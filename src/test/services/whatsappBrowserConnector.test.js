import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockGetConnectorCredential = vi.fn((connector, key) => {
  if (connector === 'whatsapp' && key === 'WHATSAPP_ACCESS_TOKEN') return 'mock-token';
  if (connector === 'whatsapp' && key === 'WHATSAPP_PHONE_NUMBER_ID') return '1234567890';
  if (connector === 'whatsapp' && key === 'WHATSAPP_CLOUD_GATEWAY_DRAIN_URL') return 'http://localhost:8000/drain';
  if (connector === 'whatsapp' && key === 'WHATSAPP_VERIFY_TOKEN') return 'mock-token';
  return '';
});

vi.mock('../../services/connectors/connectorAuth.js', () => ({
  getConnectorCredential: mockGetConnectorCredential
}));

global.fetch = vi.fn();

describe('whatsappBrowserConnector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConnectorCredential.mockImplementation((connector, key) => {
      if (connector === 'whatsapp' && key === 'WHATSAPP_ACCESS_TOKEN') return 'mock-token';
      if (connector === 'whatsapp' && key === 'WHATSAPP_PHONE_NUMBER_ID') return '1234567890';
      if (connector === 'whatsapp' && key === 'WHATSAPP_CLOUD_GATEWAY_DRAIN_URL') return 'http://localhost:8000/drain';
      if (connector === 'whatsapp' && key === 'WHATSAPP_VERIFY_TOKEN') return 'mock-token';
      return '';
    });
  });

  describe('browserSendWhatsApp', () => {
    it('exports browserSendWhatsApp function', async () => {
      const { browserSendWhatsApp } = await import('../../services/whatsappBrowserConnector');
      expect(typeof browserSendWhatsApp).toBe('function');
    });

    it('throws error when WHATSAPP_ACCESS_TOKEN missing', async () => {
      const mod = await import('../../services/whatsappBrowserConnector');
      mockGetConnectorCredential.mockReturnValueOnce('');
      await expect(mod.browserSendWhatsApp({ to: '123', text: 'hello' })).rejects.toThrow('WHATSAPP_ACCESS_TOKEN');
    });

    it('throws error when WHATSAPP_PHONE_NUMBER_ID missing', async () => {
      const mod = await import('../../services/whatsappBrowserConnector');
      mockGetConnectorCredential.mockReturnValueOnce('token').mockReturnValueOnce('');
      await expect(mod.browserSendWhatsApp({ to: '123', text: 'hello' })).rejects.toThrow('WHATSAPP_PHONE_NUMBER_ID');
    });

    it('normalizes phone number by removing + prefix', async () => {
      const { browserSendWhatsApp } = await import('../../services/whatsappBrowserConnector');
      fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ messages: [{ id: 'msg123' }] })
      });
      await browserSendWhatsApp({ to: '+1234567890', text: 'test' });
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('1234567890'),
        expect.objectContaining({
          method: 'POST'
        })
      );
    });

    it('includes replyToId in context when provided', async () => {
      const { browserSendWhatsApp } = await import('../../services/whatsappBrowserConnector');
      fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ messages: [{ id: 'msg123' }] })
      });
      await browserSendWhatsApp({ to: '123', text: 'test', replyToId: 'reply123' });
      const call = fetch.mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.context).toEqual({ message_id: 'reply123' });
    });

    it('returns ok true on successful send', async () => {
      const { browserSendWhatsApp } = await import('../../services/whatsappBrowserConnector');
      fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ messages: [{ id: 'msg123' }] })
      });
      const result = await browserSendWhatsApp({ to: '123', text: 'hello' });
      expect(result.ok).toBe(true);
      expect(result.externalId).toBe('msg123');
    });

    it('returns error object on failed send', async () => {
      const { browserSendWhatsApp } = await import('../../services/whatsappBrowserConnector');
      fetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: { message: 'Internal error' } })
      });
      const result = await browserSendWhatsApp({ to: '123', text: 'hello' });
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Internal error');
    });

    it('handles non-retryable HTTP status codes', async () => {
      const { browserSendWhatsApp } = await import('../../services/whatsappBrowserConnector');
      fetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'Unauthorized' } })
      });
      const result = await browserSendWhatsApp({ to: '123', text: 'hello' });
      expect(result.ok).toBe(false);
      expect(result.httpStatus).toBe(401);
    });
  });

  describe('browserPollWhatsAppGateway', () => {
    it('exports browserPollWhatsAppGateway function', async () => {
      const { browserPollWhatsAppGateway } = await import('../../services/whatsappBrowserConnector');
      expect(typeof browserPollWhatsAppGateway).toBe('function');
    });

    it('throws error when WHATSAPP_CLOUD_GATEWAY_DRAIN_URL missing', async () => {
      const mod = await import('../../services/whatsappBrowserConnector');
      mockGetConnectorCredential.mockReturnValue('');
      await expect(mod.browserPollWhatsAppGateway({})).rejects.toThrow('WHATSAPP_CLOUD_GATEWAY_DRAIN_URL');
    });

    it('includes limit in URL params', async () => {
      const { browserPollWhatsAppGateway } = await import('../../services/whatsappBrowserConnector');
      fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ messages: [] })
      });
      await browserPollWhatsAppGateway({ limit: 25 });
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('limit=25'), expect.any(Object));
    });

    it('includes authorization header when token present', async () => {
      const { browserPollWhatsAppGateway } = await import('../../services/whatsappBrowserConnector');
      fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ messages: [] })
      });
      await browserPollWhatsAppGateway({});
      const call = fetch.mock.calls[0];
      expect(call[1].headers).toHaveProperty('Authorization');
    });

    it('maps messages to standard format', async () => {
      const { browserPollWhatsAppGateway } = await import('../../services/whatsappBrowserConnector');
      fetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          messages: [{ from: 'user123', text: 'hello', id: 'msg1' }]
        })
      });
      const result = await browserPollWhatsAppGateway({});
      expect(result.ok).toBe(true);
      expect(result.messages[0].fromId).toBe('user123');
      expect(result.messages[0].text).toBe('hello');
    });

    it('handles array response format', async () => {
      const { browserPollWhatsAppGateway } = await import('../../services/whatsappBrowserConnector');
      fetch.mockResolvedValue({
        ok: true,
        json: async () => ([{ chatId: 'abc', text: 'test', id: 'x1' }])
      });
      const result = await browserPollWhatsAppGateway({});
      expect(result.messages).toHaveLength(1);
    });

    it('returns trust verified on success', async () => {
      const { browserPollWhatsAppGateway } = await import('../../services/whatsappBrowserConnector');
      fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ messages: [] })
      });
      const result = await browserPollWhatsAppGateway({});
      expect(result.trust).toBe('verified');
    });
  });
});