import { TRUST_STATES, timestampMs } from './trustModel';
import { generateOllamaResponse, PREFERRED_MODEL } from '../lib/ollama';
import { pushMemoryItem } from './memoryService';
import { appendSessionEvent } from './sessionIntelligenceService';
import { appendOrchestrationReceipt } from './orchestrationReceiptService';
import { storeNovaScore, getDecompositionHints } from './novaFeedbackService';
import { durableGet, durableSet } from '../lib/durableStore';

// ── Opportunity scoring (deterministic) ───────────────────────────────────────

const OPPORTUNITY_SIGNALS = [
  { pattern: /\b(build|create|launch|ship|deploy)\b/i, score: 15, signal: 'execution_intent' },
  { pattern: /\b(design|creative|content|visual|story|script)\b/i, score: 12, signal: 'creative_potential' },
  { pattern: /\b(research|analyze|study|investigate|discover)\b/i, score: 10, signal: 'research_potential' },
  { pattern: /\b(saas|app|dashboard|platform|product|mvp)\b/i, score: 14, signal: 'product_scope' },
  { pattern: /\b(market|audience|user|customer|growth|monetize)\b/i, score: 10, signal: 'market_relevance' },
  { pattern: /\b(automation|workflow|pipeline|system|integration)\b/i, score: 8, signal: 'automation_value' },
  { pattern: /\b(revenue|monetize|pricing|subscription|profit)\b/i, score: 10, signal: 'revenue_potential' },
  { pattern: /\b(ai|machine.learning|llm|model|intelligence)\b/i, score: 8, signal: 'ai_leverage' }
];

const RISK_SIGNALS = [
  { pattern: /\b(delete|remove|drop|destroy|wipe)\b/i, score: 20, signal: 'destructive_action' },
  { pattern: /\b(publish|post|deploy|push|send|email|dm)\b/i, score: 15, signal: 'external_action' },
  { pattern: /\b(pay|buy|purchase|subscribe|stripe|payment)\b/i, score: 18, signal: 'financial_action' },
  { pattern: /\b(secret|token|password|api.?key|credential)\b/i, score: 22, signal: 'credential_exposure' },
  { pattern: /\b(production|live|real|actual)\b/i, score: 12, signal: 'production_risk' },
  { pattern: /\b(database|sql|migration|schema)\b/i, score: 10, signal: 'data_risk' },
  { pattern: /\b(install|npm|pip|cargo)\b/i, score: 5, signal: 'dependency_risk' }
];

export function computeOpportunityScores(commandText, priorOutputs) {
  const lower = String(commandText || '').toLowerCase();

  let opportunityScore = 0;
  const opportunityMatched = [];
  for (const { pattern, score, signal } of OPPORTUNITY_SIGNALS) {
    if (pattern.test(lower)) {
      opportunityScore += score;
      opportunityMatched.push(signal);
    }
  }

  // Prior agent completion bonus
  if (priorOutputs?.miya?.resultState === 'completed') { opportunityScore += 8; opportunityMatched.push('miya_creative_ready'); }
  if (priorOutputs?.hector?.resultState === 'completed') { opportunityScore += 8; opportunityMatched.push('hector_research_ready'); }

  let riskScore = 0;
  const riskMatched = [];
  for (const { pattern, score, signal } of RISK_SIGNALS) {
    if (pattern.test(lower)) {
      riskScore += score;
      riskMatched.push(signal);
    }
  }

  // Failed prior agents increase risk score
  const failedCount = Object.values(priorOutputs || {}).filter((o) => o?.resultState === 'failed').length;
  if (failedCount > 0) { riskScore += failedCount * 8; riskMatched.push('prior_failures'); }

  opportunityScore = Math.min(100, Math.max(0, opportunityScore));
  riskScore = Math.min(100, Math.max(0, riskScore));

  // Timing score: high when context is rich (research done, no blockers)
  let timingScore = 50;
  const completedAgents = Object.values(priorOutputs || {}).filter((o) => o?.resultState === 'completed').length;
  timingScore += completedAgents * 10;
  if (failedCount > 0) timingScore -= failedCount * 15;
  timingScore = Math.min(100, Math.max(0, timingScore));

  // Effort score: inverse of complexity signals (lower = more effort needed)
  let effortScore = 100;
  if (/\b(complex|large|extensive|full|complete|end.to.end)\b/i.test(lower)) effortScore -= 30;
  if (/\b(simple|quick|small|brief|minimal)\b/i.test(lower)) effortScore += 15;
  effortScore = Math.min(100, Math.max(0, effortScore));

  const valueScore = Math.round((opportunityScore * 0.6) + ((100 - riskScore) * 0.4));

  return { opportunityScore, riskScore, timingScore, effortScore, valueScore, opportunitySignals: opportunityMatched, riskSignals: riskMatched };
}

