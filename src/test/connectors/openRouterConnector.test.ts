// OpenRouter (2026-10-30): every call goes through the backend's connector_openrouter_request.
// The live list decides which models are free; a refused key, an empty reply, a rate limit and
// a model no longer served each come back as their own kind, so the callers can tell them apart.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../services/connectors/connectorAuth.js', () => ({
  getConnectorCredential: vi.fn((connectorId: string, key: string) => (connectorId === 'openrouter' && key === 'OPENROUTER_API_KEY' ? 'or-test-key' : '')),
}));
vi.mock('../../services/policyEnforcementService.js', () => ({
  evaluatePolicyGate: vi.fn(() => ({ ok: true, blocked: false })),
}));
const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }));

const connector = await import('../../services/connectors/openRouterConnector');
const {
  listOpenRouterModels, sendOpenRouterMessage, getOpenRouterKeyInfo, isOpenRouterConfigured,
  OPENROUTER_KEY_REFUSED, OPENROUTER_NO_TEXT, resetOpenRouterCacheForTests,
} = connector;

const answer = (httpStatus: number, body: unknown, extra: Record<string, unknown> = {}) => ({
  ok: httpStatus >= 200 && httpStatus < 300, httpStatus, error: null,
  body: typeof body === 'string' ? body : JSON.stringify(body), retryAfterSecs: null, resetMs: null, ...extra,
});
const chat = (content: string, usage: Record<string, unknown> = {}) => answer(200, {
  model: 'b/y', choices: [{ message: { content } }], usage: { prompt_tokens: 7, completion_tokens: 4, ...usage },
});
const say = [{ role: 'user', content: 'Hello?' }];

