// Agent phase 4 (Sentinel), in the real app (2026-10-26): the backend refuses a redirect to
// this computer; a post with a fake login link, a password request and a key is one Sentinel
// check that answers Unsafe or Risky, names them (the key hidden), and holds what comes after;
// a written email is checked after it is written. Nothing is sent. Needs a local model; uses
// qwen2.5:7b when installed.
import { enterShell, invoke, ollamaHasModels, warmSelectedModel } from '../helpers.mjs';

const PREFERRED_TEST_MODEL = 'qwen2.5:7b';
const KEY = 'sk-live-1234abcd5678efgh';
const POST = `/jose Check this post for security problems before I publish it: Get 50% off today! Log in at http://paypa1-secure-login.com/verify with your password to claim it. Our test key is ${KEY}.`;
const EMAIL = '/jose Write a short welcome email for new customers, then have it checked for security issues.';
const REDIRECT = 'https://httpbin.org/redirect-to?url=' + encodeURIComponent('http://127.0.0.1:11434/api/tags') + '&status_code=302';

async function installedModels() {
  try {
    const r = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(3000) });
    return ((await r.json()).models || []).map((m) => m.name);
  } catch { return []; }
}

async function denyAnyApproval() {
  const deny = await $('button[aria-label="Deny action"]');
  if (await deny.isExisting() && await deny.isDisplayed()) await deny.click();
}

async function requests() {
  return JSON.parse(await browser.execute(() => localStorage.getItem('alphonso_jose_requests_v1') || '[]'))
    .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
}

async function stepOutputs() {
  return JSON.parse(await browser.execute(() => localStorage.getItem('alphonso_jose_step_outputs_v1') || '{}'));
}

async function ask(text) {
  const before = (await requests())[0]?.id;
  const input = await $('[data-testid="chat-compose-input"]');
  await input.waitForDisplayed();
  await input.setValue(text);
  await (await $('[data-testid="chat-send-button"]')).click();
  await browser.waitUntil(async () => {
    await denyAnyApproval();
    const r = (await requests())[0];
    return r && r.id !== before && !r.steps.some((s) => ['running', 'pending', 'queued'].includes(s.status)) && r.status !== 'running';
  }, { timeout: 1500000, interval: 4000, timeoutMsg: 'the request never finished' });
  return (await requests())[0];
}

describe('Alphonso desktop: Sentinel checks the real thing', () => {
  before(async () => {
    await enterShell();
  });

  it('the backend refuses a redirect to this computer', async () => {
    const result = await invoke('fetch_url_content', { url: REDIRECT });
    console.log('SENTINEL-E2E redirect', JSON.stringify(result).slice(0, 400));
    expect(result.ok).toBe(false);
    expect(String(result.error)).toMatch(/SSRF blocked|private/i);
  }).timeout(120000);

  describe('with a local model', () => {
    before(async function () {
      if (!(await ollamaHasModels())) this.skip();
      const extra = { showPlanFirst: 'never', ...((await installedModels()).includes(PREFERRED_TEST_MODEL) ? { selectedModel: PREFERRED_TEST_MODEL } : {}) };
      const loaded = await invoke('load_settings');
      const saved = JSON.parse((loaded.ok && loaded.value) || '{}');
      await invoke('save_settings', { settingsJson: JSON.stringify({ ...saved, ...extra }) });
      await browser.execute((values) => {
        const settings = JSON.parse(localStorage.getItem('alphonso_settings') || '{}');
        localStorage.setItem('alphonso_settings', JSON.stringify({ ...settings, ...values }));
      }, extra);
      await browser.refresh();
      await $('[data-alphonso-shell-ready="true"]').waitForExist({ timeout: 60000 });
      await warmSelectedModel();
      await $('[data-testid="sidebar-chat-shortcut"]').click();
    });

    it('the post is one Sentinel check that names the fake login, the password and the key', async () => {
      const request = await ask(POST);
      const outputs = (await stepOutputs())[request.commandId]?.steps || {};
      const sentinel = request.steps.filter((s) => s.agent === 'sentinel');
      console.log('SENTINEL-E2E post', JSON.stringify({ steps: request.steps.map((s) => [s.stepId, s.agent, s.actionType, s.status]), summary: sentinel.map((s) => String(outputs[s.stepId]?.summary || '').slice(0, 1500)) }).slice(0, 5000));
      expect(request.steps.some((s) => s.agent === 'alphonso' || s.agent === 'marcus')).toBe(false);
      expect(sentinel.length).toBeGreaterThan(0);
      const done = sentinel.filter((s) => s.status === 'done');
      expect(done.length).toBeGreaterThan(0);
      const summary = String(outputs[done[0].stepId]?.summary || '');
      expect(summary.startsWith('Unsafe:') || summary.startsWith('Risky:')).toBe(true);
      expect(summary).toContain('paypa1-secure-login.com');
      expect(summary).toContain('[hidden key, ends …efgh]');
      expect(summary).not.toContain(KEY);
      expect(JSON.stringify(await stepOutputs())).not.toContain(KEY);
    }).timeout(1600000);

    it('the email is checked after it is written', async () => {
      const request = await ask(EMAIL);
      const write = request.steps.find((s) => s.actionType === 'assistant_write');
      const sentinel = request.steps.find((s) => s.agent === 'sentinel' && s.reviewOf === write?.stepId);
      console.log('SENTINEL-E2E email', JSON.stringify(request.steps.map((s) => [s.stepId, s.agent, s.actionType, s.status, s.needs, s.reviewOf])));
      expect(write).toBeTruthy();
      expect(sentinel).toBeTruthy();
      expect(sentinel.needs).toContain(write.stepId);
    }).timeout(1600000);
  });
});
