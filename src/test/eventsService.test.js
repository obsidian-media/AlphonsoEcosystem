import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn()
}));

import { invoke } from '@tauri-apps/api/core';
import {
  EVENT_OUTCOMES,
  EVENT_TRUST_STATES,
  EVENT_SOURCES,
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
  listEventDedup,
  EVENTS_SERVICE_PUBLIC_API
} from '../services/eventsService.js';

describe('eventsService — constants', () => {
  it('exposes stable outcomes / trust / sources', () => {
    expect(EVENT_OUTCOMES.SUCCESS).toBe('success');
    expect(EVENT_OUTCOMES.FAILURE).toBe('failure');
    expect(EVENT_OUTCOMES.BLOCKED).toBe('blocked');
    expect(EVENT_TRUST_STATES.VERIFIED).toBe('verified');
    expect(EVENT_SOURCES.ALPHONSO).toBe('alphonso');
    expect(EVENT_SOURCES.ALPHONSO_NOTION).toBe('alphonso/notion_sync');
  });
});

describe('eventsService — pure helpers', () => {
  it('buildEventId is deterministic from dedup_key + ts', () => {
    expect(buildEventId('ollama.preflight:llama3.2:3b', 1700000000000)).toBe('evt:ollama.preflight:llama3.2:3b:1700000000000');
    expect(buildEventId('ollama.preflight:llama3.2:3b', 1700000000000)).toBe(buildEventId('ollama.preflight:llama3.2:3b', 1700000000000));
  });

  it('buildEventId falls back to timestamp when dedupKey is empty', () => {
    const id = buildEventId('', 42);
    expect(id).toMatch(/^evt:event:42$/);
  });

  it('normalizeEventRecord accepts snake_case and camelCase', () => {
    const a = normalizeEventRecord({ id: 'a', eventType: 'x', dedup_key: 'k', occurred_at_ms: 1 });
    const b = normalizeEventRecord({ id: 'a', eventType: 'x', dedupKey: 'k', occurredAtMs: 1 });
    expect(a.id).toBe('a');
    expect(b.id).toBe('a');
    expect(a.eventType).toBe('x');
    expect(a.occurredAtMs).toBe(1);
  });

  it('normalizeEventRecord uses sensible defaults', () => {
    const rec = normalizeEventRecord({});
    expect(rec.eventType).toBe('unknown');
    expect(rec.outcome).toBe(EVENT_OUTCOMES.PENDING);
    expect(rec.trust).toBe(EVENT_TRUST_STATES.INFERRED);
    expect(typeof rec.occurredAtMs).toBe('number');
  });

  it('buildEvent derives dedupKey from eventType + subject', () => {
    const ev = buildEvent({
      eventType: 'ollama.preflight',
      subjectKind: 'ollama_model',
      subjectId: 'llama3.2:3b',
      occurredAtMs: 100
    });
    expect(ev.dedupKey).toBe('ollama.preflight:ollama_model:llama3.2:3b');
    expect(ev.id).toBe(buildEventId(ev.dedupKey, 100));
    expect(ev.outcome).toBe(EVENT_OUTCOMES.SUCCESS);
    expect(ev.trust).toBe(EVENT_TRUST_STATES.VERIFIED);
  });

  it('buildEvent forces a deterministic id when occurredAtMs is given', () => {
    const ev = buildEvent({ eventType: 't', occurredAtMs: 7 });
    expect(ev.id).toBe('evt:t:global:7:7');
    expect(ev.dedupKey).toBe('t:global:7');
  });

  it('buildOllamaPreflightEvent produces success/failure correctly', () => {
    const ok = buildOllamaPreflightEvent({ endpoint: 'http://x', model: 'm1', ok: true });
    expect(ok.outcome).toBe(EVENT_OUTCOMES.SUCCESS);
    expect(ok.subjectKind).toBe('ollama_model');
    expect(ok.subjectId).toBe('m1');
    expect(ok.trust).toBe(EVENT_TRUST_STATES.VERIFIED);
    expect(ok.dedupKey).toBe('ollama.preflight:m1:http://x');
    const fail = buildOllamaPreflightEvent({ endpoint: 'http://x', model: 'm1', ok: false, error: 'connection refused' });
    expect(fail.outcome).toBe(EVENT_OUTCOMES.FAILURE);
    expect(fail.trust).toBe(EVENT_TRUST_STATES.FAILED);
    expect(fail.payload.error).toBe('connection refused');
  });

  it('buildNotionSyncEvent includes correlationId when workflowId is present', () => {
    const ev = buildNotionSyncEvent({
      direction: 'pull',
      notionPageId: 'abc123def456abc1',
      projectId: 'p-1',
      taskId: 't-1',
      workflowId: 'w-1',
      outcome: EVENT_OUTCOMES.FAILURE
    });
    expect(ev.eventType).toBe('notion.sync.pull');
    expect(ev.subjectId).toBe('abc123def456abc1');
    expect(ev.correlationId).toBe('wf:w-1');
    expect(ev.outcome).toBe(EVENT_OUTCOMES.FAILURE);
  });
});

