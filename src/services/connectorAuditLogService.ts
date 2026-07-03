// Lightweight in-memory ring buffer (last 100 entries) for connector call audit
const MAX_ENTRIES = 100;

export interface ConnectorAuditEntry {
  connectorId: string;
  ok: boolean;
  latencyMs: number;
  errorCode: string | null;
  ts: number;
}

const log: ConnectorAuditEntry[] = [];

export function appendConnectorAuditEntry({ connectorId, ok, latencyMs, errorCode }: { connectorId: string; ok: boolean; latencyMs: number; errorCode?: string | null }): void {
  log.push({ connectorId, ok, latencyMs, errorCode: errorCode || null, ts: Date.now() });
  if (log.length > MAX_ENTRIES) log.shift();
}

export function getConnectorAuditLog(): ConnectorAuditEntry[] {
  return [...log];
}

export function getLastEntryForConnector(connectorId: string): ConnectorAuditEntry | null {
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i].connectorId === connectorId) return log[i];
  }
  return null;
}
