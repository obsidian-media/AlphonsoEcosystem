import { TRUST_STATES, timestampMs } from './trustModel';
import { persistScopeRows } from './runtimeLedgerService';

const DECISION_KEY = 'alphonso_jose_governance_decisions_v1';
export const GOVERNANCE_SCOPE = 'jose_governance_decisions_v1';

function readDecisions() {
  try {
    const raw = localStorage.getItem(DECISION_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeDecisions(rows) {
  const nextRows = rows.slice(-500);
  localStorage.setItem(DECISION_KEY, JSON.stringify(nextRows));
  persistScopeRows(GOVERNANCE_SCOPE, nextRows, (row) => ({
    id: row.id,
    data: row,
    status: row.source || 'governance_decision',
    confidence: row.confidence || TRUST_STATES.TEMPORARY,
    verificationState: row.verificationState || TRUST_STATES.UNVERIFIED,
    timestampMs: Number(row.timestampMs || timestampMs())
  }));
}

export function listGovernanceDecisions() {
  return readDecisions();
}

export function recordGovernanceDecision({
  title,
  summary,
  source = 'jose-orchestrator',
  confidence = TRUST_STATES.TEMPORARY,
  verificationState = TRUST_STATES.UNVERIFIED,
  references = []
}) {
  const rows = readDecisions();
  const decision = {
    id: `jose-decision-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    title: title || 'Untitled governance decision',
    summary: summary || '',
    source,
    confidence,
    verificationState,
    references,
    timestampMs: timestampMs()
  };
  rows.push(decision);
  writeDecisions(rows);
  return decision;
}

export function summarizeAgentWorkload(packets = []) {
  const agents = ['jose', 'alphonso', 'miya', 'hector', 'maria', 'marcus', 'echo', 'sentinel', 'nova'];
  return agents.map((agent) => {
    const inbound = packets.filter((packet) => packet.toAgent === agent);
    const outbound = packets.filter((packet) => packet.fromAgent === agent);
    return {
      agent,
      inbound: inbound.length,
      outbound: outbound.length,
      pending: inbound.filter((packet) => packet.status === 'pending_approval' || packet.status === 'queued').length,
      completed: inbound.filter((packet) => packet.status === 'executed').length
    };
  });
}
