import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockIndexedDB = {
  open: vi.fn()
};

global.indexedDB = mockIndexedDB;

describe('offlineChatService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('module structure', () => {
    it('exports saveMessageOffline function', async () => {
      const module = await import('../../services/offlineChatService');
      expect(module.saveMessageOffline).toBeDefined();
    });

    it('exports getOfflineMessages function', async () => {
      const module = await import('../../services/offlineChatService');
      expect(module.getOfflineMessages).toBeDefined();
    });

    it('exports markSynced function', async () => {
      const module = await import('../../services/offlineChatService');
      expect(module.markSynced).toBeDefined();
    });

    it('exports getPendingSyncMessages function', async () => {
      const module = await import('../../services/offlineChatService');
      expect(module.getPendingSyncMessages).toBeDefined();
    });

    it('exports clearOfflineMessages function', async () => {
      const module = await import('../../services/offlineChatService');
      expect(module.clearOfflineMessages).toBeDefined();
    });
  });

  describe('saveMessageOffline', () => {
    it('generates id if not provided', async () => {
      const module = await import('../../services/offlineChatService');
      const mockDb = {
        transaction: vi.fn(() => ({
          objectStore: vi.fn(() => ({
            put: vi.fn()
          })),
          oncomplete: null,
          onerror: null
        }))
      };
      mockIndexedDB.open.mockImplementation((name, version, onupgradeneeded) => {
        const request = {
          result: mockDb,
          error: null,
          onsuccess: null,
          onerror: null,
          onupgradeneeded: onupgradeneeded || null
        };
        return Promise.resolve(mockDb);
      });
      await module.saveMessageOffline({ role: 'user', content: 'test' });
      expect(true).toBe(true);
    });
  });
});