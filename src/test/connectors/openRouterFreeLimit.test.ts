// OpenRouter (2026-10-30): when the free daily limit runs out, a step carries on with this
// computer's model by default (and says so), or asks to finish with a paid OpenRouter model.
// The per-minute limit is not the daily one, and with no model on this computer the step waits.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const send = vi.fn();
const keyInfo = vi.fn();
vi.mock('../../services/connectors/openRouterConnector', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  sendOpenRouterMessage: (...args: unknown[]) => send(...args),
  getOpenRouterKeyInfo: (...args: unknown[]) => keyInfo(...args),
  forgetOpenRouterKeyInfo: () => undefined,
}));
let paidAvailable = { ok: false } as { ok: boolean; reason?: string };
let paidProvider: string | null = null;
vi.mock('../../services/jose/joseSpend', () => ({
  paidModelAvailable: () => paidAvailable,
  getPaidModelSettings: () => ({ provider: paidProvider }),
}));

const limit = await import('../../services/connectors/openRouterFreeLimit');
const {
  askOpenRouterFree, freeLimitUsedUntil, markFreeLimitUsed, getFreeLimitChoice, takeModelNotes, takeSetupNeeded, markSetupNeeded,
  nextMidnightUtc, FREE_LIMIT_LOCAL, FREE_LIMIT_PAID, FREE_LIMIT_NO_LOCAL, OPENROUTER_BUSY, setWaitForTests,
} = limit;

const say = [{ role: 'user', content: 'Hello?' }];
const answer = (content = 'Hi') => ({ ok: true, content, model: 'a/x:free', costUsd: 0, usage: { promptTokens: 1, completionTokens: 1 } });
const daily = (extra: Record<string, unknown> = {}) => ({ ok: false, kind: 'rate_limited', message: 'Rate limit exceeded', providerLimited: false, ...extra });
const NOW = Date.parse('2026-10-30T15:00:00Z');

