// A real paid-model step, by hand (Jose redesign phase 6a, 2026-10-23).
// Skipped unless you set, for Claude or for ChatGPT:
//   ALPHONSO_LIVE_ANTHROPIC_API_KEY  (or ALPHONSO_LIVE_OPENAI_API_KEY), or the path of a file
//   holding it: ALPHONSO_LIVE_ANTHROPIC_KEY_FILE / ALPHONSO_LIVE_OPENAI_KEY_FILE (like the
//   live-accounts spec, so the key never appears on a command line)
//   ALPHONSO_LIVE_PAID_INPUT_PRICE   price per million input tokens, USD
//   ALPHONSO_LIVE_PAID_OUTPUT_PRICE  price per million output tokens, USD
// The key names end in _KEY, so the harness keeps them out of the app's own
// environment; the key reaches the app only by being typed into Connectors,
// as a user would. One step costs a fraction of a cent at current prices; the
// monthly cap is $0.10 for the first step and is then lowered to what was
// spent, so the second step is refused before anything is sent.
import fs from 'node:fs';
import { enterShell, invoke, mainText, buttonByText, ollamaHasModels, openPage } from '../helpers.mjs';

const fromFile = (name) => {
  const file = process.env[name];
  try { return file ? fs.readFileSync(file, 'utf8').trim() : ''; } catch { return ''; }
};
const ANTHROPIC = process.env.ALPHONSO_LIVE_ANTHROPIC_API_KEY || fromFile('ALPHONSO_LIVE_ANTHROPIC_KEY_FILE');
const OPENAI = process.env.ALPHONSO_LIVE_OPENAI_API_KEY || fromFile('ALPHONSO_LIVE_OPENAI_KEY_FILE');
const INPUT_PRICE = Number(process.env.ALPHONSO_LIVE_PAID_INPUT_PRICE);
const OUTPUT_PRICE = Number(process.env.ALPHONSO_LIVE_PAID_OUTPUT_PRICE);
const PROVIDER = ANTHROPIC ? 'claude' : 'chatgpt';
const KEY = ANTHROPIC || OPENAI;
const KEY_PLACEHOLDER = PROVIDER === 'claude' ? 'sk-ant-...' : 'sk-...';
const SECTION_TITLE = PROVIDER === 'claude' ? 'Claude (Anthropic)' : 'ChatGPT (OpenAI)';

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
const spentThisMonth = async () => browser.execute(() => {
  try { return JSON.parse(localStorage.getItem('alphonso_jose_spend_v1') || '{}').totalUsd || 0; } catch { return 0; }
});

/** A plan waiting for you, with one Nova step on the paid model (as the planner would save it). */
async function savePaidPlan(text) {
  const id = await browser.execute((planText, provider) => {
    const now = Date.now();
    const request = {
      id: `jose-request-plan-live-${now.toString(36)}`,
      commandId: '',
      source: 'user',
      text: planText,
      kind: 'normal',
      status: 'waiting_plan_approval',
      steps: [{
        stepId: 'nova-paid', agent: 'nova', actionType: 'analysis_findings', effects: ['read', 'spend'], needs: [],
        instruction: 'In one sentence, is a small coffee shop a good idea in a busy train station? Answer briefly.',
        model: `${provider}:`, status: 'waiting',
      }],
      plan: { source: 'fresh', templateId: null, note: 'Live paid-model check.' },
      changeLog: [],
      runOptions: { source: 'user', previewMode: false, zeroCostMode: false },
      createdAtMs: now,
      updatedAtMs: now,
    };
    const all = JSON.parse(localStorage.getItem('alphonso_jose_requests_v1') || '[]');
    localStorage.setItem('alphonso_jose_requests_v1', JSON.stringify([...all, request]));
    return request.id;
  }, text, PROVIDER);
  return id;
}

async function runOnBoard(requestId) {
  await openPage('system', 'orchestrator');
  await (await $('//main//button[normalize-space(.)="Requests"]')).click();
  const entry = await $(`//main//button[contains(normalize-space(.), "${(await savedRequests()).find((r) => r.id === requestId).text}")]`);
  await entry.click();
  await (await $('//main//button[normalize-space(.)="Run this plan"]')).click();
  await browser.waitUntil(async () => (await savedRequests()).find((r) => r.id === requestId).status !== 'waiting_plan_approval', {
    timeout: 120000, interval: 2000, timeoutMsg: 'the plan did not start',
  });
}

