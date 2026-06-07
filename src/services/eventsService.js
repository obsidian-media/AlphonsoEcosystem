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

const availability = {
  checked: false,
  available: false,
  nextCheckAtMs: 0
};

export function buildEventId(dedupKey, occurredAtMs) {
  const k = String(dedupKey || '').trim() || 'event';
  const ts = Math.max(0, Number(occurredAtMs || timestampMs()));
  return `evt:${k}:${ts}`;
}

export function normalizeEventRecord(row = {}) {
  return {
    id: row.id || buildEventId(row.dedupKey || row.dedup_key, row.occurredAtMs || row.occurred_at_ms),
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
} = {}) {
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

export function buildOllamaPreflightEvent({ endpoint, model, ok, error = null, correlationId = null } = {}) {
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

export function buildNotionSyncEvent({ direction, notionPageId, projectId, taskId, workflowId, outcome, sourceAgent = 'alphonso', reason = null } = {}) {
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

export function dedupeEvents(records = []) {
  const byKey = new Map();
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

export function aggregateEventsByType(records = []) {
  const byType = {};
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

export function aggregateEventsWeekly({ records = [], generatedAtMs = null, lookbackMs = null } = {}) {
  const now = Number(generatedAtMs || timestampMs());
  const lookback = Number(lookbackMs || 7 * 24 * 60 * 60 * 1000);
  const cutoff = now - lookback;
  const recent = records
    .map((r) => normalizeEventRecord(r))
    .filter((r) => r.occurredAtMs >= cutoff);
  const byType = aggregateEventsByType(recent);
  const outcomeCounts = { success: 0, failure: 0, blocked: 0, pending: 0, skipped: 0 };
  for (const r of recent) {
    outcomeCounts[r.outcome] = (outcomeCounts[r.outcome] || 0) + 1;
  }
  const lines = [];
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

export async function isEventsTableAvailable(force = false) {
  const now = timestampMs();
  if (!force && availability.checked && availability.nextCheckAtMs > now) {
    return availability.available;
  }
  try {
    const status = await invoke('get_event_store_status');
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

export async function getEventStoreStatus() {
  try {
    return await invoke('get_event_store_status');
  } catch (err) {
    return { available: false, error: err?.message || String(err) };
  }
}

export async function recordEvent(event) {
  const available = await isEventsTableAvailable();
  if (!available) return { ok: false, blocked: true, reason: 'events_table_unavailable' };
  const normalized = normalizeEventRecord(event);
  try {
    const proof = await invoke('record_event', { event: normalized });
    return { ok: true, proof, event: normalized };
  } catch (err) {
    return { ok: false, blocked: false, reason: err?.message || String(err) };
  }
}

export async function listEvents(filters = {}) {
  const available = await isEventsTableAvailable();
  if (!available) return [];
  try {
    const rows = await invoke('list_events_command', { filters });
    return Array.isArray(rows) ? rows.map((r) => normalizeEventRecord(r)) : [];
  } catch {
    return [];
  }
}

export async function listEventDedup(limit = 200) {
  const available = await isEventsTableAvailable();
  if (!available) return [];
  try {
    const rows = await invoke('list_event_dedup_command', { limit });
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
} = {}) {
  const now = Number(generatedAtMs || timestampMs());
  const lookback = Number(lookbackMs || 7 * 24 * 60 * 60 * 1000);
  const cutoff = now - lookback;

  const eventsReport = aggregateEventsWeekly({ records: eventsRecords, generatedAtMs: now, lookbackMs: lookback });

  const recentReceipts = orchestrationReceipts.filter((r) => Number(r.timestampMs || 0) >= cutoff);
  const receiptByStatus = {};
  for (const r of recentReceipts) {
    const s = r.status || 'unknown';
    receiptByStatus[s] = (receiptByStatus[s] || 0) + 1;
  }
  const receiptByAgent = {};
  for (const r of recentReceipts) {
    const a = r.agent || 'unknown';
    receiptByAgent[a] = (receiptByAgent[a] || 0) + 1;
  }

  const recentMemory = memoryItems.filter((m) => Number(m.timestampMs || 0) >= cutoff);
  const memoryByCategory = {};
  for (const m of recentMemory) {
    const c = m.category || 'unknown';
    memoryByCategory[c] = (memoryByCategory[c] || 0) + 1;
  }

  const lines = [];
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
  const notionConflicts = notionSyncRecords.filter((r) => r?.sync?.conflict_status && r.sync.conflict_status !== 'clean');
  const notionPending = notionSyncRecords.filter((r) => r?.sync?.approval_status === 'pending');
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
