// Seeing and steering Jose's plans in the real app (Jose redesign phase 3,
// 2026-10-23): with "Show Jose's plan first" set to Always, a request in Chat
// stops at a plan card; "Edit on the board" opens the Orchestrator page's
// Requests tab on it; an edit is saved in the change log; "Run this plan"
// runs it; with Never, a request runs without a card. Skipped without a local
// model; uses qwen2.5:7b when installed.
import { enterShell, invoke, buttonByText, mainText, ollamaHasModels, warmSelectedModel } from '../helpers.mjs';

// CI's model run sets ALPHONSO_E2E_MODEL (Jose phase 7); locally the 7B model when installed.
const PREFERRED_TEST_MODEL = process.env.ALPHONSO_E2E_MODEL || 'qwen2.5:7b';
const REQUEST = 'Research what the IANA example domain is used for and write a short report.';

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
  await browser.refresh();
  await $('[data-alphonso-shell-ready="true"]').waitForExist({ timeout: 60000 });
}

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

describe('Alphonso desktop: Jose plan board', function () {
  // Hooks' limits are set here: this harness ignores this.timeout() inside a hook (QA batch 1).
  this.timeout(400000);
  before(async function () {
    await enterShell();
    if (!(await ollamaHasModels())) this.skip();
    const model = (await installedModels()).includes(PREFERRED_TEST_MODEL) ? { selectedModel: PREFERRED_TEST_MODEL } : {};
    await useSettings({ ...model, showPlanFirst: 'always' });
    await warmSelectedModel();
    await openChat();
  });

  it('stops at a plan card when the plan is shown first', async function () {
    await send(REQUEST);
    const card = await $('[data-testid="jose-plan-card"]');
    await card.waitForExist({ timeout: 550000, timeoutMsg: 'Jose never showed his plan' });
    expect((await card.$$('[data-testid="jose-plan-step"]')).length).toBeGreaterThan(0);
    const [request] = (await savedRequests()).slice(-1);
    expect(request.status).toBe('waiting_plan_approval');
  }).timeout(600000);

  it('opens the plan on the board and saves an edit in the change log', async () => {
    await buttonByText('Edit on the board').click();
    await browser.waitUntil(async () => (await mainText()).includes('Plan waiting for you'), {
      timeout: 30000, timeoutMsg: 'the board did not open on the waiting plan',
    });
    await buttonByText('Edit').click();
    await $('[data-testid="jose-plan-editor"]').waitForExist();
    // One instruction box per step; change the first step's.
    const [instruction] = await $$('[data-testid="jose-plan-editor"] input[aria-label^="Instruction for"]');
    await instruction.setValue('Find the facts about the IANA example domain, with sources.');
    await buttonByText('Save changes').click();
    await browser.waitUntil(async () => /Changed what .* should do/.test(await mainText()), {
      timeout: 20000, timeoutMsg: 'the edit never appeared in the change log',
    });
  });

  it('runs the approved plan and the board shows it finish', async function () {
    await buttonByText('Run this plan').click();
    await browser.waitUntil(async () => {
      const [request] = (await savedRequests()).slice(-1);
      return request && !['waiting_plan_approval', 'running'].includes(request.status);
    }, { timeout: 1100000, interval: 3000, timeoutMsg: 'the plan never finished running' });
    const [request] = (await savedRequests()).slice(-1);
    expect(['done', 'waiting_approval']).toContain(request.status);
    expect(request.steps.some((s) => s.status === 'done')).toBe(true);
    expect(request.changeLog.some((c) => /should do/.test(c.text))).toBe(true);
  }).timeout(1200000);

  it('runs straight away when set to Never', async function () {
    await useSettings({ showPlanFirst: 'never' });
    await openChat();
    const before = (await savedRequests()).length;
    // The earlier plan card is still in the conversation; no new one may appear.
    const cardsBefore = (await $$('[data-testid="jose-plan-card"]')).length;
    await send('Plan this fresh: suggest three names for a small coffee shop.');
    await browser.waitUntil(async () => (await savedRequests()).length > before, {
      timeout: 600000, interval: 2000, timeoutMsg: 'no request was saved',
    });
    const [request] = (await savedRequests()).slice(-1);
    expect(request.status).not.toBe('waiting_plan_approval');
    expect((await $$('[data-testid="jose-plan-card"]')).length).toBe(cardsBefore);
  }).timeout(1200000);
});
