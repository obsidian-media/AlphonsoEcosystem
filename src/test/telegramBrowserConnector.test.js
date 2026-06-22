import { vi, describe, it, expect, beforeEach } from 'vitest';
import {
  getTelegramPollCursor,
  setTelegramPollCursor,
  browserPollTelegram,
  browserSendTelegram,
  parseTelegramCommand,
  handleTelegramBotCommand,
  verifyTelegramBotEnvironment
} from '../services/telegramBrowserConnector';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  global.fetch = undefined;
});

describe('getTelegramPollCursor / setTelegramPollCursor', () => {
  it('returns null when no cursor has been set', () => {
    expect(getTelegramPollCursor()).toBeNull();
  });

  it('stores and retrieves a numeric cursor', () => {
    setTelegramPollCursor(42);
    expect(getTelegramPollCursor()).toBe(42);
  });

  it('returns null when storage contains invalid JSON', () => {
    localStorage.setItem('alphonso_telegram_poll_cursor_v1', 'bad-json');
    expect(getTelegramPollCursor()).toBeNull();
  });
});

describe('browserPollTelegram', () => {
  it('returns error when botToken is missing', async () => {
    const result = await browserPollTelegram({});
    expect(result.ok).toBe(false);
    expect(result.error).toBe('bot_token_missing');
  });

  it('returns ok: false on fetch network error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    const result = await browserPollTelegram({ botToken: 'tok123' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Network error');
  });

  it('returns ok: false on non-200 HTTP status', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'Unauthorized' });
    const result = await browserPollTelegram({ botToken: 'tok123' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('401');
  });

  it('returns ok: false when Telegram body.ok is false', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: false, description: 'Unauthorized' })
    });
    const result = await browserPollTelegram({ botToken: 'tok123' });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Unauthorized');
  });

  it('returns ok: true with parsed messages on success', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        result: [
          {
            update_id: 100,
            message: {
              chat: { id: 1, type: 'private' },
              from: { id: 2, username: 'alice' },
              text: 'hello',
              date: 1700000000
            }
          }
        ]
      })
    });
    const result = await browserPollTelegram({ botToken: 'tok123' });
    expect(result.ok).toBe(true);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].text).toBe('hello');
  });

  it('updates the poll cursor to the last update_id', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        result: [{ update_id: 200, message: { chat: { id: 1, type: 'private' }, from: { id: 2 }, text: 'hi', date: 1 } }]
      })
    });
    await browserPollTelegram({ botToken: 'tok123' });
    expect(getTelegramPollCursor()).toBe(200);
  });
});

describe('browserSendTelegram', () => {
  it('returns error when chatId is missing', async () => {
    const result = await browserSendTelegram({ botToken: 'tok', chatId: '', text: 'hello' });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('chat_id_required');
  });

  it('returns error when text is missing', async () => {
    const result = await browserSendTelegram({ botToken: 'tok', chatId: '123', text: '' });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('text_required');
  });

  it('returns error when botToken is missing', async () => {
    const result = await browserSendTelegram({ botToken: '', chatId: '123', text: 'hello' });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('bot_token_missing');
  });

  it('returns ok: true with message metadata on success', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 55 } })
    });
    const result = await browserSendTelegram({ botToken: 'tok', chatId: '123', text: 'Hello' });
    expect(result.ok).toBe(true);
    expect(result.external_id).toBe('55');
    expect(result.connector_id).toBe('telegram');
  });
});

describe('parseTelegramCommand', () => {
  it('parses /start with no args', () => {
    const result = parseTelegramCommand('/start');
    expect(result.cmd).toBe('start');
    expect(result.args).toBe('');
  });

  it('parses /ask with args', () => {
    const result = parseTelegramCommand('/ask what is 2+2');
    expect(result.cmd).toBe('ask');
    expect(result.args).toBe('what is 2+2');
  });

  it('returns null for non-command text', () => {
    expect(parseTelegramCommand('hello')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseTelegramCommand('')).toBeNull();
  });

  it('strips bot mention from command', () => {
    const result = parseTelegramCommand('/help@alphonsobot');
    expect(result.cmd).toBe('help');
  });
});

describe('handleTelegramBotCommand', () => {
  it('returns ok: false for non-command text', async () => {
    const result = await handleTelegramBotCommand({ text: 'not a command', chatId: '1', botToken: 'tok' });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('not_a_command');
  });

  it('returns ok: false for unknown command', async () => {
    const result = await handleTelegramBotCommand({ text: '/unknown', chatId: '1', botToken: 'tok' });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('unknown_command');
  });

  it('returns reply string for /help when no botToken', async () => {
    const result = await handleTelegramBotCommand({ text: '/help', chatId: null, botToken: null });
    expect(result.ok).toBe(true);
    expect(typeof result.reply).toBe('string');
    expect(result.reply.length).toBeGreaterThan(0);
  });
});

describe('verifyTelegramBotEnvironment', () => {
  it('returns ok: false when botToken is missing', async () => {
    const result = await verifyTelegramBotEnvironment({});
    expect(result.ok).toBe(false);
    expect(result.trust).toBe('failed');
  });

  it('returns ok: false on fetch error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('DNS failure'));
    const result = await verifyTelegramBotEnvironment({ botToken: 'bad-token' });
    expect(result.ok).toBe(false);
    expect(result.trust).toBe('failed');
  });

  it('returns ok: true with botUsername on success', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { username: 'alphonsobot' } })
    });
    const result = await verifyTelegramBotEnvironment({ botToken: 'valid-token' });
    expect(result.ok).toBe(true);
    expect(result.botUsername).toBe('alphonsobot');
    expect(result.trust).toBe('verified');
  });
});
