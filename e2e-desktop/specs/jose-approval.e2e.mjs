// Orchestrator's Command tab goes through Jose's one entry (Jose redesign
// phase 6a, 2026-10-23): a command becomes a saved request, the Requests tab
// opens on it, its step waits for approval because of what it does, and
// approving it on the board carries the request to the end. Skipped without
// a local model.
import { enterShell, invoke, mainText, ollamaHasModels, openPage, warmSelectedModel } from '../helpers.mjs';

const COMMAND = 'Ask Jose: research what the IANA example domain is used for.';

async function useSettings(values) {
  const loaded = await invoke('load_settings');
  const saved = JSON.parse((loaded.ok && loaded.value) || '{}');
  await invoke('save_settings', { settingsJson: JSON.stringify({ ...saved, ...values }) });
  await browser.execute((extra) => {
    const settings = JSON.parse(localStorage.getItem('alphonso_settings') || '{}');
    localStorage.setItem('alphonso_settings', JSON.stringify({ ...settings, ...extra }));
  }, values);
  await browser.refresh();
  await $('[data-alphonso-shell-ready="true"]').waitForExist({ timeout: 60000 });
}

const savedRequests = async () => JSON.parse(await browser.execute(() => localStorage.getItem('alphonso_jose_requests_v1') || '[]'));

describe('Alphonso desktop Jose approvals', function () {
  // Hooks' limits are set here: this harness ignores this.timeout() inside a hook (QA batch 1).
  this.timeout(400000);
  let requestId = null;

  before(async function () {
    await enterShell();
    if (!(await ollamaHasModels())) this.skip();
    // Reading asks first, so the research step waits for approval.
    await useSettings({ showPlanFirst: 'never', approvalMode: true, effectApprovals: { read: true } });
    await warmSelectedModel();
    await openPage('system', 'orchestrator');
  });

  it('turns a command into a request that waits for approval, and opens it on the board', async function () {
    const before = new Set((await savedRequests()).map((r) => r.id));
    const commandTab = await $('//main//button[normalize-space(.)="Command"]');
    await commandTab.click();
    const command = await $('main textarea');
    await command.waitForDisplayed();
    await command.setValue(COMMAND);
    await (await $('//main//button[normalize-space(.)="Send to Jose"]')).click();
    await browser.waitUntil(async () => (await savedRequests()).some((r) => !before.has(r.id)), {
      timeout: 600000, interval: 2000, timeoutMsg: 'the command never became a saved request',
    });
    requestId = (await savedRequests()).find((r) => !before.has(r.id)).id;
    await browser.waitUntil(async () => (await savedRequests()).find((r) => r.id === requestId).status === 'waiting_approval', {
      timeout: 300000, interval: 2000, timeoutMsg: 'the request never waited for approval',
    });
    await browser.waitUntil(async () => (await mainText()).includes('Waiting for your approval'), {
      timeout: 30000, timeoutMsg: 'the Requests tab did not open on the waiting request',
    });
    const request = (await savedRequests()).find((r) => r.id === requestId);
    expect(request.source).toBe('user');
    expect(request.steps.some((s) => s.agent === 'hector')).toBe(true);
  }).timeout(900000);

  it('runs the request to the end once its steps are approved on the board', async function () {
    for (let round = 0; round < 10; round += 1) {
      const current = (await savedRequests()).find((r) => r.id === requestId);
      if (current.status !== 'waiting_approval') break;
      const waitingBefore = current.steps.filter((s) => s.status === 'waiting_approval').map((s) => s.stepId).join(',');
      const approve = await $('//main//button[starts-with(normalize-space(.), "Approve and carry on")]');
      await approve.waitForClickable({ timeout: 30000 });
      await approve.click();
      await browser.waitUntil(async () => {
        const now = (await savedRequests()).find((r) => r.id === requestId);
        return now.status !== 'running' && now.steps.filter((s) => s.status === 'waiting_approval').map((s) => s.stepId).join(',') !== waitingBefore;
      }, { timeout: 900000, interval: 3000, timeoutMsg: 'approving a step did not carry the request on' });
    }
    const finished = (await savedRequests()).find((r) => r.id === requestId);
    expect(finished.status).toBe('done');
    expect(finished.steps.find((s) => s.agent === 'hector').status).toBe('done');
  }).timeout(1800000);
});
