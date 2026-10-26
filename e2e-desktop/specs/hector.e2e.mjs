// Agent phase 1 (Hector), in the real app (2026-10-25): a research request through
// Jose comes back as a researched answer, not a search. The report starts with the
// answer, has parts with cited findings, labelled sources, and keeps page text out
// of app storage. Nothing is sent. Needs internet access and a local model; uses
// qwen2.5:7b when installed (as agent-roles.e2e.mjs does).
//
// Optional: ALPHONSO_LIVE_TAVILY_API_KEY (your own Tavily key, set only for the run) is typed
// into Settings → Connectors as a user would, so the search doesn't depend on the free search.
import { buttonByText, enterShell, invoke, mainText, ollamaHasModels, warmSelectedModel, clickSend } from '../helpers.mjs';

const PREFERRED_TEST_MODEL = 'qwen2.5:7b';
const TAVILY_KEY = process.env.ALPHONSO_LIVE_TAVILY_API_KEY || '';

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
const QUESTION = 'How many managed honeybee colonies are there in the European Union, and what are the main causes of colony losses?';

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

async function lastRequest() {
  const requests = JSON.parse(await browser.execute(() => localStorage.getItem('alphonso_jose_requests_v1') || '[]'));
  return requests.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0))[0] || null;
}

describe('Alphonso desktop: Hector researches properly', () => {
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

  it('answers first, with cited findings, labelled sources and small storage', async function () {
    const input = await $('[data-testid="chat-compose-input"]');
    await input.waitForDisplayed();
    await input.setValue(`/jose Research this: ${QUESTION}`);
    await clickSend();
    await browser.waitUntil(async () => {
      await denyAnyApproval();
      const request = await lastRequest();
      const hector = request?.steps?.find((s) => s.agent === 'hector');
      return hector && ['done', 'failed', 'setup_needed', 'not_run'].includes(hector.status);
    }, { timeout: 1500000, interval: 4000, timeoutMsg: "Hector's step never finished" });

    const request = await lastRequest();
    const hector = request.steps.find((s) => s.agent === 'hector');
    const outputs = JSON.parse(await browser.execute(() => localStorage.getItem('alphonso_jose_step_outputs_v1') || '{}'));
    const output = outputs[request.commandId]?.steps?.[hector.stepId];
    const report = output?.schema;
    console.log('HECTOR-E2E', JSON.stringify({ status: hector.status, error: hector.error, answer: report?.answer, parts: report?.subQuestions?.map((q) => [q.question, q.status, q.findings.length]), rounds: report?.rounds, sources: report?.sources?.map((s) => [s.n, s.label, s.reason, s.kind, s.url]) }).slice(0, 4000));

    // With no search key the free search can refuse a busy computer (its bot check): Hector says
    // so and the step waits; that is the intended behaviour, but nothing more can be checked here.
    if (hector.status === 'setup_needed' && /refused/i.test(String(hector.error || ''))) {
      console.log('HECTOR-E2E skipped: the free search refused this computer');
      return this.skip();
    }
    expect(hector.status).toBe('done');
    expect(report.answer.length).toBeGreaterThan(20);
    expect(String(output.summary).startsWith(report.answer)).toBe(true);
    expect(report.subQuestions.filter((q) => q.findings.length > 0).length).toBeGreaterThanOrEqual(1);
    for (const q of report.subQuestions) {
      for (const f of q.findings) {
        expect(f.sources.length).toBeGreaterThan(0);
        for (const n of f.sources) expect(n).toBeLessThanOrEqual(report.sources.length);
      }
    }
    for (const s of report.sources) {
      expect(['read', 'snippet']).toContain(s.label);
      expect(s.url).not.toMatch(/^deepseek:/);
    }
    expect(String(output.summary)).toMatch(/\nSources:\n\[1\] /);

    // No research page text over 600 characters stays in app storage.
    const longest = await browser.execute(() => {
      const rows = JSON.parse(localStorage.getItem('alphonso_hector_reports_v1') || '[]');
      return Math.max(0, ...rows.flatMap((r) => (r.sources || []).map((s) => String(s.snippet || '').length)));
    });
    expect(longest).toBeLessThanOrEqual(600);
  }).timeout(1600000);
});
