import { describe, it, expect, vi, beforeEach } from 'vitest';

// QA batch 1 (live Slack check, 2026-10-29): 4 s after every start the runtime ledger writes the
// connector sign-on profiles back as a list of rows (`[{ id: 'auth-slack', enabled: true, … }]`),
// while the app reads them keyed by connector. Every connector then read as not enabled, and a
// Slack send was refused with "not_authenticated" until Save & Enable was pressed again.
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => null) }));

const KEY = 'alphonso_connector_auth_profiles_v1';

beforeEach(() => localStorage.clear());

describe('connector sign-on profiles saved as rows', () => {
  it('a profile written back as rows still counts', async () => {
    localStorage.setItem(KEY, JSON.stringify([
      { id: 'auth-slack', enabled: true, allowlist: [], mode: 'allowlist_required' },
      { id: 'auth-telegram', enabled: false, allowlist: ['42'], mode: 'allowlist_required' },
    ]));
    const auth = await import('../../services/connectors/connectorAuth');
    expect(auth.readAuthProfiles().slack.enabled).toBe(true);
    expect(auth.readAuthProfiles().telegram.allowlist).toEqual(['42']);
    expect(auth.isConnectorAuthenticated('slack').ok).toBe(true);
  });

  it('saving after that keeps every connector keyed by its name', async () => {
    localStorage.setItem(KEY, JSON.stringify([{ id: 'auth-slack', enabled: true, allowlist: [], mode: 'allowlist_required' }]));
    const auth = await import('../../services/connectors/connectorAuth');
    auth.updateConnectorAuthProfile('discord', { enabled: true });
    const stored = JSON.parse(localStorage.getItem(KEY));
    expect(Array.isArray(stored)).toBe(false);
    expect(stored.slack.enabled).toBe(true);
    expect(stored.discord.enabled).toBe(true);
    expect(stored['0']).toBeUndefined();
  });
});
