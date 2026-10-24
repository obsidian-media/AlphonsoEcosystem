// Phase 4b: ElevenLabs is a paid connector; its voices and models come from the user's account.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }));
const creds: Record<string, string> = {};
vi.mock('../../services/connectors/connectorAuth', () => ({ getConnectorCredential: (_c: string, k: string) => creds[k] || '' }));

import { isElevenLabsConfigured, listElevenLabsVoices, listElevenLabsModels } from '../../services/connectors/elevenLabsConnector';
import { listPaidOrMeteredConnectors, classifyConnectorRisk } from '../../services/policyEnforcementService';
import { DEFAULT_CONNECTORS } from '../../services/connectors/connectorRegistry';

beforeEach(() => {
  invoke.mockReset();
  for (const k of Object.keys(creds)) delete creds[k];
});

describe('ElevenLabs connector', () => {
  it('is a registered, paid, high-risk connector', () => {
    expect(DEFAULT_CONNECTORS.some((c: { id: string; requiredEnv: string[] }) => c.id === 'elevenlabs' && c.requiredEnv.includes('ELEVENLABS_API_KEY'))).toBe(true);
    expect(listPaidOrMeteredConnectors()).toContain('elevenlabs');
    expect(classifyConnectorRisk('elevenlabs', 'speak')).toBe('high');
  });

  it('is configured once a key is saved', () => {
    expect(isElevenLabsConfigured()).toBe(false);
    creds.ELEVENLABS_API_KEY = 'k';
    expect(isElevenLabsConfigured()).toBe(true);
  });

  it("lists the account's voices and models through the backend, with the saved key", async () => {
    creds.ELEVENLABS_API_KEY = 'k';
    invoke.mockImplementation(async (cmd: string) => (cmd === 'elevenlabs_voices'
      ? { ok: true, voices: [{ id: 'v2', name: 'My voice', cloned: true }] }
      : { ok: true, models: [{ id: 'eleven_multilingual_v2', name: 'Multilingual v2' }] }));
    expect(await listElevenLabsVoices()).toEqual({ ok: true, voices: [{ id: 'v2', name: 'My voice', cloned: true }] });
    expect(invoke).toHaveBeenCalledWith('elevenlabs_voices', { keyOverride: 'k' });
    expect((await listElevenLabsModels()).models?.[0].id).toBe('eleven_multilingual_v2');
  });

  it('without a key it says what to set up and asks nothing', async () => {
    expect(await listElevenLabsVoices()).toEqual({ ok: false, reason: 'Add your ElevenLabs key in Settings → Connectors → ElevenLabs.' });
    expect(invoke).not.toHaveBeenCalled();
  });
});
