// Agent phase 7 (Echo), in the real app (2026-10-26): Echo remembers what you decide, answers
// from it in a new chat, every agent follows a preference, a changed decision replaces the old
// one, Forget removes one, a forget that could mean several waits with a button for each, a
// cleanup changes nothing until you apply it, and health checks no longer fill memory.
// Nothing is sent anywhere. Needs a local model; uses qwen2.5:7b when installed.
import { enterShell, invoke, ollamaHasModels, warmSelectedModel, mainText, needsLargerModel } from '../helpers.mjs';

// CI's model run sets ALPHONSO_E2E_MODEL (Jose phase 7); locally the 7B model when installed.
const PREFERRED_TEST_MODEL = process.env.ALPHONSO_E2E_MODEL || 'qwen2.5:7b';

async function installedModels() {
  try {
    const r = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(3000) });
    return ((await r.json()).models || []).map((m) => m.name);
  } catch { return []; }
}

const requests = async () => JSON.parse(await browser.execute(() => localStorage.getItem('alphonso_jose_requests_v1') || '[]'))
  .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
const decisions = async () => JSON.parse(await browser.execute(() => localStorage.getItem('alphonso_echo_decisions_v1') || '[]'));
const outputs = async () => JSON.parse(await browser.execute(() => localStorage.getItem('alphonso_jose_step_outputs_v1') || '{}'));
const stepSummary = async (request, agent, actionType) => {
  const step = request.steps.find((s) => s.agent === agent && (!actionType || s.actionType === actionType));
  return String((await outputs())[request.commandId]?.steps?.[step?.stepId]?.summary || '');
};

async function denyAnyApproval() {
  const deny = await $('button[aria-label="Deny action"]');
  if (await deny.isExisting() && await deny.isDisplayed()) await deny.click();
}

async function lastReplyText() {
  const replies = await $$('[data-testid="chat-message-assistant"]');
  return replies.length ? replies[replies.length - 1].getText() : '';
}

async function send(text) {
  await $('[data-testid="sidebar-chat-shortcut"]').click();
  const input = await $('[data-testid="chat-compose-input"]');
  await input.waitForDisplayed();
  await input.setValue(text);
  const button = await $('[data-testid="chat-send-button"]');
  await button.waitForEnabled({ timeout: 30000 });
  await button.click();
}

/** Sends a message that becomes a request, and waits until it stops running (or waits for you). */
async function ask(text) {
  const before = (await requests())[0]?.id;
  await send(text);
  try {
    await browser.waitUntil(async () => {
      await denyAnyApproval();
      const r = (await requests())[0];
      return r && r.id !== before && r.status !== 'running' && !r.steps.some((s) => ['running', 'pending', 'queued'].includes(s.status));
    }, { timeout: 1500000, interval: 4000 });
  } catch {
    const r = (await requests())[0];
    throw new Error(`the request never finished: ${JSON.stringify({ status: r?.status, steps: (r?.steps || []).map((s) => [s.stepId, s.agent, s.actionType, s.status]) })}`);
  }
  return (await requests())[0];
}

/** Sends a plain question and waits for a reply that passes `done` (stable for 6 s). */
async function answer(text, done = (t) => t.length > 20) {
  const before = (await $$('[data-testid="chat-message-assistant"]')).length;
  await send(text);
  let last = '';
  let same = 0;
  try {
    await browser.waitUntil(async () => {
      await denyAnyApproval();
      const replies = await $$('[data-testid="chat-message-assistant"]');
      if (replies.length <= before) return false;
      const t = (await replies[replies.length - 1].getText()).trim();
      same = t === last && done(t) ? same + 1 : 0;
      last = t;
      return same >= 2;
    }, { timeout: 600000, interval: 3000 });
  } catch {
    const replies = await $$('[data-testid="chat-message-assistant"]');
    const r = (await requests())[0];
    throw new Error(`no finished reply: ${JSON.stringify({ before, now: replies.length, last: last.slice(0, 400), request: r && { text: r.text, status: r.status, steps: r.steps.map((s) => [s.agent, s.actionType, s.status]) } })}`);
  }
  return lastReplyText();
}

/** A new chat, once it is shown empty (counting replies before it switched gave a false count). */
async function newChat() {
  await $('button[aria-label="Create new chat"]').click();
  await browser.waitUntil(async () => (await $$('[data-testid="chat-message-assistant"]')).length === 0 && (await $$('[data-testid="chat-message-user"]')).length === 0, { timeout: 30000 });
}

async function openBoard() {
  const links = await $$('//main//button[normalize-space(.)="Open on the board"]');
  await links[links.length - 1].click();
}

