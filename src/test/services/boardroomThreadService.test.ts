import { describe, it, expect, beforeEach } from 'vitest';

describe('boardroomThreadService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('createThread / listThreads', () => {
    it('creates a thread and returns it in listThreads', async () => {
      const { createThread, listThreads } = await import('../../services/boardroomThreadService');
      const thread = createThread({ topic: 'Q3 Growth Plan', participants: ['jose', 'hector'] });
      expect(thread.id).toBeTruthy();
      expect(thread.topic).toBe('Q3 Growth Plan');
      expect(thread.participants).toEqual(['jose', 'hector']);
      expect(thread.status).toBe('active');

      const threads = listThreads();
      expect(threads).toHaveLength(1);
      expect(threads[0].id).toBe(thread.id);
    });

    it('lists threads newest-first', async () => {
      const { createThread, listThreads } = await import('../../services/boardroomThreadService');
      const first = createThread({ topic: 'First', participants: ['jose'] });
      const second = createThread({ topic: 'Second', participants: ['jose'] });
      const threads = listThreads();
      expect(threads[0].id).toBe(second.id);
      expect(threads[1].id).toBe(first.id);
    });
  });

  describe('addThreadMessage', () => {
    it('adds a message and lists it via listThreadMessages', async () => {
      const { createThread, addThreadMessage, listThreadMessages } = await import('../../services/boardroomThreadService');
      const thread = createThread({ topic: 'Test', participants: ['jose'] });
      const msg = addThreadMessage({ threadId: thread.id, speaker: 'jose', content: 'Delegating to Hector.' });
      expect(msg).not.toBeNull();
      expect(msg?.speaker).toBe('jose');

      const messages = listThreadMessages(thread.id);
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('Delegating to Hector.');
    });

    it('reuses classifyMissionRoomRisk — flags high-risk content and requires approval', async () => {
      const { createThread, addThreadMessage } = await import('../../services/boardroomThreadService');
      const thread = createThread({ topic: 'Test', participants: ['marcus'] });
      const msg = addThreadMessage({ threadId: thread.id, speaker: 'marcus', content: 'Ready to publish this to production.' });
      expect(msg?.riskLevel).toBe('high');
      expect(msg?.approvalRequired).toBe(true);
    });

    it('reuses redactMissionRoomSecrets — strips API keys before persisting', async () => {
      const { createThread, addThreadMessage } = await import('../../services/boardroomThreadService');
      const thread = createThread({ topic: 'Test', participants: ['alphonso'] });
      const msg = addThreadMessage({ threadId: thread.id, speaker: 'alphonso', content: 'Key is sk-abc123def456ghi789' });
      expect(msg?.content).not.toContain('sk-abc123def456ghi789');
      expect(msg?.content).toContain('[REDACTED_SECRET]');
      expect(msg?.secretRedacted).toBe(true);
    });

    it('returns null for empty content', async () => {
      const { createThread, addThreadMessage } = await import('../../services/boardroomThreadService');
      const thread = createThread({ topic: 'Test', participants: ['jose'] });
      const msg = addThreadMessage({ threadId: thread.id, speaker: 'jose', content: '   ' });
      expect(msg).toBeNull();
    });
  });
});
