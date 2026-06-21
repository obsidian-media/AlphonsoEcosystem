import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(null),
  isTauri: vi.fn().mockReturnValue(false)
}));

const SLACK_API_BASE = 'https://slack.com/api';

let mockFetch;

async function getModule() {
  return import('../services/connectors/slackConnector.ts');
}

describe('slackConnector', () => {
  beforeEach(() => {
    localStorage.clear();
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  describe('sendMessage', () => {
    it('sends POST to chat.postMessage with channel and text', async () => {
      const { sendMessage } = await getModule();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          ts: '12345.67890',
          channel: 'C123',
          message: { text: 'Hello!', user: 'U456', thread_ts: undefined }
        })
      });

      const msg = await sendMessage({ token: 'xoxb-tok' }, 'C123', 'Hello!');

      expect(mockFetch).toHaveBeenCalledWith(
        `${SLACK_API_BASE}/chat.postMessage`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer xoxb-tok',
            'Content-Type': 'application/json'
          }),
          body: JSON.stringify({ channel: 'C123', text: 'Hello!' })
        })
      );
      expect(msg.ts).toBe('12345.67890');
      expect(msg.channel).toBe('C123');
    });

    it('includes thread_ts when provided', async () => {
      const { sendMessage } = await getModule();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          ts: '12345.67891',
          channel: 'C123',
          message: { text: 'Reply', user: 'U456', thread_ts: '12345.67890' }
        })
      });

      const msg = await sendMessage({ token: 'xoxb-tok' }, 'C123', 'Reply', '12345.67890');

      expect(mockFetch).toHaveBeenCalledWith(
        `${SLACK_API_BASE}/chat.postMessage`,
        expect.objectContaining({
          body: JSON.stringify({ channel: 'C123', text: 'Reply', thread_ts: '12345.67890' })
        })
      );
      expect(msg.threadTs).toBe('12345.67890');
    });
  });

  describe('sendRichMessage', () => {
    it('sends blocks array to chat.postMessage', async () => {
      const { sendRichMessage } = await getModule();
      const blocks = [{ type: 'section', text: { type: 'mrkdwn', text: 'Hello' } }];
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          ts: '98765.43210',
          channel: 'C123',
          message: { text: '', user: 'U456' }
        })
      });

      const msg = await sendRichMessage({ token: 'xoxb-tok' }, 'C123', blocks);

      expect(mockFetch).toHaveBeenCalledWith(
        `${SLACK_API_BASE}/chat.postMessage`,
        expect.objectContaining({
          body: JSON.stringify({ channel: 'C123', blocks })
        })
      );
      expect(msg.ts).toBe('98765.43210');
    });
  });

  describe('updateMessage', () => {
    it('sends POST to chat.update with channel, ts, text', async () => {
      const { updateMessage } = await getModule();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true })
      });

      await updateMessage({ token: 'xoxb-tok' }, 'C123', '111.222', 'Updated text');

      expect(mockFetch).toHaveBeenCalledWith(
        `${SLACK_API_BASE}/chat.update`,
        expect.objectContaining({
          body: JSON.stringify({ channel: 'C123', ts: '111.222', text: 'Updated text' })
        })
      );
    });
  });

  describe('deleteMessage', () => {
    it('sends POST to chat.delete with channel and ts', async () => {
      const { deleteMessage } = await getModule();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true })
      });

      await deleteMessage({ token: 'xoxb-tok' }, 'C123', '111.222');

      expect(mockFetch).toHaveBeenCalledWith(
        `${SLACK_API_BASE}/chat.delete`,
        expect.objectContaining({
          body: JSON.stringify({ channel: 'C123', ts: '111.222' })
        })
      );
    });
  });

  describe('listChannels', () => {
    it('maps channel fields correctly', async () => {
      const { listChannels } = await getModule();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          channels: [
            { id: 'C1', name: 'general', is_private: false, num_members: 10, purpose: { value: 'Chat' } },
            { id: 'C2', name: 'priv', is_private: true, num_members: 3, purpose: { value: '' } }
          ]
        })
      });

      const channels = await listChannels({ token: 'xoxb-tok' });

      expect(mockFetch).toHaveBeenCalledWith(
        `${SLACK_API_BASE}/conversations.list`,
        expect.objectContaining({
          body: JSON.stringify({ types: 'public_channel,private_channel', limit: 200 })
        })
      );
      expect(channels).toHaveLength(2);
      expect(channels[0].name).toBe('general');
      expect(channels[0].isPrivate).toBe(false);
      expect(channels[0].numMembers).toBe(10);
      expect(channels[1].isPrivate).toBe(true);
    });
  });

  describe('getChannelHistory', () => {
    it('maps messages with thread_ts', async () => {
      const { getChannelHistory } = await getModule();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          messages: [
            { ts: '111.111', text: 'Hello', user: 'U1', thread_ts: '111.000' },
            { ts: '111.222', text: 'World', user: 'U2' }
          ]
        })
      });

      const messages = await getChannelHistory({ token: 'xoxb-tok' }, 'C123', 10);

      expect(mockFetch).toHaveBeenCalledWith(
        `${SLACK_API_BASE}/conversations.history`,
        expect.objectContaining({
          body: JSON.stringify({ channel: 'C123', limit: 10 })
        })
      );
      expect(messages).toHaveLength(2);
      expect(messages[0].threadTs).toBe('111.000');
      expect(messages[1].threadTs).toBeUndefined();
    });
  });

  describe('uploadFile', () => {
    it('sends POST to files.upload with content, filename, title', async () => {
      const { uploadFile } = await getModule();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true })
      });

      await uploadFile({ token: 'xoxb-tok' }, 'C123', 'file content', 'test.txt', 'My File');

      expect(mockFetch).toHaveBeenCalledWith(
        `${SLACK_API_BASE}/files.upload`,
        expect.objectContaining({
          body: JSON.stringify({
            channels: 'C123',
            content: 'file content',
            filename: 'test.txt',
            title: 'My File'
          })
        })
      );
    });
  });

  describe('addReaction', () => {
    it('sends POST to reactions.add', async () => {
      const { addReaction } = await getModule();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true })
      });

      await addReaction({ token: 'xoxb-tok' }, 'C123', '111.222', 'thumbsup');

      expect(mockFetch).toHaveBeenCalledWith(
        `${SLACK_API_BASE}/reactions.add`,
        expect.objectContaining({
          body: JSON.stringify({ channel: 'C123', timestamp: '111.222', name: 'thumbsup' })
        })
      );
    });
  });

  describe('createChannel', () => {
    it('sends POST to conversations.create and maps result', async () => {
      const { createChannel } = await getModule();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          channel: { id: 'C101', name: 'new-channel', is_private: true, num_members: 0, purpose: { value: '' } }
        })
      });

      const channel = await createChannel({ token: 'xoxb-tok' }, 'new-channel', true);

      expect(mockFetch).toHaveBeenCalledWith(
        `${SLACK_API_BASE}/conversations.create`,
        expect.objectContaining({
          body: JSON.stringify({ name: 'new-channel', is_private: true })
        })
      );
      expect(channel.id).toBe('C101');
      expect(channel.name).toBe('new-channel');
      expect(channel.isPrivate).toBe(true);
    });
  });

  describe('inviteToChannel', () => {
    it('sends POST to conversations.invite with user list', async () => {
      const { inviteToChannel } = await getModule();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true })
      });

      await inviteToChannel({ token: 'xoxb-tok' }, 'C123', ['U1', 'U2']);

      expect(mockFetch).toHaveBeenCalledWith(
        `${SLACK_API_BASE}/conversations.invite`,
        expect.objectContaining({
          body: JSON.stringify({ channel: 'C123', users: 'U1,U2' })
        })
      );
    });
  });

  describe('sendWebhookMessage', () => {
    it('sends POST to webhook URL with text payload', async () => {
      const { sendWebhookMessage } = await getModule();
      mockFetch.mockResolvedValue({ ok: true });

      await sendWebhookMessage('https://hooks.slack.com/services/T00/B00/xxx', 'Hello webhook');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://hooks.slack.com/services/T00/B00/xxx',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: 'Hello webhook' })
        })
      );
    });

    it('includes blocks when provided', async () => {
      const { sendWebhookMessage } = await getModule();
      mockFetch.mockResolvedValue({ ok: true });
      const blocks = [{ type: 'section', text: { type: 'mrkdwn', text: 'Block content' } }];

      await sendWebhookMessage('https://hooks.slack.com/services/T00/B00/xxx', 'text', blocks);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://hooks.slack.com/services/T00/B00/xxx',
        expect.objectContaining({
          body: JSON.stringify({ text: 'text', blocks })
        })
      );
    });
  });

  describe('error handling', () => {
    it('throws on expired token (ok: false, error: invalid_auth)', async () => {
      const { sendMessage } = await getModule();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: false, error: 'invalid_auth' })
      });

      await expect(sendMessage({ token: 'bad' }, 'C123', 'Hi'))
        .rejects.toThrow('Slack API error: invalid_auth');
    });

    it('throws on channel not found', async () => {
      const { sendMessage } = await getModule();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: false, error: 'channel_not_found' })
      });

      await expect(sendMessage({ token: 'xoxb-tok' }, 'C999', 'Hi'))
        .rejects.toThrow('Slack API error: channel_not_found');
    });

    it('throws on webhook error response', async () => {
      const { sendWebhookMessage } = await getModule();
      mockFetch.mockResolvedValue({ ok: false, status: 403 });

      await expect(sendWebhookMessage('https://hooks.slack.com/services/T00/B00/xxx', 'test'))
        .rejects.toThrow('Slack webhook error: 403');
    });
  });
});
