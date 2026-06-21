import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  collectResourceSnapshot,
  listResourceSnapshots,
  summarizeResourceUsage
} from '../services/resourceCostService';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../services/trustModel', () => ({
  timestampMs: vi.fn(() => Date.now()),
  TRUST_STATES: { TEMPORARY: 'temporary', VERIFIED: 'verified' }
}));

// ── localStorage mock ─────────────────────────────────────────────────────────

const localStorageStore = {};
const mockLocalStorage = {
  getItem: vi.fn((k) => localStorageStore[k] ?? null),
  setItem: vi.fn((k, v) => { localStorageStore[k] = String(v); }),
  removeItem: vi.fn((k) => { delete localStorageStore[k]; }),
  clear: vi.fn(() => { Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k]); })
};
vi.stubGlobal('localStorage', mockLocalStorage);

// ── navigator + performance mocks ─────────────────────────────────────────────

vi.stubGlobal('navigator', {
  hardwareConcurrency: 8,
  deviceMemory: 16
});

vi.stubGlobal('performance', {
  now: vi.fn(() => Date.now()),
  memory: {
    jsHeapSizeLimit: 4294705152,
    usedJSHeapSize: 52428800
  }
});

beforeEach(() => {
  mockLocalStorage.clear();
  vi.clearAllMocks();
});

// ── collectResourceSnapshot ───────────────────────────────────────────────────

describe('collectResourceSnapshot', () => {
  it('returns a snapshot object with required fields', () => {
    const snap = collectResourceSnapshot({ ollamaConnected: true, modelName: 'llama3', tokenEstimate: 500 });
    expect(snap).toHaveProperty('id');
    expect(snap).toHaveProperty('timestampMs');
    expect(snap).toHaveProperty('ollamaConnected', true);
    expect(snap).toHaveProperty('modelName', 'llama3');
    expect(snap).toHaveProperty('tokenEstimate', 500);
    expect(snap).toHaveProperty('trust');
  });

  it('snapshot id starts with rs-', () => {
    const snap = collectResourceSnapshot({ ollamaConnected: false, modelName: null });
    expect(snap.id).toMatch(/^rs-/);
  });

  it('persists snapshot to localStorage', () => {
    collectResourceSnapshot({ ollamaConnected: true, modelName: 'llama3' });
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
      'alphonso_resource_snapshots_v1',
      expect.any(String)
    );
  });

  it('defaults tokenEstimate to 0 when not provided', () => {
    const snap = collectResourceSnapshot({ ollamaConnected: false, modelName: 'llama3' });
    expect(snap.tokenEstimate).toBe(0);
  });

  it('reads cpuCores from navigator.hardwareConcurrency', () => {
    const snap = collectResourceSnapshot({ ollamaConnected: false, modelName: 'test' });
    expect(snap.cpuCores).toBe(8);
  });

  it('handles ollamaConnected as boolean coercion', () => {
    const snap = collectResourceSnapshot({ ollamaConnected: null, modelName: 'test' });
    expect(snap.ollamaConnected).toBe(false);
    const snap2 = collectResourceSnapshot({ ollamaConnected: 1, modelName: 'test' });
    expect(snap2.ollamaConnected).toBe(true);
  });
});

// ── listResourceSnapshots ─────────────────────────────────────────────────────