describe('OpenRouter connector', () => {
  beforeEach(() => {
    invoke.mockReset();
    resetOpenRouterCacheForTests();
    (window as any).__TAURI_INTERNALS__ = {};
  });
  afterEach(() => {
    delete (window as any).__TAURI_INTERNALS__;
  });

  it('knows when a key is saved', () => {
    expect(isOpenRouterConfigured()).toBe(true);
  });

  it('lists free and paid models from the live list', async () => {
    invoke.mockResolvedValueOnce(answer(200, { data: [
      { id: 'a/x:free', name: 'A: X (free)', context_length: 131072, pricing: { prompt: '0', completion: '0' } },
      { id: 'openrouter/free', name: 'Free Models Router', context_length: 200000, pricing: { prompt: '0', completion: '0' } },
      { id: 'b/y', name: 'B: Y', context_length: 32000, pricing: { prompt: '0.000001', completion: '0.000002' }, expiration_date: '2026-12-01' },
      { id: 'openrouter/auto', name: 'Auto Router', context_length: 2000000, pricing: { prompt: '-1', completion: '-1' } },
    ] }));
    const models = await listOpenRouterModels();
    expect(models.map((m) => m.free)).toEqual([true, true, false, false]);
    const paid = models[2];
    expect(paid).toMatchObject({ id: 'b/y', name: 'B: Y', contextLength: 32000, promptUsdPerToken: 0.000001, completionUsdPerToken: 0.000002 });
    expect(paid.expiresAtMs).toBe(Date.parse('2026-12-01'));
    expect(models[3]).toMatchObject({ promptUsdPerToken: null, completionUsdPerToken: null });
    const [command, args] = invoke.mock.calls[0];
    expect(command).toBe('connector_openrouter_request');
    expect(args.path).toBe('models');
    // Listed once, then kept for a while.
    await listOpenRouterModels();
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('sends a chat through the backend and reports the cost, own-key cost included', async () => {
    invoke.mockResolvedValueOnce(chat('Hello to you!', { cost: 0, is_byok: true, cost_details: { upstream_inference_cost: 0.0000121 } }));
    const result = await sendOpenRouterMessage(say, { model: 'google/gemini-3.5-flash-lite' });
    expect(result).toMatchObject({ ok: true, content: 'Hello to you!', costUsd: 0.0000121, usage: { promptTokens: 7, completionTokens: 4 } });
    const [command, args] = invoke.mock.calls[0];
    expect(command).toBe('connector_openrouter_request');
    expect(args.path).toBe('chat/completions');
    expect(args.apiKey).toBe('or-test-key');
    expect(JSON.parse(args.body)).toMatchObject({ model: 'google/gemini-3.5-flash-lite', messages: say });
  });

  it("adds OpenRouter's own charge to the cost", async () => {
    invoke.mockResolvedValueOnce(chat('Hi', { cost: 0.0002, is_byok: false }));
    expect(await sendOpenRouterMessage(say, { model: 'b/y' })).toMatchObject({ ok: true, costUsd: 0.0002 });
  });

  it('a refused key is not the free limit', async () => {
    invoke.mockResolvedValueOnce(answer(401, { error: { message: 'No auth credentials found', code: 401 } }));
    expect(await sendOpenRouterMessage(say, { model: 'a/x:free' })).toEqual({ ok: false, kind: 'key_refused', message: OPENROUTER_KEY_REFUSED });
  });

  // QA, 2026-10-31: an answer stopped at the length limit says so, with or without text.
  it('says when an answer was cut off at the length limit', async () => {
    invoke.mockResolvedValueOnce(answer(200, { model: 'b/y', choices: [{ message: { content: '{"doFirst": "Coll' }, finish_reason: 'length' }], usage: { prompt_tokens: 7, completion_tokens: 4096 } }));
    expect(await sendOpenRouterMessage(say, { model: 'b/y', maxTokens: 4096 })).toMatchObject({ ok: true, cutOff: true });
    invoke.mockResolvedValueOnce(answer(200, { model: 'b/y', choices: [{ message: { content: '' }, finish_reason: 'length' }], usage: {} }));
    expect(await sendOpenRouterMessage(say, { model: 'b/y', maxTokens: 4096 })).toMatchObject({ ok: false, kind: 'no_text', cutOff: true });
    invoke.mockResolvedValueOnce(answer(200, { model: 'b/y', choices: [{ message: { content: 'done' }, finish_reason: 'stop' }], usage: {} }));
    expect((await sendOpenRouterMessage(say, { model: 'b/y' }) as { cutOff?: boolean }).cutOff).toBeUndefined();
  });

  it('an empty reply is an error', async () => {
    invoke.mockResolvedValueOnce(chat(''));
    expect(await sendOpenRouterMessage(say, { model: 'a/x:free' })).toEqual({ ok: false, kind: 'no_text', message: OPENROUTER_NO_TEXT });
  });

  it("tells OpenRouter's rate limit apart from the model's own provider", async () => {
    invoke.mockResolvedValueOnce(answer(429, { error: { message: 'Rate limit exceeded', code: 429, metadata: { error_type: 'rate_limit_exceeded' } } }, { retryAfterSecs: 30, resetMs: 1793232000000 }));
    expect(await sendOpenRouterMessage(say, { model: 'a/x:free' })).toMatchObject({
      ok: false, kind: 'rate_limited', providerLimited: false, retryAfterSecs: 30, resetMs: 1793232000000,
    });
    invoke.mockResolvedValueOnce(answer(429, { error: { message: 'Provider busy', code: 429, metadata: { provider_code: 'nvidia' } } }));
    expect(await sendOpenRouterMessage(say, { model: 'a/x:free' })).toMatchObject({ ok: false, kind: 'rate_limited', providerLimited: true });
  });

  it('a model no longer served', async () => {
    invoke.mockResolvedValueOnce(answer(404, { error: { message: 'No endpoints found for a/x:free.', code: 404 } }));
    expect(await sendOpenRouterMessage(say, { model: 'a/x:free' })).toMatchObject({ ok: false, kind: 'not_served' });
  });

  it('says plainly when OpenRouter could not be reached', async () => {
    invoke.mockResolvedValueOnce({ ok: false, httpStatus: null, body: null, error: 'connection timed out', retryAfterSecs: null, resetMs: null });
    expect(await sendOpenRouterMessage(say, { model: 'a/x:free' })).toMatchObject({ ok: false, kind: 'failed', message: "Couldn't reach OpenRouter: connection timed out" });
  });

  it('reads the free requests left today', async () => {
    invoke.mockResolvedValueOnce(answer(200, { data: { is_free_tier: false, free_model_daily_requests: { used: 4, limit: 50, remaining: 46 } } }));
    expect(await getOpenRouterKeyInfo()).toEqual({ freeUsed: 4, freeLimit: 50, freeRemaining: 46, isFreeTier: false });
    expect(invoke.mock.calls[0][1].path).toBe('key');
  });

  it('key info is null when it cannot be read', async () => {
    invoke.mockResolvedValueOnce(answer(401, { error: { message: 'no' } }));
    expect(await getOpenRouterKeyInfo()).toBeNull();
  });
});
