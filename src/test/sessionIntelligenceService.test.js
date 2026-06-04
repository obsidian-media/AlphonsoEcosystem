import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/runtimeLedgerService.js', () => ({
  persistScopeRows: vi.fn()
}));

const { appendSessionEvent, listSessionEvents, summarizeSession, SESSION_EVENT_SCOPE } = await import('../services/sessionIntelligenceService.js');

describe('sessionIntelligenceService', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('SESSION_EVENT_SCOPE', () => {
    it('exports scope as a string', () => {
      expect(typeof SESSION_EVENT_SCOPE).toBe('string');
      expect(SESSION_EVENT_SCOPE).toBe('session_events_v1');
    });
  });

  describe('appendSessionEvent', () => {
    it('creates an event with auto-generated id', () => {
      const event = appendSessionEvent({ category: 'task', title: 'Test event', details: { status: 'started' } });
      expect(event.id).toMatch(/^evt-\d+-[a-f0-9]+$/);
    });

    it('stores category and title', () => {
      const event = appendSessionEvent({ category: 'interaction', title: 'User typed', details: {} });
      expect(event.category).toBe('interaction');
      expect(event.title).toBe('User typed');
    });

    it('defaults agent to alphonso', () => {
      const event = appendSessionEvent({ category: 'task', title: 'T', details: {} });
      expect(event.agent).toBe('alphonso');
    });

    it('uses provided agent', () => {
      const event = appendSessionEvent({ category: 'task', title: 'T', details: {}, agent: 'miya' });
      expect(event.agent).toBe('miya');
    });

    it('sets timestampMs to positive number', () => {
      const event = appendSessionEvent({ category: 'task', title: 'T', details: {} });
      expect(event.timestampMs).toBeGreaterThan(0);
    });

    it('persists to localStorage', () => {
      appendSessionEvent({ category: 'task', title: 'T', details: {} });
      const raw = localStorage.getItem('alphonso_session_events_v1');
      expect(raw).toBeTruthy();
      const stored = JSON.parse(raw);
      expect(stored.length).toBe(1);
    });

    it('appends multiple events', () => {
      appendSessionEvent({ category: 'task', title: 'E1', details: {} });
      appendSessionEvent({ category: 'interaction', title: 'E2', details: {} });
      const stored = JSON.parse(localStorage.getItem('alphonso_session_events_v1'));
      expect(stored.length).toBe(2);
    });

    it('defaults confidence to temporary', () => {
      const event = appendSessionEvent({ category: 'task', title: 'T', details: {} });
      expect(event.confidence).toBe('temporary');
    });

    it('uses provided confidence', () => {
      const event = appendSessionEvent({ category: 'task', title: 'T', details: {}, confidence: 'verified' });
      expect(event.confidence).toBe('verified');
    });
  });

  describe('listSessionEvents', () => {
    it('returns empty array when no events exist', () => {
      expect(listSessionEvents()).toEqual([]);
    });

    it('returns all stored events', () => {
      appendSessionEvent({ category: 'task', title: 'E1', details: {} });
      appendSessionEvent({ category: 'task', title: 'E2', details: {} });
      expect(listSessionEvents()).toHaveLength(2);
    });

    it('returns events in insertion order', () => {
      appendSessionEvent({ category: 'task', title: 'First', details: {} });
      appendSessionEvent({ category: 'task', title: 'Second', details: {} });
      const events = listSessionEvents();
      expect(events[0].title).toBe('First');
      expect(events[1].title).toBe('Second');
    });
  });

  describe('summarizeSession', () => {
    it('returns summary with correct structure', () => {
      const summary = summarizeSession(24);
      expect(summary).toHaveProperty('generatedAtMs');
      expect(summary).toHaveProperty('hours', 24);
      expect(summary).toHaveProperty('totalEvents');
      expect(summary).toHaveProperty('byCategory');
      expect(summary).toHaveProperty('warnings');
      expect(summary).toHaveProperty('unresolved');
      expect(summary).toHaveProperty('recommendations');
    });

    it('counts events by category', () => {
      appendSessionEvent({ category: 'task', title: 'T1', details: {} });
      appendSessionEvent({ category: 'task', title: 'T2', details: {} });
      appendSessionEvent({ category: 'interaction', title: 'I1', details: {} });
      const summary = summarizeSession(24);
      expect(summary.totalEvents).toBe(3);
      expect(summary.byCategory.task).toBe(2);
      expect(summary.byCategory.interaction).toBe(1);
    });

    it('filters events outside the time window', () => {
      const events = [
        { id: 'old', timestampMs: Date.now() - 100 * 60 * 60 * 1000, category: 'task', title: 'Old', details: {}, agent: 'alphonso', confidence: 'temporary', verificationState: 'unverified' },
        { id: 'new', timestampMs: Date.now(), category: 'task', title: 'New', details: {}, agent: 'alphonso', confidence: 'temporary', verificationState: 'unverified' }
      ];
      localStorage.setItem('alphonso_session_events_v1', JSON.stringify(events));
      const summary = summarizeSession(1);
      expect(summary.totalEvents).toBe(1);
      expect(summary.warnings).toHaveLength(0);
    });

    it('collects failed verification events as warnings', () => {
      const events = [
        { id: 'e1', timestampMs: Date.now(), category: 'task', title: 'Failed', details: {}, agent: 'alphonso', confidence: 'failed', verificationState: 'failed' }
      ];
      localStorage.setItem('alphonso_session_events_v1', JSON.stringify(events));
      const summary = summarizeSession(24);
      expect(summary.warnings).toHaveLength(1);
    });

    it('identifies unresolved tasks', () => {
      const events = [
        { id: 'e1', timestampMs: Date.now(), category: 'task', title: 'Pending', details: { status: 'in_progress' }, agent: 'alphonso', confidence: 'temporary', verificationState: 'unverified' }
      ];
      localStorage.setItem('alphonso_session_events_v1', JSON.stringify(events));
      const summary = summarizeSession(24);
      expect(summary.unresolved).toHaveLength(1);
    });

    it('does not count resolved tasks as unresolved', () => {
      const events = [
        { id: 'e1', timestampMs: Date.now(), category: 'task', title: 'Done', details: { status: 'resolved' }, agent: 'alphonso', confidence: 'verified', verificationState: 'verified' }
      ];
      localStorage.setItem('alphonso_session_events_v1', JSON.stringify(events));
      const summary = summarizeSession(24);
      expect(summary.unresolved).toHaveLength(0);
    });

    it('limits warnings to 20', () => {
      const events = Array.from({ length: 25 }, (_, i) => ({
        id: `e${i}`, timestampMs: Date.now(), category: 'task', title: `F${i}`, details: {},
        agent: 'alphonso', confidence: 'failed', verificationState: 'failed'
      }));
      localStorage.setItem('alphonso_session_events_v1', JSON.stringify(events));
      const summary = summarizeSession(24);
      expect(summary.warnings.length).toBeLessThanOrEqual(20);
    });
  });
});
