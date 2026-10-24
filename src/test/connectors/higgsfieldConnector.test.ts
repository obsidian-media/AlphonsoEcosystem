// Phase 4b: Higgsfield is a paid connector; the user pastes the model ids from the Console.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }));
const creds: Record<string, string> = {};
vi.mock('../../services/connectors/connectorAuth', () => ({ getConnectorCredential: (_c: string, k: string) => creds[k] || '' }));

import { higgsfieldAvailable, higgsfieldModels, testHiggsfieldModel, HIGGSFIELD_NOT_SET_UP } from '../../services/connectors/higgsfieldConnector';
import { listPaidOrMeteredConnectors, classifyConnectorRisk } from '../../services/policyEnforcementService';
import { DEFAULT_CONNECTORS } from '../../services/connectors/connectorRegistry';

beforeEach(() => {
  invoke.mockReset();
  for (const k of Object.keys(creds)) delete creds[k];
  localStorage.clear();
  localStorage.setItem('alphonso_settings', JSON.stringify({ zeroCostMode: false }));
});

describe('Higgsfield connector', () => {
  it('is a registered, paid, high-risk connector', () => {
    expect(DEFAULT_CONNECTORS.some((c: { id: string; requiredEnv: string[] }) => c.id === 'higgsfield' && c.requiredEnv.includes('HIGGSFIELD_KEY_SECRET'))).toBe(true);
    expect(listPaidOrMeteredConnectors()).toContain('higgsfield');
    expect(classifyConnectorRisk('higgsfield', 'generate')).toBe('high');
  });

  it('is available with both keys and Zero-Cost Mode off', () => {
    expect(higgsfieldAvailable()).toEqual({ ok: false, reason: HIGGSFIELD_NOT_SET_UP });
    creds.HIGGSFIELD_KEY_ID = 'id';
    creds.HIGGSFIELD_KEY_SECRET = 'secret';
    expect(higgsfieldAvailable()).toEqual({ ok: true });
    localStorage.setItem('alphonso_settings', JSON.stringify({ zeroCostMode: true }));
    expect(higgsfieldAvailable().ok).toBe(false);
  });

  it('reads the pasted model ids and their extra settings; a broken extra box is reported, not used', () => {
    creds.HIGGSFIELD_PICTURE_MODEL = ' higgsfield-ai/soul/v2/standard ';
    creds.HIGGSFIELD_PICTURE_EXTRA = '{"quality":"high"}';
    creds.HIGGSFIELD_CLIP_MODEL = 'kling-video/v2.1/pro/image-to-video';
    creds.HIGGSFIELD_CLIP_EXTRA = '{not json';
    expect(higgsfieldModels()).toEqual({
      picture: 'higgsfield-ai/soul/v2/standard', pictureExtra: { quality: 'high' },
      clip: 'kling-video/v2.1/pro/image-to-video', clipExtraProblem: 'The clip model’s extra settings are not valid JSON.',
    });
  });

  it('Test sends the model and its extra settings to the backend with the saved keys', async () => {
    creds.HIGGSFIELD_KEY_ID = 'id';
    creds.HIGGSFIELD_KEY_SECRET = 'secret';
    invoke.mockResolvedValue({ ok: true, usd: 0.12 });
    expect(await testHiggsfieldModel('m/x', { a: 1 })).toEqual({ ok: true, usd: 0.12 });
    expect(invoke).toHaveBeenCalledWith('higgsfield_test', { model: 'm/x', extra: { a: 1 }, keys: { keyId: 'id', keySecret: 'secret' } });
  });
});