describe('Alphonso desktop: a real paid-model step (live)', () => {
  before(async function () {
    if (!KEY || !Number.isFinite(INPUT_PRICE) || !Number.isFinite(OUTPUT_PRICE)) this.skip();
    if (!(await ollamaHasModels())) this.skip();
    await enterShell();
  });

  it('saves the key in Connectors, as a user would', async function () {
    await $('[aria-label="Open settings"]').click();
    await browser.waitUntil(async () => /API CREDENTIALS|General/.test(await mainText()), { timeout: 30000 });
    await buttonByText('Connectors').click();
    await buttonByText('AI Models').click();
    const field = await $(`//main//*[contains(normalize-space(.), "${SECTION_TITLE}")]/ancestor::div[contains(@class, "rounded-2xl")][1]//input[@placeholder="${KEY_PLACEHOLDER}"]`);
    await field.waitForExist({ timeout: 30000 });
    await field.scrollIntoView();
    await field.setValue(KEY);
    const section = await field.$('./ancestor::div[contains(@class, "rounded-2xl")][1]');
    await (await section.$('.//button[contains(normalize-space(.), "Save")]')).click();
    await browser.waitUntil(async () => /key saved/i.test(await mainText()), { timeout: 30000, timeoutMsg: 'the key was not saved' });
  }).timeout(120000);

  it('runs a paid step after you approve the spend, and records what it cost', async function () {
    await useSettings({
      zeroCostMode: false, approvalMode: true, showPlanFirst: 'always',
      paidModels: { allowed: true, provider: PROVIDER, model: '', inputPerMillionUsd: INPUT_PRICE, outputPerMillionUsd: OUTPUT_PRICE, monthlyCapUsd: 0.1 },
    });
    const before = await spentThisMonth();
    const requestId = await savePaidPlan('Live paid check: coffee shop');
    await runOnBoard(requestId);
    // Spending always asks, even with Approval Mode off.
    await browser.waitUntil(async () => (await savedRequests()).find((r) => r.id === requestId).status === 'waiting_approval', {
      timeout: 120000, interval: 2000, timeoutMsg: 'the paid step did not wait for approval',
    });
    await (await $('//main//button[starts-with(normalize-space(.), "Approve and carry on")]')).click();
    await browser.waitUntil(async () => !['running', 'waiting_approval'].includes((await savedRequests()).find((r) => r.id === requestId).status), {
      timeout: 300000, interval: 3000, timeoutMsg: 'the paid step never finished',
    });
    const done = (await savedRequests()).find((r) => r.id === requestId);
    expect(done.steps[0].status).toBe('done');
    expect(await spentThisMonth()).toBeGreaterThan(before);
  }).timeout(600000);

  it('refuses a paid step that would pass the monthly cap, before sending anything', async function () {
    const spent = await spentThisMonth();
    await useSettings({
      zeroCostMode: false, approvalMode: true, showPlanFirst: 'always',
      paidModels: { allowed: true, provider: PROVIDER, model: '', inputPerMillionUsd: INPUT_PRICE, outputPerMillionUsd: OUTPUT_PRICE, monthlyCapUsd: spent },
    });
    const requestId = await savePaidPlan('Live paid check: past the cap');
    await runOnBoard(requestId);
    await browser.waitUntil(async () => (await savedRequests()).find((r) => r.id === requestId).status === 'waiting_approval', {
      timeout: 120000, interval: 2000, timeoutMsg: 'the paid step did not wait for approval',
    });
    await (await $('//main//button[starts-with(normalize-space(.), "Approve and carry on")]')).click();
    await browser.waitUntil(async () => !['running', 'waiting_approval'].includes((await savedRequests()).find((r) => r.id === requestId).status), {
      timeout: 300000, interval: 3000, timeoutMsg: 'the request never settled',
    });
    const request = (await savedRequests()).find((r) => r.id === requestId);
    expect(request.steps[0].status).not.toBe('done');
    expect(JSON.stringify(request)).toMatch(/monthly cap/);
    expect(await spentThisMonth()).toBe(spent);
  }).timeout(600000);
});
