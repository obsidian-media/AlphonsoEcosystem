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

    it('extracts and stores mentionedAgents from message content', async () => {
      const { createThread, addThreadMessage } = await import('../../services/boardroomThreadService');
      const thread = createThread({ topic: 'Test', participants: ['jose', 'hector', 'maria'] });
      const msg = addThreadMessage({ threadId: thread.id, speaker: 'jose', content: '@Hector can you research this? @Maria please review after.' });
      expect(msg?.mentionedAgents).toEqual(['hector', 'maria']);
    });

    it('mentionedAgents is empty when no @mentions are present', async () => {
      const { createThread, addThreadMessage } = await import('../../services/boardroomThreadService');
      const thread = createThread({ topic: 'Test', participants: ['jose'] });
      const msg = addThreadMessage({ threadId: thread.id, speaker: 'jose', content: 'No mentions here.' });
      expect(msg?.mentionedAgents).toEqual([]);
    });

    it('stores an optional retryContext on a message for later retry reconstruction', async () => {
      const { createThread, addThreadMessage, listThreadMessages } = await import('../../services/boardroomThreadService');
      const thread = createThread({ topic: 'Test', participants: ['jose'] });
      addThreadMessage({
        threadId: thread.id,
        speaker: 'jose',
        content: "jose couldn't respond: Ollama is not running",
        kind: 'failure',
        retryContext: 'What is the current status?'
      });
      const messages = listThreadMessages(thread.id);
      expect(messages[0].kind).toBe('failure');
      expect(messages[0].retryContext).toBe('What is the current status?');
    });

    it('defaults retryContext to undefined when not provided', async () => {
      const { createThread, addThreadMessage } = await import('../../services/boardroomThreadService');
      const thread = createThread({ topic: 'Test', participants: ['jose'] });
      const msg = addThreadMessage({ threadId: thread.id, speaker: 'jose', content: 'hi' });
      expect(msg?.retryContext).toBeUndefined();
    });
  });

  describe('migrateLegacySessions', () => {
    const LEGACY_KEY = 'alphonso_boardroom_sessions_v1';

    it('converts each legacy session into a thread with its messages replayed', async () => {
      const legacySession = {
        sessionId: 'boardroom_123',
        topic: 'Legacy Topic',
        participants: ['jose', 'hector'],
        status: 'concluded',
        mariaScore: 42,
        conclusion: 'Concluded with 2 agents. Maria risk score: 42.',
        createdAt: '2026-06-01T00:00:00.000Z',
        messages: [
          { agentId: 'hector', agentName: 'Hector', content: 'Research briefing:\n• source', timestamp: '2026-06-01T00:01:00.000Z', type: 'briefing' },
          { agentId: 'jose', agentName: 'Jose', content: 'Task delegated.', timestamp: '2026-06-01T00:02:00.000Z', type: 'response' }
        ]
      };
      localStorage.setItem(LEGACY_KEY, JSON.stringify([legacySession]));

      const { migrateLegacySessions, listThreads, listThreadMessages } = await import('../../services/boardroomThreadService');
      migrateLegacySessions();

      const threads = listThreads();
      expect(threads).toHaveLength(1);
      expect(threads[0].topic).toBe('Legacy Topic');
      expect(threads[0].status).toBe('concluded');

      const messages = listThreadMessages(threads[0].id);
      expect(messages).toHaveLength(3);
      expect(messages.some((m) => m.content.includes('Research briefing'))).toBe(true);
      expect(messages.some((m) => m.content.includes('Task delegated'))).toBe(true);
    });

    it('is idempotent — running twice does not duplicate threads', async () => {
      localStorage.setItem(LEGACY_KEY, JSON.stringify([{
        sessionId: 'boardroom_456',
        topic: 'Once Only',
        participants: ['jose'],
        status: 'active',
        createdAt: '2026-06-01T00:00:00.000Z',
        messages: []
      }]));

      const { migrateLegacySessions, listThreads } = await import('../../services/boardroomThreadService');
      migrateLegacySessions();
      migrateLegacySessions();

      expect(listThreads()).toHaveLength(1);
    });

    it('does nothing when there are no legacy sessions', async () => {
      const { migrateLegacySessions, listThreads } = await import('../../services/boardroomThreadService');
      migrateLegacySessions();
      expect(listThreads()).toHaveLength(0);
    });
  });
});

