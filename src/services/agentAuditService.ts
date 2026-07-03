import { durableGet, durableSet, durableRemove } from '../lib/durableStore';

const AUDIT_KEY = 'alphonso_approval_audit_v1';
const MAX_ENTRIES = 100;

export interface ApprovalAuditEntry {
  packetId: string;
  agent: string;
  action: string;
  outcome: string;
  timestamp: number;
}

export function logApprovalEvent(packetId: string, agent: string, action: string, outcome: string): void {
  const log = getAuditLog();
  log.push({ packetId, agent, action, outcome, timestamp: Date.now() });
  if (log.length > MAX_ENTRIES) log.splice(0, log.length - MAX_ENTRIES);
  try { durableSet(AUDIT_KEY, JSON.stringify(log)); } catch { /* ignore */ }
}

export function getAuditLog(): ApprovalAuditEntry[] {
  try { return JSON.parse(durableGet(AUDIT_KEY) ?? '[]'); } catch { return []; }
}

export function clearAuditLog(): void {
  durableRemove(AUDIT_KEY);
}
