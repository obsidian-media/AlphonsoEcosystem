/**
 * Alphonso — Canonical Events Service
 *
 * Frontend contract for the Rust `events` + `event_dedup` tables added in
 * memory_store.rs migration v3. Mirrors the Rust struct field-for-field so
 * the operator dashboard can render the same shape on web and desktop.
 *
 * The Rust backend is the source of truth for the table; this service is
 * a thin typed wrapper that adds pure helpers (id derivation, dedup, weekly
 * aggregates) that the operator UI reuses.
 *
 * Pure helpers (testable without Tauri):
 *  - `buildEventId(dedupKey, occurredAtMs)` — deterministic id from dedup_key + ts
 *  - `normalizeEventRecord(row)`             — camelCase normalization
 *  - `dedupeEvents(records)`                 — in-memory dedup by dedupKey
 *  - `aggregateEventsByType(records)`        — counts by eventType + outcome
 *  - `aggregateEventsWeekly(records, opt)`   — markdown weekly report (events)
 *
 * Tauri wrapper:
 *  - `recordEvent(event)`                    — calls `record_event`
 *  - `listEvents(filters)`                   — calls `list_events_command`
 *  - `listEventDedup(limit)`                 — calls `list_event_dedup_command`
 *  - `getEventStoreStatus()`                 — calls `get_event_store_status`
 *  - `isEventsTableAvailable()`              — cache-friendly probe
 *
 * Companion services reused (do not duplicate):
 *  - `trustModel.TRUST_STATES`               — trust values
 *  - `trustModel.timestampMs`                — time source
 *  - `runtimeLedgerService`                  — older scope/id/data substrate
 */

import { invoke } from '@tauri-apps/api/core';
import { TRUST_STATES, timestampMs } from './trustModel';
import type { OrchestrationReceipt } from './orchestrationReceiptService';

// ── Types ─────────────────────────────────────────────────────────────────────

export type EventOutcome = 'success' | 'failure' | 'blocked' | 'pending' | 'skipped';

export type EventTrustState = 'verified' | 'inferred' | 'pending' | 'failed' | 'stale';

export type EventSource = 'alphonso' | 'alphonso/operator' | 'alphonso/onboarding' | 'alphonso/notion_sync' | 'system' | 'ollama';

export interface EventRecord {
  id: string;
  eventType: string;
  source: string;
  subjectKind: string | null;
  subjectId: string | null;
  outcome: string;
  payload: unknown;
  dedupKey: string;
  occurredAtMs: number;
  recordedAtMs?: number;
  correlationId: string | null;
  trust: string;
  [key: string]: unknown;
}

export interface RawEventRow {
  id?: string;
  eventType?: string;
  event_type?: string;
  source?: string;
  subjectKind?: string | null;
  subject_kind?: string | null;
  subjectId?: string | null;
  subject_id?: string | null;
  outcome?: string;
  payload?: unknown;
  dedupKey?: string;
  dedup_key?: string;
  occurredAtMs?: number;
  occurred_at_ms?: number;
  recordedAtMs?: number;
  recorded_at_ms?: number;
  correlationId?: string | null;
  correlation_id?: string | null;
  trust?: string;
  [key: string]: unknown;
}

export interface BuildEventParams {
  eventType?: string;
  source?: string;
  subjectKind?: string | null;
  subjectId?: string | null;
  outcome?: string;
  payload?: unknown;
  dedupKey?: string;
  occurredAtMs?: number | null;
  correlationId?: string | null;
  trust?: string;
}

interface AvailabilityState {
  checked: boolean;
  available: boolean;
  nextCheckAtMs: number;
}

interface DedupEntry {
  first: EventRecord;
  count: number;
  last: EventRecord;
}

interface DedupResult {
  firstEvent: EventRecord;
  lastEvent: EventRecord;
  occurrenceCount: number;
}

interface TypeAggregate {
  total: number;
  byOutcome: Record<string, number>;
  lastAtMs: number;
}

export interface WeeklyReportParams {
  records?: RawEventRow[];
  generatedAtMs?: number | null;
  lookbackMs?: number | null;
}

interface WeeklyReportResult {
  markdown: string;
  counts: {
    total: number;
    byOutcome: Record<string, number>;
    byType: Record<string, TypeAggregate>;
  };
  generatedAtMs: number;
  windowStartMs: number;
  windowEndMs: number;
}

interface EventStoreStatus {
  available?: boolean;
  error?: string;
}