export function classifyPriorityTier(valueScore) {
  if (valueScore >= 75) return 'critical';
  if (valueScore >= 55) return 'high';
  if (valueScore >= 35) return 'medium';
  return 'watchlist';
}

// ── Ollama prompt ─────────────────────────────────────────────────────────────

export function buildNovaAnalysisPrompt(commandText, priorOutputs, scores) {
  const agentContext = Object.entries(priorOutputs || {})
    .map(([agent, o]) => `[${agent}] ${String(o?.summary || 'no output').slice(0, 200)}`)
    .join('\n');

  return [
    'You are Nova, an opportunity scoring and strategic analysis agent for a local AI desktop companion.',
    'Analyze the command and context below. Score the opportunity across dimensions and provide a strategic recommendation.',
    '',
    `Deterministic scores: opportunity=${scores.opportunityScore}/100, risk=${scores.riskScore}/100, timing=${scores.timingScore}/100, effort=${scores.effortScore}/100, value=${scores.valueScore}/100`,
    '',
    'Return ONLY valid JSON with exactly these keys (no markdown fences):',
    '{',
    '  "valueScore": 0-100,',
    '  "riskScore": 0-100,',
    '  "timingScore": 0-100,',
    '  "effortScore": 0-100,',
    '  "priorityTier": "watchlist"|"medium"|"high"|"critical",',
    '  "recommendation": "string (1-2 sentences of strategic advice)",',
    '  "summary": "string (one sentence)"',
    '}',
    '',
    'Command: ' + String(commandText || '').slice(0, 400),
    'Prior agent outputs:\n' + (agentContext || 'none'),
    '',
    'Rules: priorityTier=critical only for transformative, high-ROI, low-risk opportunities. Be discerning.'
  ].join('\n');
}

export function parseNovaAnalysisResponse(text) {
  try {
    const jsonMatch = String(text || '').match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('no json');
    const parsed = JSON.parse(jsonMatch[0]);
    const clamp = (v, fallback) => Math.min(100, Math.max(0, Number(v) || fallback));
    return {
      valueScore: clamp(parsed.valueScore, 50),
      riskScore: clamp(parsed.riskScore, 20),
      timingScore: clamp(parsed.timingScore, 50),
      effortScore: clamp(parsed.effortScore, 50),
      priorityTier: ['watchlist', 'medium', 'high', 'critical'].includes(parsed.priorityTier) ? parsed.priorityTier : 'medium',
      recommendation: String(parsed.recommendation || 'Proceed with standard agent delegation.').slice(0, 400),
      summary: String(parsed.summary || 'Nova analysis complete.').slice(0, 300)
    };
  } catch {
    return null;
  }
}

export function buildNovaFallbackAnalysis(scores) {
  const priorityTier = classifyPriorityTier(scores.valueScore);
  return {
    valueScore: scores.valueScore,
    riskScore: scores.riskScore,
    timingScore: scores.timingScore,
    effortScore: scores.effortScore,
    priorityTier,
    recommendation: priorityTier === 'critical' || priorityTier === 'high'
      ? 'High-value opportunity — prioritize creative and research agents, apply Maria governance check before execution.'
      : priorityTier === 'medium'
        ? 'Moderate opportunity — delegate selectively and monitor execution quality.'
        : 'Low-priority signal — consider deferring or simplifying scope.',
    summary: `Nova scored value ${scores.valueScore}/100 (${priorityTier} priority). Risk: ${scores.riskScore}/100. Timing: ${scores.timingScore}/100.`
  };
}

// ── Main runtime ──────────────────────────────────────────────────────────────

