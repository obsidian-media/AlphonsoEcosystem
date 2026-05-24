import { TRUST_STATES, timestampMs } from './trustModel';
import { persistScopeRows } from './runtimeLedgerService';

const RECEIPT_KEY = 'alphonso_orchestration_receipts_v1';
export const ORCHESTRATION_RECEIPT_SCOPE = 'orchestration_receipts_v1';

function readReceipts() {
  try {
    const raw = localStorage.getItem(RECEIPT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeReceipts(rows) {
  const next = rows.slice(-3000);
  localStorage.setItem(RECEIPT_KEY, JSON.stringify(next));
  persistScopeRows(ORCHESTRATION_RECEIPT_SCOPE, next, (row) => ({
    id: row.id,
    data: row,
    status: row.status || row.eventType || 'recorded',
    confidence: row.confidence || TRUST_STATES.TEMPORARY,
    verificationState: row.verificationState || TRUST_STATES.UNVERIFIED,
    timestampMs: Number(row.timestampMs || timestampMs())
  }));
}

export function listOrchestrationReceipts(filters = {}) {
  const rows = readReceipts().slice().reverse();
  return rows.filter((row) => {
    if (filters.workflowId && row.workflowId !== filters.workflowId) return false;
    if (filters.commandId && row.commandId !== filters.commandId) return false;
    if (filters.agent && row.agent !== filters.agent) return false;
    if (filters.status && row.status !== filters.status) return false;
    if (filters.eventType && row.eventType !== filters.eventType) return false;
    return true;
  });
}

export function appendOrchestrationReceipt({
  workflowId = null,
  commandId = null,
  packetId = null,
  eventType,
  status = 'recorded',
  agent = 'jose',
  connectorId = null,
  actionType = null,
  riskLevel = 'low',
  approved = false,
  blocked = false,
  setupRequired = false,
  details = {},
  confidence = TRUST_STATES.TEMPORARY,
  verificationState = TRUST_STATES.UNVERIFIED
}) {
  const rows = readReceipts();
  const receipt = {
    id: `orx-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    workflowId,
    commandId,
    packetId,
    eventType: eventType || 'event',
    status,
    agent,
    connectorId,
    actionType,
    riskLevel,
    approved: Boolean(approved),
    blocked: Boolean(blocked),
    setupRequired: Boolean(setupRequired),
    details,
    confidence,
    verificationState,
    timestampMs: timestampMs()
  };
  rows.push(receipt);
  writeReceipts(rows);
  void import('./toolNotificationDispatcher').then(({ dispatchReceiptNotifications }) => dispatchReceiptNotifications(receipt)).catch(() => null);
  return receipt;
}