export interface UnifiedWeeklyReportParams {
  eventsRecords?: RawEventRow[];
  notionSyncRecords?: Array<Record<string, unknown>>;
  orchestrationReceipts?: OrchestrationReceipt[];
  memoryItems?: Array<Record<string, unknown>>;
  generatedAtMs?: number | null;
  lookbackMs?: number | null;
}

interface UnifiedWeeklyReportResult {
  markdown: string;
  counts: {
    receipts: number;
    receiptByStatus: Record<string, number>;
    receiptByAgent: Record<string, number>;
    events: {
      total: number;
      byOutcome: Record<string, number>;
      byType: Record<string, TypeAggregate>;
    };
    memoryItems: number;
    memoryByCategory: Record<string, number>;
    notionRecords: number;
    notionConflicts: number;
    notionPending: number;
  };
  generatedAtMs: number;
  windowStartMs: number;
  windowEndMs: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const EVENT_OUTCOMES = Object.freeze({
  SUCCESS: 'success',
  FAILURE: 'failure',
  BLOCKED: 'blocked',
  PENDING: 'pending',
  SKIPPED: 'skipped'
});

export const EVENT_TRUST_STATES = Object.freeze({
  VERIFIED: 'verified',
  INFERRED: 'inferred',
  PENDING: 'pending',
  FAILED: 'failed',
  STALE: 'stale'
});

export const EVENT_SOURCES = Object.freeze({
  ALPHONSO: 'alphonso',
  ALPHONSO_OPERATOR: 'alphonso/operator',
  ALPHONSO_ONBOARDING: 'alphonso/onboarding',
  ALPHONSO_NOTION: 'alphonso/notion_sync',
  SYSTEM: 'system',
  OLLAMA: 'ollama'
});

const availability: AvailabilityState = {
  checked: false,
  available: false,
  nextCheckAtMs: 0
};

export function resetEventsAvailability(): void {
  availability.checked = false;
  availability.available = false;
  availability.nextCheckAtMs = 0;
}

export function buildEventId(dedupKey: string, occurredAtMs: number): string {
  const k = String(dedupKey || '').trim() || 'event';
  const ts = Math.max(0, Number(occurredAtMs || timestampMs()));
  return `evt:${k}:${ts}`;
}

export function normalizeEventRecord(row: RawEventRow = {}): EventRecord {
  return {
    id: row.id || buildEventId(row.dedupKey || row.dedup_key || '', row.occurredAtMs || row.occurred_at_ms || timestampMs()),
    eventType: row.eventType || row.event_type || 'unknown',
    source: row.source || EVENT_SOURCES.SYSTEM,
    subjectKind: row.subjectKind ?? row.subject_kind ?? null,
    subjectId: row.subjectId ?? row.subject_id ?? null,
    outcome: row.outcome || EVENT_OUTCOMES.PENDING,
    payload: row.payload ?? null,
    dedupKey: row.dedupKey || row.dedup_key || '',
    occurredAtMs: Number(row.occurredAtMs || row.occurred_at_ms || timestampMs()),
    recordedAtMs: Number(row.recordedAtMs || row.recorded_at_ms || row.occurredAtMs || row.occurred_at_ms || timestampMs()),
    correlationId: row.correlationId ?? row.correlation_id ?? null,
    trust: row.trust || TRUST_STATES.INFERRED
  };
}

export function buildEvent({
  eventType,
  source = EVENT_SOURCES.ALPHONSO,
  subjectKind = null,
  subjectId = null,
  outcome = EVENT_OUTCOMES.SUCCESS,
  payload = null,
  dedupKey,
  occurredAtMs = null,
  correlationId = null,
  trust = TRUST_STATES.VERIFIED
}: BuildEventParams = {}): EventRecord {
  const ts = Number(occurredAtMs || timestampMs());
  const finalDedup = String(dedupKey || `${eventType}:${subjectKind || 'global'}:${subjectId || ts}`);
  return {
    id: buildEventId(finalDedup, ts),
    eventType: String(eventType || 'unknown'),
    source: String(source || EVENT_SOURCES.SYSTEM),
    subjectKind: subjectKind ? String(subjectKind) : null,
    subjectId: subjectId ? String(subjectId) : null,
    outcome: String(outcome || EVENT_OUTCOMES.PENDING),
    payload: payload ?? null,
    dedupKey: finalDedup,
    occurredAtMs: ts,
    correlationId: correlationId ? String(correlationId) : null,
    trust: String(trust || TRUST_STATES.INFERRED)
  };
}

export function buildOllamaPreflightEvent({ endpoint, model, ok, error = null, correlationId = null }: { endpoint?: string; model?: string; ok?: boolean; error?: string | null; correlationId?: string | null } = {}): EventRecord {
  const outcome = ok ? EVENT_OUTCOMES.SUCCESS : EVENT_OUTCOMES.FAILURE;
  const trust = ok ? TRUST_STATES.VERIFIED : TRUST_STATES.FAILED;
  return buildEvent({
    eventType: 'ollama.preflight',
    source: EVENT_SOURCES.ALPHONSO_OPERATOR,
    subjectKind: 'ollama_model',
    subjectId: model || null,
    outcome,
    payload: { endpoint: endpoint || 'http://127.0.0.1:11434', model, ok: Boolean(ok), error },
    dedupKey: `ollama.preflight:${model || 'runtime'}:${endpoint || 'default'}`,
    correlationId,
    trust
  });
}

export function buildNotionSyncEvent({ direction, notionPageId, projectId, taskId, workflowId, outcome, sourceAgent = 'alphonso', reason = null }: { direction?: string; notionPageId?: string; projectId?: string; taskId?: string; workflowId?: string; outcome?: string; sourceAgent?: string; reason?: string | null } = {}): EventRecord {
  const dir = String(direction || 'pull');
  const finalOutcome = outcome || EVENT_OUTCOMES.SUCCESS;
  return buildEvent({
    eventType: `notion.sync.${dir}`,
    source: EVENT_SOURCES.ALPHONSO_NOTION,
    subjectKind: 'notion_page',
    subjectId: notionPageId ? String(notionPageId) : null,
    outcome: finalOutcome,
    payload: { projectId, taskId, workflowId, sourceAgent, reason },
    dedupKey: `notion.sync.${dir}:${projectId || 'p'}:${taskId || 't'}:${notionPageId || 'no_page'}`,
    correlationId: workflowId ? `wf:${workflowId}` : null
  });
}

export function dedupeEvents(records: RawEventRow[] = []): DedupResult[] {
  const byKey = new Map<string, DedupEntry>();
  for (const raw of records) {
    const ev = normalizeEventRecord(raw);
    if (!ev.dedupKey) continue;
    const prev = byKey.get(ev.dedupKey);
    if (!prev) {
      byKey.set(ev.dedupKey, { first: ev, count: 1, last: ev });
    } else {
      prev.count += 1;
      if (ev.occurredAtMs >= prev.last.occurredAtMs) prev.last = ev;
      if (ev.occurredAtMs < prev.first.occurredAtMs) prev.first = ev;
    }
  }
  return Array.from(byKey.values()).map((entry) => ({
    firstEvent: entry.first,
    lastEvent: entry.last,
    occurrenceCount: entry.count
  }));
}

export function aggregateEventsByType(records: RawEventRow[] = []): Record<string, TypeAggregate> {
  const byType: Record<string, TypeAggregate> = {};
  for (const raw of records) {
    const ev = normalizeEventRecord(raw);
    if (!byType[ev.eventType]) {
      byType[ev.eventType] = { total: 0, byOutcome: {}, lastAtMs: 0 };
    }
    const bucket = byType[ev.eventType];
    bucket.total += 1;
    bucket.byOutcome[ev.outcome] = (bucket.byOutcome[ev.outcome] || 0) + 1;
    if (ev.occurredAtMs > bucket.lastAtMs) bucket.lastAtMs = ev.occurredAtMs;
  }
  return byType;
}

export function aggregateEventsWeekly({ records = [], generatedAtMs = null, lookbackMs = null }: WeeklyReportParams = {}): WeeklyReportResult {
  const now = Number(generatedAtMs || timestampMs());
  const lookback = Number(lookbackMs || 7 * 24 * 60 * 60 * 1000);
  const cutoff = now - lookback;
  const recent = records
    .map((r) => normalizeEventRecord(r))
    .filter((r) => r.occurredAtMs >= cutoff);
  const byType = aggregateEventsByType(recent);
  const outcomeCounts: Record<string, number> = { success: 0, failure: 0, blocked: 0, pending: 0, skipped: 0 };
  for (const r of recent) {
    outcomeCounts[r.outcome] = (outcomeCounts[r.outcome] || 0) + 1;
  }
  const lines: string[] = [];
  lines.push('# Events — Weekly Summary');
  lines.push('');
  lines.push(`- Window: last ${Math.round(lookback / (24 * 60 * 60 * 1000))} days`);
  lines.push(`- Generated at: ${new Date(now).toISOString()}`);
  lines.push(`- Total events: ${recent.length}`);
  lines.push(`- Success: ${outcomeCounts.success}, Failure: ${outcomeCounts.failure}, Blocked: ${outcomeCounts.blocked}, Pending: ${outcomeCounts.pending}, Skipped: ${outcomeCounts.skipped}`);
  lines.push('');
  lines.push('## By event type');
  const types = Object.keys(byType).sort();
  if (types.length === 0) {
    lines.push('- (no events in window)');
  } else {
    for (const t of types) {
      const b = byType[t];
      const last = new Date(b.lastAtMs).toISOString();
      lines.push(`- ${t}: ${b.total} (last ${last})`);
    }
  }
  lines.push('');
  lines.push(`Generated at ${new Date(now).toISOString()}.`);
  return {
    markdown: lines.join('\n'),
    counts: {
      total: recent.length,
      byOutcome: outcomeCounts,
      byType
    },
    generatedAtMs: now,
    windowStartMs: cutoff,
    windowEndMs: now
  };
}

export async function isEventsTableAvailable(force: boolean = false): Promise<boolean> {
  const now = timestampMs();
  if (!force && availability.checked && availability.nextCheckAtMs > now) {
    return availability.available;
  }
  try {
    const status = await invoke('get_event_store_status') as EventStoreStatus;
    availability.checked = true;
    availability.available = Boolean(status?.available);
    availability.nextCheckAtMs = now + (availability.available ? 60_000 : 20_000);
    return availability.available;
  } catch {
    availability.checked = true;
    availability.available = false;
    availability.nextCheckAtMs = now + 20_000;
    return false;
  }
}

export async function getEventStoreStatus(): Promise<EventStoreStatus> {
  try {
    return await invoke('get_event_store_status') as EventStoreStatus;
  } catch (err: unknown) {
    return { available: false, error: (err as Error)?.message || String(err) };
  }
}

export async function recordEvent(event: RawEventRow | EventRecord): Promise<{ ok: boolean; blocked?: boolean; reason?: string; proof?: unknown; event?: EventRecord }> {
  const available = await isEventsTableAvailable();
  if (!available) return { ok: false, blocked: true, reason: 'events_table_unavailable' };
  const enriched = (event as EventRecord).dedupKey ? event as EventRecord : buildEvent(event as BuildEventParams);
  const normalized = normalizeEventRecord(enriched as RawEventRow);
  try {
    const proof = await invoke('record_event', { event: normalized });
    return { ok: true, proof, event: normalized };
  } catch (err: unknown) {
    return { ok: false, blocked: false, reason: (err as Error)?.message || String(err) };
  }
}

export async function listEvents(filters: Record<string, unknown> = {}): Promise<EventRecord[]> {
  const available = await isEventsTableAvailable();
  if (!available) return [];
  try {
    const rows = await invoke('list_events_command', { filters }) as unknown[];
    return Array.isArray(rows) ? rows.map((r) => normalizeEventRecord(r as RawEventRow)) : [];
  } catch {
    return [];
  }
}

export async function listEventDedup(limit: number = 200): Promise<unknown[]> {
  const available = await isEventsTableAvailable();
  if (!available) return [];
  try {
    const rows = await invoke('list_event_dedup_command', { limit }) as unknown[];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export function unifiedWeeklyReport({
  eventsRecords = [],
  notionSyncRecords = [],
  orchestrationReceipts = [],
  memoryItems = [],
  generatedAtMs = null,
  lookbackMs = null
}: UnifiedWeeklyReportParams = {}): UnifiedWeeklyReportResult {
  const now = Number(generatedAtMs || timestampMs());
  const lookback = Number(lookbackMs || 7 * 24 * 60 * 60 * 1000);
  const cutoff = now - lookback;

  const eventsReport = aggregateEventsWeekly({ records: eventsRecords, generatedAtMs: now, lookbackMs: lookback });

  const recentReceipts = orchestrationReceipts.filter((r) => Number(r.timestampMs || 0) >= cutoff);
  const receiptByStatus: Record<string, number> = {};
  for (const r of recentReceipts) {
    const s = (r.status as string) || 'unknown';
    receiptByStatus[s] = (receiptByStatus[s] || 0) + 1;
  }
  const receiptByAgent: Record<string, number> = {};
  for (const r of recentReceipts) {
    const a = (r.agent as string) || 'unknown';
    receiptByAgent[a] = (receiptByAgent[a] || 0) + 1;
  }

  const recentMemory = memoryItems.filter((m) => Number(m.timestampMs || 0) >= cutoff);
  const memoryByCategory: Record<string, number> = {};
  for (const m of recentMemory) {
    const c = (m.category as string) || 'unknown';
    memoryByCategory[c] = (memoryByCategory[c] || 0) + 1;
  }

  const lines: string[] = [];
  lines.push('# Alphonso — Unified Weekly Report');
  lines.push('');
  lines.push(`- Window: last ${Math.round(lookback / (24 * 60 * 60 * 1000))} days`);
  lines.push(`- Generated at: ${new Date(now).toISOString()}`);
  lines.push('');

  lines.push('## Commands Executed');
  lines.push(`- Total orchestration receipts: ${recentReceipts.length}`);
  const statusKeys = Object.keys(receiptByStatus).sort();
  if (statusKeys.length === 0) {
    lines.push('- (no receipts in window)');
  } else {
    for (const s of statusKeys) {
      lines.push(`- ${s}: ${receiptByStatus[s]}`);
    }
  }
  lines.push('');

  lines.push('## Agent Activity');
  const agentKeys = Object.keys(receiptByAgent).sort();
  if (agentKeys.length === 0) {
    lines.push('- (no agent activity in window)');
  } else {
    for (const a of agentKeys) {
      lines.push(`- ${a}: ${receiptByAgent[a]} receipts`);
    }
  }
  lines.push('');

  lines.push('## Connector Activity');
  lines.push(`- Total events: ${eventsReport.counts.total}`);
  lines.push(`- Success: ${eventsReport.counts.byOutcome.success}, Failure: ${eventsReport.counts.byOutcome.failure}`);
  const eventTypes = Object.keys(eventsReport.counts.byType).sort();
  if (eventTypes.length === 0) {
    lines.push('- (no events in window)');
  } else {
    for (const t of eventTypes) {
      lines.push(`- ${t}: ${eventsReport.counts.byType[t].total}`);
    }
  }
  lines.push('');

  lines.push('## Memory Changes');
  lines.push(`- New memory items: ${recentMemory.length}`);
  const catKeys = Object.keys(memoryByCategory).sort();
  if (catKeys.length === 0) {
    lines.push('- (no memory changes in window)');
  } else {
    for (const c of catKeys) {
      lines.push(`- ${c}: ${memoryByCategory[c]}`);
    }
  }
  lines.push('');

  lines.push('## Notion Sync');
  const notionConflicts = notionSyncRecords.filter((r) => (r as Record<string, unknown>)?.sync && ((r as Record<string, unknown>).sync as Record<string, unknown>)?.conflict_status && ((r as Record<string, unknown>).sync as Record<string, unknown>).conflict_status !== 'clean');
  const notionPending = notionSyncRecords.filter((r) => (r as Record<string, unknown>)?.sync && ((r as Record<string, unknown>).sync as Record<string, unknown>)?.approval_status === 'pending');
  lines.push(`- Total sync records: ${notionSyncRecords.length}`);
  lines.push(`- Conflicts: ${notionConflicts.length}`);
  lines.push(`- Pending approvals: ${notionPending.length}`);
  lines.push('');

  lines.push(`Generated at ${new Date(now).toISOString()}.`);

  return {
    markdown: lines.join('\n'),
    counts: {
      receipts: recentReceipts.length,
      receiptByStatus,
      receiptByAgent,
      events: eventsReport.counts,
      memoryItems: recentMemory.length,
      memoryByCategory,
      notionRecords: notionSyncRecords.length,
      notionConflicts: notionConflicts.length,
      notionPending: notionPending.length
    },
    generatedAtMs: now,
    windowStartMs: cutoff,
    windowEndMs: now
  };
}

export const EVENTS_SERVICE_PUBLIC_API = Object.freeze({
  outcomes: EVENT_OUTCOMES,
  trustStates: EVENT_TRUST_STATES,
  sources: EVENT_SOURCES,
  buildEventId,
  normalizeEventRecord,
  buildEvent,
  buildOllamaPreflightEvent,
  buildNotionSyncEvent,
  dedupeEvents,
  aggregateEventsByType,
  aggregateEventsWeekly,
  unifiedWeeklyReport,
  isEventsTableAvailable,
  getEventStoreStatus,
  recordEvent,
  listEvents,
  listEventDedup
});

export default EVENTS_SERVICE_PUBLIC_API;
