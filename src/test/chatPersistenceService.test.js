import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn().mockResolvedValue(null);

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args) => invoke(...args)
}));

const { persistChatMessages, loadChatMessages, deleteChatMessages } = await import('../services/chatPersistenceService');

describe('chatPersistenceService', () => {
  beforeEach(() => {
    localStorage.clear();
    invoke.mockReset();
    invoke.mockResolvedValue(null);
  });

  describe('loadChatMessages', () => {
    it('returns null when durable memory is unavailable', async () => {
      invoke.mockResolvedValueOnce({ available: false });
      const messages = await loadChatMessages('chat-1');
      expect(messages).toBeNull();
    });

    it('returns null when invoke fails', async () => {
      invoke.mockRejectedValueOnce(new Error('IPC error'));
      const messages = await loadChatMessages('chat-1');
      expect(messages).toBeNull();
    });

    it('returns null when no records are found', async () => {
      invoke.mockResolvedValueOnce({ available: true });
      invoke.mockResolvedValueOnce([]);
      const messages = await loadChatMessages('chat-1');
      expect(messages).toBeNull();
    });

    it('returns sorted messages from durable memory', async () => {
      invoke.mockResolvedValueOnce({ available: true });
      invoke.mockResolvedValueOnce([
        { id: 'rec-2', content: { value: 'second', __governance: { role: 'assistant', msgId: 'm2' } }, timestampMs: 2000 },
        { id: 'rec-1', content: { value: 'first', __governance: { role: 'user', msgId: 'm1' } }, timestampMs: 1000 }
      ]);
      const messages = await loadChatMessages('chat-1');
      expect(messages).toHaveLength(2);
      expect(messages[0].id).toBe('m1');
      expect(messages[1].id).toBe('m2');
    });

    it('maps user messages with correct source', async () => {
      invoke.mockResolvedValueOnce({ available: true });
      invoke.mockResolvedValueOnce([
        { id: 'rec-1', content: { value: 'hi', __governance: { role: 'user', isError: false, msgId: 'm1' } }, timestampMs: 1000 }
      ]);
      const messages = await loadChatMessages('chat-1');
      expect(messages[0].role).toBe('user');
      expect(messages[0].content).toBe('hi');
      expect(messages[0].isError).toBe(false);
    });
  });

  describe('persistChatMessages', () => {
    it('calls upsert_memory_records when durable memory is available', async () => {
      invoke.mockResolvedValueOnce({ available: true });
      invoke.mockResolvedValueOnce({ written: 2 });
      persistChatMessages('chat-1', [
        { id: 1000000000001, role: 'user', content: 'hello' },
        { id: 1000000000002, role: 'assistant', content: 'hi there' }
      ]);
      await new Promise((r) => setTimeout(r, 50));
      expect(invoke).toHaveBeenCalledWith('upsert_memory_records', expect.objectContaining({ records: expect.any(Array) }));
    });

    it('does not call upsert when durable memory is unavailable', async () => {
      invoke.mockResolvedValueOnce({ available: false });
      persistChatMessages('chat-1', [{ id: 1000, role: 'user', content: 'test' }]);
      await new Promise((r) => setTimeout(r, 50));
      expect(invoke).not.toHaveBeenCalledWith('upsert_memory_records', expect.anything());
    });

    it('does not call upsert when messages array is empty', async () => {
      invoke.mockResolvedValueOnce({ available: true });
      persistChatMessages('chat-1', []);
      await new Promise((r) => setTimeout(r, 50));
      expect(invoke).not.toHaveBeenCalledWith('upsert_memory_records', expect.anything());
    });
  });

  describe('deleteChatMessages', () => {
    it('calls delete_memory_records_by_source when durable memory is available', async () => {
      invoke.mockResolvedValueOnce({ available: true });
      invoke.mockResolvedValueOnce(undefined);
      await deleteChatMessages('chat-1');
      expect(invoke).toHaveBeenCalledWith('delete_memory_records_by_source', { source: 'chat:chat-1' });
    });

    it('does not call delete when durable memory is unavailable', async () => {
      invoke.mockResolvedValueOnce({ available: false });
      await deleteChatMessages('chat-1');
      expect(invoke).not.toHaveBeenCalledWith('delete_memory_records_by_source', expect.anything());
    });

    it('handles invoke failure gracefully', async () => {
      invoke.mockResolvedValueOnce({ available: true });
      invoke.mockRejectedValueOnce(new Error('IPC fail'));
      await expect(deleteChatMessages('chat-1')).resolves.not.toThrow();
    });
  });
});
