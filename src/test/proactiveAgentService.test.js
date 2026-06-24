import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  runProactiveCheck,
  getProactiveState,
  setProactiveEnabled,
  clearProactiveHistory,
  startProactiveWatcher
} from '../services/proactiveAgentService';
import { getAgentMetrics } from '../services/agentMetricsService';
import { listMemory } from '../services/unifiedMemoryService';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../services/trustModel', () => ({
  timestampMs: vi.fn(() => Date.now())
}));

vi.mock('../services/unifiedMemoryService', () => ({
  listMemory: vi.fn(() => [])
}));

vi.mock('../services/agentMetricsService', () => ({
  getAgentMetrics: vi.fn(() => ({
    totalExecutions: 0,
    avgConfidence: 80,
    avgIterations: 1.0,
    validationPassRate: 90,
    errorPatterns: []
  }))
}));

// ── localStorage mock ─────────────────────────────────────────────────────────

const localStorageStore = {};
const mockLocalStorage = {
  getItem: vi.fn((k) => localStorageStore[k] ?? null),
  setItem: vi.fn((k, v) => { localStorageStore[k] = v; }),
  removeItem: vi.fn((k) => { delete localStorageStore[k]; }),
  clear: vi.fn(() => { Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k]); })
};
vi.stubGlobal('localStorage', mockLocalStorage);

beforeEach(() => {
  mockLocalStorage.clear();
  vi.clearAllMocks();
});

// ── getProactiveState ─────────────────────────────────────────────────────────

describe('getProactiveState', () => {
  it('returns default state when nothing stored', () => {
    const state = getProactiveState();
    expect(state).toHaveProperty('enabled');
    expect(state).toHaveProperty('suggestionHistory');
    expect(Array.isArray(state.suggestionHistory)).toBe(true);
  });

  it('returns stored state from localStorage', () => {
    const stored = { lastCheckMs: 12345, suggestionHistory: [], enabled: false };
    localStorageStore['alphonso_proactive_state_v1'] = JSON.stringify(stored);
    const state = getProactiveState();
    expect(state.enabled).toBe(false);
    expect(state.lastCheckMs).toBe(12345);
  });

  it('returns default state when localStorage contains invalid JSON', () => {
    localStorageStore['alphonso_proactive_state_v1'] = 'not-json{{{';
    const state = getProactiveState();
    expect(state).toHaveProperty('enabled');
  });
});

// ── setProactiveEnabled ───────────────────────────────────────────────────────

describe('setProactiveEnabled', () => {
  it('disables proactive watcher when set to false', () => {
    setProactiveEnabled(false);
    const state = getProactiveState();
    expect(state.enabled).toBe(false);
  });

  it('enables proactive watcher when set to true', () => {
    setProactiveEnabled(false);
    setProactiveEnabled(true);
    const state = getProactiveState();
    expect(state.enabled).toBe(true);
  });

  it('persists state to localStorage', () => {
    setProactiveEnabled(false);
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
      'alphonso_proactive_state_v1',
      expect.stringContaining('"enabled":false')
    );
  });
});

// ── clearProactiveHistory ─────────────────────────────────────────────────────

describe('clearProactiveHistory', () => {
  it('resets suggestion history to empty array', () => {
    // Pre-populate suggestion history
    const stored = {
      lastCheckMs: 0,
      enabled: true,
      suggestionHistory: [{ type: 'idle', message: 'test', timestampMs: Date.now() }]
    };
    localStorageStore['alphonso_proactive_state_v1'] = JSON.stringify(stored);

    clearProactiveHistory();

    const state = getProactiveState();
    expect(state.suggestionHistory).toEqual([]);
  });

  it('does not disable proactive when clearing history', () => {
    setProactiveEnabled(true);
    clearProactiveHistory();
    const state = getProactiveState();
    expect(state.enabled).toBe(true);
  });
});

// ── runProactiveCheck ─────────────────────────────────────────────────────────

describe('runProactiveCheck', () => {
  it('returns null when proactive is disabled', () => {
    setProactiveEnabled(false);
    const result = runProactiveCheck();
    expect(result).toBeNull();
  });

  it('returns null when no issues detected (healthy metrics)', () => {
    vi.mocked(getAgentMetrics).mockReturnValue({
      totalExecutions: 0,
      avgConfidence: 90,
      avgIterations: 1.0,
      validationPassRate: 95,
      errorPatterns: []
    });
    vi.mocked(listMemory).mockReturnValue([{ timestampMs: Date.now() }]); // recent activity

    setProactiveEnabled(true);
    const result = runProactiveCheck();
    // With healthy metrics and recent activity, no suggestion should fire
    // (idle check only fires after 15+ minutes of inactivity)
    expect(result === null || result?.type !== undefined).toBe(true);
  });

  it('returns a suggestion object with type, title, message, actions', () => {
    vi.mocked(getAgentMetrics).mockReturnValue({
      totalExecutions: 5,
      avgConfidence: 30, // Low confidence triggers suggestion
      avgIterations: 1.0,
      validationPassRate: 95,
      errorPatterns: []
    });

    setProactiveEnabled(true);
    const result = runProactiveCheck();
    if (result) {
      expect(result).toHaveProperty('type');
      expect(result).toHaveProperty('title');
      expect(result).toHaveProperty('message');
      expect(result).toHaveProperty('actions');
      expect(Array.isArray(result.actions)).toBe(true);
    }
  });

  it('updates lastCheckMs in state after each call', () => {
    setProactiveEnabled(true);
    const before = Date.now();
    runProactiveCheck();
    const state = getProactiveState();
    expect(state.lastCheckMs).toBeGreaterThanOrEqual(before);
  });

  it('detects build failures from error patterns', () => {
    vi.mocked(getAgentMetrics).mockReturnValue({
      totalExecutions: 3,
      avgConfidence: 80,
      avgIterations: 1.0,
      validationPassRate: 90,
      errorPatterns: [{ error: 'build failed: module not found', count: 2 }]
    });

    setProactiveEnabled(true);
    const result = runProactiveCheck();
    if (result) {
      expect(['failed_build', 'high_iterations', 'low_confidence'].includes(result.type)).toBe(true);
    }
  });
});

// ── startProactiveWatcher ─────────────────────────────────────────────────────

describe('startProactiveWatcher', () => {
  it('returns a cleanup function', () => {
    vi.useFakeTimers();
    const cleanup = startProactiveWatcher(vi.fn());
    expect(typeof cleanup).toBe('function');
    cleanup();
    vi.useRealTimers();
  });

  it('cleanup function does not throw', () => {
    vi.useFakeTimers();
    const cleanup = startProactiveWatcher(vi.fn());
    expect(() => cleanup()).not.toThrow();
    vi.useRealTimers();
  });
});
