// Agent phase 2 (Nova), in the real app (2026-10-25): Nova judges what Hector found and
// answers with a ranked verdict (what to do first, every option with reasons), after him,
// with no score dump in Chat. Nothing is sent. Needs a local model and internet access;
// uses qwen2.5:7b when installed. Optional: ALPHONSO_LIVE_TAVILY_API_KEY (your own key,
// set only for the run) is typed into Settings → Connectors, so the search doesn't
// depend on the free search.
import { buttonByText, enterShell, invoke, mainText, ollamaHasModels, warmSelectedModel, clickSend } from '../helpers.mjs';

const PREFERRED_TEST_MODEL = 'qwen2.5:7b';
const TAVILY_KEY = process.env.ALPHONSO_LIVE_TAVILY_API_KEY || '';
const COFFEE = '/jose Research the coffee subscription market in Canada and tell me which opportunity is worth going after first.';
const BAKERY = '/jose Which of these should a small bakery do first: a weekly email newsletter, a loyalty card, or a podcast? Prioritize them.';

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
  await clickSend();
  await browser.waitUntil(async () => {
    await denyAnyApproval();
    const r = (await requests())[0];
    return r && r.id !== before && !r.steps.some((s) => ['running', 'pending', 'queued'].includes(s.status)) && r.status !== 'running';
  }, { timeout: 1500000, interval: 4000, timeoutMsg: 'the request never finished' });
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

describe('Alphonso desktop: Nova judges what was found', () => {
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

  it('runs after Hector and ranks with his sources', async function () {
    const request = await ask(COFFEE);
    const hector = request.steps.find((s) => s.agent === 'hector');
    const nova = request.steps.find((s) => s.agent === 'nova');
    const outputs = (await stepOutputs())[request.commandId]?.steps || {};
    console.log('NOVA-E2E coffee', JSON.stringify({ hector: hector?.status, nova: nova?.status, needs: nova?.needs, novaOut: String(outputs[nova?.stepId]?.summary || '').slice(0, 1500) }));
    expect(nova).toBeTruthy();
    expect(nova.needs).toContain(hector.stepId);
    // Without usable research (the free search refusing, sites blocking) Hector waits for setup;
    // Nova then never runs, which is the intended order. Nothing more can be checked here.
    if (hector.status !== 'done') return this.skip();
    const summary = String(outputs[nova.stepId]?.summary || '');
    expect(nova.status).toBe('done');
    expect(summary.startsWith('What to do first:') || summary.startsWith('Judged from your request only.')).toBe(true);
    const sourceCount = (outputs[hector.stepId]?.sources || []).length;
    for (const n of [...summary.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]))) expect(n).toBeLessThanOrEqual(sourceCount);
  }).timeout(1600000);

  it('ranks every option the request names, and Chat shows no score dump', async () => {
    const request = await ask(BAKERY);
    const nova = request.steps.find((s) => s.agent === 'nova');
    const output = (await stepOutputs())[request.commandId]?.steps?.[nova?.stepId];
    console.log('NOVA-E2E bakery', JSON.stringify({ steps: request.steps.map((s) => [s.agent, s.actionType, s.status]), verdict: output?.schema }).slice(0, 3000));
    expect(request.steps.map((s) => s.agent)).toEqual(['nova']);
    expect(nova.status).toBe('done');
    expect(output.schema.options.length).toBeGreaterThanOrEqual(3);
    const text = await mainText();
    expect(text).toContain('What to do first');
    // Chat's Nova card shows her saved verdict for this request (found by its command id).
    expect(await $('[data-testid="nova-verdict-card"]').isExisting()).toBe(true);
    expect(text).not.toContain('Analyzed At Ms');
    expect(text).not.toContain('Opportunity Score');
  }).timeout(1600000);
});
