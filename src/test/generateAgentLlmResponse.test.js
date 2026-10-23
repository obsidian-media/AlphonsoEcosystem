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

const { generateAgentLlmResponse, withAgentModel, getAgentModelOverride } = await import('../lib/ollama');

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
    expect(result).toMatchObject({ response: 'hi from ollama', done: true, backend: 'ollama' });
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/generate'), expect.objectContaining({ method: 'POST' }));
    expect(sendNvidiaMessage).not.toHaveBeenCalled();
    expect(sendHermesAgentMessage).not.toHaveBeenCalled();
  });

  it('routes to NVIDIA NIM when that agent is configured for nvidia_nim, resolving fresh per call', async () => {
    agentProviderMap.hector = { provider: 'nvidia_nim', model: 'meta/llama-3.1-8b-instruct' };
    sendNvidiaMessage.mockResolvedValueOnce({ ok: true, content: 'hi from nvidia', model: 'meta/llama-3.1-8b-instruct', usage: null, provider: 'nvidia_nim' });
    const result = await generateAgentLlmResponse('hector', { prompt: 'research this' });
    expect(result).toEqual({ response: 'hi from nvidia', done: true, backend: 'nvidia_nim', model: 'meta/llama-3.1-8b-instruct' });
    expect(sendNvidiaMessage).toHaveBeenCalledWith([{ role: 'user', content: 'research this' }], { model: 'meta/llama-3.1-8b-instruct' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('routes to Gemini when that agent is configured for gemini', async () => {
    agentProviderMap.miya = { provider: 'gemini' };
    sendGeminiMessage.mockResolvedValueOnce({ ok: true, content: 'hi from gemini', model: 'gemini-2.5-flash-lite', usage: null, provider: 'gemini' });
    const result = await generateAgentLlmResponse('miya', { prompt: 'write a script' });
    expect(result).toEqual({ response: 'hi from gemini', done: true, backend: 'gemini', model: 'gemini-2.5-flash-lite' });
    expect(sendGeminiMessage).toHaveBeenCalledWith([{ role: 'user', content: 'write a script' }], { model: undefined });
  });

  it('routes to the correct Hermes profile for that specific agent, not a generic one', async () => {
    agentProviderMap.jose = { provider: 'hermes', model: 'hermes-agent' };
    sendHermesAgentMessage.mockResolvedValueOnce({ ok: true, content: 'hi from jose profile', model: 'hermes-agent', usage: null, provider: 'hermes' });
    const result = await generateAgentLlmResponse('jose', { prompt: 'orchestrate this' });
    expect(result).toEqual({ response: 'hi from jose profile', done: true, backend: 'hermes', model: 'hermes-agent' });
    expect(sendHermesAgentMessage).toHaveBeenCalledWith('jose', [{ role: 'user', content: 'orchestrate this' }], { model: 'hermes-agent' });
  });

  it('passes sessionId and approved through to sendHermesAgentMessage when the caller supplies them', async () => {
    agentProviderMap.jose = { provider: 'hermes', model: 'hermes-agent' };
    sendHermesAgentMessage.mockResolvedValueOnce({ ok: true, content: 'hi', model: 'hermes-agent', usage: null, provider: 'hermes' });
    await generateAgentLlmResponse('jose', { prompt: 'orchestrate this', sessionId: 'receipt-7', approved: true });
    expect(sendHermesAgentMessage).toHaveBeenCalledWith('jose', [{ role: 'user', content: 'orchestrate this' }], { model: 'hermes-agent', sessionId: 'receipt-7', approved: true });
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

  // QA 2026-10-22: with no address passed, this used localhost:11434 and so
  // ignored an Ollama the user had set elsewhere in Settings (Companion Mode).
  it("uses the Ollama address from Settings when the caller passes none", async () => {
    localStorage.setItem('alphonso_settings', JSON.stringify({ endpoint: 'http://192.168.1.50:11434' }));
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ response: 'ok', done: true }) });
    await generateAgentLlmResponse('alphonso', { prompt: 'hello' });
    expect(fetch.mock.calls[0][0]).toBe('http://192.168.1.50:11434/api/generate');
    localStorage.removeItem('alphonso_settings');
  });

  // Jose redesign phase 4: a model chosen for one step, for one agent only.
  it('uses a per-step model for that agent only, and nothing is left over', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ response: 'ok', done: true }) });
    await withAgentModel('nova', 'qwen2.5:7b', async () => {
      await generateAgentLlmResponse('nova', { prompt: 'judge' });
      await generateAgentLlmResponse('hector', { prompt: 'find' });
    });
    const bodies = fetch.mock.calls.map((c) => JSON.parse(c[1].body).model);
    expect(bodies[0]).toBe('qwen2.5:7b');
    expect(bodies[1]).not.toBe('qwen2.5:7b');
    expect(getAgentModelOverride('nova')).toBeNull();
  });

  it('clears the per-step model even when the step throws', async () => {
    await expect(withAgentModel('nova', 'qwen2.5:7b', async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(getAgentModelOverride('nova')).toBeNull();
  });
});
