import { TRUST_STATES, timestampMs } from './trustModel';
import { persistScopeRows } from './runtimeLedgerService';

const WORKFLOW_TELEMETRY_KEY = 'alphonso_workflow_telemetry_v1';
export const WORKFLOW_TELEMETRY_SCOPE = 'workflow_telemetry_v1';

function readRows() {
  try {
    const raw = localStorage.getItem(WORKFLOW_TELEMETRY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRows(rows) {
  const next = rows.slice(-5000);
  localStorage.setItem(WORKFLOW_TELEMETRY_KEY, JSON.stringify(next));
  persistScopeRows(WORKFLOW_TELEMETRY_SCOPE, next, (row) => ({
    id: row.id,
    data: row,
    status: row.eventType || 'telemetry_event',
    confidence: row.confidence || TRUST_STATES.TEMPORARY,
    verificationState: row.verificationState || TRUST_STATES.UNVERIFIED,
    timestampMs: Number(row.timestampMs || timestampMs())
  }));
}

export function appendWorkflowTelemetryEvent({
  workflowId,
  workflowRunId = null,
  eventType = 'status_update',
  status = 'queued',
  riskLevel = 'low',
  metrics = {},
  confidence = TRUST_STATES.TEMPORARY,
  verificationState = TRUST_STATES.UNVERIFIED
}) {
  const rows = readRows();
  const row = {
    id: `wft-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    workflowId,
    workflowRunId,
    eventType,
    status,
    riskLevel,
    metrics,
    confidence,
    verificationState,
    timestampMs: timestampMs()
  };
  rows.push(row);
  writeRows(rows);
  return row;
}

export function listWorkflowTelemetry(filters = {}) {
  return readRows()
    .slice()
    .reverse()
    .filter((row) => {
      if (filters.workflowId && row.workflowId !== filters.workflowId) return false;
      if (filters.workflowRunId && row.workflowRunId !== filters.workflowRunId) return false;
      if (filters.eventType && row.eventType !== filters.eventType) return false;
      return true;
    });
}

export function summarizeWorkflowTelemetry(workflowId = null) {
  const rows = listWorkflowTelemetry(workflowId ? { workflowId } : {});
  const summary = {
    totalEvents: rows.length,
    totalRuns: new Set(rows.map((row) => row.workflowRunId).filter(Boolean)).size,
    statusCounts: {},
    riskCounts: {},
    lastEventAtMs: rows[0]?.timestampMs || null
  };
  rows.forEach((row) => {
    summary.statusCounts[row.status] = (summary.statusCounts[row.status] || 0) + 1;
    summary.riskCounts[row.riskLevel] = (summary.riskCounts[row.riskLevel] || 0) + 1;
  });
  return summary;
}
