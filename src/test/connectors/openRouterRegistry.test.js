// OpenRouter (2026-10-30): registered beside NVIDIA and Gemini; its free use passes Zero-Cost
// Mode (paid OpenRouter steps are gated per step instead); the Health Monitor checks it live.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const keyInfo = vi.fn();
vi.mock('../../services/connectors/openRouterConnector', () => ({ getOpenRouterKeyInfo: (...a) => keyInfo(...a) }));
let savedKey = '';
vi.mock('../../services/connectors/connectorAuth.js', async (orig) => ({
  ...(await orig()),
  getConnectorCredential: vi.fn((id, key) => (id === 'openrouter' && key === 'OPENROUTER_API_KEY' ? savedKey : '')),
}));

const { listConnectors } = await import('../../services/connectors/connectorRegistry.js');
const { evaluatePolicyGate } = await import('../../services/policyEnforcementService');
const { checkConnectorHealth } = await import('../../services/connectorHealthCheckService');

describe('OpenRouter as a connector', () => {
  beforeEach(() => {
    localStorage.clear();
    keyInfo.mockReset();
    savedKey = '';
  });

  it('is registered with its key', () => {
    const entry = listConnectors().find((c) => c.id === 'openrouter');
    expect(entry).toMatchObject({ name: 'OpenRouter', requiredEnv: ['OPENROUTER_API_KEY'] });
  });

  it('free use passes Zero-Cost Mode', () => {
    localStorage.setItem('alphonso_settings', JSON.stringify({ zeroCostMode: true }));
    const gate = evaluatePolicyGate({ connectorId: 'openrouter', actionType: 'chat', commandPreview: '{}', approved: false, auth: { enabled: false, isAuthorized: false } });
    expect(gate.ok).toBe(true);
  });

  it('the Health Monitor checks it live and says the free requests left', async () => {
    savedKey = 'or-key';
    keyInfo.mockResolvedValueOnce({ freeUsed: 4, freeLimit: 50, freeRemaining: 46, isFreeTier: false });
    const result = await checkConnectorHealth('openrouter');
    expect(result).toMatchObject({ ok: true, checked: 'live', message: 'OpenRouter answered: 46 free requests left today.' });
  });

  it('says what to set up without a key', async () => {
    const result = await checkConnectorHealth('openrouter');
    expect(result).toMatchObject({ ok: false, message: 'No OpenRouter key saved. Add it in Settings → Connectors.' });
  });

  it('says plainly when the key is refused', async () => {
    savedKey = 'or-key';
    keyInfo.mockResolvedValueOnce(null);
    const result = await checkConnectorHealth('openrouter');
    expect(result).toMatchObject({ ok: false, checked: 'live', message: 'OpenRouter did not answer for this key. Check it in Settings → Connectors.' });
  });
});
