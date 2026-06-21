const AUDIT_KEY = 'alphonso_approval_audit_v1';
const MAX_ENTRIES = 100;

export function logApprovalEvent(packetId, agent, action, outcome) {
  const log = getAuditLog();
  log.push({ packetId, agent, action, outcome, timestamp: Date.now() });
  if (log.length > MAX_ENTRIES) log.splice(0, log.length - MAX_ENTRIES);
  try { localStorage.setItem(AUDIT_KEY, JSON.stringify(log)); } catch {}
}

export function getAuditLog() {
  try { return JSON.parse(localStorage.getItem(AUDIT_KEY) ?? '[]'); } catch { return []; }
}

export function clearAuditLog() {
  localStorage.removeItem(AUDIT_KEY);
}
