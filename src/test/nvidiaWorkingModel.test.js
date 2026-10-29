// NVIDIA lists models it no longer serves (QA batch 1: 58 of 85 answered 404), and Chat used to
// pick from a fixed "recommended" list whose first listed model was one of them. Alphonso now
// asks each listed model a tiny question until one answers, and remembers the ones NVIDIA no
// longer serves.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/connectors/connectorAuth.js', () => ({
  getConnectorCredential: vi.fn(() => 'nvapi-test-key')
}));
vi.mock('../services/policyEnforcementService.js', () => ({
  evaluatePolicyGate: vi.fn(() => ({ ok: true, blocked: false }))
}));

const { findWorkingNvidiaModel, nvidiaModelsNotServed } = await import('../services/connectors/nvidiaNimConnector.js');

function answer(byModel) {
  return vi.fn(async (_url, init) => {
    const { model } = JSON.parse(init.body);
    const r = byModel[model] ?? { status: 404, text: 'Not Found' };
    return {
      ok: r.status === 200, status: r.status,
      text: async () => r.text ?? '',
      json: async () => ({ choices: [{ message: { content: r.text } }], model }),
    };
  });
}

describe('finding an NVIDIA model that answers', () => {
  beforeEach(() => { localStorage.clear(); });

  it('tries the listed models in turn and keeps the first that answers', async () => {
    vi.stubGlobal('fetch', answer({ 'b/chat': { status: 200, text: 'OK' } }));
    const found = await findWorkingNvidiaModel(['a/gone', 'b/chat', 'c/chat']);
    expect(found).toEqual({ model: 'b/chat', notServed: ['a/gone'] });
    expect(nvidiaModelsNotServed()).toEqual(['a/gone']);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('skips a model that answers but not as a chat model (a safety checker says "safe")', async () => {
    vi.stubGlobal('fetch', answer({ 'a/guard': { status: 200, text: 'safe' }, 'b/chat': { status: 200, text: 'OK.' } }));
    expect((await findWorkingNvidiaModel(['a/guard', 'b/chat'])).model).toBe('b/chat');
    expect(nvidiaModelsNotServed()).toEqual([]);
  });

  it('skips models already known not to be served', async () => {
    localStorage.setItem('alphonso_nvidia_models_not_served_v1', JSON.stringify(['a/gone']));
    vi.stubGlobal('fetch', answer({ 'b/chat': { status: 200, text: 'ok' } }));
    expect((await findWorkingNvidiaModel(['a/gone', 'b/chat'])).model).toBe('b/chat');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('stops at a rate limit without guessing', async () => {
    vi.stubGlobal('fetch', answer({ 'a/x': { status: 429, text: 'slow down' } }));
    expect(await findWorkingNvidiaModel(['a/x', 'b/chat'])).toEqual({ model: null, notServed: [], rateLimited: true });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('answers null when none of them answers', async () => {
    vi.stubGlobal('fetch', answer({}));
    expect((await findWorkingNvidiaModel(['a', 'b'])).model).toBeNull();
  });
});