describe('parseMentions', () => {
  const KNOWN_AGENT_IDS = ['jose', 'hector', 'miya', 'maria', 'marcus', 'echo', 'sentinel', 'nova', 'alphonso'];

  it('returns an empty array for text with no mentions', async () => {
    const { parseMentions } = await import('../../services/boardroomThreadService');
    expect(parseMentions('just a plain message', KNOWN_AGENT_IDS)).toEqual([]);
  });

  it('extracts a single mention (case-insensitive) matched against known agent ids', async () => {
    const { parseMentions } = await import('../../services/boardroomThreadService');
    expect(parseMentions('@Hector can you look into this?', KNOWN_AGENT_IDS)).toEqual(['hector']);
    expect(parseMentions('@HECTOR can you look into this?', KNOWN_AGENT_IDS)).toEqual(['hector']);
  });

  it('extracts multiple distinct mentions, deduplicated, in first-seen order', async () => {
    const { parseMentions } = await import('../../services/boardroomThreadService');
    expect(parseMentions('@Hector and @Maria please review, @Hector especially the sourcing', KNOWN_AGENT_IDS))
      .toEqual(['hector', 'maria']);
  });

  it('ignores @-tokens that do not match a known agent id', async () => {
    const { parseMentions } = await import('../../services/boardroomThreadService');
    expect(parseMentions('email me @ myaddress@example.com about @nobody', KNOWN_AGENT_IDS)).toEqual([]);
  });

  it('does not match a mention embedded inside another word', async () => {
    const { parseMentions } = await import('../../services/boardroomThreadService');
    expect(parseMentions('the email is foo@hector.com', KNOWN_AGENT_IDS)).toEqual([]);
  });

  describe('findCrossThreadContext', () => {
    beforeEach(() => {
      localStorage.clear();
    });

    it('finds keyword-overlapping messages from other threads, excluding the current thread', async () => {
      const { createThread, addThreadMessage, findCrossThreadContext } = await import('../../services/boardroomThreadService');
      const pricing = createThread({ topic: 'Q3 Pricing', participants: ['jose'] });
      addThreadMessage({ threadId: pricing.id, speaker: 'jose', content: 'We decided on a tiered pricing structure for enterprise renewal contracts.' });
      const other = createThread({ topic: 'Unrelated Thread', participants: ['hector'] });
      addThreadMessage({ threadId: other.id, speaker: 'hector', content: 'Completely different market research about weather patterns.' });
      const current = createThread({ topic: 'Renewal Terms', participants: ['jose'] });

      const results = findCrossThreadContext({ excludeThreadId: current.id, queryText: 'what did we decide about renewal pricing?' });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].threadTopic).toBe('Q3 Pricing');
      expect(results.some((r) => r.threadTopic === current.id)).toBe(false);
    });

    it('returns an empty array when nothing overlaps', async () => {
      const { createThread, addThreadMessage, findCrossThreadContext } = await import('../../services/boardroomThreadService');
      const other = createThread({ topic: 'Zzz Thread', participants: ['hector'] });
      addThreadMessage({ threadId: other.id, speaker: 'hector', content: 'xyzzy plugh qwerty asdf.' });
      const current = createThread({ topic: 'Current Thread', participants: ['jose'] });

      const results = findCrossThreadContext({ excludeThreadId: current.id, queryText: 'completely unrelated banana topic' });

      expect(results).toEqual([]);
    });

    it('caps results at maxResults', async () => {
      const { createThread, addThreadMessage, findCrossThreadContext } = await import('../../services/boardroomThreadService');
      for (let i = 0; i < 5; i++) {
        const t = createThread({ topic: `Budget Thread ${i}`, participants: ['jose'] });
        addThreadMessage({ threadId: t.id, speaker: 'jose', content: 'budget budget budget planning discussion here' });
      }
      const current = createThread({ topic: 'Current', participants: ['jose'] });

      const results = findCrossThreadContext({ excludeThreadId: current.id, queryText: 'budget planning', maxResults: 3 });

      expect(results.length).toBeLessThanOrEqual(3);
    });
  });
});
