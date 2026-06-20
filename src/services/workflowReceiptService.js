import { TRUST_STATES, timestampMs } from './trustModel';
import { persistScopeRows } from './runtimeLedgerService';

const WORKFLOW_RECEIPT_KEY = 'alphonso_workflow_receipts_v1';
export const WORKFLOW_RECEIPT_SCOPE = 'workflow_receipts_v1';

export const WORKFLOW_RECEIPT_STATUSES = [
  'approved',
  'denied',
  'blocked',
  'approval_required',
  'setup_required',
  'executed',
  'partial',
  'failed',
  'queued'
];

function readRows() {
  try {
    const raw = localStorage.getItem(WORKFLOW_RECEIPT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRows(rows) {
  const next = rows.slice(-6000);
  localStorage.setItem(WORKFLOW_RECEIPT_KEY, JSON.stringify(next));
  persistScopeRows(WORKFLOW_RECEIPT_SCOPE, next, (row) => ({
    id: row.id,
    data: row,
    status: row.status || 'queued',
    confidence: row.confidence || TRUST_STATES.TEMPORARY,
    verificationState: row.verificationState || TRUST_STATES.UNVERIFIED,
    timestampMs: Number(row.timestampMs || timestampMs())
  }));
}

export function appendWorkflowReceipt({
  workflowId,
  workflowRunId = null,
  stageId = null,
  agent = 'jose',
  actionType = 'workflow_event',
  status = 'queued',
  riskLevel = 'low',
  approved = false,
  blocked = false,
  setupRequired = false,
  confidence = TRUST_STATES.TEMPORARY,
  verificationState = TRUST_STATES.UNVERIFIED,
  details = {}
}) {
  const rows = readRows();
  const receipt = {
    id: `wfr-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    workflowId: workflowId || null,
    workflowRunId,
    stageId,
    agent,
    actionType,
    status: WORKFLOW_RECEIPT_STATUSES.includes(status) ? status : 'queued',
    riskLevel,
    approved: Boolean(approved),
    blocked: Boolean(blocked),
    setupRequired: Boolean(setupRequired),
    confidence,
    verificationState,
    details,
    timestampMs: timestampMs()
  };
  rows.push(receipt);
  writeRows(rows);
  return receipt;
}

export function listWorkflowReceipts(filters = {}) {
  const rows = readRows().slice().reverse();
  return rows.filter((row) => {
    if (filters.workflowId && row.workflowId !== filters.workflowId) return false;
    if (filters.workflowRunId && row.workflowRunId !== filters.workflowRunId) return false;
    if (filters.agent && row.agent !== filters.agent) return false;
    if (filters.status && row.status !== filters.status) return false;
    return true;
  });
}
