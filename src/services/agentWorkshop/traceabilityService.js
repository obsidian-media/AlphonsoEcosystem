const TRACE_KEY = 'alphonso_traceability_chain_v1';

export const TRACE_STAGES = Object.freeze([
  'message',
  'task',
  'proposal',
  'approval',
  'execution',
  'verification',
  'memory'
]);

function readTraceRows() {
  try {
    const raw = localStorage.getItem(TRACE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeTraceRows(rows) {
  localStorage.setItem(TRACE_KEY, JSON.stringify(rows.slice(-2000)));
}

export function appendTraceEvent(event = {}) {
  const row = {
    id: event.id || `trace-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    traceId: event.traceId || `workflow-${Date.now()}`,
    stage: TRACE_STAGES.includes(event.stage) ? event.stage : 'message',
    generatedBy: event.generatedBy || 'system',
    createdAt: event.createdAt || new Date().toISOString(),
    reason: event.reason || '',
    inputSnapshot: event.inputSnapshot || null,
    proposedFileChanges: event.proposedFileChanges || [],
    approvalState: event.approvalState || 'pending',
    verificationState: event.verificationState || 'unverified',
    executionResult: event.executionResult || 'not_executed',
    metadata: event.metadata || {}
  };
  const rows = readTraceRows();
  rows.push(row);
  writeTraceRows(rows);
  return row;
}

export function listTraceEvents(traceId = null) {
  const rows = readTraceRows();
  return traceId ? rows.filter((row) => row.traceId === traceId) : rows;
}

export function getTraceSummary(traceId = null) {
  const rows = listTraceEvents(traceId);
  return {
    total: rows.length,
    pendingApprovals: rows.filter((row) => row.approvalState === 'pending').length,
    executed: rows.filter((row) => row.executionResult === 'executed').length,
    failed: rows.filter((row) => row.executionResult === 'failed').length,
    stagesCovered: [...new Set(rows.map((row) => row.stage))]
  };
}

