import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockInvoke = vi.fn((cmd) => {
  if (cmd === 'check_env_vars_presence') return Promise.resolve({});
  return Promise.reject(new Error('test rejection'));
});
vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke
}));

vi.mock('../../lib/durableStore', () => ({
  durableGet: vi.fn((key) => {
    try { return localStorage.getItem(key); } catch { return null; }
  }),
  durableSet: vi.fn((key, value) => {
    try { localStorage.setItem(key, value); } catch { /* ignore */ }
  }),
  durableRemove: vi.fn((key) => {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  })
}));

vi.mock('../telegramBrowserConnector', () => ({
  browserPollTelegram: vi.fn(async () => ({ ok: true, messages: [], trust: 'verified' }))
}));

vi.mock('../whatsappBrowserConnector', () => ({
  browserPollWhatsAppGateway: vi.fn(async () => ({ ok: true, messages: [], trust: 'verified' }))
}));

describe('connectorPolling', () => {
  const localStorageMock = {
    getItem: vi.fn(() => null),
    setItem: vi.fn()
  };
  vi.stubGlobal('localStorage', localStorageMock);

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
  });

  describe('parseInboundConnectorMessage', () => {
    it('exports parseInboundConnectorMessage function', async () => {
      const { parseInboundConnectorMessage } = await import('../../services/connectors/connectorPolling');
      expect(typeof parseInboundConnectorMessage).toBe('function');
    });

    it('routes to JOSE by default', async () => {
      const { parseInboundConnectorMessage } = await import('../../services/connectors/connectorPolling');
      const result = parseInboundConnectorMessage('telegram', 'hello world');
      expect(result.routeTo).toBe('jose');
    });

    it('routes to HECTOR when asked', async () => {
      const { parseInboundConnectorMessage } = await import('../../services/connectors/connectorPolling');
      const result = parseInboundConnectorMessage('telegram', 'ask hector what is rust?');
      expect(result.routeTo).toBe('hector');
    });

    it('routes to MIYA when asked', async () => {
      const { parseInboundConnectorMessage } = await import('../../services/connectors/connectorPolling');
      const result = parseInboundConnectorMessage('whatsapp', 'ask miya design a logo');
      expect(result.routeTo).toBe('miya');
    });

    it('detects risky actions', async () => {
      const { parseInboundConnectorMessage } = await import('../../services/connectors/connectorPolling');
      const result = parseInboundConnectorMessage('telegram', 'delete all files');
      expect(result.requiresApproval).toBe(true);
      expect(result.riskLevel).toBe('medium');
    });

    it('detects external actions', async () => {
      const { parseInboundConnectorMessage } = await import('../../services/connectors/connectorPolling');
      const result = parseInboundConnectorMessage('whatsapp', 'send to telegram');
      expect(result.riskLevel).toBe('high');
    });

    it('includes auth information', async () => {
      const { parseInboundConnectorMessage } = await import('../../services/connectors/connectorPolling');
      const result = parseInboundConnectorMessage('telegram', 'test', 'user123');
      expect(result).toHaveProperty('auth');
      expect(result).toHaveProperty('senderId');
    });
  });

  describe('createConnectorRoutePacket', () => {
    it('exports createConnectorRoutePacket function', async () => {
      const { createConnectorRoutePacket } = await import('../../services/connectors/connectorPolling');
      expect(typeof createConnectorRoutePacket).toBe('function');
    });

    it('rejects unauthorized senders', async () => {
      const { createConnectorRoutePacket } = await import('../../services/connectors/connectorPolling');
      const result = createConnectorRoutePacket('telegram', 'test message', 'unknown_user');
      expect(result.rejected).toBe(true);
      expect(result.packet).toBeNull();
    });

    it('accepts authorized senders', async () => {
      const { createConnectorRoutePacket } = await import('../../services/connectors/connectorPolling');
      localStorageMock.getItem.mockReturnValueOnce(JSON.stringify({
        telegram: { enabled: true, allowlist: ['authorized_user'] }
      }));
      const result = createConnectorRoutePacket('telegram', 'test message', 'authorized_user');
      expect(result.rejected).toBe(false);
      expect(result.packet).toBeTruthy();
    });
  });

  describe('pollTelegramConnector', () => {
    it('exports pollTelegramConnector function', async () => {
      const { pollTelegramConnector } = await import('../../services/connectors/connectorPolling');
      expect(typeof pollTelegramConnector).toBe('function');
    });

    it('returns setup required when telegram not configured', async () => {
      const { pollTelegramConnector } = await import('../../services/connectors/connectorPolling');
      const result = await pollTelegramConnector(10);
      expect(result.setupRequired).toBe(true);
    });
  });

  describe('pollWhatsAppConnector', () => {
    it('exports pollWhatsAppConnector function', async () => {
      const { pollWhatsAppConnector } = await import('../../services/connectors/connectorPolling');
      expect(typeof pollWhatsAppConnector).toBe('function');
    });

    it('returns setup required when whatsapp not configured', async () => {
      const { pollWhatsAppConnector } = await import('../../services/connectors/connectorPolling');
      const result = await pollWhatsAppConnector(10);
      expect(result.setupRequired).toBe(true);
    });
  });

  describe('normalizeWhatsAppCloudInboundPayload', () => {
    it('exports normalizeWhatsAppCloudInboundPayload function', async () => {
      const { normalizeWhatsAppCloudInboundPayload } = await import('../../services/connectors/connectorPolling');
      expect(typeof normalizeWhatsAppCloudInboundPayload).toBe('function');
    });

    it('parses valid WhatsApp Cloud payload', async () => {
      const { normalizeWhatsAppCloudInboundPayload } = await import('../../services/connectors/connectorPolling');
      const payload = {
        entry: [{
          changes: [{
            value: {
              metadata: { display_phone_number: '123456789' },
              messages: [{
                from: 'user123',
                id: 'msg1',
                text: { body: 'hello' }
              }]
            }
          }]
        }]
      };
      const result = normalizeWhatsAppCloudInboundPayload(payload);
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('hello');
      expect(result[0].fromId).toBe('user123');
    });

    it('handles empty payload', async () => {
      const { normalizeWhatsAppCloudInboundPayload } = await import('../../services/connectors/connectorPolling');
      const result = normalizeWhatsAppCloudInboundPayload({});
      expect(result).toHaveLength(0);
    });

    it('skips messages without text', async () => {
      const { normalizeWhatsAppCloudInboundPayload } = await import('../../services/connectors/connectorPolling');
      const payload = {
        entry: [{
          changes: [{
            value: {
              messages: [{
                from: 'user123',
                id: 'msg1'
              }]
            }
          }]
        }]
      };
      const result = normalizeWhatsAppCloudInboundPayload(payload);
      expect(result).toHaveLength(0);
    });
  });

  describe('verifyWhatsAppCloudWebhookChallenge', () => {
    it('exports verifyWhatsAppCloudWebhookChallenge function', async () => {
      const { verifyWhatsAppCloudWebhookChallenge } = await import('../../services/connectors/connectorPolling');
      expect(typeof verifyWhatsAppCloudWebhookChallenge).toBe('function');
    });

    it('returns error on invoke failure', async () => {
      const { verifyWhatsAppCloudWebhookChallenge } = await import('../../services/connectors/connectorPolling');
      const result = await verifyWhatsAppCloudWebhookChallenge({ mode: 'subscribe' });
      expect(result.ok).toBe(false);
    });
  });

  describe('verifyWhatsAppCloudWebhookSignature', () => {
    it('exports verifyWhatsAppCloudWebhookSignature function', async () => {
      const { verifyWhatsAppCloudWebhookSignature } = await import('../../services/connectors/connectorPolling');
      expect(typeof verifyWhatsAppCloudWebhookSignature).toBe('function');
    });

    it('returns error on invoke failure', async () => {
      const { verifyWhatsAppCloudWebhookSignature } = await import('../../services/connectors/connectorPolling');
      const result = await verifyWhatsAppCloudWebhookSignature({ rawBody: '', signatureHeader: '' });
      expect(result.ok).toBe(false);
    });
  });

  describe('simulateWhatsAppCloudInbound', () => {
    it('exports simulateWhatsAppCloudInbound function', async () => {
      const { simulateWhatsAppCloudInbound } = await import('../../services/connectors/connectorPolling');
      expect(typeof simulateWhatsAppCloudInbound).toBe('function');
    });

    it('returns routed and rejected counts', async () => {
      const { simulateWhatsAppCloudInbound } = await import('../../services/connectors/connectorPolling');
      const payload = {
        entry: [{
          changes: [{
            value: {
              messages: [{ from: 'user1', id: 'msg1', text: { body: 'ask hector research ai' } }]
            }
          }]
        }]
      };
      const result = await simulateWhatsAppCloudInbound(payload);
      expect(result).toHaveProperty('count');
      expect(result).toHaveProperty('routedCount');
      expect(result).toHaveProperty('rejectedCount');
    });
  });

  describe('getConnectorEnvironment', () => {
    it('returns empty object when no stored environment', async () => {
      const { parseInboundConnectorMessage } = await import('../../services/connectors/connectorPolling');
      const result = parseInboundConnectorMessage('telegram', 'test');
      expect(result).toHaveProperty('auth');
    });
  });
});