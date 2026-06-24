import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invoke: mockInvoke } = vi.hoisted(() => ({
  invoke: vi.fn().mockResolvedValue(null)
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args) => mockInvoke(...args),
  isTauri: vi.fn().mockReturnValue(false)
}));

vi.mock('../services/connectorRegistryService', () => ({
  appendConnectorAudit: vi.fn(),
  createConnectorRoutePacket: vi.fn()
}));

vi.mock('../services/joseCommandRouterService', () => ({
  createJoseCommandRoute: vi.fn().mockResolvedValue({ ok: true })
}));

vi.mock('../services/trustModel', () => ({
  timestampMs: vi.fn(() => Date.now())
}));

vi.mock('../services/telegramBrowserConnector', () => ({
  browserPollTelegram: vi.fn(),
  browserSendTelegram: vi.fn().mockResolvedValue({ ok: true }),
  handleTelegramBotCommand: vi.fn().mockResolvedValue({ ok: true })
}));

vi.mock('../services/connectors/connectorAuth', () => ({
  getConnectorCredential: vi.fn((connectorId, key) => {
    try {
      const raw = localStorage.getItem('alphonso_connector_credentials_v1');
      const all = raw ? JSON.parse(raw) : {};
      return all?.[connectorId]?.[key] || '';
    } catch {
      return '';
    }
  }),
  getConnectorCredentials: vi.fn((connectorId) => {
    try {
      const raw = localStorage.getItem('alphonso_connector_credentials_v1');
      const all = raw ? JSON.parse(raw) : {};
      return all?.[connectorId] || {};
    } catch {
      return {};
    }
  })
}));

