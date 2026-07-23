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

const mockGetConnectorCredential = vi.fn(() => '');
vi.mock('../../services/connectors/connectorAuth', () => ({
  getConnectorCredential: (...args) => mockGetConnectorCredential(...args)
}));

vi.mock('../../services/policyEnforcementService', () => ({
  evaluatePolicyGate: vi.fn().mockReturnValue({ ok: true })
}));

vi.mock('../../services/connectorRegistryService', () => ({
  isConnectorAuthenticated: vi.fn(() => ({ ok: false }))
}));

const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args) => mockInvoke(...args)
}));

describe('connectorHealthCheckService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.length = 0;
    mockGetConnectorCredential.mockReturnValue('');
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
      mockGetConnectorCredential.mockReturnValue('saved-real-token');
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, result: { username: 'realbot' } })
      });
      const { checkTelegramConnection } = await import('../../services/connectorHealthCheckService');
      const result = await checkTelegramConnection();
      expect(mockGetConnectorCredential).toHaveBeenCalledWith('telegram', 'TELEGRAM_BOT_TOKEN');
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

  describe('checkMobileBridgeConnection', () => {
    it('exports checkMobileBridgeConnection function', async () => {
      const { checkMobileBridgeConnection } = await import('../../services/connectorHealthCheckService');
      expect(typeof checkMobileBridgeConnection).toBe('function');
    });

    it('reports ok when Companion server is running with a paired device', async () => {
      mockInvoke.mockResolvedValue({ running: true, port: 8765, connected_clients: 1 });
      const { checkMobileBridgeConnection } = await import('../../services/connectorHealthCheckService');
      const result = await checkMobileBridgeConnection();
      expect(mockInvoke).toHaveBeenCalledWith('companion_get_status');
      expect(result.ok).toBe(true);
      expect(result.message).toContain('1 device(s) paired');
      expect(result.details.port).toBe(8765);
    });

    it('reports not-ok when Companion server is running but nothing is paired', async () => {
      mockInvoke.mockResolvedValue({ running: true, port: 8765, connected_clients: 0 });
      const { checkMobileBridgeConnection } = await import('../../services/connectorHealthCheckService');
      const result = await checkMobileBridgeConnection();
      expect(result.ok).toBe(false);
      expect(result.message).toContain('no devices paired');
    });

    it('reports not-ok when Companion server is not running', async () => {
      mockInvoke.mockResolvedValue({ running: false });
      const { checkMobileBridgeConnection } = await import('../../services/connectorHealthCheckService');
      const result = await checkMobileBridgeConnection();
      expect(result.ok).toBe(false);
      expect(result.message).toContain('not running');
    });

    it('handles a failed Tauri invoke gracefully', async () => {
      mockInvoke.mockRejectedValue(new Error('no tauri runtime'));
      const { checkMobileBridgeConnection } = await import('../../services/connectorHealthCheckService');
      const result = await checkMobileBridgeConnection();
      expect(result.ok).toBe(false);
      expect(result.details.reason).toBe('tauri_invoke_error');
    });
  });

  describe('checkGitHubConnection', () => {
    it('returns missing_token when no GitHub token configured', async () => {
      const { checkGitHubConnection } = await import('../../services/connectorHealthCheckService');
      const result = await checkGitHubConnection();
      expect(result.ok).toBe(false);
      expect(result.details.reason).toBe('missing_token');
    });

    it('reports connected login on a successful /user call', async () => {
      mockGetConnectorCredential.mockReturnValue('ghp_test');
      global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ login: 'octocat' }) });
      const { checkGitHubConnection } = await import('../../services/connectorHealthCheckService');
      const result = await checkGitHubConnection();
      expect(fetch).toHaveBeenCalledWith('https://api.github.com/user', expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer ghp_test' })
      }));
      expect(result.ok).toBe(true);
      expect(result.message).toContain('octocat');
    });
  });

  describe('checkSlackConnection', () => {
    it('returns missing_token when no Slack token configured', async () => {
      const { checkSlackConnection } = await import('../../services/connectorHealthCheckService');
      const result = await checkSlackConnection();
      expect(result.ok).toBe(false);
      expect(result.details.reason).toBe('missing_token');
    });

    it('reports connected team/user on a successful auth.test call', async () => {
      mockGetConnectorCredential.mockReturnValue('xoxb-test');
      global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, team: 'Acme', user: 'alphonso' }) });
      const { checkSlackConnection } = await import('../../services/connectorHealthCheckService');
      const result = await checkSlackConnection();
      expect(result.ok).toBe(true);
      expect(result.message).toContain('Acme');
    });
  });

  describe('checkDiscordConnection', () => {
    it('returns missing_token when no Discord token configured', async () => {
      const { checkDiscordConnection } = await import('../../services/connectorHealthCheckService');
      const result = await checkDiscordConnection();
      expect(result.ok).toBe(false);
      expect(result.details.reason).toBe('missing_token');
    });

    it('reports connected username on a successful /users/@me call', async () => {
      mockGetConnectorCredential.mockReturnValue('bot-token');
      global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ username: 'AlphonsoBot' }) });
      const { checkDiscordConnection } = await import('../../services/connectorHealthCheckService');
      const result = await checkDiscordConnection();
      expect(result.ok).toBe(true);
      expect(result.message).toContain('AlphonsoBot');
    });
  });

  describe('checkGenericWebhookConnection', () => {
    it('returns missing_config when no drain URL configured', async () => {
      const { checkGenericWebhookConnection } = await import('../../services/connectorHealthCheckService');
      const result = await checkGenericWebhookConnection();
      expect(result.ok).toBe(false);
      expect(result.details.reason).toBe('missing_config');
    });

    it('reports ok without draining the queue when a drain URL is configured', async () => {
      mockGetConnectorCredential.mockReturnValue('https://gateway.example.com/queue/drain');
      const { checkGenericWebhookConnection } = await import('../../services/connectorHealthCheckService');
      const result = await checkGenericWebhookConnection();
      expect(result.ok).toBe(true);
      expect(result.details.drainUrlConfigured).toBe(true);
    });
  });

  describe('checkN8nConnection', () => {
    it('reports ok when the n8n instance is healthy', async () => {
      mockGetConnectorCredential.mockReturnValue('http://localhost:5678');
      global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      const { checkN8nConnection } = await import('../../services/connectorHealthCheckService');
      const result = await checkN8nConnection();
      expect(result.ok).toBe(true);
    });

    it('reports not-ok when the n8n instance is unreachable', async () => {
      mockGetConnectorCredential.mockReturnValue('http://localhost:5678');
      global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      const { checkN8nConnection } = await import('../../services/connectorHealthCheckService');
      const result = await checkN8nConnection();
      expect(result.ok).toBe(false);
    });
  });

  describe('API-key-presence connectors (brave_search, perplexity, tavily, deepseek)', () => {
    it.each(['brave_search', 'perplexity', 'tavily', 'deepseek'])('%s: reports not-ok with no key configured', async (connectorId) => {
      const { checkConnectorHealth } = await import('../../services/connectorHealthCheckService');
      const result = await checkConnectorHealth(connectorId);
      expect(result.ok).toBe(false);
      expect(result.details.reason).toBe('missing_key');
    });

    it.each(['brave_search', 'perplexity', 'tavily', 'deepseek'])('%s: reports ok when a key is configured', async (connectorId) => {
      mockGetConnectorCredential.mockReturnValue('a-real-key');
      const { checkConnectorHealth } = await import('../../services/connectorHealthCheckService');
      const result = await checkConnectorHealth(connectorId);
      expect(result.ok).toBe(true);
      expect(result.details.reason).toBe('key_present');
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

    it('routes to checkMobileBridgeConnection for mobile_bridge', async () => {
      mockInvoke.mockResolvedValue({ running: true, port: 8765, connected_clients: 2 });
      const { checkConnectorHealth } = await import('../../services/connectorHealthCheckService');
      const result = await checkConnectorHealth('mobile_bridge');
      expect(mockInvoke).toHaveBeenCalledWith('companion_get_status');
      expect(result.ok).toBe(true);
    });

    it('returns not implemented for a truly unregistered connector id', async () => {
      const { checkConnectorHealth } = await import('../../services/connectorHealthCheckService');
      const result = await checkConnectorHealth('unknown');
      expect(result.ok).toBe(false);
      expect(result.details.reason).toBe('not_implemented');
    });

    it.each(['github', 'slack', 'discord', 'generic_webhook', 'n8n', 'brave_search', 'perplexity', 'tavily', 'deepseek'])(
      'routes %s to a real check, not the not_implemented fallback',
      async (connectorId) => {
        global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
        const { checkConnectorHealth } = await import('../../services/connectorHealthCheckService');
        const result = await checkConnectorHealth(connectorId);
        expect(result.details.reason).not.toBe('not_implemented');
      }
    );
  });
});
