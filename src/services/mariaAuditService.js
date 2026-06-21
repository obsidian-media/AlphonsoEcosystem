import { TRUST_STATES, timestampMs } from './trustModel';
import { generateOllamaResponse, PREFERRED_MODEL } from '../lib/ollama';
import { pushMemoryItem } from './memoryService';
import { appendSessionEvent } from './sessionIntelligenceService';
import { generateRiskScore } from './audit/marcusAuditService';

// ── Prompt ────────────────────────────────────────────────────────────────────

export function buildMariaAuditPrompt(commandText, priorOutputs) {
  const agentSummary = Object.entries(priorOutputs || {})
    .map(([agent, output]) => `[${agent}] ${String(output?.summary || 'no output').slice(0, 300)}`)
    .join('\n');

  return [
    'You are Maria, an AI governance auditor for a local AI desktop companion.',
    'Analyze the command and prior agent outputs below for governance risks, policy compliance, and approval requirements.',
    'Return ONLY valid JSON with exactly these keys (no extra keys, no markdown fences):',
    '{',
    '  "riskLevel": "low"|"medium"|"high"|"critical",',
    '  "approvalRequired": true|false,',
    '  "policyFindings": ["finding 1", ...],',
    '  "complianceNotes": ["note 1", ...],',
    '  "summary": "2-3 sentence governance assessment"',
    '}',
    '',
    `Command: ${String(commandText || '').slice(0, 500)}`,
    agentSummary ? `\nPrior agent outputs:\n${agentSummary}` : ''
  ].filter(Boolean).join('\n');
}

// ── JSON parser with fallback ─────────────────────────────────────────────────

export function parseMariaAuditResponse(text) {
  const raw = String(text || '').trim();
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const cleaned = fenceMatch ? fenceMatch[1].trim() : raw;
  const parsed = JSON.parse(cleaned);

  const validLevels = ['low', 'medium', 'high', 'critical'];
  return {
    riskLevel: validLevels.includes(parsed.riskLevel) ? parsed.riskLevel : 'medium',
    approvalRequired: typeof parsed.approvalRequired === 'boolean' ? parsed.approvalRequired : true,
    policyFindings: Array.isArray(parsed.policyFindings) ? parsed.policyFindings.map(String) : [],
    complianceNotes: Array.isArray(parsed.complianceNotes) ? parsed.complianceNotes.map(String) : [],
    summary: String(parsed.summary || '').slice(0, 500) || 'Maria governance audit completed.'
  };
}

// ── Deterministic fallback ────────────────────────────────────────────────────

export function buildMariaFallbackAudit(commandText, assignment, priorOutputs) {
  const actionType = String(assignment?.actionType || '').toLowerCase();
  const text = String(commandText || '').toLowerCase();

  const policyFindings = [];
  const complianceNotes = [];
  let approvalRequired = false;

  if (/delete|remove|drop|destroy|wipe/.test(actionType + ' ' + text)) {
    policyFindings.push('Destructive action detected — irreversible operation requires operator sign-off.');
    approvalRequired = true;
  }
  if (/publish|deploy|send|post|upload|broadcast/.test(actionType + ' ' + text)) {
    policyFindings.push('External publish or deploy action detected — supervisor review required.');
    approvalRequired = true;
  }
  if (/file_write|filesystem|overwrite/.test(actionType)) {
    policyFindings.push('Filesystem modification detected — change log and rollback path must be confirmed.');
    approvalRequired = true;
  }
  if (/secret|token|password|api.?key|credential/.test(text)) {
    policyFindings.push('Credential or secret reference in command — confirm no exposure in output artifacts.');
    approvalRequired = true;
  }
  if (/production|live|real users/.test(text)) {
    policyFindings.push('Production environment reference — elevated approval threshold applies.');
    approvalRequired = true;
  }

  for (const [agent, output] of Object.entries(priorOutputs || {})) {
    const trust = String(output?.trust || output?.verificationState || '').toLowerCase();
    if (trust === 'failed' || output?.resultState === 'failed') {
      policyFindings.push(`Prior agent ${agent} reported a failure — chain integrity at risk.`);
    }
    if (output?.blocked) {
      complianceNotes.push(`Agent ${agent} was blocked — downstream action depends on blocked output.`);
      approvalRequired = true;
    }
  }

  const inputForScore = { commandText, actionType, policyFindings };
  const scoreResult = generateRiskScore(inputForScore);
  const derivedLevel = policyFindings.length >= 3 ? 'high'
    : policyFindings.length >= 1 ? 'medium'
    : scoreResult.level;

  if (complianceNotes.length === 0) {
    complianceNotes.push('No explicit compliance violations found. Standard review guidelines apply.');
  }

  const summaryParts = [
    `Maria governance audit for "${String(commandText || '').slice(0, 80)}".`,
    `Risk level: ${derivedLevel}.`,
    `${policyFindings.length} policy finding(s).`,
    approvalRequired ? 'Operator approval required before execution.' : 'Cleared for auto-execution within policy bounds.'
  ];

  return {
    riskLevel: derivedLevel,
    approvalRequired,
    policyFindings,
    complianceNotes,
    summary: summaryParts.join(' ')
  };
}

