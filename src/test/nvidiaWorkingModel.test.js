// NVIDIA lists models it no longer serves (QA batch 1: 58 of 85 answered 404), and Chat used to
// pick from a fixed "recommended" list whose first listed model was one of them. Alphonso now
// asks the listed models a tiny question until one answers, and remembers the ones NVIDIA no
// longer serves. Some listed models never answer at all, so each try has a short limit and a few
// run at once (QA batch 1: one at a time took 139 s on a fresh install, over 4 minutes in the app).
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/connectors/connectorAuth.js', () => ({
  getConnectorCredential: vi.fn(() => 'nvapi-test-key')
}));
vi.mock('../services/policyEnforcementService.js', () => ({
  evaluatePolicyGate: vi.fn(() => ({ ok: true, blocked: false }))
}));

const { findWorkingNvidiaModel, nvidiaModelsNotServed, NVIDIA_PROBE } = await import('../services/connectors/nvidiaNimConnector.js');

/** fetch answering per model; `hang` never answers until the request is cut off. */
function answer(byModel) {
  return vi.fn((_url, init) => {
    const { model } = JSON.parse(init.body);
    const r = byModel[model] ?? { status: 404, text: 'Not Found' };
    if (r.hang) {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('timed out'), { name: 'TimeoutError' })));
      });
    }
    return Promise.resolve({
      ok: r.status === 200, status: r.status,
      text: async () => r.text ?? '',
      json: async () => ({ choices: [{ message: { content: r.text } }], model }),
    });
  });
}

describe('finding an NVIDIA model that answers', () => {
  beforeEach(() => { localStorage.clear(); });

  it('keeps the model that answers and remembers the ones NVIDIA no longer serves', async () => {
    vi.stubGlobal('fetch', answer({ 'b/chat': { status: 200, text: 'OK' } }));
    const found = await findWorkingNvidiaModel(['a/gone', 'b/chat']);
    expect(found.model).toBe('b/chat');
    expect(found.notServed).toEqual(['a/gone']);
    expect(nvidiaModelsNotServed()).toEqual(['a/gone']);
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
    expect(await findWorkingNvidiaModel(['a/x'])).toEqual({ model: null, notServed: [], rateLimited: true });
  });

  it('answers null when none of them answers', async () => {
    vi.stubGlobal('fetch', answer({}));
    expect((await findWorkingNvidiaModel(['a', 'b'])).model).toBeNull();
  });

  it("doesn't wait for a model that never answers: a few at once, each with a short limit", async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal('fetch', answer({ 'a/hangs': { hang: true }, 'b/hangs': { hang: true }, 'c/chat': { status: 200, text: 'OK' } }));
      const search = findWorkingNvidiaModel(['a/hangs', 'b/hangs', 'c/chat']);
      await vi.advanceTimersByTimeAsync(0);
      // All three were asked at once, so the answering model is found without waiting out the others.
      expect(fetch).toHaveBeenCalledTimes(3);
      expect((await search).model).toBe('c/chat');
      expect(NVIDIA_PROBE.timeoutSecs).toBeLessThanOrEqual(30);
      expect(NVIDIA_PROBE.atOnce).toBeGreaterThan(1);
      // A model that timed out is not marked as not served: it may answer another time.
      expect(nvidiaModelsNotServed()).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});
