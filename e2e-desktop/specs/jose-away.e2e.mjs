// Jose while you are away, in the real app (Jose redesign phase 5,
// 2026-10-23): a request cut off when the app closed shows "Carry on" in Chat
// after a restart and finishes when you press it; a request waiting for your
// approval longer than the set days expires at start. Telegram itself is
// unit-tested (no bot here). The first check needs a local model; uses
// qwen2.5:7b when installed.
import { enterShell, invoke, ollamaHasModels, warmSelectedModel } from '../helpers.mjs';

const PREFERRED_TEST_MODEL = 'qwen2.5:7b';
const DAY = 24 * 60 * 60 * 1000;

async function installedModels() {
  try {
    const response = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(3000) });
    const data = await response.json();
    return (data.models || []).map((m) => m.name);
  } catch {
    return [];
  }
}

async function useSettings(values) {
  const loaded = await invoke('load_settings');
  const saved = JSON.parse((loaded.ok && loaded.value) || '{}');
  await invoke('save_settings', { settingsJson: JSON.stringify({ ...saved, ...values }) });
  await browser.execute((extra) => {
    const settings = JSON.parse(localStorage.getItem('alphonso_settings') || '{}');
    localStorage.setItem('alphonso_settings', JSON.stringify({ ...settings, ...extra }));
  }, values);
}

const restart = async () => {
  await browser.refresh();
  await $('[data-alphonso-shell-ready="true"]').waitForExist({ timeout: 60000 });
};

async function openChat() {
  await $('[data-testid="sidebar-chat-shortcut"]').click();
  await browser.waitUntil(
    async () => !(await browser.execute(() => document.querySelector('main')?.innerText || '')).includes('Start Ollama to enable AI'),
    { timeout: 60000, timeoutMsg: 'the app never selected an Ollama model' }
  );
}

async function send(text) {
  const input = await $('[data-testid="chat-compose-input"]');
  await input.waitForDisplayed();
  await input.setValue(text);
  const button = await $('[data-testid="chat-send-button"]');
  await button.waitForClickable();
  await button.click();
}

const savedRequests = async () => JSON.parse(await browser.execute(() => localStorage.getItem('alphonso_jose_requests_v1') || '[]'));
const findRequest = async (id) => (await savedRequests()).find((r) => r.id === id);

/** Change a saved request as the app would have left it (status, a step's status, age). */
const patchRequest = (id, patch) => browser.execute((requestId, change) => {
  const all = JSON.parse(localStorage.getItem('alphonso_jose_requests_v1') || '[]');
  const request = all.find((r) => r.id === requestId);
  if (change.status) request.status = change.status;
  if (change.stepId) request.steps.find((s) => s.stepId === change.stepId).status = change.stepStatus;
  if (change.ageMs) { request.updatedAtMs -= change.ageMs; request.createdAtMs -= change.ageMs; }
  localStorage.setItem('alphonso_jose_requests_v1', JSON.stringify(all));
}, id, patch);

describe('Alphonso desktop: Jose while you are away', () => {
  before(async () => {
    await enterShell();
  });

  it('expires a request that waited longer than the set days', async () => {
    await useSettings({ joseWaitingExpiryDays: 7 });
    const id = 'jose-request-e2e-expiry';
    await browser.execute((requestId) => {
      const all = JSON.parse(localStorage.getItem('alphonso_jose_requests_v1') || '[]');
      all.push({
        id: requestId, commandId: 'jose-command-e2e-expiry', source: 'user', text: 'Post the launch video', kind: 'normal',
        status: 'waiting_approval', createdAtMs: Date.now(), updatedAtMs: Date.now(), changeLog: [],
        steps: [{ stepId: 'post', agent: 'marcus', actionType: 'distribution_execution', effects: ['publish_or_send'], needs: [], status: 'waiting_approval' }],
      });
      localStorage.setItem('alphonso_jose_requests_v1', JSON.stringify(all));
    }, id);
    await patchRequest(id, { ageMs: 8 * DAY });
    await restart();
    const request = await findRequest(id);
    expect(request.status).toBe('expired');
    expect(request.changeLog.map((c) => c.text)).toContain('Expired after 7 days without your approval.');
  });

  it('offers Carry on for a request cut off when the app closed, and finishes it', async function () {
    if (!(await ollamaHasModels())) this.skip();
    this.timeout(1800000);
    const model = (await installedModels()).includes(PREFERRED_TEST_MODEL) ? { selectedModel: PREFERRED_TEST_MODEL } : {};
    await useSettings({ ...model, showPlanFirst: 'never', effectApprovals: {} });
    await restart();
    await warmSelectedModel();
    await openChat();
    const before = (await savedRequests()).length;
    await send('Plan this fresh: suggest three names for a small coffee shop.');
    await browser.waitUntil(async () => (await savedRequests()).length > before, { timeout: 600000, interval: 2000, timeoutMsg: 'no request was saved' });
    await browser.waitUntil(async () => (await savedRequests()).slice(-1)[0].status === 'done', { timeout: 900000, interval: 3000, timeoutMsg: 'the request never finished' });
    const request = (await savedRequests()).slice(-1)[0];
    const last = request.steps[request.steps.length - 1].stepId;
    // As if the app closed while the last step ran.
    await patchRequest(request.id, { status: 'running', stepId: last, stepStatus: 'running' });
    await restart();
    expect((await findRequest(request.id)).status).toBe('interrupted');
    await openChat();
    const notice = await $('[data-testid="chat-interrupted-notice"]');
    await notice.waitForExist({ timeout: 30000, timeoutMsg: 'Chat did not show the cut-off request' });
    await (await notice.$('button=Carry on')).click();
    await browser.waitUntil(async () => (await findRequest(request.id)).status === 'done', {
      timeout: 900000, interval: 3000, timeoutMsg: 'Carry on did not finish the request',
    });
    expect((await findRequest(request.id)).steps.find((s) => s.stepId === last).status).toBe('done');
  });
});
