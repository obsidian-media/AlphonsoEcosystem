import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn()
}));

vi.mock('../../services/connectorRegistryService', () => ({
  isConnectorAuthenticated: vi.fn(() => ({ ok: true })),
  appendConnectorAudit: vi.fn()
}));

vi.mock('../../services/connectors/connectorAuth', () => ({
  getConnectorCredential: vi.fn(() => 'mock-anthropic-key')
}));

vi.mock('../../services/trustModel', () => ({
  TRUST_STATES: { VERIFIED: 'verified', FAILED: 'failed', TEMPORARY: 'temporary' },
  timestampMs: () => Date.now()
}));

global.fetch = vi.fn();

describe('claudeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('sendClaudeMessage', () => {
    it('exports sendClaudeMessage function', async () => {
      const { sendClaudeMessage } = await import('../../services/claudeService');
      expect(typeof sendClaudeMessage).toBe('function');
    });

    it('returns error when not authenticated', async () => {
      const { sendClaudeMessage } = await import('../../services/claudeService');
      const { isConnectorAuthenticated } = await import('../../services/connectorRegistryService');
      isConnectorAuthenticated.mockReturnValueOnce({ ok: false });
      const result = await sendClaudeMessage('hello');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('not authenticated');
    });

    it('returns error when API key missing', async () => {
      const { sendClaudeMessage } = await import('../../services/claudeService');
      const { getConnectorCredential } = await import('../../services/connectors/connectorAuth');
      getConnectorCredential.mockReturnValueOnce('');
      const result = await sendClaudeMessage('hello');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('No API key');
    });

    it('uses default model claude-3-haiku-20240307', async () => {
      const { sendClaudeMessage } = await import('../../services/claudeService');
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: [{ text: 'response' }],
          usage: { input_tokens: 10, output_tokens: 20 }
        })
      });
      await sendClaudeMessage('hello');
      const call = fetch.mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.model).toBe('claude-3-haiku-20240307');
    });

    it('uses custom model when specified', async () => {
      const { sendClaudeMessage } = await import('../../services/claudeService');
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: [{ text: 'response' }],
          usage: { input_tokens: 10, output_tokens: 20 }
        })
      });
      await sendClaudeMessage('hello', { model: 'claude-3-opus-20240229' });
      const call = fetch.mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.model).toBe('claude-3-opus-20240229');
    });

    it('includes system prompt in request body', async () => {
      const { sendClaudeMessage } = await import('../../services/claudeService');
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: [{ text: 'response' }],
          usage: { input_tokens: 10, output_tokens: 20 }
        })
      });
      await sendClaudeMessage('hello', { system: 'You are a helpful assistant.' });
      const call = fetch.mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.system).toBe('You are a helpful assistant.');
    });

    it('extracts content from response', async () => {
      const { sendClaudeMessage } = await import('../../services/claudeService');
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: [{ text: 'response text' }],
          usage: { input_tokens: 10, output_tokens: 20 }
        })
      });
      const result = await sendClaudeMessage('hello');
      expect(result.text).toBe('response text');
    });

    it('extracts HTTP error message on failure', async () => {
      const { sendClaudeMessage } = await import('../../services/claudeService');
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'Invalid API key' } })
      });
      const result = await sendClaudeMessage('hello');
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Invalid API key');
    });
  });

  describe('streamClaudeMessage', () => {
    it('exports streamClaudeMessage function', async () => {
      const { streamClaudeMessage } = await import('../../services/claudeService');
      expect(typeof streamClaudeMessage).toBe('function');
    });

    it('calls sendClaudeMessage with stream true', async () => {
      const { streamClaudeMessage } = await import('../../services/claudeService');
      const mockReader = {
        read: vi.fn().mockResolvedValueOnce({ done: true })
      };
      fetch.mockResolvedValueOnce({
        ok: true,
        body: { getReader: () => mockReader }
      });
      await streamClaudeMessage('hello');
      const call = fetch.mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.stream).toBe(true);
    });
  });

  describe('buildHeaders', () => {
    it('includes anthropic-version header', async () => {
      const { sendClaudeMessage } = await import('../../services/claudeService');
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: [{ text: 'response' }],
          usage: { input_tokens: 10, output_tokens: 20 }
        })
      });
      await sendClaudeMessage('hello');
      const call = fetch.mock.calls[0];
      expect(call[1].headers).toHaveProperty('anthropic-version', '2023-06-01');
    });

    it('includes x-api-key header', async () => {
      const { sendClaudeMessage } = await import('../../services/claudeService');
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: [{ text: 'response' }],
          usage: { input_tokens: 10, output_tokens: 20 }
        })
      });
      await sendClaudeMessage('hello');
      const call = fetch.mock.calls[0];
      expect(call[1].headers).toHaveProperty('x-api-key');
    });

    it('includes anthropic-dangerous-direct-browser-access header', async () => {
      const { sendClaudeMessage } = await import('../../services/claudeService');
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: [{ text: 'response' }],
          usage: { input_tokens: 10, output_tokens: 20 }
        })
      });
      await sendClaudeMessage('hello');
      const call = fetch.mock.calls[0];
      expect(call[1].headers).toHaveProperty('anthropic-dangerous-direct-browser-access', 'true');
    });
  });

  describe('readSSEStream', () => {
    it('handles content_block_delta events', async () => {
      const { sendClaudeMessage } = await import('../../services/claudeService');
      const mockReader = {
        read: vi.fn()
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode('data: {"type":"content_block_delta","delta":{"text":"hello"}}\n\n')
          })
          .mockResolvedValueOnce({ done: true })
      };
      fetch.mockResolvedValueOnce({
        ok: true,
        body: { getReader: () => mockReader }
      });
      const onChunk = vi.fn();
      const result = await sendClaudeMessage('hello', { stream: true, onChunk });
      expect(result.ok).toBe(true);
    });

    it('handles [DONE] marker', async () => {
      const { sendClaudeMessage } = await import('../../services/claudeService');
      const mockReader = {
        read: vi.fn()
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode('data: [DONE]')
          })
          .mockResolvedValueOnce({ done: true })
      };
      fetch.mockResolvedValueOnce({
        ok: true,
        body: { getReader: () => mockReader }
      });
      const result = await sendClaudeMessage('hello', { stream: true });
      expect(result.ok).toBe(true);
    });
  });

  describe('error handling', () => {
    it('returns structured error on network failure', async () => {
      const { sendClaudeMessage } = await import('../../services/claudeService');
      fetch.mockRejectedValueOnce(new Error('Network error'));
      const result = await sendClaudeMessage('hello');
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Network error');
    });

    it('calculates latency for one-shot request', async () => {
      const { sendClaudeMessage } = await import('../../services/claudeService');
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: [{ text: 'response' }],
          usage: { input_tokens: 10, output_tokens: 20 }
        })
      });
      const result = await sendClaudeMessage('hello');
      expect(result).toHaveProperty('latencyMs');
    });

    it('calculates latency for streaming request', async () => {
      const { sendClaudeMessage } = await import('../../services/claudeService');
      const mockReader = {
        read: vi.fn().mockResolvedValueOnce({ done: true })
      };
      fetch.mockResolvedValueOnce({
        ok: true,
        body: { getReader: () => mockReader }
      });
      const result = await sendClaudeMessage('hello', { stream: true });
      expect(result).toHaveProperty('latencyMs');
    });
  });

  describe('audit logging', () => {
    it('logs send_success on successful one-shot', async () => {
      const { sendClaudeMessage } = await import('../../services/claudeService');
      const { appendConnectorAudit } = await import('../../services/connectorRegistryService');
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: [{ text: 'response' }],
          usage: { input_tokens: 10, output_tokens: 20 }
        })
      });
      await sendClaudeMessage('hello');
      expect(appendConnectorAudit).toHaveBeenCalled();
    });

    it('logs stream_success on successful stream', async () => {
      const { sendClaudeMessage } = await import('../../services/claudeService');
      const { appendConnectorAudit } = await import('../../services/connectorRegistryService');
      const mockReader = {
        read: vi.fn().mockResolvedValueOnce({ done: true })
      };
      fetch.mockResolvedValueOnce({
        ok: true,
        body: { getReader: () => mockReader }
      });
      await sendClaudeMessage('hello', { stream: true });
      expect(appendConnectorAudit).toHaveBeenCalled();
    });
  });
});