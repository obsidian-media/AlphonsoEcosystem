// Jose phase 7 in the real app: a request cut off when the app closed can be cancelled on the
// board, and a running request can be stopped from Chat (finished work kept, nothing new starts).
import { expect } from '@wdio/globals';
import { enterShell, invoke, ollamaHasModels, openPage, warmSelectedModel, clickSend } from '../helpers.mjs';

const PREFERRED_TEST_MODEL = process.env.ALPHONSO_E2E_MODEL || 'qwen2.5:7b';
const savedRequests = async () => JSON.parse(await browser.execute(() => localStorage.getItem('alphonso_jose_requests_v1') || '[]'));

async function installedModels() {
  try {
    const response = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(3000) });
    return response.ok ? ((await response.json()).models || []).map((m) => m.name) : [];
  } catch {
    return [];
  }
}

async function useSettings(values) {
  const loaded = await invoke('load_settings');
  const saved = JSON.parse((loaded.ok && loaded.value) || '{}');
  await invoke('save_settings', { settingsJson: JSON.stringify({ ...saved, ...values }) });
  await browser.execute((v) => {
    const settings = JSON.parse(localStorage.getItem('alphonso_settings') || '{}');
    localStorage.setItem('alphonso_settings', JSON.stringify({ ...settings, ...v }));
  }, values);
  await browser.refresh();
  await $('[data-alphonso-shell-ready="true"]').waitForExist({ timeout: 60000 });
}

describe('Alphonso desktop: Jose phase 7', () => {
  before(async () => {
    await enterShell();
  });

  it('a request cut off when the app closed is cancelled from the board', async () => {
    const id = 'jose-request-e2e-cut';
    await browser.execute((requestId) => {
      const all = JSON.parse(localStorage.getItem('alphonso_jose_requests_v1') || '[]');
      all.push({ id: requestId, commandId: 'e2e-cut', source: 'user', text: 'Research the tide tables', kind: 'normal', status: 'interrupted', steps: [], createdAtMs: Date.now(), updatedAtMs: Date.now() });
      localStorage.setItem('alphonso_jose_requests_v1', JSON.stringify(all));
    }, id);
    await openPage('system', 'orchestrator');
    await (await $('//main//button[normalize-space(.)="Requests"]')).click();
    const item = await $('//main//button[.//div[normalize-space(.)="Research the tide tables"]]');
    await item.waitForDisplayed({ timeout: 30000 });
    await item.click();
    const cancel = await $('[data-testid="jose-cancel-request"]');
    await cancel.waitForDisplayed({ timeout: 30000 });
    await cancel.click();
    await browser.waitUntil(async () => (await savedRequests()).find((r) => r.id === id)?.status === 'cancelled', {
      timeout: 30000, timeoutMsg: 'the request was not cancelled',
    });
    const request = (await savedRequests()).find((r) => r.id === id);
    expect(request.changeLog.at(-1).text).toBe('Cancelled by you.');
  });

  it('a running request is stopped from Chat and ends "stopped"', async function () {
    if (!(await ollamaHasModels())) this.skip();
    const extra = { showPlanFirst: 'never', ...((await installedModels()).includes(PREFERRED_TEST_MODEL) ? { selectedModel: PREFERRED_TEST_MODEL } : {}) };
    await useSettings(extra);
    await warmSelectedModel();
    await $('[data-testid="sidebar-chat-shortcut"]').click();
    const before = new Set((await savedRequests()).map((r) => r.id));
    const input = await $('[data-testid="chat-compose-input"]');
    await input.waitForDisplayed();
    await input.setValue('/jose Research the history of tea, then write a long report about it, then check the report.');
    await clickSend();
    const stop = await $('[data-testid="chat-live-stop"]');
    await stop.waitForDisplayed({ timeout: 600000 });
    await stop.click();
    let request;
    await browser.waitUntil(async () => {
      request = (await savedRequests()).find((r) => !before.has(r.id));
      return request && !['running', 'queued'].includes(request.status);
    }, { timeout: 600000, interval: 2000, timeoutMsg: 'the request never ended after Stop' });
    console.log('JOSE7-E2E stop', JSON.stringify({ status: request.status, steps: request.steps.map((s) => [s.stepId, s.agent, s.status]) }));
    expect(request.status).toBe('stopped');
    expect(request.steps.some((s) => s.status === 'stopped' || s.status === 'not_run')).toBe(true);
    expect(request.changeLog.at(-1).text).toBe('Stopped by you.');
  }).timeout(1200000);
});