describe('OpenRouter free limit', () => {
  const waits: number[] = [];
  beforeEach(() => {
    localStorage.clear();
    send.mockReset();
    keyInfo.mockReset();
    paidAvailable = { ok: false };
    paidProvider = null;
    waits.length = 0;
    setWaitForTests(async (ms: number) => { waits.push(ms); });
    takeModelNotes('hector');
    takeSetupNeeded('hector');
  });

  it('answers with the free model while there are free requests', async () => {
    send.mockResolvedValueOnce(answer('Hello there'));
    expect(await askOpenRouterFree('hector', say, 'a/x:free', NOW)).toEqual({ kind: 'answer', content: 'Hello there', model: 'a/x:free' });
  });

  it('a daily limit switches to this computer and is remembered until the reset', async () => {
    send.mockResolvedValueOnce(daily({ resetMs: NOW + 3600_000 }));
    keyInfo.mockResolvedValueOnce({ freeUsed: 50, freeLimit: 50, freeRemaining: 0, isFreeTier: true });
    expect(await askOpenRouterFree('hector', say, 'a/x:free', NOW)).toEqual({ kind: 'local' });
    expect(freeLimitUsedUntil(NOW)).toBe(NOW + 3600_000);
    // The next step doesn't ask OpenRouter until the reset.
    expect(await askOpenRouterFree('hector', say, 'a/x:free', NOW + 60_000)).toEqual({ kind: 'local' });
    expect(send).toHaveBeenCalledTimes(1);
    expect(freeLimitUsedUntil(NOW + 3600_000)).toBeNull();
  });

  it('without a reset time, the limit counts until the next midnight UTC', async () => {
    send.mockResolvedValueOnce(daily());
    keyInfo.mockResolvedValueOnce(null);
    await askOpenRouterFree('hector', say, 'a/x:free', NOW);
    expect(freeLimitUsedUntil(NOW)).toBe(Date.parse('2026-10-31T00:00:00Z'));
    expect(nextMidnightUtc(NOW)).toBe(Date.parse('2026-10-31T00:00:00Z'));
  });

  it('the per-minute limit is not the daily one: it waits once and asks again', async () => {
    send.mockResolvedValueOnce(daily({ retryAfterSecs: 30 })).mockResolvedValueOnce(answer('Later answer'));
    keyInfo.mockResolvedValueOnce({ freeUsed: 20, freeLimit: 50, freeRemaining: 30, isFreeTier: true });
    expect(await askOpenRouterFree('hector', say, 'a/x:free', NOW)).toEqual({ kind: 'answer', content: 'Later answer', model: 'a/x:free' });
    expect(waits).toEqual([30_000]);
    expect(freeLimitUsedUntil(NOW)).toBeNull();
  });

  it("a second per-minute refusal says OpenRouter is busy", async () => {
    send.mockResolvedValue(daily());
    keyInfo.mockResolvedValue({ freeUsed: 20, freeLimit: 50, freeRemaining: 30, isFreeTier: true });
    await expect(askOpenRouterFree('hector', say, 'a/x:free', NOW)).rejects.toThrow(OPENROUTER_BUSY);
    expect(waits).toEqual([20_000]);
  });

  it("the model's own provider being busy is waited for once too", async () => {
    send.mockResolvedValueOnce(daily({ providerLimited: true, retryAfterSecs: 120 })).mockResolvedValueOnce(answer());
    expect((await askOpenRouterFree('hector', say, 'a/x:free', NOW)).kind).toBe('answer');
    expect(waits).toEqual([60_000]);
    expect(keyInfo).not.toHaveBeenCalled();
  });

  it('another failure is passed on as it is', async () => {
    send.mockResolvedValueOnce({ ok: false, kind: 'key_refused', message: 'OpenRouter refused the key. Check it in Settings → Connectors.' });
    await expect(askOpenRouterFree('hector', say, 'a/x:free', NOW)).rejects.toThrow('OpenRouter refused the key.');
  });

  it('asks for a paid model when that is the choice and OpenRouter is the paid model', async () => {
    localStorage.setItem('alphonso_settings', JSON.stringify({ openRouterFreeLimit: 'paid' }));
    paidAvailable = { ok: true };
    paidProvider = 'openrouter';
    markFreeLimitUsed(NOW + 1000);
    await expect(askOpenRouterFree('hector', say, 'a/x:free', NOW)).rejects.toThrow(FREE_LIMIT_PAID);
    expect(takeModelNotes('hector')).toEqual([FREE_LIMIT_PAID]);
  });

  it('runs on this computer when the paid model is Claude, or paid models are off', async () => {
    localStorage.setItem('alphonso_settings', JSON.stringify({ openRouterFreeLimit: 'paid' }));
    markFreeLimitUsed(NOW + 1000);
    paidAvailable = { ok: true };
    paidProvider = 'claude';
    expect(await askOpenRouterFree('hector', say, 'a/x:free', NOW)).toEqual({ kind: 'local' });
    paidProvider = 'openrouter';
    paidAvailable = { ok: false, reason: 'Paid models are off in Settings.' };
    expect(await askOpenRouterFree('hector', say, 'a/x:free', NOW)).toEqual({ kind: 'local' });
  });

  it('the choice is "local" unless "paid" was chosen', () => {
    expect(getFreeLimitChoice()).toBe('local');
    localStorage.setItem('alphonso_settings', JSON.stringify({ openRouterFreeLimit: 'paid' }));
    expect(getFreeLimitChoice()).toBe('paid');
    localStorage.setItem('alphonso_settings', JSON.stringify({ openRouterFreeLimit: 'something' }));
    expect(getFreeLimitChoice()).toBe('local');
  });

  it('notes and setup reasons are kept per agent and taken once', () => {
    limit.noteModel('hector', FREE_LIMIT_LOCAL('llama3.2:3b'));
    markSetupNeeded('hector', FREE_LIMIT_NO_LOCAL);
    expect(takeModelNotes('hector')).toEqual(["OpenRouter's free limit for today is used up; this step ran on llama3.2:3b on this computer."]);
    expect(takeModelNotes('hector')).toEqual([]);
    expect(takeSetupNeeded('hector')).toBe(FREE_LIMIT_NO_LOCAL);
    expect(takeSetupNeeded('hector')).toBeNull();
    expect(takeModelNotes('nova')).toEqual([]);
  });
});
