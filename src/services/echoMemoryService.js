import { TRUST_STATES, timestampMs } from './trustModel';
import { generateOllamaResponse, PREFERRED_MODEL } from '../lib/ollama';
import { pushMemoryItem, listMemoryItems } from './memoryService';
import { appendSessionEvent } from './sessionIntelligenceService';
import { addMemoryToChroma, semanticSearchMemory, isChromaHealthy } from './chromaDbService.js';

// ── Retention policy classification ──────────────────────────────────────────

const RETENTION_RULES = [
  { pattern: /decision|approved|rejected|milestone|release|shipped/, policy: 'permanent' },
  { pattern: /preference|setting|config|style/, policy: 'permanent' },
  { pattern: /research|findings|report/, policy: 'standard_180d' },
  { pattern: /creative|draft|concept|idea/, policy: 'standard_180d' },
  { pattern: /temp|test|debug|experiment/, policy: 'ephemeral_7d' },
  { pattern: /error|failure|exception/, policy: 'ephemeral_7d' }
];

export function classifyRetentionPolicy(category, content) {
  const text = (String(category || '') + ' ' + String(content || '')).toLowerCase();
  for (const rule of RETENTION_RULES) {
    if (rule.pattern.test(text)) return rule.policy;
  }
  return 'standard_180d';
}

// ── Category classifier ───────────────────────────────────────────────────────

export function classifyMemoryCategory(commandText, priorOutputs) {
  const text = String(commandText || '').toLowerCase();
  const agents = Object.keys(priorOutputs || {});

  if (/decision|approved|plan|roadmap|milestone|goal/.test(text)) return 'timeline_memory';
  if (/preference|style|always|never|usually/.test(text)) return 'preference_memory';
  if (agents.includes('jose') || agents.includes('alphonso') || /orchestrat|pipeline|workflow/.test(text)) return 'orchestration_memory';
  return 'project_memory';
}

// ── Prompt ────────────────────────────────────────────────────────────────────

export function buildEchoSynthesisPrompt(commandText, priorOutputs) {
  const outputLines = Object.entries(priorOutputs || {})
    .map(([agent, output]) => `[${agent}] ${String(output?.summary || 'no summary').slice(0, 400)}`)
    .join('\n');

  return [
    'You are Echo, a knowledge preservation specialist for a local AI desktop companion.',
    'Synthesize the workflow outputs below into a single structured memory entry that captures what happened and what was decided.',
    'Return ONLY valid JSON with exactly these keys (no extra keys, no markdown fences):',
    '{',
    '  "title": "concise memory title (max 100 chars)",',
    '  "content": "2-3 sentence synthesis of what happened and what was decided or produced",',
    '  "category": "project_memory"|"timeline_memory"|"preference_memory"|"orchestration_memory",',
    '  "sensitivity": "internal"|"public"|"confidential",',
    '  "retentionPolicy": "standard_180d"|"permanent"|"ephemeral_7d"',
    '}',
    '',
    `Command: ${String(commandText || '').slice(0, 500)}`,
    outputLines ? `\nAgent outputs:\n${outputLines}` : ''
  ].filter(Boolean).join('\n');
}

// ── JSON parser with fallback ─────────────────────────────────────────────────

export function parseEchoMemoryResponse(text) {
  try {
  const raw = String(text || '').trim();
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonMatch = fenceMatch ? null : raw.match(/\{[\s\S]*\}/);
  const cleaned = fenceMatch ? fenceMatch[1].trim() : jsonMatch ? jsonMatch[0] : raw;
  const parsed = JSON.parse(cleaned);

  const validCategories = ['project_memory', 'timeline_memory', 'preference_memory', 'orchestration_memory'];
  const validSensitivity = ['internal', 'public', 'confidential'];
  const validRetention = ['standard_180d', 'permanent', 'ephemeral_7d'];

  return {
    title: String(parsed.title || '').slice(0, 100) || 'Echo memory entry',
    content: String(parsed.content || '').slice(0, 1000) || 'Workflow output preserved.',
    category: validCategories.includes(parsed.category) ? parsed.category : 'project_memory',
    sensitivity: validSensitivity.includes(parsed.sensitivity) ? parsed.sensitivity : 'internal',
    retentionPolicy: validRetention.includes(parsed.retentionPolicy) ? parsed.retentionPolicy : 'standard_180d'
  };
  } catch {
    return { title: 'Echo memory entry', content: 'Workflow output preserved.', category: 'project_memory', sensitivity: 'internal', retentionPolicy: 'standard_180d' };
  }
}