describe('eventsService — dedup + aggregates', () => {
  const baseRow = (overrides = {}) => ({
    eventType: 'ollama.preflight',
    source: EVENT_SOURCES.ALPHONSO_OPERATOR,
    outcome: EVENT_OUTCOMES.SUCCESS,
    dedupKey: 'k1',
    occurredAtMs: 100,
    ...overrides
  });

  it('dedupeEvents collapses by dedupKey and counts occurrences', () => {
    const grouped = dedupeEvents([
      baseRow({ occurredAtMs: 100, id: 'a' }),
      baseRow({ occurredAtMs: 200, id: 'b' }),
      baseRow({ occurredAtMs: 150, id: 'c', dedupKey: 'k2' })
    ]);
    expect(grouped).toHaveLength(2);
    const k1 = grouped.find((g) => g.firstEvent.dedupKey === 'k1');
    expect(k1.occurrenceCount).toBe(2);
    expect(k1.firstEvent.occurredAtMs).toBe(100);
    expect(k1.lastEvent.occurredAtMs).toBe(200);
  });

  it('dedupeEvents is deterministic on a single record', () => {
    const grouped = dedupeEvents([baseRow({ id: 'a', occurredAtMs: 100 })]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].firstEvent.id).toBe('a');
    expect(grouped[0].lastEvent.id).toBe('a');
    expect(grouped[0].occurrenceCount).toBe(1);
  });

  it('aggregateEventsByType counts by eventType + outcome', () => {
    const byType = aggregateEventsByType([
      baseRow({ outcome: EVENT_OUTCOMES.SUCCESS }),
      baseRow({ dedupKey: 'k2', occurredAtMs: 200, outcome: EVENT_OUTCOMES.FAILURE }),
      baseRow({ eventType: 'notion.sync.pull', dedupKey: 'k3', occurredAtMs: 300, outcome: EVENT_OUTCOMES.SUCCESS })
    ]);
    expect(byType['ollama.preflight'].total).toBe(2);
    expect(byType['ollama.preflight'].byOutcome[EVENT_OUTCOMES.SUCCESS]).toBe(1);
    expect(byType['ollama.preflight'].byOutcome[EVENT_OUTCOMES.FAILURE]).toBe(1);
    expect(byType['notion.sync.pull'].total).toBe(1);
  });

  it('aggregateEventsWeekly returns markdown + counts within window', () => {
    const now = 1700000000000;
    const out = aggregateEventsWeekly({
      records: [
        baseRow({ occurredAtMs: now - 1000 }),
        baseRow({ dedupKey: 'k2', occurredAtMs: now - 2000, outcome: EVENT_OUTCOMES.FAILURE })
      ],
      generatedAtMs: now
    });
    expect(out.counts.total).toBe(2);
    expect(out.counts.byOutcome.success).toBe(1);
    expect(out.counts.byOutcome.failure).toBe(1);
    expect(out.markdown).toMatch(/# Events .* Weekly Summary/);
  });

  it('aggregateEventsWeekly excludes events outside the window', () => {
    const now = 1700000000000;
    const out = aggregateEventsWeekly({
      records: [
        baseRow({ occurredAtMs: now - 1000 }),
        baseRow({ occurredAtMs: now - 9 * 24 * 60 * 60 * 1000 })
      ],
      generatedAtMs: now
    });
    expect(out.counts.total).toBe(1);
  });

  it('aggregateEventsWeekly handles empty input gracefully', () => {
    const out = aggregateEventsWeekly({ records: [], generatedAtMs: 1700000000000 });
    expect(out.counts.total).toBe(0);
    expect(out.markdown).toMatch(/no events in window/);
  });
});

