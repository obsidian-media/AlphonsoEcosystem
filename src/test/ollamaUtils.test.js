vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => false)
}));

import { invoke, isTauri } from '@tauri-apps/api/core';
import {
  chooseDefaultModel,
  classifyOllamaError,
  formatModelSize,
  freeOllamaGpuMemory,
  generateOllamaChatStream,
  generateOllamaResponse,
  normalizeEndpoint,
  PREFERRED_MODEL
} from '../lib/ollama';
import { STARTER_MODEL_TAG } from '../services/setupFlowService';

describe('ollama utilities', () => {
  describe('normalizeEndpoint', () => {
    it('returns default when empty', () => {
      expect(normalizeEndpoint('')).toBe('http://localhost:11434');
      expect(normalizeEndpoint(null)).toBe('http://localhost:11434');
      expect(normalizeEndpoint(undefined)).toBe('http://localhost:11434');
    });

    it('strips trailing slashes', () => {
      expect(normalizeEndpoint('http://localhost:11434/')).toBe('http://localhost:11434');
      expect(normalizeEndpoint('http://localhost:11434///')).toBe('http://localhost:11434');
    });

    it('prepends http:// when missing', () => {
      expect(normalizeEndpoint('localhost:11434')).toBe('http://localhost:11434');
    });

    it('preserves https://', () => {
      expect(normalizeEndpoint('https://my-ollama.host')).toBe('https://my-ollama.host');
    });
  });

  describe('formatModelSize', () => {
    it('formats bytes', () => {
      expect(formatModelSize(512)).toBe('512 B');
    });

    it('formats kilobytes', () => {
      expect(formatModelSize(2048)).toBe('2.0 KB');
    });

    it('formats gigabytes', () => {
      expect(formatModelSize(2 * 1024 * 1024 * 1024)).toBe('2.0 GB');
    });

    it('returns Unknown size for non-positive values', () => {
      expect(formatModelSize(0)).toBe('Unknown size');
      expect(formatModelSize(-1)).toBe('Unknown size');
      expect(formatModelSize(NaN)).toBe('Unknown size');
    });
  });

  describe('chooseDefaultModel', () => {
    it('falls back to the bundled starter model, not a coding model', () => {
      // Owner decision 2026-10-21: last picked model, else the starter.
      // PREFERRED_MODEL was 'qwen2.5-coder:7b' until then (QA Bug 20).
      expect(PREFERRED_MODEL).toBe(STARTER_MODEL_TAG);
      const models = [{ name: 'qwen2.5-coder:7b' }, { name: 'glm-ocr:latest' }, { name: STARTER_MODEL_TAG }];
      expect(chooseDefaultModel(models, '')).toBe(STARTER_MODEL_TAG);
    });

    it('prefers the preferred model when available', () => {
      const models = [{ name: 'mistral:latest' }, { name: PREFERRED_MODEL }];
      expect(chooseDefaultModel(models, '')).toBe(PREFERRED_MODEL);
    });

    it('keeps current model when still available', () => {
      const models = [{ name: 'mistral:latest' }, { name: 'codellama:7b' }];
      expect(chooseDefaultModel(models, 'codellama:7b')).toBe('codellama:7b');
    });

    it('falls back to first model when current is gone', () => {
      const models = [{ name: 'mistral:latest' }];
      expect(chooseDefaultModel(models, 'llama3:gone')).toBe('mistral:latest');
    });

    it('returns empty string when no models', () => {
      expect(chooseDefaultModel([], '')).toBe('');
    });
  });

  describe('classifyOllamaError', () => {
    it('classifies AbortError as timeout', () => {
      const err = { name: 'AbortError' };
      expect(classifyOllamaError(err).code).toBe('timeout');
    });

    it('classifies cors errors', () => {
      const err = { message: 'cors policy blocked the request' };
      expect(classifyOllamaError(err).code).toBe('cors');
    });

    it('classifies an Ollama 403 as an origin issue', () => {
      const err = { message: 'Ollama /api/chat returned HTTP 403' };
      expect(classifyOllamaError(err).code).toBe('cors');
    });

    it('classifies fetch failures as not_running', () => {
      const err = { message: 'Failed to fetch' };
      expect(classifyOllamaError(err).code).toBe('not_running');
    });

    it('classifies unknown errors as disconnected', () => {
      const err = { message: 'something went wrong' };
      expect(classifyOllamaError(err).code).toBe('disconnected');
    });

    it('handles null/undefined gracefully', () => {
      expect(classifyOllamaError(null).code).toBe('disconnected');
      expect(classifyOllamaError(undefined).code).toBe('disconnected');
    });
  });

  describe('generateOllamaChatStream', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('streams tokens from /api/chat and returns full text', async () => {
      const lines = [
        JSON.stringify({ message: { role: 'assistant', content: 'Hello' }, done: false }),
        JSON.stringify({ message: { role: 'assistant', content: ' world' }, done: false }),
        JSON.stringify({ done: true })
      ].join('\n');

      const encoder = new TextEncoder();
      const encoded = encoder.encode(lines);
      let offset = 0;
      const mockReader = {
        read: vi.fn()
          .mockResolvedValueOnce({ done: false, value: encoded })
          .mockResolvedValueOnce({ done: true, value: undefined })
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: { getReader: () => mockReader }
      });

      const tokens = [];
      const result = await generateOllamaChatStream({
        endpoint: 'http://localhost:11434',
        model: 'llama3.2:3b',
        messages: [{ role: 'user', content: 'hi' }],
        onToken: (_tok, full) => tokens.push(full)
      });

      expect(result).toBe('Hello world');
      expect(tokens.length).toBeGreaterThan(0);
      expect(tokens[tokens.length - 1]).toBe('Hello world');
    });

    it('throws on non-ok HTTP response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'model error' })
      });

      await expect(
        generateOllamaChatStream({
          endpoint: 'http://localhost:11434',
          model: 'llama3.2:3b',
          messages: [{ role: 'user', content: 'hi' }]
        })
      ).rejects.toThrow('model error');
    });

    describe('desktop fallback when the window is refused', () => {
      const messages = [
        { role: 'system', content: 'be brief' },
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' },
        { role: 'user', content: 'and again' }
      ];

      beforeEach(() => {
        isTauri.mockReturnValue(true);
        invoke.mockReset();
        global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({}) });
      });

      afterEach(() => {
        isTauri.mockReturnValue(false);
      });

      it('frees GPU memory through the backend and never throws', async () => {
        invoke.mockResolvedValueOnce({ unloaded: ['qwen2.5-coder:7b'], error: null });
        await expect(freeOllamaGpuMemory('http://localhost:11434/')).resolves.toEqual({ unloaded: ['qwen2.5-coder:7b'], error: null });
        expect(invoke).toHaveBeenCalledWith('ollama_unload_models', { endpoint: 'http://localhost:11434' });
        invoke.mockRejectedValueOnce('backend gone');
        await expect(freeOllamaGpuMemory()).resolves.toEqual({ unloaded: [], error: 'backend gone' });
      });

      it('reports the backend reason when the command rejects with a plain string', async () => {
        // Tauri rejects with a string, not an Error; callers used to lose it
        // and say "The local model could not be reached" (QA Bug 18).
        invoke.mockRejectedValue('invalid args `model` for command `ollama_generate`: invalid type: null, expected a string');
        await expect(
          generateOllamaResponse({ endpoint: 'http://localhost:11434', model: null, prompt: 'hi' })
        ).rejects.toThrow('invalid args `model` for command `ollama_generate`');
        expect(invoke).toHaveBeenCalledTimes(1);
      });

      it('sends the real chat turns to ollama_chat instead of a flattened prompt', async () => {
        invoke.mockResolvedValue({ response: 'from backend', error: null });
        const tokens = [];

        const result = await generateOllamaChatStream({
          endpoint: 'http://localhost:11434/',
          model: 'llama3.2:3b',
          messages,
          onToken: (_tok, full) => tokens.push(full)
        });

        expect(result).toBe('from backend');
        expect(tokens).toEqual(['from backend']);
        expect(invoke).toHaveBeenCalledTimes(1);
        expect(invoke).toHaveBeenCalledWith('ollama_chat', {
          endpoint: 'http://localhost:11434',
          model: 'llama3.2:3b',
          messages
        });
      });

      it('retries once when the backend reports a transient startup error', async () => {
        invoke
          .mockResolvedValueOnce({ response: '', error: 'connection refused' })
          .mockResolvedValueOnce({ response: 'second try', error: null });

        const result = await generateOllamaChatStream({ endpoint: 'http://localhost:11434', model: 'm', messages });

        expect(result).toBe('second try');
        expect(invoke).toHaveBeenCalledTimes(2);
        expect(invoke.mock.calls.every(([command]) => command === 'ollama_chat')).toBe(true);
      });

      it('surfaces a real model error from the backend', async () => {
        invoke.mockResolvedValue({ response: '', error: "model 'm' not found" });

        await expect(
          generateOllamaChatStream({ endpoint: 'http://localhost:11434', model: 'm', messages })
        ).rejects.toThrow("model 'm' not found");
        expect(invoke).toHaveBeenCalledTimes(1);
      });
    });
  });
});
