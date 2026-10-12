// Guards the isolation the other specs depend on: the app under test must be
// using its own data folder, not the developer's real one. If this fails,
// stop: specs that send or save things would be writing into real app data.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { enterShell, invoke } from '../helpers.mjs';

describe('Alphonso desktop test isolation', () => {
  before(enterShell);

  it('runs on an isolated backend profile', async () => {
    const profile = process.env.ALPHONSO_E2E_PROFILE;
    expect(profile).toMatch(/^run-[a-z0-9-]+$/);
    // Force the backend to open its store, then check where it landed.
    expect((await invoke('kv_get', { key: 'e2e_isolation_probe' })).ok).toBe(true);
    const root = process.env.APPDATA || process.env.XDG_DATA_HOME;
    if (root) expect(existsSync(join(root, `com.shayan.alphonso.e2e.${profile}`))).toBe(true);
  });

  it('starts with no chat history', async () => {
    await $('[data-testid="sidebar-chat-shortcut"]').click();
    await $('[data-testid="chat-compose-input"]').waitForDisplayed();
    await browser.pause(2000);
    expect((await $$('[data-testid^="chat-message-"]')).length).toBe(0);
  });
});
