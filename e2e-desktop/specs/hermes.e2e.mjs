// Hermes gateway in the real app (2026-10-30): a stand-in Hermes API server on this computer
// (e2e-desktop/fixtures/hermesStandIn.mjs) is found as one of the user's own profiles through a
// test Hermes folder (wdio.conf.mjs sets HERMES_HOME to HERMES_HOME_FOR_TEST for this spec only),
// shown with its Telegram warning, and connected to Alphonso in Settings. Then three requests run
// as Hermes runs: one whose request to run a command is approved on the board (the stand-in gets
// "once"), one rejected ("deny"), and one stopped from Chat's live line (the stand-in gets /stop).
// No model is needed: Jose's rule plan gives "Write a short note" to Alphonso.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { enterShell, invoke, mainText, buttonByText } from '../helpers.mjs';
import { startHermesStandIn } from '../fixtures/hermesStandIn.mjs';
import { HERMES_HOME_FOR_TEST } from '../fixtures/hermesHome.mjs';

const KEY = 'e2e-stand-in-key-0123456789';
let standIn;

const requests = async () => JSON.parse(await browser.execute(() => localStorage.getItem('alphonso_jose_requests_v1') || '[]'))
  .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));

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

async function openConnectors() {
  await $('[aria-label="Open settings"]').click();
  await browser.waitUntil(async () => /API CREDENTIALS|General/.test(await mainText()), { timeout: 30000 });
  await buttonByText('Connectors').click();
}

/** Sends a request from Chat and returns its id once it is saved. */
async function ask(text) {
  const before = new Set((await requests()).map((r) => r.id));
  await $('[data-testid="sidebar-chat-shortcut"]').click();
  const input = await $('[data-testid="chat-compose-input"]');
  await input.waitForDisplayed();
  await input.setValue(text);
  const send = await $('[data-testid="chat-send-button"]');
  await send.waitForEnabled({ timeout: 30000 });
  await send.click();
  await browser.waitUntil(async () => (await requests()).some((r) => !before.has(r.id)), {
    timeout: 120000, interval: 1000, timeoutMsg: `the request was never saved: ${text}`,
  });
  return (await requests()).find((r) => !before.has(r.id)).id;
}

const requestById = async (id) => (await requests()).find((r) => r.id === id);

async function waitForHermesApproval(id) {
  await browser.waitUntil(async () => (await requestById(id))?.steps.some((s) => s.agent === 'alphonso' && s.hermesApproval), {
    timeout: 180000, interval: 1000, timeoutMsg: "Alphonso's step never waited on Hermes's request",
  });
}

/** Chat's live line links the running request to the board. */
async function openOnBoard() {
  const link = await $('[data-testid="chat-live-open-board"]');
  await link.waitForClickable({ timeout: 60000 });
  await link.click();
}

describe('Alphonso desktop: Hermes gateway', function () {
  this.timeout(1200000);

  before(async () => {
    standIn = await startHermesStandIn({ key: KEY });
    rmSync(HERMES_HOME_FOR_TEST, { recursive: true, force: true });
    const folder = join(HERMES_HOME_FOR_TEST, 'profiles', 'work');
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, 'config.yaml'), [
      'platforms:',
      '  api_server:',
      '    enabled: true',
      '    extra:',
      `      port: ${standIn.port}`,
      '  telegram:',
      '    enabled: true',
      'platform_toolsets:',
      '  api_server: [web, memory]',
      'approvals:',
      '  mode: manual',
      '',
    ].join('\n'));
    await enterShell();
    // Hermes's own requests always ask; Approval Mode off keeps the step's own approval out of the way.
    await useSettings({ showPlanFirst: 'never', approvalMode: false });
  });

  after(async () => {
    await standIn?.close();
    rmSync(HERMES_HOME_FOR_TEST, { recursive: true, force: true });
  });

  it("finds the user's own profile with its Telegram warning, and connects it to Alphonso", async () => {
    await openConnectors();
    const find = await $('[data-testid="hermes-find"]');
    await find.waitForExist({ timeout: 30000 });
    await find.scrollIntoView();
    await find.click();
    const card = await $('[data-testid="hermes-user-work"]');
    await card.waitForDisplayed({ timeout: 30000 });
    expect(await card.getText()).toContain('Answering');
    expect(await (await $('[data-testid="hermes-warning-work"]')).getText()).toMatch(/own Telegram skip Alphonso's approvals/);
    await (await $('[data-testid="hermes-connect-agent-work"]')).selectByAttribute('value', 'alphonso');
    await (await $('[data-testid="hermes-connect-key-work"]')).setValue(KEY);
    await (await $('[data-testid="hermes-connect-work"]')).click();
    await browser.waitUntil(async () => /Alphonso now uses your profile work\./.test(await mainText()), { timeout: 30000 });
    const telegram = await $('[data-testid="hermes-messaging-warning-telegram"]');
    await telegram.waitForExist({ timeout: 30000 });
    expect(await telegram.getText()).toContain('Your Hermes profile work also has its own Telegram');
  });

  it("waits on the board for Hermes's request to run a command, and Approve answers once", async () => {
    standIn.armApproval();
    const id = await ask('/jose Write a short note: approve-me');
    await waitForHermesApproval(id);
    expect(standIn.calls.runs.some((r) => /^You are Alphonso\./.test(r.instructions || ''))).toBe(true);
    await openOnBoard();
    const card = await $('[data-testid="jose-hermes-approval-alphonso"]');
    await card.waitForDisplayed({ timeout: 30000 });
    expect(await card.getText()).toContain("Alphonso's Hermes profile wants to run: ls build");
    await (await buttonByText('Approve: Alphonso')).click();
    await browser.waitUntil(async () => (await requestById(id)).status === 'done', { timeout: 180000, interval: 1000, timeoutMsg: 'the request never finished' });
    expect(standIn.calls.approvals.at(-1).choice).toBe('once');
    console.log('HERMES-E2E approved', JSON.stringify((await requestById(id)).steps.map((s) => [s.stepId, s.agent, s.status])));
  });

  it('Reject answers deny, and the request still ends', async () => {
    standIn.armApproval();
    const id = await ask('/jose Write a short note: approve-me again');
    await waitForHermesApproval(id);
    await openOnBoard();
    await (await $('[data-testid="jose-hermes-approval-alphonso"]')).waitForDisplayed({ timeout: 30000 });
    await (await buttonByText('Reject: Alphonso')).click();
    await browser.waitUntil(async () => !['running', 'queued'].includes((await requestById(id)).status), { timeout: 180000, interval: 1000 });
    expect(standIn.calls.approvals.at(-1).choice).toBe('deny');
  });

  it("shows Hermes's progress on Chat's live line, and Stop stops the run", async () => {
    const stopsBefore = standIn.calls.stops.length;
    const id = await ask('/jose Write a short note: keep-going');
    await browser.waitUntil(async () => (await mainText()).includes('Alphonso: searching the web'), {
      timeout: 180000, interval: 1000, timeoutMsg: "Hermes's progress never showed on Chat's live line",
    });
    await (await $('[data-testid="chat-live-stop"]')).click();
    await browser.waitUntil(async () => (await requestById(id)).status === 'stopped', { timeout: 60000, interval: 1000, timeoutMsg: 'the request was never stopped' });
    await browser.waitUntil(async () => standIn.calls.stops.length > stopsBefore, { timeout: 30000, timeoutMsg: 'the Hermes run was never stopped' });
  });
});
