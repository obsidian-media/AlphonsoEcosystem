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
// Hermes gateway (2026-10-30): a Hermes step is a Hermes run.
const runHermesStep = vi.fn();
vi.mock('../services/hermes/hermesRun', () => ({ runHermesStep }));

const sendOpenRouterMessage = vi.fn();
vi.mock('../services/connectors/openRouterConnector', async (orig) => ({ ...(await orig()), sendOpenRouterMessage }));

const { generateAgentLlmResponse, withAgentModel, getAgentModelOverride } = await import('../lib/ollama');

describe('generateAgentLlmResponse — the one shared per-agent dispatcher', () => {
  beforeEach(() => {
    agentProviderMap = {};
    sendNvidiaMessage.mockReset();
    sendGeminiMessage.mockReset();
    sendHermesAgentMessage.mockReset();
    runHermesStep.mockReset();
    sendOpenRouterMessage.mockReset();
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

  // OpenRouter (2026-10-30): a free model chosen for the agent, else OpenRouter's free router.
  it('routes to OpenRouter when that agent is configured for openrouter', async () => {
    agentProviderMap.hector = { provider: 'openrouter', model: 'x/y:free' };
    sendOpenRouterMessage.mockResolvedValueOnce({ ok: true, content: 'hi from openrouter', model: 'x/y:free', costUsd: 0, usage: { promptTokens: 2, completionTokens: 3 } });
    const result = await generateAgentLlmResponse('hector', { prompt: 'research this' });
    expect(result).toEqual({ response: 'hi from openrouter', done: true, backend: 'openrouter', model: 'x/y:free' });
    expect(sendOpenRouterMessage).toHaveBeenCalledWith([{ role: 'user', content: 'research this' }], { model: 'x/y:free' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses OpenRouter's free router when no model was chosen", async () => {
    agentProviderMap.alphonso = { provider: 'openrouter' };
    sendOpenRouterMessage.mockResolvedValueOnce({ ok: true, content: 'hi', model: 'some/free:free', costUsd: 0, usage: { promptTokens: 1, completionTokens: 1 } });
    await generateAgentLlmResponse('alphonso', { prompt: 'hello' });
    expect(sendOpenRouterMessage).toHaveBeenCalledWith([{ role: 'user', content: 'hello' }], { model: 'openrouter/free' });
  });

  it("carries on with this computer's model once the free limit is used up, and says so", async () => {
    agentProviderMap.hector = { provider: 'openrouter', model: 'x/y:free' };
    const limit = await import('../services/connectors/openRouterFreeLimit');
    limit.markFreeLimitUsed(Date.now() + 3_600_000);
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ response: 'local answer', done: true }) });
    const result = await generateAgentLlmResponse('hector', { prompt: 'research this' });
    expect(result).toMatchObject({ response: 'local answer', backend: 'ollama', model: 'llama3.2:3b' });
    expect(sendOpenRouterMessage).not.toHaveBeenCalled();
    expect(limit.takeModelNotes('hector')).toEqual([limit.FREE_LIMIT_LOCAL('llama3.2:3b')]);
    localStorage.clear();
  });

  it('waits for setup when no model on this computer can take over', async () => {
    agentProviderMap.hector = { provider: 'openrouter', model: 'x/y:free' };
    const limit = await import('../services/connectors/openRouterFreeLimit');
    limit.markFreeLimitUsed(Date.now() + 3_600_000);
    fetch.mockRejectedValueOnce(new Error('connection refused'));
    await expect(generateAgentLlmResponse('hector', { prompt: 'x' })).rejects.toThrow(limit.FREE_LIMIT_NO_LOCAL);
    expect(limit.takeSetupNeeded('hector')).toBe(limit.FREE_LIMIT_NO_LOCAL);
    localStorage.clear();
  });

  it('a paid OpenRouter step records the cost OpenRouter reports', async () => {
    localStorage.setItem('alphonso_settings', JSON.stringify({ zeroCostMode: false, paidModels: { allowed: true, provider: 'openrouter', model: 'b/y', inputPerMillionUsd: 1, outputPerMillionUsd: 2, monthlyCapUsd: 5 } }));
    localStorage.setItem('alphonso_connector_auth_profiles_v1', JSON.stringify({ openrouter: { enabled: true, mode: 'trusted_session' } }));
    const spend = await import('../services/jose/joseSpend');
    if (!spend.paidModelAvailable().ok) throw new Error(`paid model not available: ${spend.paidModelAvailable().reason}`);
    sendOpenRouterMessage.mockResolvedValueOnce({ ok: true, content: 'paid answer', model: 'b/y', costUsd: 0.0123, costReported: true, usage: { promptTokens: 100, completionTokens: 50 } });
    const result = await generateAgentLlmResponse('hector', { prompt: 'deep research', model: 'openrouter:b/y' });
    expect(result).toEqual({ response: 'paid answer', done: true, backend: 'openrouter', model: 'b/y' });
    expect(sendOpenRouterMessage).toHaveBeenCalledWith([{ role: 'user', content: 'deep research' }], { model: 'b/y', maxTokens: spend.PAID_MAX_OUTPUT_TOKENS });
    expect(spend.monthSpendUsd()).toBeCloseTo(0.0123, 6);
    localStorage.clear();
  });

  it("says plainly when OpenRouter refuses the key", async () => {
    agentProviderMap.hector = { provider: 'openrouter', model: 'x/y:free' };
    sendOpenRouterMessage.mockResolvedValueOnce({ ok: false, kind: 'key_refused', message: 'OpenRouter refused the key. Check it in Settings → Connectors.' });
    await expect(generateAgentLlmResponse('hector', { prompt: 'x' })).rejects.toThrow('OpenRouter refused the key. Check it in Settings → Connectors.');
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
    runHermesStep.mockResolvedValueOnce({ ok: true, text: 'hi from jose profile' });
    const result = await generateAgentLlmResponse('jose', { prompt: 'orchestrate this' });
    expect(result).toEqual({ response: 'hi from jose profile', done: true, backend: 'hermes', model: 'hermes-agent' });
    expect(runHermesStep).toHaveBeenCalledWith('jose', 'orchestrate this', expect.objectContaining({ instructions: expect.stringContaining('You own:'), model: 'hermes-agent' }));
  });

  it('passes sessionId, approved and the step\'s stop signal through to the Hermes run', async () => {
    agentProviderMap.jose = { provider: 'hermes', model: 'hermes-agent' };
    runHermesStep.mockResolvedValueOnce({ ok: true, text: 'hi' });
    const signal = new AbortController().signal;
    await generateAgentLlmResponse('jose', { prompt: 'orchestrate this', sessionId: 'receipt-7', approved: true, signal });
    expect(runHermesStep).toHaveBeenCalledWith('jose', 'orchestrate this', expect.objectContaining({ sessionId: 'receipt-7', approved: true, signal }));
  });

  it('a different agent set to ollama is unaffected by another agent being on hermes — per-agent resolution, not global', async () => {
    agentProviderMap.jose = { provider: 'hermes', model: 'hermes-agent' };
    // hector has no entry -> defaults to ollama
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ response: 'ollama reply', done: true }) });
    const result = await generateAgentLlmResponse('hector', { prompt: 'research' });
    expect(result.response).toBe('ollama reply');
    expect(runHermesStep).not.toHaveBeenCalled();
  });

  it('propagates a rate-limited Hermes result as a thrown error rather than a silent Ollama fallback', async () => {
    agentProviderMap.jose = { provider: 'hermes' };
    runHermesStep.mockResolvedValueOnce({ ok: false, reason: 'Hermes profile rate limit exceeded' });
    await expect(generateAgentLlmResponse('jose', { prompt: 'x' })).rejects.toThrow('Hermes profile rate limit exceeded');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('a Hermes connector throw (e.g. profile down) propagates rather than falling back to Ollama', async () => {
    agentProviderMap.jose = { provider: 'hermes' };
    runHermesStep.mockRejectedValueOnce(new Error('Hermes endpoint not configured for agent "jose"'));
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
