import { TRUST_STATES, timestampMs } from './trustModel';
import { persistScopeRows } from './runtimeLedgerService';

const DECISION_KEY = 'alphonso_jose_governance_decisions_v1';
export const GOVERNANCE_SCOPE = 'jose_governance_decisions_v1';

interface GovernanceDecision {
  id: string;
  title: string;
  summary: string;
  source: string;
  confidence: string;
  verificationState: string;
  references: string[];
  timestampMs: number;
}

interface GovernanceDecisionInput {
  title?: string;
  summary?: string;
  source?: string;
  confidence?: string;
  verificationState?: string;
  references?: string[];
}

interface AgentWorkload {
  agent: string;
  inbound: number;
  outbound: number;
  pending: number;
  completed: number;
}

interface Packet {
  toAgent: string;
  fromAgent: string;
  status: string;
}

function readDecisions(): GovernanceDecision[] {
  try {
    const raw = localStorage.getItem(DECISION_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeDecisions(rows: GovernanceDecision[]) {
  const nextRows = rows.slice(-500);
  localStorage.setItem(DECISION_KEY, JSON.stringify(nextRows));
  persistScopeRows(GOVERNANCE_SCOPE, nextRows, (row: GovernanceDecision) => ({
    id: row.id,
    data: row,
    status: row.source || 'governance_decision',
    confidence: row.confidence || TRUST_STATES.TEMPORARY,
    verificationState: row.verificationState || TRUST_STATES.UNVERIFIED,
    timestampMs: Number(row.timestampMs || timestampMs())
  }));
}

export function listGovernanceDecisions(): GovernanceDecision[] {
  return readDecisions();
}

export function recordGovernanceDecision({
  title,
  summary,
  source = 'jose-orchestrator',
  confidence = TRUST_STATES.TEMPORARY,
  verificationState = TRUST_STATES.UNVERIFIED,
  references = []
}: GovernanceDecisionInput = {}): GovernanceDecision {
  const rows = readDecisions();
  const decision: GovernanceDecision = {
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

export function summarizeAgentWorkload(packets: Packet[] = []): AgentWorkload[] {
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
