import { TRUST_STATES, timestampMs } from './trustModel';
import { persistScopeRows } from './runtimeLedgerService';

const WORKFLOW_TELEMETRY_KEY = 'alphonso_workflow_telemetry_v1';
export const WORKFLOW_TELEMETRY_SCOPE = 'workflow_telemetry_v1';

interface TelemetryRow {
  id: string;
  workflowId: string;
  workflowRunId: string | null;
  eventType: string;
  status: string;
  riskLevel: string;
  metrics: Record<string, unknown>;
  confidence: string;
  verificationState: string;
  timestampMs: number;
}

interface TelemetryEventInput {
  workflowId: string;
  workflowRunId?: string | null;
  eventType?: string;
  status?: string;
  riskLevel?: string;
  metrics?: Record<string, unknown>;
  confidence?: string;
  verificationState?: string;
}

interface TelemetryFilters {
  workflowId?: string;
  workflowRunId?: string;
  eventType?: string;
}

interface TelemetrySummary {
  totalEvents: number;
  totalRuns: number;
  statusCounts: Record<string, number>;
  riskCounts: Record<string, number>;
  lastEventAtMs: number | null;
}

function readRows(): TelemetryRow[] {
  try {
    const raw = localStorage.getItem(WORKFLOW_TELEMETRY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRows(rows: TelemetryRow[]) {
  const next = rows.slice(-5000);
  localStorage.setItem(WORKFLOW_TELEMETRY_KEY, JSON.stringify(next));
  persistScopeRows(WORKFLOW_TELEMETRY_SCOPE, next, (row: TelemetryRow) => ({
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
}: TelemetryEventInput): TelemetryRow {
  const rows = readRows();
  const row: TelemetryRow = {
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

export function listWorkflowTelemetry(filters: TelemetryFilters = {}): TelemetryRow[] {
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

export function summarizeWorkflowTelemetry(workflowId: string | null = null): TelemetrySummary {
  const rows = listWorkflowTelemetry(workflowId ? { workflowId } : {});
  const summary: TelemetrySummary = {
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
