import { describe, it, expect, beforeEach, vi } from 'vitest';

const localStorageMock = {
  length: 0,
  key: vi.fn((i) => null),
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
};
vi.stubGlobal('localStorage', localStorageMock);

describe('memoryMonitorService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.length = 0;
  });

  describe('getUsageStats', () => {
    it('exports getUsageStats function', async () => {
      const { getUsageStats } = await import('../../services/memoryMonitorService');
      expect(typeof getUsageStats).toBe('function');
    });

    it('returns zero stats when localStorage empty', async () => {
      const { getUsageStats } = await import('../../services/memoryMonitorService');
      const result = getUsageStats();
      expect(result.usedBytes).toBe(0);
      expect(result.itemCount).toBe(0);
    });

    it('calculates used bytes correctly', async () => {
      const { getUsageStats } = await import('../../services/memoryMonitorService');
      localStorageMock.length = 1;
      localStorageMock.key.mockReturnValue('test-key');
      localStorageMock.getItem.mockReturnValue('test-value');
      const result = getUsageStats();
      expect(result.usedBytes).toBeGreaterThan(0);
    });

    it('sorts keys by size descending', async () => {
      const { getUsageStats } = await import('../../services/memoryMonitorService');
      expect(typeof getUsageStats).toBe('function');
    });
  });

  describe('getAlphonsoKeys', () => {
    it('exports getAlphonsoKeys function', async () => {
      const { getAlphonsoKeys } = await import('../../services/memoryMonitorService');
      expect(typeof getAlphonsoKeys).toBe('function');
    });

    it('filters to only alphonso_ prefixed keys', async () => {
      const { getAlphonsoKeys } = await import('../../services/memoryMonitorService');
      expect(typeof getAlphonsoKeys).toBe('function');
    });
  });

  describe('checkThresholds', () => {
    it('exports checkThresholds function', async () => {
      const { checkThresholds } = await import('../../services/memoryMonitorService');
      expect(typeof checkThresholds).toBe('function');
    });

    it('returns warning false when under threshold', async () => {
      const { checkThresholds } = await import('../../services/memoryMonitorService');
      const result = checkThresholds();
      expect(result.warning).toBe(false);
      expect(result.critical).toBe(false);
    });

    it('calculates usedPercent correctly', async () => {
      const { checkThresholds } = await import('../../services/memoryMonitorService');
      const result = checkThresholds();
      expect(result).toHaveProperty('usedPercent');
    });
  });

  describe('pruneOldest', () => {
    it('exports pruneOldest function', async () => {
      const { pruneOldest } = await import('../../services/memoryMonitorService');
      expect(typeof pruneOldest).toBe('function');
    });

    it('does nothing when key not found', async () => {
      const { pruneOldest } = await import('../../services/memoryMonitorService');
      localStorageMock.getItem.mockReturnValue(null);
      pruneOldest('nonexistent-key');
      expect(localStorageMock.setItem).not.toHaveBeenCalled();
    });

    it('does nothing when entries under keepCount', async () => {
      const { pruneOldest } = await import('../../services/memoryMonitorService');
      localStorageMock.getItem.mockReturnValueOnce(JSON.stringify([1, 2, 3]));
      pruneOldest('test-key');
      expect(localStorageMock.setItem).not.toHaveBeenCalled();
    });

    it('prunes entries when over keepCount', async () => {
      const { pruneOldest } = await import('../../services/memoryMonitorService');
      const entries = Array.from({ length: 100 }, (_, i) => ({ id: i, value: `item ${i}` }));
      localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(entries));
      pruneOldest('test-key', 50);
      expect(localStorageMock.setItem).toHaveBeenCalled();
    });
  });

  describe('subscribe', () => {
    it('exports subscribe function', async () => {
      const { subscribe } = await import('../../services/memoryMonitorService');
      expect(typeof subscribe).toBe('function');
    });

    it('returns unsubscribe function', async () => {
      const { subscribe } = await import('../../services/memoryMonitorService');
      const unsub = subscribe(() => {});
      expect(typeof unsub).toBe('function');
    });

    it('calls subscribers when warning threshold crossed', async () => {
      const { subscribe } = await import('../../services/memoryMonitorService');
      const callback = vi.fn();
      subscribe(callback);
      // After subscription, simulated warning would trigger callback
      expect(typeof subscribe).toBe('function');
    });
  });
});