// ── Main entry ────────────────────────────────────────────────────────────────

export async function runMariaGovernanceAudit(commandText, assignment, options = {}) {
  const priorOutputs = options.priorOutputs || {};
  const startMs = timestampMs();

  let auditResult = null;
  let ollamaUsed = false;

  if (!options.draftDisabled) {
    try {
      const prompt = buildMariaAuditPrompt(commandText, priorOutputs);
      const response = await generateOllamaResponse({
        endpoint: options.endpoint,
        model: options.model || PREFERRED_MODEL,
        prompt
      });
      const parsed = parseMariaAuditResponse(response?.response);
      if (parsed && parsed.summary.length > 10) {
        auditResult = parsed;
        ollamaUsed = true;
      }
    } catch {
      // fall through to deterministic fallback
    }
  }

  if (!auditResult) {
    auditResult = buildMariaFallbackAudit(commandText, assignment, priorOutputs);
  }

  const schema = {
    workflowId: assignment?.commandId || assignment?.packetId || '',
    packetId: assignment?.packetId || '',
    summary: auditResult.summary,
    riskLevel: auditResult.riskLevel,
    approvalRequired: auditResult.approvalRequired,
    policyFindings: auditResult.policyFindings,
    complianceNotes: auditResult.complianceNotes,
    confidenceLevel: ollamaUsed ? TRUST_STATES.INFERRED : TRUST_STATES.TEMPORARY,
    verificationState: TRUST_STATES.UNVERIFIED,
    auditedAtMs: startMs
  };

  pushMemoryItem({
    title: `Maria audit: ${String(commandText || '').slice(0, 80)}`,
    category: 'governance_memory',
    content: schema,
    source: 'maria-audit-service',
    sourceAgent: 'maria',
    confidence: schema.confidenceLevel,
    verificationState: schema.verificationState
  });

  appendSessionEvent({
    category: 'governance',
    title: 'Maria governance audit completed',
    details: {
      riskLevel: schema.riskLevel,
      approvalRequired: schema.approvalRequired,
      findingCount: schema.policyFindings.length,
      ollamaUsed
    },
    agent: 'maria',
    confidence: schema.confidenceLevel,
    verificationState: schema.verificationState
  });

  const approved = !schema.approvalRequired && schema.riskLevel !== 'high' && schema.riskLevel !== 'critical';

  return {
    summary: schema.summary,
    resultState: approved ? 'completed' : 'pending_review',
    resultUrl: null,
    artifacts: [
      {
        type: 'governance_audit',
        action: assignment?.actionType || 'governance_audit',
        riskLevel: schema.riskLevel,
        approvalRequired: schema.approvalRequired,
        findingCount: schema.policyFindings.length
      },
      { type: 'risk_assessment', riskLevel: schema.riskLevel, policyFindings: schema.policyFindings },
      { type: 'compliance_notes', notes: schema.complianceNotes },
      { type: 'maria_audit_schema', schema }
    ],
    sources: [],
    contractAction: assignment?.actionType || 'governance_audit',
    trust: approved ? TRUST_STATES.VERIFIED : TRUST_STATES.PENDING,
    verificationState: approved ? TRUST_STATES.VERIFIED : TRUST_STATES.PENDING,
    schema
  };
}
