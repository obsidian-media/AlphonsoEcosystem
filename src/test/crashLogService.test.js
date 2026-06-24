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
});