const seed = (list) => browser.execute((items) => {
  const all = JSON.parse(localStorage.getItem('alphonso_echo_decisions_v1') || '[]');
  localStorage.setItem('alphonso_echo_decisions_v1', JSON.stringify([...all, ...items]));
}, list);
const decision = (id, text, topics) => ({ id, kind: 'decision', text, topics, source: { surface: 'chat', by: 'you' }, atMs: Date.now(), status: 'active' });

describe('Alphonso desktop: Echo remembers what you decide', () => {
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
  });

  it('remembers a decision, shows it in Chat, and answers from it in a new chat', async function () {
    const request = await ask('Remember that our launch is on Friday the 14th and the price is $29.');
    const saved = (await decisions()).filter((d) => d.status === 'active');
    console.log('ECHO-E2E remember', JSON.stringify({ steps: request.steps.map((s) => [s.stepId, s.agent, s.actionType, s.status]), saved: saved.map((d) => [d.kind, d.text]) }));
    expect(request.steps.some((s) => s.agent === 'echo' && s.status === 'done')).toBe(true);
    expect(saved.some((d) => /14/.test(d.text))).toBe(true);
    expect(saved.some((d) => /29/.test(d.text))).toBe(true);
    await browser.waitUntil(async () => (await $$('[data-testid="echo-remembered"]')).length > 0, { timeout: 10000 });
    const shown = await $$('[data-testid="echo-remembered"]');
    expect(await shown[shown.length - 1].getText()).toContain('Echo remembered:');

    needsLargerModel(this, 'the answer has to give both the date and the price');
    await newChat();
    const reply = await answer('What did we decide about the launch?', (t) => /14/.test(t) && /29/.test(t));
    console.log('ECHO-E2E recall', JSON.stringify(reply.slice(0, 600)));
    expect(reply).toContain('14');
    expect(reply).toContain('29');
  }).timeout(1600000);

  it('every agent follows a preference: the email has no emoji and the date', async () => {
    await ask('Remember that I prefer short emails without emojis.');
    expect((await decisions()).some((d) => d.status === 'active' && d.kind === 'preference')).toBe(true);
    const request = await ask('/jose Write a short email to Sam about the launch.');
    const writer = request.steps.find((s) => s.agent === 'alphonso');
    const email = await stepSummary(request, writer ? 'alphonso' : 'miya');
    console.log('ECHO-E2E email', JSON.stringify({ steps: request.steps.map((s) => [s.stepId, s.agent, s.actionType, s.status]), email: email.slice(0, 800) }));
    expect(email.length).toBeGreaterThan(20);
    expect(/\p{Extended_Pictographic}/u.test(email)).toBe(false);
    expect(email).toContain('14');
  }).timeout(1600000);

  it('a changed decision replaces the old one, and the recall gives both dates', async function () {
    const moved = await ask('Remember that the launch moved to Saturday the 15th.');
    const all = await decisions();
    console.log('ECHO-E2E moved', JSON.stringify({ steps: moved.steps.map((s) => [s.stepId, s.agent, s.actionType, s.status, s.error]), echo: await stepSummary(moved, 'echo'), decisions: all.map((d) => [d.id, d.status, d.text, d.replaces, d.replacedBy]) }));
    expect(all.some((d) => d.status === 'active' && /15/.test(d.text))).toBe(true);
    // The old decision is marked replaced, unless it also holds something still true (the price):
    // then Echo's model may keep both, and the recall still has to give both dates.
    const old = all.find((d) => /14/.test(d.text) && d.status !== 'forgotten');
    expect(old).toBeTruthy();
    expect(old.status === 'replaced' || /29/.test(old.text)).toBe(true);
    needsLargerModel(this, "Echo's recall has to give the old date and the new one");
    const request = await ask('/jose What did we decide about the launch date?');
    const said = await stepSummary(request, 'echo');
    console.log('ECHO-E2E dates', JSON.stringify(said.slice(0, 800)));
    expect(said).toContain('15');
    expect(said).toContain('14');
  }).timeout(1600000);

  it('Forget in Chat removes a decision, and the next answer leaves it out', async () => {
    await ask('Remember that the launch venue is the Blue Room.');
    const venue = (await decisions()).find((d) => d.status === 'active' && /Blue Room/i.test(d.text));
    expect(venue).toBeTruthy();
    const boxes = await $$('[data-testid="echo-remembered"]');
    const forget = await boxes[boxes.length - 1].$('.//button[normalize-space(.)="Forget"]');
    await forget.click();
    await browser.waitUntil(async () => (await decisions()).find((d) => d.id === venue.id)?.status === 'forgotten', { timeout: 10000 });
    await newChat();
    const reply = await answer('What did we decide about the launch venue?');
    console.log('ECHO-E2E venue', JSON.stringify(reply.slice(0, 400)));
    expect(reply).not.toMatch(/Blue Room/i);
  }).timeout(1600000);

  it('a forget that could mean several waits with a button for each', async () => {
    await seed([
      decision('e2e-party', 'The launch party is at the shop.', ['launch', 'party']),
      decision('e2e-video', 'The launch video goes out at noon.', ['launch', 'video']),
    ]);
    const request = await ask('/jose Forget the launch decision');
    const echo = request.steps.find((s) => s.agent === 'echo');
    console.log('ECHO-E2E forget', JSON.stringify({ status: request.status, echo }));
    expect(request.status).toBe('waiting_setup');
    expect(echo.decisionChoices.length).toBeGreaterThan(1);
    const pick = echo.decisionChoices[0].id;
    await openBoard();
    await (await $(`[data-testid="echo-forget-${pick}"]`)).waitForDisplayed({ timeout: 30000 });
    await (await $(`[data-testid="echo-forget-${pick}"]`)).click();
    await browser.waitUntil(async () => (await decisions()).find((d) => d.id === pick)?.status === 'forgotten', { timeout: 300000, interval: 2000 });
    const others = (await decisions()).filter((d) => echo.decisionChoices.some((c) => c.id === d.id) && d.id !== pick);
    expect(others.every((d) => d.status !== 'forgotten')).toBe(true);
  }).timeout(1600000);

  it('a cleanup changes nothing until you apply it', async () => {
    await seed([
      decision('e2e-dup-a', 'Our newsletter goes out every Monday.', ['newsletter']),
      decision('e2e-dup-b', 'Newsletter: every Monday.', ['newsletter']),
    ]);
    const before = (await decisions()).map((d) => [d.id, d.status, d.text]);
    const request = await ask('/jose Clean up my memory');
    const echo = request.steps.find((s) => s.agent === 'echo' && s.actionType === 'memory_cleanup');
    const after = (await decisions()).map((d) => [d.id, d.status, d.text]);
    console.log('ECHO-E2E cleanup', JSON.stringify({ status: request.status, steps: request.steps.map((s) => [s.stepId, s.agent, s.actionType, s.status]), echo }));
    expect(echo).toBeTruthy();
    expect(request.steps.some((s) => s.actionType === 'memory_forget')).toBe(false);
    expect(after).toEqual(before);
    if (!echo.cleanupSetId) {
      expect(await stepSummary(request, 'echo', 'memory_cleanup')).toBe('Memory looks tidy.');
      return;
    }
    await openBoard();
    await (await $('[data-testid="echo-cleanup"]')).waitForDisplayed({ timeout: 30000 });
    await (await $('[data-testid="echo-cleanup"]')).$('.//button[normalize-space(.)="Apply"]').click();
    await browser.waitUntil(async () => JSON.parse(await browser.execute(() => localStorage.getItem('alphonso_echo_cleanup_v1') || '[]'))
      .find((s) => s.id === echo.cleanupSetId)?.status === 'applied', { timeout: 300000, interval: 2000 });
    console.log('ECHO-E2E applied', JSON.stringify((await decisions()).map((d) => [d.id, d.status, d.text])));
  }).timeout(1600000);

  // Agent roles Part C2: Echo finds a decision worded differently, with the small meaning model.
  it('finds a decision by meaning when the words differ', async () => {
    await seed([decision('e2e-meaning', 'We serve breakfast until eleven.', ['kitchen'])]);
    // A fresh start, so the meaning search reads the seeded decision when it gets ready.
    await browser.refresh();
    await $('[data-alphonso-shell-ready="true"]').waitForExist({ timeout: 60000 });
    await ask('/jose What did we decide about the newsletter?');
    await $('[aria-label="Open settings"]').click();
    const memory = await $('//nav//button[normalize-space(.)="Memory"]');
    await memory.waitForClickable({ timeout: 30000 });
    await memory.click();
    const status = await $('[data-testid="echo-meaning-status"]');
    await status.waitForDisplayed({ timeout: 30000 });
    await browser.waitUntil(async () => /^On\.$|Couldn't|Needs Ollama/.test(await status.getText()), { timeout: 600000, interval: 3000, timeoutMsg: 'the meaning search never got ready' });
    const shown = await status.getText();
    console.log('ECHO-E2E meaning status', shown);
    expect(shown).toBe('On.');
    const request = await ask('/jose What did we decide about morning meals?');
    const said = await stepSummary(request, 'echo');
    console.log('ECHO-E2E meaning', JSON.stringify(said.slice(0, 600)));
    expect(said.toLowerCase()).toContain('breakfast');
  }).timeout(1600000);

  it('no health-check notes were saved during the run', async () => {
    const items = JSON.parse(await browser.execute(() => localStorage.getItem('alphonso_memory_items_v1') || '[]'));
    expect(items.filter((m) => m.source === 'ollama-health-check')).toHaveLength(0);
    expect(await mainText()).toBeTruthy();
  });
});