export async function runNovaAnalysis(commandText, assignment, priorOutputs, options = {}) {
  const startMs = timestampMs();

  // 1. Deterministic scoring (always runs)
  const scores = computeOpportunityScores(commandText, priorOutputs);

  // 2. Ollama strategic analysis
  let ollamaResult = null;
  try {
    const prompt = buildNovaAnalysisPrompt(commandText, priorOutputs, scores);
    const response = await generateOllamaResponse({ model: PREFERRED_MODEL, prompt });
    ollamaResult = parseNovaAnalysisResponse(response?.response || '');
  } catch {
    // Ollama unavailable — use deterministic fallback
  }

  const analysis = ollamaResult || buildNovaFallbackAnalysis(scores);

  // 3. Store score in novaFeedbackService for decomposition hints
  const commandId = assignment?.commandId || `nova_${startMs}`;
  storeNovaScore(commandId, {
    opportunityScore: scores.opportunityScore,
    riskScore: analysis.riskScore,
    score: analysis.valueScore
  });
  const { hints } = getDecompositionHints(commandId);

  // 4. Build NOVA_OPPORTUNITY_SCHEMA
  const opportunityId = `nova_${commandId}_${startMs}`;
  const schema = {
    opportunityId,
    title: String(commandText || '').slice(0, 120),
    summary: analysis.summary,
    valueScore: analysis.valueScore,
    riskScore: analysis.riskScore,
    timingScore: analysis.timingScore,
    effortScore: analysis.effortScore,
    priorityTier: analysis.priorityTier,
    recommendation: analysis.recommendation,
    confidenceLevel: ollamaResult ? TRUST_STATES.VERIFIED : TRUST_STATES.INFERRED,
    verificationState: ollamaResult ? TRUST_STATES.VERIFIED : TRUST_STATES.INFERRED,
    analyzedAtMs: startMs
  };

  // 5. Persist memory
  pushMemoryItem({
    title: `Nova analysis: ${String(commandText || '').slice(0, 80)}`,
    category: 'research_memory',
    content: { schema, opportunitySignals: scores.opportunitySignals, riskSignals: scores.riskSignals, hints: hints.map((h) => h.message) },
    source: 'nova-analysis-service',
    sourceAgent: 'nova',
    confidence: schema.confidenceLevel,
    verificationState: schema.verificationState
  });

  appendSessionEvent({
    category: 'analysis',
    title: `Nova scored ${analysis.priorityTier} priority (value ${analysis.valueScore}/100)`,
    details: { valueScore: analysis.valueScore, riskScore: analysis.riskScore, priorityTier: analysis.priorityTier },
    agent: 'nova',
    confidence: schema.confidenceLevel,
    verificationState: schema.verificationState
  });

  appendOrchestrationReceipt({
    workflowId: assignment?.commandId || 'nova_analysis',
    commandId: assignment?.commandId || null,
    packetId: assignment?.packetId || null,
    eventType: 'nova_analysis_completed',
    status: 'completed',
    agent: 'nova',
    actionType: assignment?.actionType || 'opportunity_analysis',
    riskLevel: analysis.riskScore >= 60 ? 'high' : analysis.riskScore >= 30 ? 'medium' : 'low',
    approved: true,
    blocked: false,
    details: { valueScore: analysis.valueScore, priorityTier: analysis.priorityTier, hintsCount: hints.length, ollamaUsed: !!ollamaResult, durationMs: timestampMs() - startMs },
    confidence: schema.confidenceLevel,
    verificationState: schema.verificationState
  });

  const summaryParts = [
    `Nova scored value ${analysis.valueScore}/100 (${analysis.priorityTier} priority).`,
    `Risk: ${analysis.riskScore}/100. Timing: ${analysis.timingScore}/100. Effort: ${analysis.effortScore}/100.`,
    hints.length > 0 ? `${hints.length} decomposition hint(s).` : '',
    analysis.recommendation
  ].filter(Boolean).join(' ');

  return {
    summary: summaryParts,
    resultState: 'completed',
    resultUrl: null,
    artifacts: [
      {
        type: 'opportunity_score',
        opportunityScore: scores.opportunityScore,
        riskScore: analysis.riskScore,
        timingScore: analysis.timingScore,
        effortScore: analysis.effortScore,
        valueScore: analysis.valueScore,
        priorityTier: analysis.priorityTier,
        opportunitySignals: scores.opportunitySignals,
        riskSignals: scores.riskSignals,
        hints: hints.map((h) => h.message),
        scoreId: commandId
      },
      { type: 'nova_opportunity_schema', schema }
    ],
    sources: [],
    contractAction: assignment?.actionType || 'opportunity_analysis',
    schema
  };
}

const NOVA_HISTORY_KEY = 'alphonso_nova_history_v1';
const MAX_HISTORY = 30;

export function saveOpportunityScore(score, recommendation) {
  const history = getOpportunityHistory();
  history.push({ score, recommendation, timestamp: Date.now() });
  if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
  try { durableSet(NOVA_HISTORY_KEY, JSON.stringify(history)); } catch { /* ignore */ }
}

export function getOpportunityHistory() {
  try { return JSON.parse(durableGet(NOVA_HISTORY_KEY) ?? '[]'); } catch { return []; }
}
