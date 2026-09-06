import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue({})
}));

vi.mock('../services/agentBusService', () => ({
  AGENTS: {}
}));

vi.mock('../services/trustModel', () => ({
  TRUST_STATES: { FAILED: 'failed', PENDING: 'pending', UNVERIFIED: 'unverified' },
  timestampMs: vi.fn(() => 1700000000000)
}));

vi.mock('../services/chatgptService', () => ({
  sendChatGPTMessage: vi.fn().mockResolvedValue({ ok: true, text: 'response' })
}));

vi.mock('../services/claudeService', () => ({
  sendClaudeMessage: vi.fn().mockResolvedValue({ ok: true, text: 'response' })
}));

vi.mock('../services/connectorAuditLogService', () => ({
  appendConnectorAuditEntry: vi.fn()
}));

vi.mock('../services/telegramBrowserConnector', () => ({
  browserSendTelegram: vi.fn().mockResolvedValue({ ok: true, externalId: '123' })
}));

vi.mock('../services/whatsappBrowserConnector', () => ({
  browserSendWhatsApp: vi.fn().mockResolvedValue({ ok: true })
}));

vi.mock('../services/connectors/connectorAuth', () => ({
  getConnectorCredential: vi.fn().mockReturnValue('test-token'),
  isConnectorAuthenticated: vi.fn().mockReturnValue({ ok: true }),
  logUnauthenticatedConnectorRequest: vi.fn().mockResolvedValue({ ok: false, blocked: true })
}));

vi.mock('../services/connectors/connectorRegistry', () => ({
  gateConnectorAction: vi.fn().mockReturnValue({ ok: true }),
  requireConnectorReady: vi.fn().mockResolvedValue({ ok: true }),
  requireConnectorApproval: vi.fn().mockResolvedValue({ ok: true }),
  verifyConnectorEnvironment: vi.fn().mockResolvedValue({ ok: true }),
  appendConnectorAudit: vi.fn(),
  getConnectorCircuitState: vi.fn().mockReturnValue({ ok: true }),
  recordConnectorFailure: vi.fn(),
  recordConnectorSuccess: vi.fn()
}));

