import { describe, it, expect, vi, beforeEach } from 'vitest';

function mockIndexedDB() {
  let db;
  vi.stubGlobal('IDBKeyRange', { only: vi.fn((v) => v) });
  vi.stubGlobal('indexedDB', {
    open: vi.fn(() => {
      const request = { onupgradeneeded: null, onsuccess: null, onerror: null };
      setTimeout(() => {
        if (!db) {
          const stores = {};
          db = {
            transaction: vi.fn(() => {
              const tx = { oncomplete: null, onerror: null };
              tx.objectStore = vi.fn(() => {
                const store = stores['chat-messages'] || { data: [] };
                stores['chat-messages'] = store;
                return {
                  put: vi.fn((val) => { store.data.push(val); }),
                  get: vi.fn(() => ({ result: null, onsuccess: null })),
                  index: vi.fn(() => ({
                    openCursor: vi.fn(() => {
                      const cr = { result: null, onsuccess: null };
                      setTimeout(() => { if (cr.onsuccess) cr.onsuccess({ target: cr }); }, 5);
                      return cr;
                    }),
                  })),
                  openCursor: vi.fn(() => {
                    const cr = { result: null, onsuccess: null };
                    setTimeout(() => { if (cr.onsuccess) cr.onsuccess({ target: cr }); }, 5);
                    return cr;
                  }),
                  delete: vi.fn(),
                };
              });
              setTimeout(() => { if (tx.oncomplete) tx.oncomplete(); }, 5);
              return tx;
            }),
            objectStoreNames: { contains: vi.fn(() => false) },
            createObjectStore: vi.fn(() => ({ createIndex: vi.fn() })),
          };
        }
        request.result = db;
        if (request.onsuccess) request.onsuccess({ target: request });
      }, 5);
      return request;
    }),
  });
}

describe('offlineChatService', () => {
  beforeEach(() => {
    mockIndexedDB();
  });

  it('exports all 5 public functions with correct types', async () => {
    const module = await import('../../services/offlineChatService');
    expect(typeof module.saveMessageOffline).toBe('function');
    expect(typeof module.getOfflineMessages).toBe('function');
    expect(typeof module.markSynced).toBe('function');
    expect(typeof module.getPendingSyncMessages).toBe('function');
    expect(typeof module.clearOfflineMessages).toBe('function');
  });

  it('saveMessageOffline resolves with default values', async () => {
    const module = await import('../../services/offlineChatService');
    await expect(module.saveMessageOffline({ content: 'hello' })).resolves.toBeUndefined();
  });

  it('getOfflineMessages returns empty array for no messages', async () => {
    const module = await import('../../services/offlineChatService');
    const messages = await module.getOfflineMessages('test-conv');
    expect(Array.isArray(messages)).toBe(true);
    expect(messages.length).toBe(0);
  });

  it('getPendingSyncMessages returns empty array when no messages', async () => {
    const module = await import('../../services/offlineChatService');
    const messages = await module.getPendingSyncMessages();
    expect(Array.isArray(messages)).toBe(true);
    expect(messages.length).toBe(0);
  });

  it('clearOfflineMessages resolves for empty store', async () => {
    const module = await import('../../services/offlineChatService');
    await expect(module.clearOfflineMessages('test-conv')).resolves.toBeUndefined();
  });

  it('markSynced resolves for non-existent message', async () => {
    const module = await import('../../services/offlineChatService');
    await expect(module.markSynced('nonexistent')).resolves.toBeUndefined();
  });

  it('saveMessageOffline has correct signature (message param)', async () => {
    const module = await import('../../services/offlineChatService');
    expect(module.saveMessageOffline.length).toBe(1);
  });

  it('getOfflineMessages has correct signature (conversationId param)', async () => {
    const module = await import('../../services/offlineChatService');
    expect(module.getOfflineMessages.length).toBe(1);
  });

  it('markSynced has correct signature (messageId param)', async () => {
    const module = await import('../../services/offlineChatService');
    expect(module.markSynced.length).toBe(1);
  });

  it('getPendingSyncMessages has no required params', async () => {
    const module = await import('../../services/offlineChatService');
    expect(module.getPendingSyncMessages.length).toBe(0);
  });

  it('clearOfflineMessages has correct signature (conversationId param)', async () => {
    const module = await import('../../services/offlineChatService');
    expect(module.clearOfflineMessages.length).toBe(1);
  });
});