describe('telegramAutoPollService', () => {
  let service;
  let browserPollTelegram;
  let appendConnectorAudit;
  let createConnectorRoutePacket;

  beforeEach(async () => {
    localStorage.clear();
    vi.clearAllMocks();
    service = await import('../services/telegramAutoPollService');
    browserPollTelegram = (await import('../services/telegramBrowserConnector')).browserPollTelegram;
    appendConnectorAudit = (await import('../services/connectorRegistryService')).appendConnectorAudit;
    createConnectorRoutePacket = (await import('../services/connectorRegistryService')).createConnectorRoutePacket;
  });

  describe('getTelegramAutoPollState', () => {
    it('returns default state when empty', () => {
      const state = service.getTelegramAutoPollState();
      expect(state).toEqual({
        enabled: false,
        lastPolledAtMs: null,
        errors: 0
      });
    });

    it('returns stored state with all fields', () => {
      localStorage.setItem('alphonso_telegram_auto_poll_state_v1', JSON.stringify({
        enabled: true,
        lastPolledAtMs: 1700000000000,
        errors: 3
      }));
      const state = service.getTelegramAutoPollState();
      expect(state).toEqual({
        enabled: true,
        lastPolledAtMs: 1700000000000,
        errors: 3
      });
    });

    it('normalizes missing or invalid fields', () => {
      localStorage.setItem('alphonso_telegram_auto_poll_state_v1', JSON.stringify({ enabled: true }));
      const state = service.getTelegramAutoPollState();
      expect(state).toEqual({
        enabled: true,
        lastPolledAtMs: null,
        errors: 0
      });
    });

    it('returns default state on malformed JSON', () => {
      localStorage.setItem('alphonso_telegram_auto_poll_state_v1', 'not-json');
      const state = service.getTelegramAutoPollState();
      expect(state).toEqual({
        enabled: false,
        lastPolledAtMs: null,
        errors: 0
      });
    });
  });

  describe('getTelegramEnvSafe', () => {
    it('returns envPresence from connector registry rows', () => {
      localStorage.setItem('alphonso_connector_credentials_v1', JSON.stringify({
        telegram: { TELEGRAM_BOT_TOKEN: 'bot_token_123', TELEGRAM_BOT_USERNAME: 'mybot' }
      }));
      const env = service.getTelegramEnvSafe();
      expect(env).toHaveProperty('TELEGRAM_BOT_TOKEN', 'bot_token_123');
    });

    it('returns top-level envPresence when present', () => {
      localStorage.setItem('alphonso_connector_credentials_v1', JSON.stringify({
        telegram: { TELEGRAM_BOT_TOKEN: 'tok123' }
      }));
      const env = service.getTelegramEnvSafe();
      expect(env).toHaveProperty('TELEGRAM_BOT_TOKEN', 'tok123');
    });

    it('returns empty object when registry is empty', () => {
      const env = service.getTelegramEnvSafe();
      expect(env.TELEGRAM_BOT_TOKEN).toBeFalsy();
    });

    it('returns empty object when telegram row not found', () => {
      localStorage.setItem('alphonso_connector_credentials_v1', JSON.stringify({
        whatsapp: { WHATSAPP_TOKEN: 'tok' }
      }));
      const env = service.getTelegramEnvSafe();
      expect(env.TELEGRAM_BOT_TOKEN).toBeFalsy();
    });
  });

  describe('runSingleTelegramPoll', () => {
    it('returns error when bot token is missing', async () => {
      const result = await service.runSingleTelegramPoll();
      expect(result).toEqual({ ok: false, reason: 'missing_bot_token' });
      expect(appendConnectorAudit).toHaveBeenCalledWith('telegram', 'poll_failed', {
        reason: 'missing_bot_token'
      });
      expect(browserPollTelegram).not.toHaveBeenCalled();
    });

    it('calls browserPollTelegram with token and limit', async () => {
      localStorage.setItem('alphonso_connector_credentials_v1', JSON.stringify({
        telegram: { TELEGRAM_BOT_TOKEN: 'test_bot_token' }
      }));
      browserPollTelegram.mockResolvedValue({ ok: true, messages: [], cursor: null });

      await service.runSingleTelegramPoll({ limit: 5 });

      expect(browserPollTelegram).toHaveBeenCalledWith({ botToken: 'test_bot_token', limit: 5 });
    });

    it('handles poll failures gracefully', async () => {
      localStorage.setItem('alphonso_connector_credentials_v1', JSON.stringify({
        telegram: { TELEGRAM_BOT_TOKEN: 'test_bot_token' }
      }));
      browserPollTelegram.mockResolvedValue({ ok: false, error: 'network_timeout' });

      const result = await service.runSingleTelegramPoll();

      expect(result).toEqual({ ok: false, reason: 'network_timeout', count: 0 });
      expect(appendConnectorAudit).toHaveBeenCalledWith('telegram', 'poll_failed', {
        error: 'network_timeout'
      });
    });

    it('uses default reason when poll failure has no error', async () => {
      localStorage.setItem('alphonso_connector_credentials_v1', JSON.stringify({
        telegram: { TELEGRAM_BOT_TOKEN: 'test_bot_token' }
      }));
      browserPollTelegram.mockResolvedValue({ ok: false });

      const result = await service.runSingleTelegramPoll();

      expect(result.ok).toBe(false);
      expect(result.reason).toBe('poll_failed');
    });

    it('routes messages through jose command router', async () => {
      localStorage.setItem('alphonso_connector_credentials_v1', JSON.stringify({
        telegram: { TELEGRAM_BOT_TOKEN: 'test_bot_token' }
      }));
      browserPollTelegram.mockResolvedValue({
        ok: true,
        messages: [{ from_id: 'user1', chat_id: 'chat1', text: 'hello world', update_id: 1 }],
        cursor: 100
      });
      createConnectorRoutePacket.mockReturnValue({
        rejected: false,
        packet: { id: 'pkt_1' },
        parsed: { originalText: 'hello world' }
      });

      const result = await service.runSingleTelegramPoll();

      expect(result.ok).toBe(true);
      expect(result.count).toBe(1);
      expect(result.routed).toBe(1);
      expect(result.rejected).toBe(0);
      expect(appendConnectorAudit).toHaveBeenCalledWith('telegram', 'poll_message_routed', {
        packetId: 'pkt_1',
        chatId: 'chat1',
        updateId: 1
      });
    });

    it('counts rejected messages', async () => {
      localStorage.setItem('alphonso_connector_credentials_v1', JSON.stringify({
        telegram: { TELEGRAM_BOT_TOKEN: 'test_bot_token' }
      }));
      browserPollTelegram.mockResolvedValue({
        ok: true,
        messages: [{ chat_id: 'chat1', text: 'spam' }],
        cursor: null
      });
      createConnectorRoutePacket.mockReturnValue({ rejected: true });

      const result = await service.runSingleTelegramPoll();

      expect(result.ok).toBe(true);
      expect(result.count).toBe(1);
      expect(result.routed).toBe(0);
      expect(result.rejected).toBe(1);
      expect(appendConnectorAudit).toHaveBeenCalledWith('telegram', 'poll_message_rejected', {
        chatId: 'chat1',
        updateId: null
      });
    });

    it('increments error count on poll failure', async () => {
      localStorage.setItem('alphonso_connector_credentials_v1', JSON.stringify({
        telegram: { TELEGRAM_BOT_TOKEN: 'test_bot_token' }
      }));
      localStorage.setItem('alphonso_telegram_auto_poll_state_v1', JSON.stringify({
        enabled: true,
        lastPolledAtMs: null,
        errors: 2
      }));
      browserPollTelegram.mockResolvedValue({ ok: false, error: 'timeout' });

      await service.runSingleTelegramPoll();

      const state = service.getTelegramAutoPollState();
      expect(state.errors).toBe(3);
    });

    it('resets error count on success', async () => {
      localStorage.setItem('alphonso_connector_credentials_v1', JSON.stringify({
        telegram: { TELEGRAM_BOT_TOKEN: 'test_bot_token' }
      }));
      localStorage.setItem('alphonso_telegram_auto_poll_state_v1', JSON.stringify({
        enabled: true,
        lastPolledAtMs: null,
        errors: 5
      }));
      browserPollTelegram.mockResolvedValue({ ok: true, messages: [], cursor: null });

      await service.runSingleTelegramPoll();

      const state = service.getTelegramAutoPollState();
      expect(state.errors).toBe(0);
    });
  });
});