// ── Deterministic fallback ────────────────────────────────────────────────────

export function buildEchoFallbackEntry(commandText, priorOutputs) {
  const agents = Object.keys(priorOutputs || {});
  const summaries = Object.entries(priorOutputs || {})
    .map(([agent, output]) => `${agent}: ${String(output?.summary || 'no summary').slice(0, 200)}`)
    .join(' | ');

  const category = classifyMemoryCategory(commandText, priorOutputs);
  const title = `Echo: ${String(commandText || '').slice(0, 80)}`;
  const content = agents.length > 0
    ? `Workflow involving ${agents.join(', ')} completed. ${summaries.slice(0, 600)}`
    : `Command recorded: ${String(commandText || '').slice(0, 300)}.`;

  return {
    title,
    content,
    category,
    sensitivity: 'internal',
    retentionPolicy: classifyRetentionPolicy(category, content),
    confidenceLevel: 'UNVERIFIED'
  };
}

// ── Confidence normalization ──────────────────────────────────────────────────

export function normalizeMemoryConfidence(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return [];

  const CONFIDENCE_RANK = {
    [TRUST_STATES.VERIFIED]: 4,
    [TRUST_STATES.INFERRED]: 3,
    [TRUST_STATES.TEMPORARY]: 2,
    [TRUST_STATES.PENDING]: 1,
    [TRUST_STATES.UNVERIFIED]: 0,
    [TRUST_STATES.FAILED]: -1
  };

  return entries.map((entry) => {
    if (!entry || typeof entry !== 'object') return entry;
    const current = entry.confidence || entry.confidenceLevel || TRUST_STATES.UNVERIFIED;
    const rank = CONFIDENCE_RANK[current] ?? 0;
    const normalized = rank >= 3 ? TRUST_STATES.VERIFIED
      : rank >= 2 ? TRUST_STATES.INFERRED
      : rank >= 1 ? TRUST_STATES.TEMPORARY
      : TRUST_STATES.UNVERIFIED;
    return { ...entry, confidence: normalized, confidenceLevel: entry.confidenceLevel || normalized };
  });
}

// ── Main entry ────────────────────────────────────────────────────────────────

