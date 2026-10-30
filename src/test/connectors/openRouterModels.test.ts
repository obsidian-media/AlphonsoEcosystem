// OpenRouter (2026-10-30): the free models offered in the picker, and the test question before
// a chosen one is used. Free requests are scarce (50 a day), so the test asks one model at a
// time, at most three, and never asks the router, which OpenRouter keeps serving.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const send = vi.fn();
vi.mock('../../services/connectors/openRouterConnector', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  sendOpenRouterMessage: (...args: unknown[]) => send(...args),
}));

const {
  freeModelChoices, findWorkingOpenRouterModel, openRouterModelsNotServed, rememberNotServed,
  OPENROUTER_FREE_PRIVACY, OPENROUTER_CHOOSE_FREE_LABEL,
} = await import('../../services/connectors/openRouterModels');

const model = (id: string, extra: Record<string, unknown> = {}) => ({
  id, name: id.toUpperCase(), contextLength: 131072, promptUsdPerToken: 0, completionUsdPerToken: 0,
  free: id.endsWith(':free') || id === 'openrouter/free', expiresAtMs: null, ...extra,
});

describe('OpenRouter free models', () => {
  beforeEach(() => {
    localStorage.clear();
    send.mockReset();
  });

  it('offers the router first, then free models by name, never paid ones', () => {
    const choices = freeModelChoices([
      model('z/b:free'), model('b/y', { free: false, promptUsdPerToken: 1e-6 }), model('openrouter/free'), model('a/c:free'),
    ], Date.now());
    expect(choices.map((c) => c.id)).toEqual(['openrouter/free', 'a/c:free', 'z/b:free']);
    expect(choices[0].label).toBe(OPENROUTER_CHOOSE_FREE_LABEL);
    expect(choices[1].label).toBe('A/C:FREE (128k)');
    expect(choices.every((c) => c.served)).toBe(true);
  });

  it('marks an expired model and a remembered one as no longer served', () => {
    rememberNotServed('a/c:free');
    const now = Date.parse('2026-10-30T12:00:00Z');
    const choices = freeModelChoices([model('a/c:free'), model('z/b:free', { expiresAtMs: now - 1 }), model('m/n:free')], now);
    const byId = Object.fromEntries(choices.map((c) => [c.id, c]));
    expect(byId['a/c:free']).toMatchObject({ served: false, label: 'A/C:FREE (128k) (no longer served)' });
    expect(byId['z/b:free'].served).toBe(false);
    expect(byId['m/n:free'].served).toBe(true);
  });

  it('skips a model OpenRouter no longer serves and remembers it', async () => {
    send.mockResolvedValueOnce({ ok: false, kind: 'not_served', message: 'gone' });
    send.mockResolvedValueOnce({ ok: true, content: 'OK', model: 'ok:free', costUsd: 0, usage: { promptTokens: 1, completionTokens: 1 } });
    expect(await findWorkingOpenRouterModel(['gone:free', 'ok:free'])).toEqual({ model: 'ok:free', skipped: ['gone:free'] });
    expect(openRouterModelsNotServed()).toEqual(['gone:free']);
  });

  it('a model that answers with no text still counts as served', async () => {
    send.mockResolvedValueOnce({ ok: false, kind: 'no_text', message: 'no text' });
    expect(await findWorkingOpenRouterModel(['thinks:free'])).toEqual({ model: 'thinks:free', skipped: [] });
  });

  it('the router is used without asking it anything', async () => {
    expect(await findWorkingOpenRouterModel(['openrouter/free', 'x:free'])).toEqual({ model: 'openrouter/free', skipped: [] });
    expect(send).not.toHaveBeenCalled();
  });

  it('stops at a rate limit or a refused key instead of spending more free requests', async () => {
    send.mockResolvedValueOnce({ ok: false, kind: 'rate_limited', message: 'slow down' });
    expect(await findWorkingOpenRouterModel(['a:free', 'b:free'])).toEqual({ model: null, skipped: [], reason: 'slow down' });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('asks at most three models', async () => {
    send.mockResolvedValue({ ok: false, kind: 'not_served', message: 'gone' });
    const result = await findWorkingOpenRouterModel(['a:free', 'b:free', 'c:free', 'd:free']);
    expect(result.model).toBeNull();
    expect(send).toHaveBeenCalledTimes(3);
  });

  it('a model already tested today is not asked again', async () => {
    send.mockResolvedValueOnce({ ok: true, content: 'OK', model: 'a:free', costUsd: 0, usage: { promptTokens: 1, completionTokens: 1 } });
    await findWorkingOpenRouterModel(['a:free']);
    expect(await findWorkingOpenRouterModel(['a:free'])).toEqual({ model: 'a:free', skipped: [] });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('warns that free providers may keep what you send', () => {
    expect(OPENROUTER_FREE_PRIVACY).toBe('Free models are run by other companies through OpenRouter; some may keep what you send.');
  });
});
