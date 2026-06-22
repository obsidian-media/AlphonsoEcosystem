import { vi, describe, it, expect, beforeEach } from 'vitest';
import {
  getScreenObserverState,
  getScreenObserverLogs,
  updateScreenObserverState,
  requestScreenNotificationPermission,
  stopScreenObserver,
  startScreenObserver
} from '../services/screenIntelligenceService';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('getScreenObserverState', () => {
  it('returns default state when storage is empty', () => {
    const state = getScreenObserverState();
    expect(state.enabled).toBe(false);
    expect(state.status).toBe('idle');
  });

  it('hydrates updatedAtMs if missing from stored state', () => {
    localStorage.setItem(
      'alphonso_screen_observer_state_v1',
      JSON.stringify({ enabled: false, status: 'idle' })
    );
    const state = getScreenObserverState();
    expect(typeof state.updatedAtMs).toBe('number');
  });

  it('returns stored state when present', () => {
    const stored = { enabled: true, status: 'observing', updatedAtMs: Date.now() };
    localStorage.setItem('alphonso_screen_observer_state_v1', JSON.stringify(stored));
    const state = getScreenObserverState();
    expect(state.enabled).toBe(true);
    expect(state.status).toBe('observing');
  });
});

describe('getScreenObserverLogs', () => {
  it('returns [] when no logs exist', () => {
    expect(getScreenObserverLogs()).toEqual([]);
  });

  it('returns stored logs', () => {
    const logs = [{ id: 'log-1', status: 'stable_observation' }];
    localStorage.setItem('alphonso_screen_observer_logs_v1', JSON.stringify(logs));
    expect(getScreenObserverLogs()).toHaveLength(1);
  });

  it('returns [] when logs storage is corrupted', () => {
    localStorage.setItem('alphonso_screen_observer_logs_v1', 'not-json');
    expect(getScreenObserverLogs()).toEqual([]);
  });
});

describe('updateScreenObserverState', () => {
  it('merges the patch and updates updatedAtMs', () => {
    const before = Date.now();
    const state = updateScreenObserverState({ status: 'observing', enabled: true });
    expect(state.status).toBe('observing');
    expect(state.enabled).toBe(true);
    expect(state.updatedAtMs).toBeGreaterThanOrEqual(before);
  });

  it('preserves unpatched fields', () => {
    getScreenObserverState(); // seed
    const state = updateScreenObserverState({ status: 'stopped' });
    expect(typeof state.sampleEveryMs).toBe('number');
  });
});

describe('requestScreenNotificationPermission', () => {
  it('returns "unsupported" when Notification API is absent', async () => {
    const origNotification = global.Notification;
    delete global.Notification;
    const result = await requestScreenNotificationPermission();
    expect(result).toBe('unsupported');
    global.Notification = origNotification;
  });

  it('returns "granted" immediately if permission is already granted', async () => {
    global.Notification = { permission: 'granted' };
    const result = await requestScreenNotificationPermission();
    expect(result).toBe('granted');
    delete global.Notification;
  });
});

describe('stopScreenObserver', () => {
  it('returns a state with enabled: false and status stopped or idle', () => {
    const state = stopScreenObserver();
    expect(state.enabled).toBe(false);
    expect(['stopped', 'idle'].includes(state.status)).toBe(true);
  });
});

describe('startScreenObserver', () => {
  it('returns ok: false with reason "unsupported" when mediaDevices is absent', async () => {
    const origNavigator = global.navigator;
    Object.defineProperty(global, 'navigator', {
      value: { mediaDevices: undefined },
      configurable: true
    });
    const result = await startScreenObserver();
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('unsupported');
    Object.defineProperty(global, 'navigator', { value: origNavigator, configurable: true });
  });

  it('returns ok: false with reason "permission_denied" when getDisplayMedia rejects', async () => {
    Object.defineProperty(global, 'navigator', {
      value: {
        mediaDevices: {
          getDisplayMedia: vi.fn().mockRejectedValue(new Error('NotAllowedError'))
        }
      },
      configurable: true
    });
    const result = await startScreenObserver();
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('permission_denied');
  });
});
