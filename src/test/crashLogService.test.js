import { describe, it, expect, beforeEach, vi } from 'vitest';

const store = {};
vi.mock('../lib/durableStore', () => ({
  durableGet: vi.fn((k) => store[k] ?? null),
  durableSet: vi.fn((k, v) => { store[k] = v; }),
  durableRemove: vi.fn((k) => { delete store[k]; }),
}));

import { logError, getCrashLog, clearCrashLog } from '../services/crashLogService';
import { durableSet, durableRemove } from '../lib/durableStore';

describe('crashLogService', () => {
  beforeEach(() => {
    Object.keys(store).forEach((k) => delete store[k]);
    vi.clearAllMocks();
  });

  it('getCrashLog returns empty array when no log', () => {
    expect(getCrashLog()).toEqual([]);
  });

  it('logError stores an entry', () => {
    logError(new Error('boom'));
    expect(durableSet).toHaveBeenCalled();
    const entries = JSON.parse(durableSet.mock.calls[0][1]);
    expect(entries[0].message).toBe('boom');
  });

  it('logError stores context', () => {
    logError(new Error('ctx'), { component: 'ChatView' });
    const entries = JSON.parse(durableSet.mock.calls[0][1]);
    expect(entries[0].context.component).toBe('ChatView');
  });

  it('logError handles non-Error values', () => {
    logError('string error');
    const entries = JSON.parse(durableSet.mock.calls[0][1]);
    expect(entries[0].message).toBe('string error');
  });

  it('logError caps at 100 entries', () => {
    for (let i = 0; i < 102; i++) {
      store['alphonso_crash_log_v1'] = JSON.stringify(
        Array.from({ length: i }, (_, j) => ({ timestamp: j, message: `e${j}`, stack: null, context: {} }))
      );
      logError(new Error(`e${i}`));
    }
    const entries = getCrashLog();
    expect(entries.length).toBeLessThanOrEqual(100);
  });

  it('clearCrashLog calls durableRemove', () => {
    clearCrashLog();
    expect(durableRemove).toHaveBeenCalledWith('alphonso_crash_log_v1');
  });

  // ── secret-shaped context redaction (Truth-First plan B4) ──────────────

  describe('logError redacts sensitive-looking context keys before persisting', () => {
    it('redacts a top-level key matching a sensitive pattern', () => {
      logError(new Error('auth failed'), { apiKey: 'sk-real-secret-value', component: 'GitHub' });
      const entries = JSON.parse(durableSet.mock.calls[0][1]);
      expect(entries[0].context.apiKey).toBe('[REDACTED]');
      expect(entries[0].context.component).toBe('GitHub'); // non-sensitive key untouched
    });

    it('redacts nested sensitive keys, not just top-level', () => {
      logError(new Error('nested'), {
        request: { headers: { Authorization: 'Bearer sk-real-secret-value' }, url: '/api/x' }
      });
      const entries = JSON.parse(durableSet.mock.calls[0][1]);
      expect(entries[0].context.request.headers.Authorization).toBe('[REDACTED]');
      expect(entries[0].context.request.url).toBe('/api/x');
    });

    it('redacts sensitive keys inside arrays of objects', () => {
      logError(new Error('array'), {
        attempts: [{ token: 'ghp_realtoken123' }, { token: 'ghp_anothersecret' }]
      });
      const entries = JSON.parse(durableSet.mock.calls[0][1]);
      expect(entries[0].context.attempts[0].token).toBe('[REDACTED]');
      expect(entries[0].context.attempts[1].token).toBe('[REDACTED]');
    });

    it('covers the common credential-shaped key name variants', () => {
      logError(new Error('variants'), {
        password: 'p',
        SLACK_BOT_TOKEN: 't',
        NOTION_API_KEY: 'k',
        client_secret: 's',
        passphrase: 'ph',
        privateKey: 'pk'
      });
      const entries = JSON.parse(durableSet.mock.calls[0][1]);
      const ctx = entries[0].context;
      expect(ctx.password).toBe('[REDACTED]');
      expect(ctx.SLACK_BOT_TOKEN).toBe('[REDACTED]');
      expect(ctx.NOTION_API_KEY).toBe('[REDACTED]');
      expect(ctx.client_secret).toBe('[REDACTED]');
      expect(ctx.passphrase).toBe('[REDACTED]');
      expect(ctx.privateKey).toBe('[REDACTED]');
    });

    it('does not choke on a circular context object', () => {
      const ctx = { component: 'X' };
      ctx.self = ctx;
      expect(() => logError(new Error('circular'), ctx)).not.toThrow();
      const entries = JSON.parse(durableSet.mock.calls[0][1]);
      expect(entries[0].context.self).toBe('[CIRCULAR]');
    });
  });
});
