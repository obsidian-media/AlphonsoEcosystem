// Jose's plans changing while they run, in the real app (Jose redesign phase
// 4, 2026-10-23): a step waiting for approval is approved on the board and
// the request carries on; Chat links to the board while a request runs; a
// research report's review steps each record a verdict, and a review that
// asked for changes has a revision and a re-review ("Round 1") that ran before
// the steps after it. The model decides the verdicts, so this checks the
// loop's shape, not a fixed verdict. Skipped without a local model; uses
// qwen2.5:7b when installed, with "Show Jose's plan first" set to Never.
import { enterShell, invoke, buttonByText, mainText, ollamaHasModels, warmSelectedModel } from '../helpers.mjs';

const PREFERRED_TEST_MODEL = 'qwen2.5:7b';

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

// Earlier replies have the link too; the newest one belongs to the latest request.
async function openLatestOnBoard() {
  const links = await $$('//main//button[normalize-space(.)="Open on the board"]');
  await links[links.length - 1].click();
}

const savedRequests = async () => JSON.parse(await browser.execute(() => localStorage.getItem('alphonso_jose_requests_v1') || '[]'));
const latest = async () => (await savedRequests()).slice(-1)[0];
const settled = (request) => request && !['running', 'waiting_plan_approval'].includes(request.status);

describe('Alphonso desktop: Jose plans that change while they run', () => {
  let baseSettings = {};

  before(async function () {
    await enterShell();
    if (!(await ollamaHasModels())) this.skip();
    this.timeout(400000);
    baseSettings = (await installedModels()).includes(PREFERRED_TEST_MODEL) ? { selectedModel: PREFERRED_TEST_MODEL } : {};
    // Every step's own work asks first, so this request waits for approval.
    await useSettings({ ...baseSettings, showPlanFirst: 'never', approvalMode: true, effectApprovals: { read: true, write_own_work: true } });
    await warmSelectedModel();
    await openChat();
  });

  it('links to the board while a request runs', async function () {
    this.timeout(900000);
    const before = (await savedRequests()).length;
    await send('Plan this fresh: write a one-line tagline for a small coffee shop.');
    const live = await $('[data-testid="chat-live-open-board"]');
    await live.waitForExist({ timeout: 600000, timeoutMsg: 'Chat never showed the board link while the request ran' });
    await browser.waitUntil(async () => (await savedRequests()).length > before, { timeout: 60000, timeoutMsg: 'no request was saved' });
    await browser.waitUntil(async () => settled(await latest()), { timeout: 300000, interval: 2000, timeoutMsg: 'the request never stopped running' });
  });

  it('carries the request on when its waiting steps are approved on the board', async function () {
    this.timeout(1800000);
    const request = await latest();
    expect(request.status).toBe('waiting_approval');
    await openLatestOnBoard();
    await browser.waitUntil(async () => (await mainText()).includes('Waiting for your approval'), {
      timeout: 30000, timeoutMsg: 'the board did not open on the waiting request',
    });
    // Each approval runs that step and the steps after it, until the next one that asks.
    for (let round = 0; round < 10; round += 1) {
      const current = (await savedRequests()).find((r) => r.id === request.id);
      if (current.status !== 'waiting_approval') break;
      const approve = await $('//main//button[starts-with(normalize-space(.), "Approve and carry on")]');
      await approve.waitForClickable({ timeout: 30000 });
      const waitingBefore = current.steps.filter((s) => s.status === 'waiting_approval').map((s) => s.stepId).join(',');
      await approve.click();
      await browser.waitUntil(async () => {
        const now = (await savedRequests()).find((r) => r.id === request.id);
        return now.status !== 'running' && now.steps.filter((s) => s.status === 'waiting_approval').map((s) => s.stepId).join(',') !== waitingBefore;
      }, { timeout: 900000, interval: 3000, timeoutMsg: 'approving a step did not carry the request on' });
    }
    const finished = (await savedRequests()).find((r) => r.id === request.id);
    expect(finished.status).toBe('done');
    expect(finished.steps.every((s) => s.status === 'done')).toBe(true);
  });

  it('records a verdict for every review in a research report, and a revision ran when one asked for changes', async function () {
    this.timeout(2400000);
    await useSettings({ ...baseSettings, showPlanFirst: 'never', effectApprovals: {} });
    await openChat();
    const before = (await savedRequests()).length;
    await send('Research what the IANA example domain is used for and write a short report.');
    await browser.waitUntil(async () => (await savedRequests()).length > before, { timeout: 600000, interval: 2000, timeoutMsg: 'no request was saved' });
    await browser.waitUntil(async () => settled(await latest()), { timeout: 2300000, interval: 5000, timeoutMsg: 'the research report never finished' });
    const request = await latest();
    const reviews = request.steps.filter((s) => s.reviewOf && s.status === 'done');
    expect(reviews.length).toBeGreaterThan(0);
    for (const review of reviews) expect(['pass', 'fix']).toContain(review.verdict);
    for (const review of reviews.filter((r) => r.verdict === 'fix' && (r.round || 0) < 2)) {
      const round = (review.round || 0) + 1;
      const revision = request.steps.find((s) => s.revises && s.round === round && s.needs.includes(review.stepId));
      expect(revision).toBeTruthy();
      const reReview = request.steps.find((s) => s.reviewOf === revision.stepId);
      expect(reReview).toBeTruthy();
      expect(revision.status).toBe('done');
      // Every step that needs the re-review started after it ended.
      for (const later of request.steps.filter((s) => s.needs.includes(reReview.stepId) && s.startedAtMs)) {
        expect(later.startedAtMs).toBeGreaterThanOrEqual(reReview.endedAtMs);
      }
    }
    const rounds = request.steps.filter((s) => s.round);
    if (rounds.length > 0) {
      await openLatestOnBoard();
      await browser.waitUntil(async () => (await mainText()).includes('Round 1'), { timeout: 30000, timeoutMsg: 'the board did not show Round 1' });
    }
  });
});
