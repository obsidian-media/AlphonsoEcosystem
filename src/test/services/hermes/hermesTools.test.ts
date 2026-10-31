// Hermes gateway (2026-10-30), Task 7: the resource manager starts, counts and stops Hermes profiles.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a), isTauri: () => true }));
const providers: Record<string, string> = {};
vi.mock('../../../services/modelSelectionService', () => ({ getAgentProvider: (a: string) => ({ provider: providers[a] || 'ollama' }) }));
const urls: Record<string, string> = {};
const health = vi.fn();
vi.mock('../../../services/connectors/hermesAgentConnector', () => ({
  getHermesAgentEndpoint: (a: string) => ({ url: urls[a] || '', key: 'k' }),
  getHermesAgentHealth: (a: string) => health(a),
  isLoopbackHermesUrl: (u: string) => /^http:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(u),
}));
const own: string[] = [];
vi.mock('../../../services/hermes/hermesProfiles', () => ({ listOwnProfiles: async () => own.map((agent) => ({ agent })) }));
const userProfiles: Record<string, { name: string; folder: string }> = {};
vi.mock('../../../services/hermes/userProfiles', () => ({ userProfileFor: (a: string) => userProfiles[a] || null }));
vi.mock('../../../services/connectors/connectorAuth', () => ({ getConnectorCredential: () => '' }));

const {
  hermesToolFor, hermesLocalModel, saveProfileModel, startHermesTool, stopHermesTool, hermesToolLabel,
  isHermesTool, HERMES_DIDNT_START,
} = await import('../../../services/hermes/hermesTools');

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  for (const m of [providers, urls, userProfiles]) for (const k of Object.keys(m)) delete m[k];
  own.length = 0;
  invoke.mockResolvedValue({});
});

describe('which Hermes profile a step uses', () => {
  it('is a tool on this computer only for a Hermes provider at a loopback address', () => {
    providers.hector = 'hermes';
    urls.hector = 'http://127.0.0.1:8700';
    expect(hermesToolFor('hector')).toBe('hermes:hector');
    urls.hector = 'https://box.example';
    expect(hermesToolFor('hector')).toBeNull();
    providers.hector = 'ollama';
    urls.hector = 'http://127.0.0.1:8700';
    expect(hermesToolFor('hector')).toBeNull();
    expect(isHermesTool('hermes:hector')).toBe(true);
    expect(isHermesTool('comfyui')).toBe(false);
    expect(hermesToolLabel('hermes:hector')).toBe("Hector's Hermes profile");
  });

  it("knows the local model only of a profile Alphonso set up to think with Ollama", () => {
    expect(hermesLocalModel('hector')).toBeNull();
    saveProfileModel('hector', { kind: 'ollama', model: 'qwen2.5:7b' });
    expect(hermesLocalModel('hector')).toBe('qwen2.5:7b');
    saveProfileModel('hector', { kind: 'openrouter', model: 'openrouter/free' });
    expect(hermesLocalModel('hector')).toBeNull();
    saveProfileModel('hector', null);
    expect(hermesLocalModel('hector')).toBeNull();
  });
});

describe('starting a Hermes profile', () => {
  it('does nothing when it already answers', async () => {
    health.mockResolvedValue({ ok: true });
    expect(await startHermesTool('hermes:hector')).toEqual({ ok: true });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("starts a profile Alphonso set up, and waits until it answers", async () => {
    own.push('hector');
    health.mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: false }).mockResolvedValue({ ok: true });
    expect(await startHermesTool('hermes:hector', { pollMs: 1, waitMs: 1000 })).toEqual({ ok: true });
    expect(invoke).toHaveBeenCalledWith('hermes_profile_start', { agent: 'hector', openrouterKey: null });
  });

  it("starts the user's connected profile with the user's own Hermes", async () => {
    userProfiles.hector = { name: 'work', folder: 'C:/h/profiles/work' };
    health.mockResolvedValueOnce({ ok: false }).mockResolvedValue({ ok: true });
    expect(await startHermesTool('hermes:hector', { pollMs: 1, waitMs: 1000 })).toEqual({ ok: true });
    expect(invoke).toHaveBeenCalledWith('hermes_user_profile_start', { agent: 'hector', name: 'work' });
  });

  it('says so when it never answers', async () => {
    own.push('hector');
    health.mockResolvedValue({ ok: false });
    expect(HERMES_DIDNT_START('hector')).toBe("Hector's Hermes profile didn't start. Open Runtime Hub to see its log.");
    expect(await startHermesTool('hermes:hector', { pollMs: 1, waitMs: 20 })).toEqual({ ok: false, reason: HERMES_DIDNT_START('hector') });
  });

  it("passes on the backend's reason, e.g. no Hermes install", async () => {
    userProfiles.hector = { name: 'work', folder: 'x' };
    health.mockResolvedValue({ ok: false });
    invoke.mockRejectedValue("Your Hermes install wasn't found.");
    expect(await startHermesTool('hermes:hector', { pollMs: 1, waitMs: 20 })).toEqual({ ok: false, reason: "Your Hermes install wasn't found." });
  });

  it('starts nothing for a profile that is neither ours nor connected', async () => {
    health.mockResolvedValue({ ok: false });
    expect(await startHermesTool('hermes:hector', { pollMs: 1, waitMs: 20 })).toEqual({ ok: true });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('stops one through the backend', async () => {
    expect(await stopHermesTool('hermes:hector')).toEqual({ ok: true });
    expect(invoke).toHaveBeenCalledWith('hermes_profile_stop', { agent: 'hector' });
  });
});
