import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invoke: mockInvoke } = vi.hoisted(() => ({
  invoke: vi.fn().mockResolvedValue(null)
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args) => mockInvoke(...args)
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
  browserPollTelegram: vi.fn()
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
      localStorage.setItem('alphonso_connector_registry_v2', JSON.stringify({
        rows: [
          { id: 'telegram', envPresence: { TELEGRAM_BOT_TOKEN: true, TELEGRAM_BOT_USERNAME: true } }
        ]
      }));
      const env = service.getTelegramEnvSafe();
      expect(env).toEqual({ TELEGRAM_BOT_TOKEN: true, TELEGRAM_BOT_USERNAME: true });
    });

    it('returns top-level envPresence when present', () => {
      localStorage.setItem('alphonso_connector_registry_v2', JSON.stringify({
        envPresence: { TELEGRAM_BOT_TOKEN: true }
      }));
      const env = service.getTelegramEnvSafe();
      expect(env).toEqual({ TELEGRAM_BOT_TOKEN: true });
    });

    it('returns empty object when registry is empty', () => {
      const env = service.getTelegramEnvSafe();
      expect(env).toEqual({});
    });

    it('returns empty object when telegram row not found', () => {
      localStorage.setItem('alphonso_connector_registry_v2', JSON.stringify({
        rows: [{ id: 'whatsapp', envPresence: { WHATSAPP_TOKEN: true } }]
      }));
      const env = service.getTelegramEnvSafe();
      expect(env).toEqual({});
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
      localStorage.setItem('alphonso_connector_registry_v2', JSON.stringify({
        envPresence: { TELEGRAM_BOT_TOKEN: true }
      }));
      browserPollTelegram.mockResolvedValue({ ok: true, messages: [], cursor: null });

      await service.runSingleTelegramPoll({ limit: 5 });

      expect(browserPollTelegram).toHaveBeenCalledWith({ botToken: true, limit: 5 });
    });

    it('handles poll failures gracefully', async () => {
      localStorage.setItem('alphonso_connector_registry_v2', JSON.stringify({
        envPresence: { TELEGRAM_BOT_TOKEN: true }
      }));
      browserPollTelegram.mockResolvedValue({ ok: false, error: 'network_timeout' });

      const result = await service.runSingleTelegramPoll();

      expect(result).toEqual({ ok: false, reason: 'network_timeout', count: 0 });
      expect(appendConnectorAudit).toHaveBeenCalledWith('telegram', 'poll_failed', {
        error: 'network_timeout'
      });
    });

    it('uses default reason when poll failure has no error', async () => {
      localStorage.setItem('alphonso_connector_registry_v2', JSON.stringify({
        envPresence: { TELEGRAM_BOT_TOKEN: true }
      }));
      browserPollTelegram.mockResolvedValue({ ok: false });

      const result = await service.runSingleTelegramPoll();

      expect(result.ok).toBe(false);
      expect(result.reason).toBe('poll_failed');
    });

    it('routes messages through jose command router', async () => {
      localStorage.setItem('alphonso_connector_registry_v2', JSON.stringify({
        envPresence: { TELEGRAM_BOT_TOKEN: true }
      }));
      browserPollTelegram.mockResolvedValue({
        ok: true,
        messages: [{ from_id: 'user1', chat_id: 'chat1', text: '/help', update_id: 1 }],
        cursor: 100
      });
      createConnectorRoutePacket.mockReturnValue({
        rejected: false,
        packet: { id: 'pkt_1' },
        parsed: { originalText: '/help' }
      });

      const result = await service.runSingleTelegramPoll();

      expect(result).toEqual({ ok: true, count: 1, routed: 1, rejected: 0 });
      expect(appendConnectorAudit).toHaveBeenCalledWith('telegram', 'poll_message_routed', {
        packetId: 'pkt_1',
        chatId: 'chat1',
        updateId: 1
      });
      expect(appendConnectorAudit).toHaveBeenCalledWith('telegram', 'poll_success', {
        count: 1,
        routed: 1,
        rejected: 0,
        lastUpdateId: 100
      });
    });

    it('counts rejected messages', async () => {
      localStorage.setItem('alphonso_connector_registry_v2', JSON.stringify({
        envPresence: { TELEGRAM_BOT_TOKEN: true }
      }));
      browserPollTelegram.mockResolvedValue({
        ok: true,
        messages: [{ chat_id: 'chat1', text: 'spam' }],
        cursor: null
      });
      createConnectorRoutePacket.mockReturnValue({ rejected: true });

      const result = await service.runSingleTelegramPoll();

      expect(result).toEqual({ ok: true, count: 1, routed: 0, rejected: 1 });
      expect(appendConnectorAudit).toHaveBeenCalledWith('telegram', 'poll_message_rejected', {
        chatId: 'chat1',
        updateId: null
      });
    });

    it('increments error count on poll failure', async () => {
      localStorage.setItem('alphonso_connector_registry_v2', JSON.stringify({
        envPresence: { TELEGRAM_BOT_TOKEN: true }
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
      localStorage.setItem('alphonso_connector_registry_v2', JSON.stringify({
        envPresence: { TELEGRAM_BOT_TOKEN: true }
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
