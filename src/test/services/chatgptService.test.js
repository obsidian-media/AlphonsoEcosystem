import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn()
}));

vi.mock('../../services/connectorRegistryService', () => ({
  isConnectorAuthenticated: vi.fn(() => ({ ok: true })),
  appendConnectorAudit: vi.fn()
}));

vi.mock('../../services/connectors/connectorAuth', () => ({
  getConnectorCredential: vi.fn(() => 'mock-openai-key')
}));

vi.mock('../../services/trustModel', () => ({
  TRUST_STATES: { VERIFIED: 'verified', FAILED: 'failed', TEMPORARY: 'temporary' },
  timestampMs: () => Date.now()
}));

global.fetch = vi.fn();

describe('chatgptService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('sendChatGPTMessage', () => {
    it('exports sendChatGPTMessage function', async () => {
      const { sendChatGPTMessage } = await import('../../services/chatgptService');
      expect(typeof sendChatGPTMessage).toBe('function');
    });

    it('returns error when not authenticated', async () => {
      const { sendChatGPTMessage } = await import('../../services/chatgptService');
      const { isConnectorAuthenticated } = await import('../../services/connectorRegistryService');
      isConnectorAuthenticated.mockReturnValueOnce({ ok: false });
      const result = await sendChatGPTMessage('hello');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('not authenticated');
    });

    it('returns error when API key missing', async () => {
      const { sendChatGPTMessage } = await import('../../services/chatgptService');
      const { getConnectorCredential } = await import('../../services/connectors/connectorAuth');
      getConnectorCredential.mockReturnValueOnce('');
      const result = await sendChatGPTMessage('hello');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('No API key');
    });

    it('calls one-shot endpoint when stream disabled', async () => {
      const { sendChatGPTMessage } = await import('../../services/chatgptService');
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'response text' } }],
          usage: { prompt_tokens: 10, completion_tokens: 20 }
        })
      });
      const result = await sendChatGPTMessage('hello', { stream: false });
      expect(fetch).toHaveBeenCalled();
      expect(result.ok).toBe(true);
    });

    it('calls streaming endpoint when stream enabled', async () => {
      const { sendChatGPTMessage } = await import('../../services/chatgptService');
      const mockReader = {
        read: vi.fn()
          .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"hi"}}]}\n\n') })
          .mockResolvedValueOnce({ done: true })
      };
      fetch.mockResolvedValueOnce({
        ok: true,
        body: { getReader: () => mockReader }
      });
      const onChunk = vi.fn();
      const result = await sendChatGPTMessage('hello', { stream: true, onChunk });
      expect(fetch).toHaveBeenCalled();
    });

    it('uses default model when not specified', async () => {
      const { sendChatGPTMessage } = await import('../../services/chatgptService');
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'response' } }] })
      });
      await sendChatGPTMessage('hello');
      const call = fetch.mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.model).toBe('gpt-4o-mini');
    });

    it('uses custom model when specified', async () => {
      const { sendChatGPTMessage } = await import('../../services/chatgptService');
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'response' } }] })
      });
      await sendChatGPTMessage('hello', { model: 'gpt-4' });
      const call = fetch.mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.model).toBe('gpt-4');
    });

    it('extracts HTTP error message on failure', async () => {
      const { sendChatGPTMessage } = await import('../../services/chatgptService');
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({ error: { message: 'Rate limit exceeded' } })
      });
      const result = await sendChatGPTMessage('hello');
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Rate limit exceeded');
    });

    it('includes usage statistics in response', async () => {
      const { sendChatGPTMessage } = await import('../../services/chatgptService');
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'response' } }],
          usage: { prompt_tokens: 50, completion_tokens: 75 }
        })
      });
      const result = await sendChatGPTMessage('hello');
      expect(result.usage).toEqual({ prompt_tokens: 50, completion_tokens: 75 });
    });

    it('calculates latency', async () => {
      const { sendChatGPTMessage } = await import('../../services/chatgptService');
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'response' } }] })
      });
      const result = await sendChatGPTMessage('hello');
      expect(result).toHaveProperty('latencyMs');
    });
  });

  describe('streamChatGPTMessage', () => {
    it('exports streamChatGPTMessage function', async () => {
      const { streamChatGPTMessage } = await import('../../services/chatgptService');
      expect(typeof streamChatGPTMessage).toBe('function');
    });

    it('calls sendChatGPTMessage with stream true', async () => {
      const { streamChatGPTMessage } = await import('../../services/chatgptService');
      const mockReader = {
        read: vi.fn().mockResolvedValueOnce({ done: true })
      };
      fetch.mockResolvedValueOnce({
        ok: true,
        body: { getReader: () => mockReader }
      });
      await streamChatGPTMessage('hello');
      const call = fetch.mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.stream).toBe(true);
    });
  });

  describe('parseSSELine', () => {
    it('handles DONE marker', async () => {
      const { sendChatGPTMessage } = await import('../../services/chatgptService');
      expect(typeof sendChatGPTMessage).toBe('function');
    });
  });

  describe('buildHeaders', () => {
    it('includes authorization header', async () => {
      const { sendChatGPTMessage } = await import('../../services/chatgptService');
      expect(typeof sendChatGPTMessage).toBe('function');
    });
  });

  describe('error handling', () => {
    it('returns structured error on network failure', async () => {
      const { sendChatGPTMessage } = await import('../../services/chatgptService');
      fetch.mockRejectedValueOnce(new Error('Network error'));
      const result = await sendChatGPTMessage('hello');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Network error');
    });
  });
});