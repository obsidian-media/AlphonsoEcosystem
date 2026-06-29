import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../services/connectors/deepseekConnector.js', () => ({
  isDeepSeekConfigured: vi.fn(() => false),
  sendDeepSeekMessage: vi.fn()
}));

vi.mock('../../services/chatgptService.js', () => ({
  sendChatGPTMessage: vi.fn()
}));

vi.mock('../../services/claudeService.js', () => ({
  sendClaudeMessage: vi.fn()
}));

vi.mock('../../services/connectorRegistryService.js', () => ({
  isConnectorAuthenticated: vi.fn(() => ({ ok: false }))
}));

vi.mock('../../lib/ollama.js', () => ({
  generateOllamaChatStream: vi.fn()
}));

const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
};
vi.stubGlobal('localStorage', localStorageMock);

import {
  listSupportedExternalProviders,
  runExternalAgentTask,
  getExternalAdapterUsageLog
} from '../../services/agentWorkshop/externalAgentAdapter';

import { isDeepSeekConfigured, sendDeepSeekMessage } from '../../services/connectors/deepseekConnector.js';
import { sendChatGPTMessage } from '../../services/chatgptService.js';
import { sendClaudeMessage } from '../../services/claudeService.js';
import { isConnectorAuthenticated } from '../../services/connectorRegistryService.js';
import { generateOllamaChatStream } from '../../lib/ollama.js';

describe('externalAgentAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('listSupportedExternalProviders', () => {
    it('returns array of 6 providers', () => {
      const providers = listSupportedExternalProviders();
      expect(providers).toHaveLength(6);
    });

    it('includes openai provider', () => {
      const providers = listSupportedExternalProviders();
      expect(providers.find(p => p.id === 'openai')).toBeDefined();
    });

    it('includes claude provider', () => {
      const providers = listSupportedExternalProviders();
      expect(providers.find(p => p.id === 'claude')).toBeDefined();
    });

    it('includes ollama provider as live by default', () => {
      const providers = listSupportedExternalProviders();
      const ollama = providers.find(p => p.id === 'ollama');
      expect(ollama).toBeDefined();
      expect(ollama.status).toBe('live');
      expect(ollama.enabled).toBe(true);
    });

    it('includes gemini provider as planned', () => {
      const providers = listSupportedExternalProviders();
      const gemini = providers.find(p => p.id === 'gemini');
      expect(gemini.status).toBe('planned_v2.6');
    });

    it('includes acc provider as not_wired', () => {
      const providers = listSupportedExternalProviders();
      const acc = providers.find(p => p.id === 'acc');
      expect(acc.status).toBe('not_wired');
    });
  });

  describe('runExternalAgentTask - wired providers', () => {
    it('returns no_credentials for openai when not authenticated', async () => {
      isConnectorAuthenticated.mockReturnValue({ ok: false });

      const result = await runExternalAgentTask('openai', 'test task');
      expect(result.enabled).toBe(false);
      expect(result.status).toBe('no_credentials');
    });

    it('calls sendChatGPTMessage for openai when authenticated', async () => {
      isConnectorAuthenticated.mockReturnValue({ ok: true });
      sendChatGPTMessage.mockResolvedValue({ text: 'openai response' });

      const result = await runExternalAgentTask('openai', 'test task');
      expect(sendChatGPTMessage).toHaveBeenCalledWith('test task', expect.objectContaining({ stream: false }));
      expect(result.content).toBe('openai response');
    });

    it('returns no_credentials for claude when not authenticated', async () => {
      isConnectorAuthenticated.mockReturnValue({ ok: false });

      const result = await runExternalAgentTask('claude', 'test task');
      expect(result.status).toBe('no_credentials');
    });

    it('calls sendClaudeMessage for claude when authenticated', async () => {
      isConnectorAuthenticated.mockReturnValue({ ok: true });
      sendClaudeMessage.mockResolvedValue({ text: 'claude response' });

      const result = await runExternalAgentTask('claude', 'test task');
      expect(sendClaudeMessage).toHaveBeenCalled();
      expect(result.content).toBe('claude response');
    });

    it('calls generateOllamaChatStream for ollama provider', async () => {
      generateOllamaChatStream.mockImplementation(async ({ onToken }) => {
        onToken('ollama response');
      });

      const result = await runExternalAgentTask('ollama', 'test task');
      expect(generateOllamaChatStream).toHaveBeenCalled();
      expect(result.content).toBe('ollama response');
    });

    it('returns error for ollama when Ollama unavailable', async () => {
      generateOllamaChatStream.mockRejectedValue(new Error('Connection refused'));

      const result = await runExternalAgentTask('ollama', 'test task');
      expect(result.status).toBe('error');
    });
  });

  describe('runExternalAgentTask - not wired providers', () => {
    it('returns no_credentials for deepseek when not configured', async () => {
      isDeepSeekConfigured.mockReturnValue(false);

      const result = await runExternalAgentTask('deepseek', 'test task');
      expect(result.status).toBe('no_credentials');
    });

    it('returns not_wired for gemini provider', async () => {
      const result = await runExternalAgentTask('gemini', 'test task');
      expect(result.status).toBe('not_wired');
    });

    it('returns not_wired for acc provider', async () => {
      const result = await runExternalAgentTask('acc', 'test task');
      expect(result.status).toBe('not_wired');
    });

    it('returns not_wired for unknown provider', async () => {
      const result = await runExternalAgentTask('unknown', 'test task');
      expect(result.status).toBe('not_wired');
    });
  });

  describe('error handling', () => {
    it('returns error object on deepseek failure', async () => {
      isDeepSeekConfigured.mockReturnValue(true);
      sendDeepSeekMessage.mockRejectedValue(new Error('API error'));

      const result = await runExternalAgentTask('deepseek', 'test task');
      expect(result.status).toBe('error');
      expect(result.message).toContain('API error');
    });

    it('returns error object on openai failure', async () => {
      isConnectorAuthenticated.mockReturnValue({ ok: true });
      sendChatGPTMessage.mockRejectedValue(new Error('Rate limited'));

      const result = await runExternalAgentTask('openai', 'test task');
      expect(result.status).toBe('error');
    });

    it('handles null/undefined task gracefully', async () => {
      const result = await runExternalAgentTask('ollama', null);
      expect(result.tracked).toBe(true);
    });
  });

  describe('usage tracking', () => {
    it('tracks all dispatched tasks', async () => {
      generateOllamaChatStream.mockImplementation(async () => {});

      await runExternalAgentTask('ollama', 'task A');
      await runExternalAgentTask('ollama', 'task B');

      const log = getExternalAdapterUsageLog();
      expect(log.length).toBeGreaterThanOrEqual(2);
      const last = log[log.length - 1];
      expect(last.provider).toBe('ollama');
    });

    it('limits log to 50 entries', async () => {
      generateOllamaChatStream.mockImplementation(async () => {});

      for (let i = 0; i < 55; i++) {
        await runExternalAgentTask('ollama', `task ${i}`);
      }

      const log = getExternalAdapterUsageLog();
      expect(log.length).toBe(50);
    });
  });
});