describe('connectorOutbound', () => {
  let outbound;

  beforeEach(async () => {
    vi.clearAllMocks();
    outbound = await import('../services/connectors/connectorOutbound');
  });

  describe('sendTelegramConnectorMessage', () => {
    it('sends a message successfully', async () => {
      const result = await outbound.sendTelegramConnectorMessage('12345', 'hello');
      expect(result.ok).toBe(true);
      expect(result.externalId).toBe('123');
    });

    it('blocks unauthenticated requests', async () => {
      const { isConnectorAuthenticated } = await import('../services/connectors/connectorAuth');
      isConnectorAuthenticated.mockReturnValueOnce({ ok: false });
      const result = await outbound.sendTelegramConnectorMessage('12345', 'hello');
      expect(result.ok).toBe(false);
      expect(result.blocked).toBe(true);
    });

    it('blocks when circuit breaker is open', async () => {
      const { getConnectorCircuitState } = await import('../services/connectors/connectorRegistry');
      getConnectorCircuitState.mockReturnValueOnce({ ok: false, failures: 5, remainingMs: 30000 });
      const result = await outbound.sendTelegramConnectorMessage('12345', 'hello');
      expect(result.ok).toBe(false);
      expect(result.blocked).toBe(true);
    });

    it('blocks on policy gate', async () => {
      const { gateConnectorAction } = await import('../services/connectors/connectorRegistry');
      gateConnectorAction.mockReturnValueOnce({ ok: false, reason: 'policy denied' });
      const result = await outbound.sendTelegramConnectorMessage('12345', 'hello');
      expect(result.ok).toBe(false);
      expect(result.blocked).toBe(true);
    });

    it('rejects empty chat id', async () => {
      const result = await outbound.sendTelegramConnectorMessage('', 'hello');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('chat id');
    });

    it('rejects empty text', async () => {
      const result = await outbound.sendTelegramConnectorMessage('12345', '');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('text');
    });

    it('handles send failure', async () => {
      const { browserSendTelegram } = await import('../services/telegramBrowserConnector');
      browserSendTelegram.mockRejectedValueOnce(new Error('network error'));
      const result = await outbound.sendTelegramConnectorMessage('12345', 'hello');
      expect(result.ok).toBe(false);
    });
  });

  describe('proveTelegramConnectorPath', () => {
    it('proves telegram path', async () => {
      const result = await outbound.proveTelegramConnectorPath('12345', 'proof');
      expect(result.connectorId).toBe('telegram');
      expect(result.proofType).toBe('telegram_live_send');
    });

    it('rejects empty target', async () => {
      const result = await outbound.proveTelegramConnectorPath('', 'proof');
      expect(result.ok).toBe(false);
      expect(result.setupRequired).toBe(true);
    });
  });

  describe('sendWhatsAppConnectorMessage', () => {
    it('sends via browser fallback', async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      invoke.mockResolvedValueOnce({ WHATSAPP_ACCESS_TOKEN: true });
      const result = await outbound.sendWhatsAppConnectorMessage('+1234567890', 'hello');
      expect(result).toBeDefined();
    });

    it('blocks unauthenticated requests', async () => {
      const { isConnectorAuthenticated } = await import('../services/connectors/connectorAuth');
      isConnectorAuthenticated.mockReturnValueOnce({ ok: false });
      const result = await outbound.sendWhatsAppConnectorMessage('+1234567890', 'hello');
      expect(result.ok).toBe(false);
      expect(result.blocked).toBe(true);
    });
  });

  describe('sendChatGptConnectorMessage', () => {
    it('sends message', async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      invoke.mockResolvedValueOnce({ OPENAI_API_KEY: true });
      const result = await outbound.sendChatGptConnectorMessage('hello');
      expect(result.ok).toBe(true);
    });

    it('blocks unauthenticated', async () => {
      const { isConnectorAuthenticated } = await import('../services/connectors/connectorAuth');
      isConnectorAuthenticated.mockReturnValueOnce({ ok: false });
      const result = await outbound.sendChatGptConnectorMessage('hello');
      expect(result.ok).toBe(false);
    });

    it('blocks on missing env key', async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      invoke.mockResolvedValueOnce({ OPENAI_API_KEY: false });
      const result = await outbound.sendChatGptConnectorMessage('hello');
      expect(result.ok).toBe(false);
      expect(result.code).toBe('MISSING_KEY');
    });
  });

  describe('sendClaudeConnectorMessage', () => {
    it('sends message', async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      invoke.mockResolvedValueOnce({ ANTHROPIC_API_KEY: true });
      const result = await outbound.sendClaudeConnectorMessage('hello');
      expect(result.ok).toBe(true);
    });

    it('blocks unauthenticated', async () => {
      const { isConnectorAuthenticated } = await import('../services/connectors/connectorAuth');
      isConnectorAuthenticated.mockReturnValueOnce({ ok: false });
      const result = await outbound.sendClaudeConnectorMessage('hello');
      expect(result.ok).toBe(false);
    });
  });

  describe('sendQwenConnectorMessage', () => {
    it('sends via invoke', async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      invoke.mockResolvedValueOnce({ DASHSCOPE_API_KEY: true });
      invoke.mockResolvedValueOnce({ ok: true });
      const result = await outbound.sendQwenConnectorMessage('hello');
      expect(result).toBeDefined();
    });
  });

  describe('sendNotionConnectorEntry', () => {
    it('sends entry', async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      invoke.mockResolvedValueOnce({ NOTION_API_KEY: true });
      invoke.mockResolvedValueOnce({ ok: true, externalId: 'page-1' });
      const result = await outbound.sendNotionConnectorEntry({ title: 'Test', content: 'body' });
      expect(result.ok).toBe(true);
    });
  });

  describe('sendClickUpConnectorTask', () => {
    it('sends task', async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      invoke.mockResolvedValueOnce({ CLICKUP_API_KEY: true });
      invoke.mockResolvedValueOnce({ ok: true });
      const result = await outbound.sendClickUpConnectorTask({ title: 'Task', content: 'desc' });
      expect(result.ok).toBe(true);
    });
  });

  describe('uploadYouTubeConnectorVideo', () => {
    it('uploads video', async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      invoke.mockResolvedValueOnce({ YOUTUBE_CLIENT_ID: true, YOUTUBE_CLIENT_SECRET: true });
      invoke.mockResolvedValueOnce({ ok: true, videoId: 'vid-1' });
      const result = await outbound.uploadYouTubeConnectorVideo({
        filePath: '/path/video.mp4', title: 'Test Video'
      });
      expect(result.ok).toBe(true);
      expect(result.videoId).toBe('vid-1');
    });
  });

  describe('sendGitHubAction', () => {
    it('performs action', async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      invoke.mockResolvedValueOnce({ GITHUB_TOKEN: true });
      invoke.mockResolvedValueOnce({ ok: true, data: { number: 1 } });
      const result = await outbound.sendGitHubAction('create_issue', { title: 'Bug' });
      expect(result.ok).toBe(true);
    });
  });

  describe('sendSlackMessage', () => {
    it('sends message', async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      invoke.mockResolvedValueOnce({ SLACK_BOT_TOKEN: true });
      invoke.mockResolvedValueOnce({ ok: true, ts: '123.456' });
      const result = await outbound.sendSlackMessage('#general', 'hello');
      expect(result.ok).toBe(true);
      expect(result.ts).toBe('123.456');
    });

    it('blocks on missing token', async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      invoke.mockResolvedValueOnce({ SLACK_BOT_TOKEN: false });
      const result = await outbound.sendSlackMessage('#general', 'hello');
      expect(result.ok).toBe(false);
      expect(result.code).toBe('MISSING_KEY');
    });
  });
});
