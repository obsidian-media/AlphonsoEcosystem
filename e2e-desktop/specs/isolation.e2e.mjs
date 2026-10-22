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

  it('sees none of the developer real credentials', async () => {
    // QA Bug 37: the test app used to inherit real tokens from the repo's
    // .env (loaded by the WebdriverIO CLI and by the app itself) and from the
    // user's environment.
    const names = ['GITHUB_TOKEN', 'SLACK_BOT_TOKEN', 'NVIDIA_API_KEY', 'GEMINI_API_KEY', 'DASHSCOPE_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'TELEGRAM_BOT_TOKEN', 'TAURI_SIGNING_PRIVATE_KEY'];
    const presence = await invoke('check_env_vars_presence', { names });
    expect(presence.ok).toBe(true);
    const leaked = names.filter((name) => presence.value?.[name]);
    expect(leaked).toEqual([]);
  });

  it('starts with no chat history', async () => {
    await $('[data-testid="sidebar-chat-shortcut"]').click();
    await $('[data-testid="chat-compose-input"]').waitForDisplayed();
    await browser.pause(2000);
    expect((await $$('[data-testid^="chat-message-"]')).length).toBe(0);
  });
});