export async function runEchoPreservation(commandText, assignment, priorOutputs, options = {}) {
  const startMs = timestampMs();

  let memoryEntry = null;
  let ollamaUsed = false;

  if (!options.draftDisabled) {
    try {
      const prompt = buildEchoSynthesisPrompt(commandText, priorOutputs);
      const response = await generateOllamaResponse({
        endpoint: options.endpoint,
        model: options.model || PREFERRED_MODEL,
        prompt
      });
      const parsed = parseEchoMemoryResponse(response?.response);
      if (parsed && parsed.title.length > 3 && parsed.content.length > 10) {
        memoryEntry = parsed;
        ollamaUsed = true;
      }
    } catch {
      // fall through to deterministic fallback
    }
  }

  if (!memoryEntry) {
    memoryEntry = buildEchoFallbackEntry(commandText, priorOutputs);
  }

  const schema = {
    memoryId: `echo-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    workflowId: assignment?.commandId || assignment?.packetId || '',
    sourceAgent: 'echo',
    title: memoryEntry.title,
    content: memoryEntry.content,
    category: memoryEntry.category,
    confidenceLevel: ollamaUsed ? TRUST_STATES.INFERRED : TRUST_STATES.TEMPORARY,
    verificationState: TRUST_STATES.UNVERIFIED,
    retentionPolicy: memoryEntry.retentionPolicy,
    sensitivity: memoryEntry.sensitivity,
    archivedAtMs: startMs
  };

  pushMemoryItem({
    title: schema.title,
    category: schema.category,
    content: {
      commandText: String(commandText || '').slice(0, 500),
      synthesis: schema.content,
      agentCount: Object.keys(priorOutputs || {}).length,
      agents: Object.keys(priorOutputs || {}),
      retentionPolicy: schema.retentionPolicy,
      sensitivity: schema.sensitivity,
      memoryId: schema.memoryId
    },
    source: 'echo-memory-service',
    sourceAgent: 'echo',
    confidence: schema.confidenceLevel,
    verificationState: schema.verificationState
  });

  // Mirror to ChromaDB for semantic search (fire-and-forget, non-blocking)
  addMemoryToChroma({ id: schema.memoryId, title: schema.title, content: schema.content, category: schema.category, sourceAgent: 'echo', timestampMs: startMs });

  // Normalize confidence across recent memory entries (best-effort, non-blocking)
  try {
    const recent = listMemoryItems().slice(-50);
    normalizeMemoryConfidence(recent);
  } catch {
    // best-effort
  }

  appendSessionEvent({
    category: 'memory',
    title: 'Echo knowledge preservation completed',
    details: {
      memoryId: schema.memoryId,
      category: schema.category,
      retentionPolicy: schema.retentionPolicy,
      agentCount: Object.keys(priorOutputs || {}).length,
      ollamaUsed
    },
    agent: 'echo',
    confidence: schema.confidenceLevel,
    verificationState: schema.verificationState
  });

  return {
    summary: `Echo preserved: "${schema.title}". Category: ${schema.category}. Retention: ${schema.retentionPolicy}. Agents captured: ${Object.keys(priorOutputs || {}).join(', ') || 'none'}.`,
    resultState: 'completed',
    resultUrl: null,
    artifacts: [
      {
        type: 'memory_preservation',
        memoryId: schema.memoryId,
        category: schema.category,
        retentionPolicy: schema.retentionPolicy,
        sensitivity: schema.sensitivity,
        preservedAgents: Object.keys(priorOutputs || {})
      },
      { type: 'echo_memory_schema', schema }
    ],
    sources: [],
    contractAction: assignment?.actionType || 'memory_preservation',
    schema
  };
}

// ── Session synthesis (end-of-session hook) ───────────────────────────────────
// Takes the last N chat messages and synthesizes them into a memory entry.

export async function synthesizeSession(recentMessages) {
  const messages = Array.isArray(recentMessages) ? recentMessages.slice(-20) : [];
  if (messages.length === 0) return null;

  const commandText = messages
    .map((m) => `[${m.role || 'user'}] ${String(m.content || '').slice(0, 300)}`)
    .join('\n');

  const priorOutputs = {};
  for (const msg of messages) {
    if (msg.role === 'assistant' && msg.content) {
      priorOutputs['session'] = { summary: String(msg.content).slice(0, 400), resultState: 'completed' };
      break;
    }
  }

  try {
    return await runEchoPreservation(commandText, { commandId: `session_${Date.now()}`, actionType: 'session_synthesis' }, priorOutputs, { draftDisabled: false });
  } catch {
    return null;
  }
}

// ── Semantic search via ChromaDB (falls back to keyword search if offline) ───

export async function searchEchoMemorySemantic(query, limit = 10) {
  const semanticResults = await semanticSearchMemory(query, limit);
  if (semanticResults && semanticResults.length > 0) {
    const allMemories = listMemoryItems();
    return semanticResults
      .map(r => allMemories.find(m => m.id === r.id || m.content?.memoryId === r.id))
      .filter(Boolean);
  }
  // Keyword fallback
  const q = query.toLowerCase();
  return listMemoryItems()
    .filter(m => {
      const text = `${m.title || ''} ${JSON.stringify(m.content || '')} ${m.category || ''}`.toLowerCase();
      return q.split(' ').some(word => word.length > 2 && text.includes(word));
    })
    .slice(-limit);
}

export { isChromaHealthy };
