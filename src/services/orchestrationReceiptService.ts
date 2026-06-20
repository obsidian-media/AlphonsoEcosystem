import { invoke } from '@tauri-apps/api/core';
import { TRUST_STATES, timestampMs } from './trustModel';
import { persistScopeRows } from './runtimeLedgerService';

const RECEIPT_KEY = 'alphonso_orchestration_receipts_v1';
export const ORCHESTRATION_RECEIPT_SCOPE = 'orchestration_receipts_v1';

export interface OrchestrationReceipt {
  id: string;
  workflowId: string | null;
  commandId: string | null;
  packetId: string | null;
  eventType: string;
  status: string;
  agent: string;
  connectorId: string | null;
  actionType: string | null;
  riskLevel: string;
  approved: boolean;
  blocked: boolean;
  setupRequired: boolean;
  details: Record<string, any>;
  confidence: string;
  verificationState: string;
  timestampMs: number;
}

export interface ReceiptFilters {
  workflowId?: string;
  commandId?: string;
  agent?: string;
  status?: string;
  eventType?: string;
}

export interface AppendReceiptInput {
  workflowId?: string | null;
  commandId?: string | null;
  packetId?: string | null;
  eventType?: string;
  status?: string;
  agent?: string;
  connectorId?: string | null;
  actionType?: string | null;
  riskLevel?: string;
  approved?: boolean;
  blocked?: boolean;
  setupRequired?: boolean;
  details?: Record<string, any>;
  confidence?: string;
  verificationState?: string;
}

function readReceipts(): OrchestrationReceipt[] {
  try {
    const raw = localStorage.getItem(RECEIPT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeReceipts(rows: OrchestrationReceipt[]): void {
  const next = rows.slice(-3000);
  try {
    invoke('kv_set', { key: RECEIPT_KEY, value: JSON.stringify(next) }).catch(() => {});
  } catch {
    // SQLite not available in browser
  }
  localStorage.setItem(RECEIPT_KEY, JSON.stringify(next));
  persistScopeRows(ORCHESTRATION_RECEIPT_SCOPE, next, (row: OrchestrationReceipt) => ({
    id: row.id,
    data: row,
    status: row.status || row.eventType || 'recorded',
    confidence: row.confidence || TRUST_STATES.TEMPORARY,
    verificationState: row.verificationState || TRUST_STATES.UNVERIFIED,
    timestampMs: Number(row.timestampMs || timestampMs())
  }));
}

export function listOrchestrationReceipts(filters: ReceiptFilters = {}): OrchestrationReceipt[] {
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
}: AppendReceiptInput): OrchestrationReceipt {
  const rows = readReceipts();
  const receipt: OrchestrationReceipt = {
    id: `orx-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    workflowId: workflowId ?? null,
    commandId: commandId ?? null,
    packetId: packetId ?? null,
    eventType: eventType || 'event',
    status,
    agent,
    connectorId: connectorId ?? null,
    actionType: actionType ?? null,
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
