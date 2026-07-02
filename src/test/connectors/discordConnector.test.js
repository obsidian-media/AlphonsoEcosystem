import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(null),
  isTauri: vi.fn().mockReturnValue(false)
}));

const mockEvaluatePolicyGate = vi.fn().mockReturnValue({
  ok: true, blocked: false, setupRequired: false, reason: null,
  riskLevel: 'medium', confidence: 'verified', verificationState: 'verified'
});

vi.mock('../../services/policyEnforcementService', () => ({
  evaluatePolicyGate: (...args) => mockEvaluatePolicyGate(...args)
}));

const DISCORD_API_BASE = 'https://discord.com/api/v10';
let mockFetch;

async function getModule() {
  return import('../../services/connectors/discordConnector.ts');
}

describe('discordConnector', () => {
  beforeEach(() => {
    localStorage.clear();
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    mockEvaluatePolicyGate.mockReturnValue({
      ok: true, blocked: false, setupRequired: false, reason: null,
      riskLevel: 'medium', confidence: 'verified', verificationState: 'verified'
    });
  });

  describe('policy gate blocking', () => {
    it('throws when policy gate blocks a request', async () => {
      mockEvaluatePolicyGate.mockReturnValue({
        ok: false, blocked: true, setupRequired: false,
        reason: 'Zero-Cost Mode blocked discord',
        riskLevel: 'medium', confidence: 'verified', verificationState: 'pending'
      });
      const { sendMessage } = await getModule();
      await expect(sendMessage({ botToken: 'bot-tok' }, 'C123', 'Hi'))
        .rejects.toThrow('Zero-Cost Mode blocked discord');
    });

    it('calls evaluatePolicyGate with correct connectorId', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'M1', channel_id: 'C1', content: 'Hi', author: { id: 'U1' }, timestamp: 't1' })
      });
      const { sendMessage } = await getModule();
      await sendMessage({ botToken: 'bot-tok' }, 'C1', 'Hi');
      expect(mockEvaluatePolicyGate).toHaveBeenCalledWith(
        expect.objectContaining({ connectorId: 'discord' })
      );
    });
  });

  describe('sendMessage', () => {
    it('sends POST to /channels/{id}/messages with content', async () => {
      const { sendMessage } = await getModule();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'M1', channel_id: 'C123', content: 'Hello!', author: { id: 'U456' }, timestamp: '2026-07-02T00:00:00Z' })
      });

      const msg = await sendMessage({ botToken: 'bot-tok' }, 'C123', 'Hello!');

      expect(mockFetch).toHaveBeenCalledWith(
        `${DISCORD_API_BASE}/channels/C123/messages`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bot bot-tok',
            'Content-Type': 'application/json'
          }),
          body: JSON.stringify({ content: 'Hello!' })
        })
      );
      expect(msg.id).toBe('M1');
      expect(msg.channelId).toBe('C123');
      expect(msg.authorId).toBe('U456');
    });
  });

  describe('editMessage', () => {
    it('sends PATCH to /channels/{id}/messages/{id} with content', async () => {
      const { editMessage } = await getModule();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'M1', channel_id: 'C123', content: 'Updated', author: { id: 'U1' }, timestamp: 't1' })
      });

      const msg = await editMessage({ botToken: 'bot-tok' }, 'C123', 'M1', 'Updated');

      expect(mockFetch).toHaveBeenCalledWith(
        `${DISCORD_API_BASE}/channels/C123/messages/M1`,
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ content: 'Updated' })
        })
      );
      expect(msg.content).toBe('Updated');
    });
  });

  describe('deleteMessage', () => {
    it('sends DELETE to /channels/{id}/messages/{id}', async () => {
      const { deleteMessage } = await getModule();
      mockFetch.mockResolvedValue({ ok: true, status: 204 });

      await deleteMessage({ botToken: 'bot-tok' }, 'C123', 'M1');

      expect(mockFetch).toHaveBeenCalledWith(
        `${DISCORD_API_BASE}/channels/C123/messages/M1`,
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  describe('listGuildChannels', () => {
    it('maps channel fields correctly', async () => {
      const { listGuildChannels } = await getModule();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ([
          { id: 'C1', name: 'general', type: 0, guild_id: 'G1', topic: 'Chat' },
          { id: 'C2', name: 'voice', type: 2, guild_id: 'G1', topic: null }
        ])
      });

      const channels = await listGuildChannels({ botToken: 'bot-tok' }, 'G1');

      expect(mockFetch).toHaveBeenCalledWith(
        `${DISCORD_API_BASE}/guilds/G1/channels`,
        expect.objectContaining({ method: 'GET' })
      );
      expect(channels).toHaveLength(2);
      expect(channels[0].name).toBe('general');
      expect(channels[0].guildId).toBe('G1');
      expect(channels[1].topic).toBe('');
    });
  });

  describe('getChannelHistory', () => {
    it('maps messages and includes limit in query string', async () => {
      const { getChannelHistory } = await getModule();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ([
          { id: 'M1', channel_id: 'C123', content: 'Hello', author: { id: 'U1' }, timestamp: 't1' },
          { id: 'M2', channel_id: 'C123', content: 'World', author: { id: 'U2' }, timestamp: 't2' }
        ])
      });

      const messages = await getChannelHistory({ botToken: 'bot-tok' }, 'C123', 10);

      expect(mockFetch).toHaveBeenCalledWith(
        `${DISCORD_API_BASE}/channels/C123/messages?limit=10`,
        expect.objectContaining({ method: 'GET' })
      );
      expect(messages).toHaveLength(2);
      expect(messages[0].content).toBe('Hello');
    });

    it('defaults limit to 50', async () => {
      const { getChannelHistory } = await getModule();
      mockFetch.mockResolvedValue({ ok: true, json: async () => [] });
      await getChannelHistory({ botToken: 'bot-tok' }, 'C123');
      expect(mockFetch).toHaveBeenCalledWith(
        `${DISCORD_API_BASE}/channels/C123/messages?limit=50`,
        expect.anything()
      );
    });
  });

  describe('addReaction', () => {
    it('sends PUT to the reactions/@me endpoint with encoded emoji', async () => {
      const { addReaction } = await getModule();
      mockFetch.mockResolvedValue({ ok: true, status: 204 });

      await addReaction({ botToken: 'bot-tok' }, 'C123', 'M1', '👍');

      expect(mockFetch).toHaveBeenCalledWith(
        `${DISCORD_API_BASE}/channels/C123/messages/M1/reactions/${encodeURIComponent('👍')}/@me`,
        expect.objectContaining({ method: 'PUT' })
      );
    });
  });

  describe('sendWebhookMessage', () => {
    it('sends POST to webhook URL with content payload', async () => {
      const { sendWebhookMessage } = await getModule();
      mockFetch.mockResolvedValue({ ok: true });

      await sendWebhookMessage('https://discord.com/api/webhooks/1/xxx', 'Hello webhook');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://discord.com/api/webhooks/1/xxx',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: 'Hello webhook' })
        })
      );
    });

    it('includes username when provided', async () => {
      const { sendWebhookMessage } = await getModule();
      mockFetch.mockResolvedValue({ ok: true });

      await sendWebhookMessage('https://discord.com/api/webhooks/1/xxx', 'text', 'Alphonso Bot');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://discord.com/api/webhooks/1/xxx',
        expect.objectContaining({
          body: JSON.stringify({ content: 'text', username: 'Alphonso Bot' })
        })
      );
    });

    it('does not go through policy gate (webhook is external)', async () => {
      const { sendWebhookMessage } = await getModule();
      mockFetch.mockResolvedValue({ ok: true });
      mockEvaluatePolicyGate.mockClear();
      await sendWebhookMessage('https://discord.com/api/webhooks/1/xxx', 'test');
      expect(mockEvaluatePolicyGate).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('throws with status and message on non-ok response', async () => {
      const { sendMessage } = await getModule();
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ message: '401: Unauthorized' })
      });

      await expect(sendMessage({ botToken: 'bad' }, 'C123', 'Hi'))
        .rejects.toThrow('Discord API error (401): 401: Unauthorized');
    });

    it('throws on channel not found (404)', async () => {
      const { sendMessage } = await getModule();
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ message: 'Unknown Channel' })
      });

      await expect(sendMessage({ botToken: 'bot-tok' }, 'C999', 'Hi'))
        .rejects.toThrow('Discord API error (404): Unknown Channel');
    });

    it('throws on webhook error response', async () => {
      const { sendWebhookMessage } = await getModule();
      mockFetch.mockResolvedValue({ ok: false, status: 403 });

      await expect(sendWebhookMessage('https://discord.com/api/webhooks/1/xxx', 'test'))
        .rejects.toThrow('Discord webhook error: 403');
    });

    it('throws on rate limited (429)', async () => {
      const { sendMessage } = await getModule();
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({ message: 'You are being rate limited.' })
      });

      await expect(sendMessage({ botToken: 'bot-tok' }, 'C123', 'Hi'))
        .rejects.toThrow('Discord API error (429): You are being rate limited.');
    });

    it('falls back to statusText when response body is not JSON', async () => {
      const { sendMessage } = await getModule();
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => { throw new Error('not json'); }
      });

      await expect(sendMessage({ botToken: 'bot-tok' }, 'C123', 'Hi'))
        .rejects.toThrow('Discord API error (500): Internal Server Error');
    });
  });
});
