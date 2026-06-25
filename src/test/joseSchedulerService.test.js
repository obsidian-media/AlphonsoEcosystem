import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createSchedule,
  listSchedules,
  saveSchedule,
  deleteSchedule,
  startScheduler,
  stopScheduler,
  SCHEDULE_PRESETS,
} from '../services/joseSchedulerService';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const localStorageMock = (() => {
  let store = {};
  return {
    getItem: vi.fn((key) => store[key] || null),
    setItem: vi.fn((key, value) => { store[key] = value; }),
    removeItem: vi.fn((key) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();

Object.defineProperty(global, 'localStorage', { value: localStorageMock });

// ── SCHEDULE_PRESETS ──────────────────────────────────────────────────────────

describe('SCHEDULE_PRESETS', () => {
  it('has 4 presets', () => {
    expect(SCHEDULE_PRESETS.length).toBe(4);
  });

  it('has correct intervals', () => {
    expect(SCHEDULE_PRESETS.find((p) => p.id === '30min').intervalMs).toBe(30 * 60 * 1000);
    expect(SCHEDULE_PRESETS.find((p) => p.id === 'hourly').intervalMs).toBe(60 * 60 * 1000);
    expect(SCHEDULE_PRESETS.find((p) => p.id === 'daily').intervalMs).toBe(24 * 60 * 60 * 1000);
    expect(SCHEDULE_PRESETS.find((p) => p.id === 'weekly').intervalMs).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

// ── createSchedule ────────────────────────────────────────────────────────────

describe('createSchedule', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('creates a schedule with correct fields', () => {
    const sched = createSchedule({ name: 'Test', commandText: 'do something', presetId: 'hourly' });
    expect(sched.id).toMatch(/^sched_/);
    expect(sched.name).toBe('Test');
    expect(sched.commandText).toBe('do something');
    expect(sched.presetId).toBe('hourly');
    expect(sched.enabled).toBe(true);
    expect(sched.intervalMs).toBe(60 * 60 * 1000);
    expect(sched.agentId).toBe('jose');
    expect(sched.lastRunAtMs).toBeNull();
    expect(sched.nextRunAtMs).toBeGreaterThan(Date.now());
    expect(sched.createdAtMs).toBeGreaterThan(0);
  });

  it('persists to localStorage', () => {
    createSchedule({ name: 'Persisted', commandText: 'test' });
    expect(localStorageMock.setItem).toHaveBeenCalled();
  });

  it('defaults to hourly preset', () => {
    const sched = createSchedule({ name: 'Default', commandText: 'test' });
    expect(sched.presetId).toBe('hourly');
  });
});

// ── listSchedules ─────────────────────────────────────────────────────────────

describe('listSchedules', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('returns empty array when no schedules', () => {
    expect(listSchedules()).toEqual([]);
  });

  it('returns all created schedules', () => {
    createSchedule({ name: 'S1', commandText: 'cmd1' });
    createSchedule({ name: 'S2', commandText: 'cmd2' });
    const all = listSchedules();
    expect(all.length).toBe(2);
    expect(all[0].name).toBe('S1');
    expect(all[1].name).toBe('S2');
  });
});

// ── saveSchedule ──────────────────────────────────────────────────────────────

describe('saveSchedule', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('updates an existing schedule', () => {
    const sched = createSchedule({ name: 'Original', commandText: 'cmd' });
    saveSchedule({ ...sched, name: 'Updated', enabled: false });
    const all = listSchedules();
    expect(all[0].name).toBe('Updated');
    expect(all[0].enabled).toBe(false);
  });
});

// ── deleteSchedule ────────────────────────────────────────────────────────────

describe('deleteSchedule', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('deletes a schedule by id', () => {
    const sched = createSchedule({ name: 'ToDelete', commandText: 'cmd' });
    const result = deleteSchedule(sched.id);
    expect(result).toBe(true);
    expect(listSchedules().length).toBe(0);
  });

  it('returns false for non-existent id', () => {
    const result = deleteSchedule('nonexistent');
    expect(result).toBe(false);
  });
});

// ── startScheduler / stopScheduler ────────────────────────────────────────────

describe('startScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorageMock.clear();
    stopScheduler();
  });

  afterEach(() => {
    vi.useRealTimers();
    stopScheduler();
  });

  it('returns a stop function', () => {
    const stop = startScheduler(() => {});
    expect(typeof stop).toBe('function');
    stop();
  });

  it('fires callback for due schedules', () => {
    const callback = vi.fn();
    startScheduler(callback);

    // Create a schedule that's already due (nextRunAtMs in the past)
    const sched = createSchedule({ name: 'Due', commandText: 'cmd', presetId: 'hourly' });
    const all = listSchedules();
    all[0].nextRunAtMs = Date.now() - 1000;
    localStorageMock.setItem('alphonso_jose_schedules_v1', JSON.stringify(all));

    // Advance timer past the 60s interval
    vi.advanceTimersByTime(61_000);

    expect(callback).toHaveBeenCalled();
    stopScheduler();
  });

  it('does not fire callback for future schedules', () => {
    const callback = vi.fn();
    startScheduler(callback);

    createSchedule({ name: 'Future', commandText: 'cmd', presetId: 'weekly' });

    vi.advanceTimersByTime(61_000);

    expect(callback).not.toHaveBeenCalled();
    stopScheduler();
  });
});

// ── stopScheduler ─────────────────────────────────────────────────────────────

describe('stopScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorageMock.clear();
    stopScheduler();
  });

  afterEach(() => {
    vi.useRealTimers();
    stopScheduler();
  });

  it('stops the interval', () => {
    const callback = vi.fn();
    startScheduler(callback);

    // Make a schedule due
    const all = listSchedules();
    if (all.length > 0) {
      all[0].nextRunAtMs = Date.now() - 1000;
      localStorageMock.setItem('alphonso_jose_schedules_v1', JSON.stringify(all));
    } else {
      const sched = createSchedule({ name: 'Test', commandText: 'cmd' });
      const schedules = listSchedules();
      schedules[0].nextRunAtMs = Date.now() - 1000;
      localStorageMock.setItem('alphonso_jose_schedules_v1', JSON.stringify(schedules));
    }

    stopScheduler();
    vi.advanceTimersByTime(120_000);

    // callback should not be called after stop
    expect(callback).not.toHaveBeenCalled();
  });
});
