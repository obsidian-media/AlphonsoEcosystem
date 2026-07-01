import { describe, it, expect, vi } from 'vitest';

describe('offlineChatService', () => {
  it('exports all 5 public functions with correct types', async () => {
    const module = await import('../../services/offlineChatService');
    expect(typeof module.saveMessageOffline).toBe('function');
    expect(typeof module.getOfflineMessages).toBe('function');
    expect(typeof module.markSynced).toBe('function');
    expect(typeof module.getPendingSyncMessages).toBe('function');
    expect(typeof module.clearOfflineMessages).toBe('function');
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
