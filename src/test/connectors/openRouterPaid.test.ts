// OpenRouter (2026-10-30): the paid models offered in Settings → Approvals → Allow paid models,
// with OpenRouter's own prices. Only models the account can use (OpenRouter's /models/user),
// with both prices listed and a text answer; never a free one.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../services/connectors/connectorAuth.js', () => ({
  getConnectorCredential: vi.fn((id: string, key: string) => (id === 'openrouter' && key === 'OPENROUTER_API_KEY' ? 'or-key' : '')),
}));
vi.mock('../../services/policyEnforcementService.js', () => ({ evaluatePolicyGate: vi.fn(() => ({ ok: true })) }));
const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }));

const { resetOpenRouterCacheForTests, listOpenRouterUserModels } = await import('../../services/connectors/openRouterConnector');
const { paidModelChoices, paidModelLabel } = await import('../../services/connectors/openRouterPaid');

const row = (id: string, prompt: string, completion: string, out: string[] = ['text']) => ({
  id, name: id.toUpperCase(), context_length: 32000, pricing: { prompt, completion }, architecture: { output_modalities: out },
});
const answer = (data: unknown[]) => ({ ok: true, httpStatus: 200, error: null, body: JSON.stringify({ data }), retryAfterSecs: null, resetMs: null });

describe('OpenRouter paid models', () => {
  beforeEach(() => {
    invoke.mockReset();
    resetOpenRouterCacheForTests();
    (window as any).__TAURI_INTERNALS__ = {};
  });
  afterEach(() => {
    delete (window as any).__TAURI_INTERNALS__;
  });

  it('reads the models this account can use', async () => {
    invoke.mockResolvedValueOnce(answer([row('b/y', '0.000001', '0.000002')]));
    const models = await listOpenRouterUserModels();
    expect(models.map((m) => m.id)).toEqual(['b/y']);
    expect(invoke.mock.calls[0][1].path).toBe('models/user');
  });

  it("falls back to OpenRouter's whole list when the account's can't be read", async () => {
    invoke.mockResolvedValueOnce({ ok: false, httpStatus: 401, error: null, body: '{}', retryAfterSecs: null, resetMs: null });
    invoke.mockResolvedValueOnce(answer([row('c/z', '0.000003', '0.000004')]));
    expect((await listOpenRouterUserModels()).map((m) => m.id)).toEqual(['c/z']);
    expect(invoke.mock.calls[1][1].path).toBe('models');
  });

  it('offers paid text models with both prices, never free ones or ones without a price', async () => {
    invoke.mockResolvedValueOnce(answer([
      row('b/y', '0.000001', '0.000002'),
      row('a/x:free', '0', '0'),
      row('openrouter/auto', '-1', '-1'),
      row('google/lyria-3', '0', '0', ['audio']),
      row('m/n', '0.0000005', '0.0000015', ['text', 'image']),
      row('pics/only', '0.00001', '0.00002', ['image']),
    ]));
    const choices = paidModelChoices(await listOpenRouterUserModels());
    expect(choices).toEqual([
      { id: 'b/y', label: 'B/Y ($1.00 in, $2.00 out per million tokens)', inputPerMillionUsd: 1, outputPerMillionUsd: 2 },
      { id: 'm/n', label: 'M/N ($0.50 in, $1.50 out per million tokens)', inputPerMillionUsd: 0.5, outputPerMillionUsd: 1.5 },
    ]);
  });

  it('labels a price below a cent plainly', () => {
    expect(paidModelLabel('Tiny', 0.002, 0.004)).toBe('Tiny ($0.002 in, $0.004 out per million tokens)');
  });
});
