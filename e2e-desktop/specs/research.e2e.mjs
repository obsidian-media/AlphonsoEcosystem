// Hector Research Desk, end to end (updated for agent phase 1, 2026-10-25): a draft
// with one supplied source, then "Run Live Research", which is now a one-step Hector
// request through Jose. The report shows the answer first with numbered sources, and
// the run is on the Requests board. Needs internet access and, for the write-up, a
// local Ollama model.
import { enterShell, mainText, ollamaHasModels } from '../helpers.mjs';

const QUESTION = 'What is the IANA example domain used for?';

async function reports() {
  return JSON.parse(await browser.execute(() => localStorage.getItem('alphonso_hector_reports_v1') || '[]'));
}

describe('Alphonso desktop research (Hector)', () => {
  let haveModel = false;

  before(async () => {
    await enterShell();
    haveModel = await ollamaHasModels();
    await $('[data-testid="space-pill-research"]').click();
    await $('[data-testid="sidebar-nav-hector"]').click();
  });

  it('creates a research draft that records the supplied source', async () => {
    const question = await $('input[placeholder="What do you want Hector to research?"]');
    await question.waitForDisplayed();
    await question.setValue(QUESTION);
    await $('textarea').setValue('https://example.com/');
    await $('button=Create Research Draft').click();
    await $('button=Run Live Research').waitForClickable();
    const text = await mainText();
    expect(text).toContain('1 reports');
    expect(text).toContain(QUESTION);
  });

  it('researches through Jose and shows the answer with numbered sources', async function () {
    if (!haveModel) this.skip();
    await $('button=Run Live Research').click();
    await browser.waitUntil(async () => {
      const r = (await reports()).find((x) => x.researchQuestion === QUESTION);
      return r && ['research_done', 'research_failed'].includes(r.status);
    }, { timeout: 600000, interval: 3000, timeoutMsg: 'the research run did not finish within 10 minutes' });
    const report = (await reports()).find((x) => x.researchQuestion === QUESTION);
    console.log('RESEARCH-DESK', JSON.stringify({ status: report.status, summary: String(report.summary).slice(0, 300), sources: (report.sources || []).map((s) => [s.url, s.label]) }));
    expect(report.status).toBe('research_done');
    expect(report.research.answer.length).toBeGreaterThan(10);
    for (const source of report.sources) expect(String(source.snippet || '').length).toBeLessThanOrEqual(600);
    await browser.waitUntil(async () => (await mainText()).includes('Sources ('), { timeout: 20000, timeoutMsg: 'the Desk never showed the sources' });

    // The run is a Jose request on the board.
    const requests = JSON.parse(await browser.execute(() => localStorage.getItem('alphonso_jose_requests_v1') || '[]'));
    expect(requests.some((r) => r.source === 'research_desk' && r.text === QUESTION)).toBe(true);
  }).timeout(700000);

  it('exports the report', async function () {
    if (!haveModel) this.skip();
    for (const label of ['Markdown', 'PDF', 'PowerPoint']) {
      expect(await $(`button=${label}`).isEnabled()).toBe(true);
    }
  });
});
