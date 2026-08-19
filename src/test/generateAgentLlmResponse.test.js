import { describe, it, expect, vi, beforeEach } from 'vitest';

let agentProviderMap = {};
vi.mock('../services/modelSelectionService', () => ({
  getAgentProvider: vi.fn((agentId) => agentProviderMap[agentId] || { provider: 'ollama' })
}));

const sendNvidiaMessage = vi.fn();
vi.mock('../services/connectors/nvidiaNimConnector', () => ({ sendNvidiaMessage }));

const sendGeminiMessage = vi.fn();
vi.mock('../services/connectors/geminiConnector', () => ({ sendGeminiMessage }));

const sendHermesAgentMessage = vi.fn();
vi.mock('../services/connectors/hermesAgentConnector', () => ({ sendHermesAgentMessage }));

const { generateAgentLlmResponse } = await import('../lib/ollama');

describe('generateAgentLlmResponse — the one shared per-agent dispatcher', () => {
  beforeEach(() => {
    agentProviderMap = {};
    sendNvidiaMessage.mockReset();
    sendGeminiMessage.mockReset();
    sendHermesAgentMessage.mockReset();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('defaults to Ollama and calls the real /api/generate endpoint — untouched behavior for anyone who never configures this', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ response: 'hi from ollama', done: true }) });
    const result = await generateAgentLlmResponse('jose', { prompt: 'hello' });
    expect(result).toEqual({ response: 'hi from ollama', done: true });
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/generate'), expect.objectContaining({ method: 'POST' }));
    expect(sendNvidiaMessage).not.toHaveBeenCalled();
    expect(sendHermesAgentMessage).not.toHaveBeenCalled();
  });

  it('routes to NVIDIA NIM when that agent is configured for nvidia_nim, resolving fresh per call', async () => {
    agentProviderMap.hector = { provider: 'nvidia_nim', model: 'meta/llama-3.1-8b-instruct' };
    sendNvidiaMessage.mockResolvedValueOnce({ ok: true, content: 'hi from nvidia', model: 'meta/llama-3.1-8b-instruct', usage: null, provider: 'nvidia_nim' });
    const result = await generateAgentLlmResponse('hector', { prompt: 'research this' });
    expect(result).toEqual({ response: 'hi from nvidia', done: true });
    expect(sendNvidiaMessage).toHaveBeenCalledWith([{ role: 'user', content: 'research this' }], { model: 'meta/llama-3.1-8b-instruct' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('routes to Gemini when that agent is configured for gemini', async () => {
    agentProviderMap.miya = { provider: 'gemini' };
    sendGeminiMessage.mockResolvedValueOnce({ ok: true, content: 'hi from gemini', model: 'gemini-2.5-flash-lite', usage: null, provider: 'gemini' });
    const result = await generateAgentLlmResponse('miya', { prompt: 'write a script' });
    expect(result).toEqual({ response: 'hi from gemini', done: true });
    expect(sendGeminiMessage).toHaveBeenCalledWith([{ role: 'user', content: 'write a script' }], { model: undefined });
  });

  it('routes to the correct Hermes profile for that specific agent, not a generic one', async () => {
    agentProviderMap.jose = { provider: 'hermes', model: 'hermes-agent' };
    sendHermesAgentMessage.mockResolvedValueOnce({ ok: true, content: 'hi from jose profile', model: 'hermes-agent', usage: null, provider: 'hermes' });
    const result = await generateAgentLlmResponse('jose', { prompt: 'orchestrate this' });
    expect(result).toEqual({ response: 'hi from jose profile', done: true });
    expect(sendHermesAgentMessage).toHaveBeenCalledWith('jose', [{ role: 'user', content: 'orchestrate this' }], { model: 'hermes-agent' });
  });

  it('a different agent set to ollama is unaffected by another agent being on hermes — per-agent resolution, not global', async () => {
    agentProviderMap.jose = { provider: 'hermes', model: 'hermes-agent' };
    // hector has no entry -> defaults to ollama
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ response: 'ollama reply', done: true }) });
    const result = await generateAgentLlmResponse('hector', { prompt: 'research' });
    expect(result.response).toBe('ollama reply');
    expect(sendHermesAgentMessage).not.toHaveBeenCalled();
  });

  it('propagates a rate-limited Hermes result as a thrown error rather than a silent Ollama fallback', async () => {
    agentProviderMap.jose = { provider: 'hermes' };
    sendHermesAgentMessage.mockResolvedValueOnce({ ok: false, rateLimited: true, status: 429, message: 'Hermes profile rate limit exceeded', provider: 'hermes' });
    await expect(generateAgentLlmResponse('jose', { prompt: 'x' })).rejects.toThrow('Hermes profile rate limit exceeded');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('a Hermes connector throw (e.g. profile down) propagates rather than falling back to Ollama', async () => {
    agentProviderMap.jose = { provider: 'hermes' };
    sendHermesAgentMessage.mockRejectedValueOnce(new Error('Hermes endpoint not configured for agent "jose"'));
    await expect(generateAgentLlmResponse('jose', { prompt: 'x' })).rejects.toThrow('Hermes endpoint not configured');
    expect(fetch).not.toHaveBeenCalled();
  });
});