describe('eventsService — Tauri wrapper', () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it('isEventsTableAvailable returns false when invoke throws', async () => {
    invoke.mockRejectedValue(new Error('not in tauri'));
    const ok = await isEventsTableAvailable(true);
    expect(ok).toBe(false);
  });

  it('isEventsTableAvailable caches result and refreshes after ttl', async () => {
    invoke.mockResolvedValue({ available: true });
    const a = await isEventsTableAvailable(true);
    expect(a).toBe(true);
    const b = await isEventsTableAvailable();
    expect(b).toBe(true);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('getEventStoreStatus returns payload on success', async () => {
    invoke.mockResolvedValue({ available: true, eventCount: 4 });
    const s = await getEventStoreStatus();
    expect(s.available).toBe(true);
    expect(s.eventCount).toBe(4);
  });

  it('getEventStoreStatus returns fallback on error', async () => {
    invoke.mockRejectedValue(new Error('boom'));
    const s = await getEventStoreStatus();
    expect(s.available).toBe(false);
    expect(s.error).toBe('boom');
  });

  it('recordEvent blocks cleanly when table is unavailable', async () => {
    invoke.mockRejectedValue(new Error('no tauri'));
    const r = await recordEvent({ eventType: 'x' });
    expect(r.ok).toBe(false);
    expect(r.blocked).toBe(true);
    expect(r.reason).toBe('events_table_unavailable');
  });

  it('recordEvent invokes the Tauri command with a normalized event', async () => {
    invoke
      .mockResolvedValueOnce({ available: true })
      .mockResolvedValueOnce({ requested: 1, written: 1, deduped: 0, trust: 'verified' });
    const r = await recordEvent({ eventType: 'ollama.preflight', subjectId: 'm1' });
    expect(r.ok).toBe(true);
    expect(r.event.dedupKey).toBe('ollama.preflight:global:m1');
    expect(invoke).toHaveBeenLastCalledWith('record_event', expect.objectContaining({ event: expect.objectContaining({ eventType: 'ollama.preflight' }) }));
  });

  it('listEvents returns [] when invoke throws after the first probe', async () => {
    invoke.mockResolvedValueOnce({ available: true }).mockRejectedValueOnce(new Error('db locked'));
    const out = await listEvents();
    expect(out).toEqual([]);
  });

  it('listEvents normalizes rows on success', async () => {
    invoke.mockResolvedValueOnce({ available: true }).mockResolvedValueOnce([
      { id: 'a', event_type: 'ollama.preflight', source: 'alphonso', outcome: 'success', dedup_key: 'k1', occurred_at_ms: 100 }
    ]);
    const out = await listEvents();
    expect(out).toHaveLength(1);
    expect(out[0].eventType).toBe('ollama.preflight');
    expect(out[0].dedupKey).toBe('k1');
  });

  it('listEventDedup returns [] when invoke throws after probe', async () => {
    invoke.mockResolvedValueOnce({ available: true }).mockRejectedValueOnce(new Error('db locked'));
    const out = await listEventDedup();
    expect(out).toEqual([]);
  });

  it('listEventDedup returns rows on success', async () => {
    invoke.mockResolvedValueOnce({ available: true }).mockResolvedValueOnce([
      { dedupKey: 'k1', firstEventId: 'a', firstOccurredAtMs: 100, occurrenceCount: 3, lastOccurredAtMs: 300, lastOutcome: 'success' }
    ]);
    const out = await listEventDedup();
    expect(out).toHaveLength(1);
    expect(out[0].occurrenceCount).toBe(3);
  });

  it('public API surface exposes all helpers', () => {
    expect(EVENTS_SERVICE_PUBLIC_API.buildEvent).toBe(buildEvent);
    expect(EVENTS_SERVICE_PUBLIC_API.aggregateEventsWeekly).toBe(aggregateEventsWeekly);
    expect(EVENTS_SERVICE_PUBLIC_API.unifiedWeeklyReport).toBe(unifiedWeeklyReport);
    expect(EVENTS_SERVICE_PUBLIC_API.recordEvent).toBe(recordEvent);
  });
});

describe('unifiedWeeklyReport', () => {
  it('returns markdown with all sections', () => {
    const result = unifiedWeeklyReport({});
    expect(result.markdown).toContain('Unified Weekly Report');
    expect(result.markdown).toContain('Commands Executed');
    expect(result.markdown).toContain('Agent Activity');
    expect(result.markdown).toContain('Connector Activity');
    expect(result.markdown).toContain('Memory Changes');
    expect(result.markdown).toContain('Notion Sync');
  });

  it('includes counts object', () => {
    const result = unifiedWeeklyReport({});
    expect(result.counts).toHaveProperty('receipts');
    expect(result.counts).toHaveProperty('events');
    expect(result.counts).toHaveProperty('memoryItems');
    expect(result.counts).toHaveProperty('notionRecords');
  });

  it('aggregates orchestration receipts by status and agent', () => {
    const receipts = [
      { id: 'r1', status: 'reported_to_jose', agent: 'miya', timestampMs: Date.now() },
      { id: 'r2', status: 'dead_letter', agent: 'hector', timestampMs: Date.now() },
      { id: 'r3', status: 'reported_to_jose', agent: 'miya', timestampMs: Date.now() }
    ];
    const result = unifiedWeeklyReport({ orchestrationReceipts: receipts });
    expect(result.counts.receiptByStatus.reported_to_jose).toBe(2);
    expect(result.counts.receiptByStatus.dead_letter).toBe(1);
    expect(result.counts.receiptByAgent.miya).toBe(2);
    expect(result.counts.receiptByAgent.hector).toBe(1);
  });

  it('aggregates memory items by category', () => {
    const items = [
      { id: 'm1', category: 'creative_memory', timestampMs: Date.now() },
      { id: 'm2', category: 'creative_memory', timestampMs: Date.now() },
      { id: 'm3', category: 'research_memory', timestampMs: Date.now() }
    ];
    const result = unifiedWeeklyReport({ memoryItems: items });
    expect(result.counts.memoryByCategory.creative_memory).toBe(2);
    expect(result.counts.memoryByCategory.research_memory).toBe(1);
  });

  it('filters items outside the lookback window', () => {
    const old = Date.now() - 10 * 24 * 60 * 60 * 1000;
    const receipts = [{ id: 'r1', status: 'executed', agent: 'jose', timestampMs: old }];
    const result = unifiedWeeklyReport({ orchestrationReceipts: receipts });
    expect(result.counts.receipts).toBe(0);
  });

  it('handles empty data gracefully', () => {
    const result = unifiedWeeklyReport({
      eventsRecords: [],
      notionSyncRecords: [],
      orchestrationReceipts: [],
      memoryItems: []
    });
    expect(result.markdown).toContain('(no receipts in window)');
    expect(result.markdown).toContain('(no memory changes in window)');
  });

  it('exposed on public API surface', () => {
    expect(EVENTS_SERVICE_PUBLIC_API.unifiedWeeklyReport).toBe(unifiedWeeklyReport);
  });
});
