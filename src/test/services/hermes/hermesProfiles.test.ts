import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hermes gateway (2026-10-30), Task 3: setting up and removing an agent's Hermes profile.
const invoke = vi.fn();
let desktop = true;
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a), isTauri: () => desktop }));

const providers: Record<string, { provider: string; model?: string }> = {};
vi.mock('../../../services/modelSelectionService', () => ({
  getAgentProvider: (agent: string) => providers[agent] || { provider: 'ollama' },
  setAgentProvider: (agent: string, config: { provider: string }) => { providers[agent] = config; },
}));
const saved: Record<string, { url: string; key: string } | undefined> = {};
vi.mock('../../../services/connectors/hermesAgentConnector', () => ({
  saveHermesAgentEndpoint: (agent: string, url: string, key: string) => { saved[agent] = url || key ? { url, key } : undefined; },
}));
const policy = { zeroCostMode: false };
vi.mock('../../../services/policyEnforcementService', () => ({ getRuntimePolicySettings: () => policy }));
vi.mock('../../../lib/ollama', () => ({
  getConfiguredOllamaEndpoint: () => 'http://127.0.0.1:11434',
  getConfiguredOllamaModel: () => 'qwen2.5:7b',
}));
vi.mock('../../../services/connectors/openRouterConnector', () => ({
  OPENROUTER_CHOOSE_FREE: 'openrouter/free',
  isOpenRouterConfigured: () => true,
}));

const { setUpProfile, removeProfile, profileKeyRef, PAID_IN_ZERO_COST, NOT_DESKTOP, profileModelChoices } = await import('../../../services/hermes/hermesProfiles');

const info = { agent: 'hector', port: 8700, url: 'http://127.0.0.1:8700', folder: 'D:/r/hermes-profiles/hector', running: false };

describe('Hermes profiles in the app', () => {
  beforeEach(() => {
    invoke.mockReset();
    desktop = true;
    policy.zeroCostMode = false;
    localStorage.clear();
    for (const k of Object.keys(providers)) delete providers[k];
    for (const k of Object.keys(saved)) delete saved[k];
  });

  it('sets one up with the agent\'s model and switches the agent to it', async () => {
    providers.hector = { provider: 'nvidia_nim' };
    invoke.mockResolvedValueOnce(info);
    const r = await setUpProfile('hector');
    expect(r).toEqual({ ok: true, profile: info });
    const [cmd, args] = invoke.mock.calls[0];
    expect(cmd).toBe('hermes_profile_setup');
    expect(args.agent).toBe('hector');
    expect(args.model).toEqual({ kind: 'ollama', endpoint: 'http://127.0.0.1:11434', model: 'qwen2.5:7b' });
    expect(args.persona.owns).toMatch(/^Finding facts/);
    expect(args.persona.never).toBeTruthy();
    expect(args.persona.actionLine).toMatch(/^If your work needs something sent/);
    // The window keeps the address and a reference, never the key itself.
    expect(saved.hector).toEqual({ url: info.url, key: profileKeyRef('hector') });
    expect(profileKeyRef('hector')).toBe('alphonso-profile:hector');
    expect(providers.hector).toEqual({ provider: 'hermes' });
  });

  it('leaves the agent\'s provider alone when not used now', async () => {
    providers.hector = { provider: 'gemini' };
    invoke.mockResolvedValueOnce(info);
    await setUpProfile('hector', { useNow: false });
    expect(providers.hector).toEqual({ provider: 'gemini' });
  });

  it('refuses a paid OpenRouter model in Zero-Cost Mode before asking the backend', async () => {
    policy.zeroCostMode = true;
    const r = await setUpProfile('hector', { model: { kind: 'openrouter', model: 'anthropic/claude-x' } });
    expect(r).toEqual({ ok: false, reason: PAID_IN_ZERO_COST });
    expect(PAID_IN_ZERO_COST).toBe('That model is paid and Zero-Cost Mode is on.');
    expect(invoke).not.toHaveBeenCalled();
    invoke.mockResolvedValueOnce(info);
    expect((await setUpProfile('hector', { model: { kind: 'openrouter', model: 'meta/llama:free' } })).ok).toBe(true);
    invoke.mockResolvedValueOnce(info);
    expect((await setUpProfile('hector', { model: { kind: 'openrouter', model: 'openrouter/free' } })).ok).toBe(true);
  });

  it('removes it and gives the agent back its earlier provider', async () => {
    providers.hector = { provider: 'gemini' };
    invoke.mockResolvedValueOnce(info);
    await setUpProfile('hector');
    invoke.mockResolvedValueOnce(undefined);
    const r = await removeProfile('hector');
    expect(r).toEqual({ ok: true });
    expect(invoke.mock.calls[1]).toEqual(['hermes_profile_remove', { agent: 'hector' }]);
    expect(providers.hector).toEqual({ provider: 'gemini' });
    expect(saved.hector).toBeUndefined();
  });

  it('says why when the backend refuses', async () => {
    invoke.mockRejectedValueOnce('Install Hermes Agent in Runtime Hub first.');
    expect(await setUpProfile('hector')).toEqual({ ok: false, reason: 'Install Hermes Agent in Runtime Hub first.' });
    expect(providers.hector).toBeUndefined();
  });

  it('needs the desktop app', async () => {
    desktop = false;
    expect(await setUpProfile('hector')).toEqual({ ok: false, reason: NOT_DESKTOP });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('offers the agent\'s own model first, and OpenRouter\'s free choice when set up', async () => {
    const choices = await profileModelChoices();
    expect(choices[0]).toEqual({ kind: 'ollama', model: 'qwen2.5:7b' });
    expect(choices).toContainEqual({ kind: 'openrouter', model: 'openrouter/free' });
  });
});
