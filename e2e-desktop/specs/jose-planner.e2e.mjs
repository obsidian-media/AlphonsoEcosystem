// Jose's planner in the real app (Jose redesign phase 2, 2026-10-23):
// everything typed in Chat goes to Jose, who answers a question directly and
// plans a task. A planned reply says how he planned it: fresh, from a
// template, or the simple plan and why. Skipped without a local model; uses
// qwen2.5:7b when installed (small models write unusable plans more often).
import { enterShell, invoke, ollamaHasModels, warmSelectedModel } from '../helpers.mjs';

// CI's model run sets ALPHONSO_E2E_MODEL (Jose phase 7); locally the 7B model when installed.
const PREFERRED_TEST_MODEL = process.env.ALPHONSO_E2E_MODEL || 'qwen2.5:7b';
const PLAN_NOTE = /Planned fresh\.|Based on template|used the simple plan/;

async function installedModels() {
  try {
    const response = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(3000) });
    const data = await response.json();
    return (data.models || []).map((m) => m.name);
  } catch {
    return [];
  }
}

async function lastReplyText() {
  const replies = await $$('[data-testid="chat-message-assistant"]');
  return replies.length ? replies[replies.length - 1].getText() : '';
}

async function send(text) {
  const input = await $('[data-testid="chat-compose-input"]');
  await input.waitForDisplayed();
  await input.setValue(text);
  const button = await $('[data-testid="chat-send-button"]');
  await button.waitForClickable();
  await button.click();
}

describe('Alphonso desktop: Jose plans', () => {
  before(async function () {
    await enterShell();
    if (!(await ollamaHasModels())) this.skip();
    this.timeout(400000);
    // Plans run straight away here (the plan card is jose-board.e2e.mjs's job).
    // Backend settings are merged in at start, so save there as Settings does.
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
    await browser.waitUntil(
      async () => !(await browser.execute(() => document.querySelector('main')?.innerText || '')).includes('Start Ollama to enable AI'),
      { timeout: 60000, timeoutMsg: 'the app never selected an Ollama model' }
    );
  });

  it('answers a plain question directly, with no plan', async () => {
    await send('What is 2 + 2? Reply with just the number.');
    await browser.waitUntil(async () => /\b4\b|four/i.test(await lastReplyText()), {
      timeout: 150000, interval: 1000, timeoutMsg: 'no direct answer within 150s',
    });
    expect(await lastReplyText()).not.toMatch(PLAN_NOTE);
  });

  it('plans a research task and says how it planned it', async function () {
    this.timeout(1200000);
    const before = (await $$('[data-testid="chat-message-assistant"]')).length;
    await send('Research what the IANA example domain is used for and write a short report.');
    await browser.waitUntil(
      async () => (await $$('[data-testid="chat-message-assistant"]')).length > before && PLAN_NOTE.test(await lastReplyText()),
      { timeout: 1100000, interval: 2000, timeoutMsg: 'Jose never replied with how he planned the request' }
    ).catch(async (e) => {
      const reqs = JSON.parse(await browser.execute(() => localStorage.getItem('alphonso_jose_requests_v1') || '[]'));
      const last = reqs.slice(-1)[0];
      console.log('PLANNER-DIAG reply', JSON.stringify(await lastReplyText()).slice(0, 1500));
      console.log('PLANNER-DIAG request', JSON.stringify(last && { status: last.status, plan: last.plan, steps: last.steps.map((s) => [s.stepId, s.agent, s.status, s.error]), log: last.changeLog }).slice(0, 2500));
      throw e;
    });
    // Hector did the research: the plan ran, not just a chat reply.
    const receipts = await browser.execute(() => localStorage.getItem('alphonso_jose_requests_v1') || '[]');
    const requests = JSON.parse(receipts);
    expect(requests.length).toBeGreaterThan(0);
    expect(requests[requests.length - 1].steps.some((s) => s.agent === 'hector')).toBe(true);
  });

  it('"Plan this fresh:" plans without a template', async function () {
    this.timeout(1200000);
    const before = (await $$('[data-testid="chat-message-assistant"]')).length;
    await send('Plan this fresh: suggest three names for a small coffee shop.');
    await browser.waitUntil(
      async () => (await $$('[data-testid="chat-message-assistant"]')).length > before && /Planned fresh\.|used the simple plan/.test(await lastReplyText()),
      { timeout: 1100000, interval: 2000, timeoutMsg: 'Jose never replied with a fresh plan' }
    );
    expect(await lastReplyText()).not.toMatch(/Based on template/);
  });
});
