// Agent phase 3 (Maria), in the real app (2026-10-25): Maria reviews the work itself (pass or
// fix, quoting the work) after it is written from Hector's research, and reviews a plan with
// its risk, the rules that apply and what needs your approval, with no schema dump in Chat.
// When she asks for approval, nothing after her runs. Nothing is sent. Needs a local model and
// internet access; uses qwen2.5:7b when installed. Optional: ALPHONSO_LIVE_TAVILY_API_KEY (your
// own key, set only for the run) is typed into Settings → Connectors.
import { buttonByText, enterShell, invoke, mainText, ollamaHasModels, warmSelectedModel } from '../helpers.mjs';

const PREFERRED_TEST_MODEL = 'qwen2.5:7b';
const TAVILY_KEY = process.env.ALPHONSO_LIVE_TAVILY_API_KEY || '';
const POST = '/jose Research three facts about honeybees, write a short post about them, and have the post checked for accuracy';
const PLAN = '/jose Audit this plan for compliance risks: tomorrow we email all 500 customers a 30 percent discount code and post it on Instagram.';

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
  try {
    await browser.waitUntil(async () => {
      await denyAnyApproval();
      const r = (await requests())[0];
      return r && r.id !== before && !r.steps.some((s) => ['running', 'pending', 'queued'].includes(s.status)) && r.status !== 'running';
    }, { timeout: 1500000, interval: 4000 });
  } catch {
    const r = (await requests())[0];
    throw new Error(`the request never finished: ${JSON.stringify({ status: r?.status, steps: (r?.steps || []).map((s) => [s.stepId, s.agent, s.actionType, s.status]) })}`);
  }
  return (await requests())[0];
}

async function saveTavilyKey() {
  await $('[aria-label="Open settings"]').click();
  await browser.waitUntil(async () => /API CREDENTIALS|General/.test(await mainText()), { timeout: 30000 });
  await buttonByText('Connectors').click();
  await buttonByText('Search & Research').click();
  const field = await $('//main//input[@placeholder="tvly-..."]');
  await field.waitForExist({ timeout: 30000 });
  await field.scrollIntoView();
  await field.setValue(TAVILY_KEY);
  const section = await field.$('./ancestor::div[contains(@class, "rounded-2xl")][1]');
  await (await section.$('.//button[contains(normalize-space(.), "Save")]')).click();
  await browser.waitUntil(async () => /Tavily key saved/i.test(await mainText()), { timeout: 30000, timeoutMsg: 'the Tavily key was not saved' });
}

const textOf = (output) => [output?.summary, ...(output?.artifacts || []).map((a) => (typeof a?.raw === 'string' ? a.raw : ''))].filter(Boolean).join('\n');

describe("Alphonso desktop: Maria reviews the work and the plan", () => {
  before(async function () {
    await enterShell();
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
    if (TAVILY_KEY) await saveTavilyKey();
    await $('[data-testid="sidebar-chat-shortcut"]').click();
  });

  it('the post is written from the research, and her review quotes it', async function () {
    const request = await ask(POST);
    const hector = request.steps.find((s) => s.agent === 'hector');
    const write = request.steps.find((s) => s.actionType === 'assistant_write' && !s.revises);
    const reviews = request.steps.filter((s) => s.agent === 'maria' && s.reviewOf);
    const outputs = (await stepOutputs())[request.commandId]?.steps || {};
    console.log('MARIA-E2E post', JSON.stringify({ steps: request.steps.map((s) => [s.stepId, s.agent, s.actionType, s.status, s.needs, s.reviewOf]), reviews: reviews.map((r) => String(outputs[r.stepId]?.summary || '').slice(0, 1500)) }).slice(0, 6000));
    expect(hector).toBeTruthy();
    expect(write).toBeTruthy();
    expect(write.needs).toContain(hector.stepId);
    expect(reviews.length).toBeGreaterThan(0);
    // Without usable research Hector waits for setup and nothing after him runs.
    if (hector.status !== 'done') return this.skip();
    const done = reviews.filter((r) => r.status === 'done');
    expect(done.length).toBeGreaterThan(0);
    for (const review of done) {
      const out = outputs[review.stepId];
      const summary = String(out?.summary || '');
      expect(summary.startsWith('Pass.') || summary.startsWith('Fix:')).toBe(true);
      const work = textOf(outputs[review.reviewOf]);
      for (const finding of out?.schema?.findings || []) {
        const quote = /^"([^"]+)":/.exec(finding)?.[1];
        if (quote) expect(work).toContain(quote);
      }
    }
  }).timeout(1600000);

  it('a plan review gives the risk, and Chat shows no schema dump', async () => {
    const request = await ask(PLAN);
    const outputs = (await stepOutputs())[request.commandId]?.steps || {};
    const maria = request.steps.find((s) => s.agent === 'maria');
    console.log('MARIA-E2E plan', JSON.stringify({ steps: request.steps.map((s) => [s.stepId, s.agent, s.actionType, s.status]), review: outputs[maria?.stepId]?.schema }).slice(0, 4000));
    expect(request.steps.map((s) => s.agent)).toEqual(['maria']);
    expect(maria.status).toBe('done');
    expect(String(outputs[maria.stepId]?.summary || '')).toMatch(/^Risk: (low|medium|high)\./);
    // When she asked for your approval, nothing after her ran.
    if (outputs[maria.stepId]?.schema?.needsApproval) {
      for (const step of request.steps.filter((s) => (s.needs || []).includes(maria.stepId))) expect(step.status).not.toBe('done');
    }
    // The request is saved as done a moment before Chat shows the reply.
    await browser.waitUntil(async () => (await mainText()).includes('Risk:'), { timeout: 120000, interval: 2000 }).catch(() => undefined);
    const text = await mainText();
    expect(text).toContain('Risk:');
    expect(text).not.toContain('MARIA_AUDIT_SCHEMA');
    expect(text).not.toContain('Confidence Level');
  }).timeout(1600000);
});
