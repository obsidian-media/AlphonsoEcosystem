import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hermes gateway (2026-10-30), Task 4: the user's own Hermes profiles and their warnings.
const invoke = vi.fn();
let desktop = true;
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a), isTauri: () => desktop }));
const saved: Record<string, { url: string; key: string }> = {};
vi.mock('../../../services/connectors/hermesAgentConnector', () => ({
  saveHermesAgentEndpoint: (agent: string, url: string, key: string) => { saved[agent] = { url, key }; },
}));

const {
  profileWarnings, findUserProfiles, connectUserProfile, userProfileFor,
  ACTS_WITHOUT_ASKING, CANT_READ, API_SERVER_OFF,
} = await import('../../../services/hermes/userProfiles');

const base = {
  name: 'research', folder: 'C:/h/profiles/research', apiServer: { on: true, port: 9100 },
  platformsOn: [] as string[], toolsetsOn: ['web', 'memory'], approvalsMode: 'manual', readable: true,
};

describe("the user's own Hermes profiles", () => {
  beforeEach(() => {
    invoke.mockReset();
    desktop = true;
    localStorage.clear();
    for (const k of Object.keys(saved)) delete saved[k];
  });

  it('warns about a messaging platform of its own, one line each', () => {
    expect(profileWarnings({ ...base, platformsOn: ['telegram', 'whatsapp'] })).toEqual([
      "Messages to this profile's own Telegram skip Alphonso's approvals.",
      "Messages to this profile's own WhatsApp skip Alphonso's approvals.",
    ]);
  });

  it('warns when the profile can change things without asking', () => {
    expect(ACTS_WITHOUT_ASKING).toBe('This profile can change things without asking.');
    expect(profileWarnings({ ...base, toolsetsOn: ['web', 'terminal'], approvalsMode: 'smart' })).toEqual([ACTS_WITHOUT_ASKING]);
    expect(profileWarnings({ ...base, toolsetsOn: ['web', 'file'] })).toEqual([ACTS_WITHOUT_ASKING]);
    // No list means Hermes's own default set, which writes files.
    expect(profileWarnings({ ...base, toolsetsOn: [] })).toEqual([ACTS_WITHOUT_ASKING]);
    expect(profileWarnings({ ...base, toolsetsOn: ['web', 'terminal'], approvalsMode: 'manual' })).toEqual([]);
    expect(profileWarnings(base)).toEqual([]);
  });

  it("can't connect a profile whose settings it can't read", async () => {
    expect(CANT_READ).toBe("Can't read this profile's settings.");
    const broken = { ...base, readable: false, apiServer: { on: false } };
    expect(profileWarnings(broken)).toEqual([CANT_READ]);
    invoke.mockResolvedValueOnce([broken]);
    expect(await connectUserProfile('research', 'hector', 'k'.repeat(32))).toEqual({ ok: false, reason: CANT_READ });
    expect(saved.hector).toBeUndefined();
  });

  it('lists each profile with whether it answers and its warnings', async () => {
    invoke.mockImplementation(async (cmd: string, args: any) => {
      if (cmd === 'hermes_find_user_profiles') return [base, { ...base, name: 'off', apiServer: { on: false } }];
      if (cmd === 'connector_hermes_agent_request') return { ok: args.url === 'http://127.0.0.1:9100/health', httpStatus: 200, body: '{}', error: null };
      return null;
    });
    const list = await findUserProfiles();
    expect(list.map((p) => [p.name, p.answering, p.warnings])).toEqual([['research', true, []], ['off', false, []]]);
    const health = invoke.mock.calls.find((c) => c[0] === 'connector_hermes_agent_request');
    expect(health?.[1]).toMatchObject({ method: 'GET', headers: {} });
  });

  // 2.11.0 QA (owner, 2026-11-01): the key comes from the profile's .env on click, kept by the
  // backend in the keychain; the window only ever holds a reference to it.
  it('connects a profile through the backend, which keeps the key, and remembers which one it is', async () => {
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'hermes_find_user_profiles') return [base];
      if (cmd === 'hermes_user_profile_link') return { url: 'http://127.0.0.1:9100', keyRef: 'alphonso-user-profile:hector' };
      return null;
    });
    expect(await connectUserProfile('research', 'hector', '')).toEqual({ ok: true });
    expect(invoke).toHaveBeenCalledWith('hermes_user_profile_link', { agent: 'hector', name: 'research', key: null });
    expect(saved.hector).toEqual({ url: 'http://127.0.0.1:9100', key: 'alphonso-user-profile:hector' });
    expect(userProfileFor('hector')).toEqual({ name: 'research', folder: 'C:/h/profiles/research' });
  });

  it('passes a key you typed to the backend, and never keeps it in the window', async () => {
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'hermes_find_user_profiles') return [base];
      if (cmd === 'hermes_user_profile_link') return { url: 'http://127.0.0.1:9100', keyRef: 'alphonso-user-profile:hector' };
      return null;
    });
    expect(await connectUserProfile('research', 'hector', ' secret-key-1234567890 ')).toEqual({ ok: true });
    expect(invoke).toHaveBeenCalledWith('hermes_user_profile_link', { agent: 'hector', name: 'research', key: 'secret-key-1234567890' });
    expect(JSON.stringify(saved)).not.toContain('secret-key');
    expect(JSON.stringify(localStorage)).not.toContain('secret-key');
  });

  it("says why when the backend can't connect it, and saves nothing", async () => {
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'hermes_find_user_profiles') return [base];
      if (cmd === 'hermes_user_profile_link') throw new Error('This profile has no API_SERVER_KEY in its .env file. Type its key, or set one in Hermes.');
      return null;
    });
    expect(await connectUserProfile('research', 'hector', '')).toEqual({ ok: false, reason: 'This profile has no API_SERVER_KEY in its .env file. Type its key, or set one in Hermes.' });
    expect(saved.hector).toBeUndefined();
    invoke.mockImplementation(async () => [{ ...base, apiServer: { on: false } }]);
    expect(await connectUserProfile('research', 'nova', 'k')).toEqual({ ok: false, reason: API_SERVER_OFF });
  });
});
