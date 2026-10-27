// Agent roles Part C1 in the real app (2026-10-27): Work → Projects starts a real Jose request
// planned from the Build an app template. Its Steps tab lists the planned steps, its Approval
// tab shows what waits, and Results stays locked while a step waits or the request runs.
// Nothing is approved: any approval window is denied. Skipped without a local model; uses
// qwen2.5:7b when installed.
import { enterShell, invoke, ollamaHasModels, warmSelectedModel, openPage } from '../helpers.mjs';

const PREFERRED_TEST_MODEL = 'qwen2.5:7b';

async function installedModels() {
  try {
    const response = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(3000) });
    return ((await response.json()).models || []).map((m) => m.name);
  } catch {
    return [];
  }
}

async function denyAnyApproval() {
  const deny = await $('button[aria-label="Deny action"]');
  if (await deny.isExisting() && await deny.isDisplayed()) await deny.click();
}

const readJson = (key) => browser.execute((k) => localStorage.getItem(k) || '[]', key).then((s) => JSON.parse(s));
const tab = (label) => $(`//button[starts-with(normalize-space(translate(., 'abcdefghijklmnopqrstuvwxyz', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ')), "${label.toUpperCase()}")]`);

describe('Alphonso desktop: Projects', () => {
  before(async function () {
    await enterShell();
    if (!(await ollamaHasModels())) this.skip();
    this.timeout(400000);
    const extra = { showPlanFirst: 'never', ...((await installedModels()).includes(PREFERRED_TEST_MODEL) ? { selectedModel: PREFERRED_TEST_MODEL } : {}) };
    const loaded = await invoke('load_settings');
    await invoke('save_settings', { settingsJson: JSON.stringify({ ...JSON.parse((loaded.ok && loaded.value) || '{}'), ...extra }) });
    await browser.execute((values) => {
      localStorage.setItem('alphonso_settings', JSON.stringify({ ...JSON.parse(localStorage.getItem('alphonso_settings') || '{}'), ...values }));
    }, extra);
    await browser.refresh();
    await $('[data-alphonso-shell-ready="true"]').waitForExist({ timeout: 60000 });
    await warmSelectedModel();
    await openPage('work', 'project_execution');
  });

  it('starts a request whose steps, approvals and locked results show on the page', async function () {
    this.timeout(1500000);
    await $('input[aria-label="Project name"]').setValue('Tea timer');
    await $('input[aria-label="What it should do"]').setValue('A small web page that counts down three minutes for a cup of tea');
    await $('[data-testid="projects-start"]').click();

    const project = await browser.waitUntil(async () => (await readJson('alphonso_projects_v2')).find((p) => p.name === 'Tea timer' && p.runs.length), { timeout: 120000, timeoutMsg: 'the project was not started' });
    const requestId = project.runs[0].requestId;
    const request = async () => (await readJson('alphonso_jose_requests_v1')).find((r) => r.id === requestId);
    const settled = await browser.waitUntil(async () => {
      await denyAnyApproval();
      const r = await request();
      return r && !['planning', 'running'].includes(r.status) && r;
    }, { timeout: 1400000, interval: 3000, timeoutMsg: 'the request never settled' });
    expect(settled.steps.length).toBeGreaterThan(0);
    expect(settled.plan?.templateId === 'build_app' || settled.plan?.source === 'fresh' || settled.plan?.source === 'adapted' || settled.plan?.source === 'template').toBe(true);

    await (await tab('Steps')).click();
    const steps = await $('[data-testid="projects-steps"]');
    await steps.waitForDisplayed({ timeout: 30000 });
    expect((await steps.$$('li')).length).toBe(settled.steps.length);

    const waiting = settled.steps.filter((s) => s.status === 'waiting_approval');
    await (await tab('Approval')).click();
    const approval = await $('[data-testid="projects-approval"]');
    await approval.waitForDisplayed({ timeout: 30000 });
    if (waiting.length) expect(await approval.getText()).toContain('Approve and carry on');
    else expect(await approval.getText()).toContain('Nothing is waiting for you.');

    const results = await tab('Results');
    expect(await results.getAttribute('disabled') !== null).toBe(waiting.length > 0);
  });
});