describe('listResourceSnapshots', () => {
  it('returns empty array when no snapshots stored', () => {
    mockLocalStorage.getItem.mockReturnValueOnce(null);
    const result = listResourceSnapshots();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it('returns stored snapshots from localStorage', () => {
    const snaps = [
      { id: 'rs-1', timestampMs: Date.now(), ollamaConnected: true, tokenEstimate: 100, trust: 'temporary' },
      { id: 'rs-2', timestampMs: Date.now(), ollamaConnected: false, tokenEstimate: 200, trust: 'temporary' }
    ];
    localStorageStore['alphonso_resource_snapshots_v1'] = JSON.stringify(snaps);

    const result = listResourceSnapshots();
    expect(result.length).toBe(2);
    expect(result[0].id).toBe('rs-1');
  });

  it('returns empty array when localStorage contains invalid JSON', () => {
    localStorageStore['alphonso_resource_snapshots_v1'] = '{{{bad json';
    const result = listResourceSnapshots();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it('returns snapshots accumulated via collectResourceSnapshot', () => {
    collectResourceSnapshot({ ollamaConnected: true, modelName: 'llama3', tokenEstimate: 300 });
    collectResourceSnapshot({ ollamaConnected: true, modelName: 'llama3', tokenEstimate: 600 });
    const result = listResourceSnapshots();
    expect(result.length).toBe(2);
  });
});

// ── summarizeResourceUsage ────────────────────────────────────────────────────

describe('summarizeResourceUsage', () => {
  it('returns summary with zero points when no snapshots in window', () => {
    mockLocalStorage.getItem.mockReturnValueOnce('[]');
    const summary = summarizeResourceUsage(24);
    expect(summary.points).toBe(0);
    expect(summary.avgTokenEstimate).toBe(0);
    expect(summary.recommendations.length).toBeGreaterThan(0);
  });

  it('calculates correct avgTokenEstimate from recent snapshots', () => {
    const now = Date.now();
    const snaps = [
      { id: 'rs-1', timestampMs: now - 1000, ollamaConnected: true, tokenEstimate: 200, trust: 'temporary' },
      { id: 'rs-2', timestampMs: now - 2000, ollamaConnected: true, tokenEstimate: 400, trust: 'temporary' }
    ];
    localStorageStore['alphonso_resource_snapshots_v1'] = JSON.stringify(snaps);

    const summary = summarizeResourceUsage(24);
    expect(summary.avgTokenEstimate).toBe(300);
    expect(summary.points).toBe(2);
  });

  it('excludes snapshots outside the time window', () => {
    const now = Date.now();
    const snaps = [
      { id: 'rs-1', timestampMs: now - (25 * 3600 * 1000), ollamaConnected: true, tokenEstimate: 999, trust: 'temporary' }, // 25h ago — outside 24h window
      { id: 'rs-2', timestampMs: now - 1000, ollamaConnected: true, tokenEstimate: 100, trust: 'temporary' } // recent
    ];
    localStorageStore['alphonso_resource_snapshots_v1'] = JSON.stringify(snaps);

    const summary = summarizeResourceUsage(24);
    expect(summary.points).toBe(1);
    expect(summary.avgTokenEstimate).toBe(100);
  });

  it('detects Ollama disconnects and includes recommendation', () => {
    const now = Date.now();
    const snaps = [
      { id: 'rs-1', timestampMs: now - 1000, ollamaConnected: false, tokenEstimate: 100, trust: 'temporary' },
      { id: 'rs-2', timestampMs: now - 2000, ollamaConnected: false, tokenEstimate: 200, trust: 'temporary' }
    ];
    localStorageStore['alphonso_resource_snapshots_v1'] = JSON.stringify(snaps);

    const summary = summarizeResourceUsage(24);
    expect(summary.disconnectedCount).toBe(2);
    expect(summary.recommendations.some((r) => /disconnect/i.test(r))).toBe(true);
  });

  it('recommends shorter prompts when token estimate is high', () => {
    const now = Date.now();
    const snaps = [
      { id: 'rs-1', timestampMs: now - 1000, ollamaConnected: true, tokenEstimate: 10000, trust: 'temporary' }
    ];
    localStorageStore['alphonso_resource_snapshots_v1'] = JSON.stringify(snaps);

    const summary = summarizeResourceUsage(24);
    expect(summary.recommendations.some((r) => /prompt|shorter/i.test(r))).toBe(true);
  });

  it('returns hours field matching the input parameter', () => {
    mockLocalStorage.getItem.mockReturnValueOnce('[]');
    const summary = summarizeResourceUsage(12);
    expect(summary.hours).toBe(12);
  });
});
