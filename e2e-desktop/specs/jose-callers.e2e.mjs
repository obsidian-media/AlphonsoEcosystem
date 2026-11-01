// Every caller goes through Jose (Jose redesign phase 6a, 2026-10-23): a
// schedule's "Run now" makes a request that never waits for its plan (even
// with "Show Jose's plan first" on Always) and may not use a paid model, and
// Boardroom's Creative brief is a one-step request set by Boardroom. (The
// Orchestrator's Command tab is checked by jose-approval.e2e.mjs.) Skipped
// without a local model.
import { enterShell, invoke, mainText, ollamaHasModels, openPage, warmSelectedModel } from '../helpers.mjs';

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
const newRequest = async (before) => (await savedRequests()).find((r) => !before.has(r.id));
const settled = (request) => request && !['running', 'waiting_plan_approval'].includes(request.status);

describe('Alphonso desktop: every caller goes through Jose', function () {
  // Hooks' limits are set here: this harness ignores this.timeout() inside a hook (QA batch 1).
  this.timeout(400000);
  before(async function () {
    await enterShell();
    if (!(await ollamaHasModels())) this.skip();
    // Nothing but the locked kinds asks, so the requests run to the end.
    await useSettings({ showPlanFirst: 'always', approvalMode: true, effectApprovals: {} });
    await warmSelectedModel();
  });

  it("a schedule's Run now makes a request that runs without showing its plan first", async function () {
    // Off and far in the future, so only Run now runs it.
    await browser.execute(() => {
      const now = Date.now();
      localStorage.setItem('alphonso_jose_schedules_v1', JSON.stringify([{
        id: 'sched_e2e_callers', name: 'Callers check', commandText: 'Ask Jose: research what the IANA example domain is used for.',
        presetId: 'daily', intervalMs: 86400000, agentId: 'jose', enabled: false, lastRunAtMs: null,
        nextRunAtMs: now + 30 * 86400000, createdAtMs: now,
      }]));
    });
    await browser.refresh();
    await $('[data-alphonso-shell-ready="true"]').waitForExist({ timeout: 60000 });
    const before = new Set((await savedRequests()).map((r) => r.id));
    await openPage('work', 'automation');
    await (await $('//main//button[normalize-space(.)="Schedules"]')).click();
    const run = await $('[aria-label="Run Callers check now"]');
    await run.waitForClickable({ timeout: 30000 });
    await run.click();
    await browser.waitUntil(async () => Boolean(await newRequest(before)), { timeout: 600000, interval: 2000, timeoutMsg: 'Run now made no request' });
    await browser.waitUntil(async () => settled(await newRequest(before)), { timeout: 900000, interval: 3000, timeoutMsg: 'the scheduled request never finished' });
    const request = await newRequest(before);
    console.log('CALLERS-E2E schedule', JSON.stringify({ status: request.status, steps: request.steps.map((x) => [x.stepId, x.agent, x.actionType, x.status, x.error || null]) }));
    expect(request.source).toBe('schedule');
    expect(request.runOptions.allowPaidModels).toBe(false);
    expect(request.steps.some((s) => String(s.model || '').includes(':'))).toBe(false);
    expect(request.status).toBe('done');
  }).timeout(1200000);

  it("Boardroom's Creative brief is a one-step request set by Boardroom", async function () {
    const before = new Set((await savedRequests()).map((r) => r.id));
    await $('[data-testid="space-pill-boardroom"]').click();
    await $('[data-testid="sidebar-nav-mission_room"]').click();
    const topic = await $('input[placeholder="New thread topic..."]');
    await topic.waitForDisplayed();
    await topic.setValue('Callers check: a launch brief');
    await $('button*=New Thread').click();
    await $('input[placeholder="Message the room..."]').waitForDisplayed();
    await (await $('//main//button[normalize-space(.)="Creative brief"]')).click();
    await browser.waitUntil(async () => /Creative brief: |Miya's creative brief/.test(await mainText()), {
      timeout: 600000, interval: 3000, timeoutMsg: 'the thread never showed the creative brief',
    });
    const request = await newRequest(before);
    expect(request.source).toBe('boardroom');
    expect(request.plan.source).toBe('given');
    expect(request.plan.note).toBe('Steps set by Boardroom.');
    expect(request.steps.map((s) => s.agent)).toEqual(['miya']);
  }).timeout(900000);
});
