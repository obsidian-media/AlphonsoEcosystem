import { describe, it, expect, beforeEach, vi } from 'vitest';

const localStorageMock = {
  length: 0,
  key: vi.fn((i) => null),
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
};
vi.stubGlobal('localStorage', localStorageMock);

vi.mock('../../services/connectors/connectorAuth', () => ({
  getConnectorCredential: vi.fn(() => '')
}));

vi.mock('../../services/connectorRegistryService', () => ({
  isConnectorAuthenticated: vi.fn(() => ({ ok: false }))
}));

describe('connectorHealthCheckService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.length = 0;
  });

  describe('checkTelegramConnection', () => {
    it('exports checkTelegramConnection function', async () => {
      const { checkTelegramConnection } = await import('../../services/connectorHealthCheckService');
      expect(typeof checkTelegramConnection).toBe('function');
    });

    it('returns error when no bot token configured', async () => {
      const { checkTelegramConnection } = await import('../../services/connectorHealthCheckService');
      const result = await checkTelegramConnection();
      expect(result.ok).toBe(false);
      expect(result.message).toContain('No Telegram bot token');
    });

    it('falls back to the real saved credential store (connectorAuth), not the unrelated auth-profiles localStorage key', async () => {
      const { getConnectorCredential } = await import('../../services/connectors/connectorAuth');
      getConnectorCredential.mockReturnValue('saved-real-token');
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, result: { username: 'realbot' } })
      });
      const { checkTelegramConnection } = await import('../../services/connectorHealthCheckService');
      const result = await checkTelegramConnection();
      expect(getConnectorCredential).toHaveBeenCalledWith('telegram', 'TELEGRAM_BOT_TOKEN');
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('saved-real-token'));
      expect(result.ok).toBe(true);
    });

    it('uses custom bot token when provided', async () => {
      const { checkTelegramConnection } = await import('../../services/connectorHealthCheckService');
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, result: { username: 'testbot' } })
      });
      await checkTelegramConnection({ botToken: 'custom-token' });
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('custom-token'));
    });

    it('measures latency on successful connection', async () => {
      const { checkTelegramConnection } = await import('../../services/connectorHealthCheckService');
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, result: { username: 'testbot' } })
      });
      const result = await checkTelegramConnection({ botToken: 'test' });
      expect(result.latency).toBeGreaterThanOrEqual(0);
    });

    it('returns connected as when API returns ok', async () => {
      const { checkTelegramConnection } = await import('../../services/connectorHealthCheckService');
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, result: { username: 'mybot', id: 123 } })
      });
      const result = await checkTelegramConnection({ botToken: 'test' });
      expect(result.ok).toBe(true);
      expect(result.message).toContain('mybot');
    });

    it('returns error on failed Telegram API response', async () => {
      const { checkTelegramConnection } = await import('../../services/connectorHealthCheckService');
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ description: 'Unauthorized' })
      });
      const result = await checkTelegramConnection({ botToken: 'bad-token' });
      expect(result.ok).toBe(false);
    });

    it('handles network errors gracefully', async () => {
      const { checkTelegramConnection } = await import('../../services/connectorHealthCheckService');
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
      const result = await checkTelegramConnection({ botToken: 'test' });
      expect(result.ok).toBe(false);
      expect(result.details.reason).toBe('network_error');
    });
  });

  describe('checkWhatsAppConnection', () => {
    it('exports checkWhatsAppConnection function', async () => {
      const { checkWhatsAppConnection } = await import('../../services/connectorHealthCheckService');
      expect(typeof checkWhatsAppConnection).toBe('function');
    });

    it('returns error when whatsapp not authenticated', async () => {
      const { checkWhatsAppConnection } = await import('../../services/connectorHealthCheckService');
      const result = await checkWhatsAppConnection();
      expect(result.ok).toBe(false);
    });
  });

  describe('checkConnectorHealth', () => {
    it('exports checkConnectorHealth function', async () => {
      const { checkConnectorHealth } = await import('../../services/connectorHealthCheckService');
      expect(typeof checkConnectorHealth).toBe('function');
    });

    it('routes to checkTelegramConnection for telegram', async () => {
      const { checkConnectorHealth } = await import('../../services/connectorHealthCheckService');
      const result = await checkConnectorHealth('telegram');
      expect(result).toHaveProperty('ok');
    });

    it('routes to checkWhatsAppConnection for whatsapp', async () => {
      const { checkConnectorHealth } = await import('../../services/connectorHealthCheckService');
      const result = await checkConnectorHealth('whatsapp');
      expect(result).toHaveProperty('ok');
    });

    it('returns not implemented for unknown connector', async () => {
      const { checkConnectorHealth } = await import('../../services/connectorHealthCheckService');
      const result = await checkConnectorHealth('unknown');
      expect(result.ok).toBe(false);
      expect(result.details.reason).toBe('not_implemented');
    });
  });
});
