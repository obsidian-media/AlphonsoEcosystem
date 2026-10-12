// Hector Research Desk, end to end: create a draft with one supplied source,
// run live research, and check the source was really fetched by the backend
// and a synthesized report rendered. Needs internet access (it fetches
// https://example.com) and, for the synthesis half, a local Ollama model.
import { enterShell, mainText, ollamaHasModels } from '../helpers.mjs';

const QUESTION = 'What is the IANA example domain used for?';

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
    await $('textarea').setValue('https://example.com');
    await $('button=Create Research Draft').click();
    await $('button=Run Live Research').waitForClickable();
    const text = await mainText();
    expect(text).toContain('1 reports');
    expect(text).toContain(QUESTION);
    expect(text).toContain('not fetched');
  });

  it('fetches the source through the real backend', async () => {
    await $('button=Run Live Research').click();
    await browser.waitUntil(async () => (await mainText()).includes('Researching…'), {
      timeout: 10000,
      timeoutMsg: 'research never started',
    });
    // Includes a possible cold model load for the synthesis step.
    await browser.waitUntil(async () => !(await mainText()).includes('Researching…'), {
      timeout: 300000,
      interval: 2000,
      timeoutMsg: 'research run did not finish within 5 minutes',
    });
    const text = await mainText();
    expect(text).toContain('HTTP 200');
    expect(text).toContain('sources_verified');
    expect(text).toContain('documentation examples');
  });

  it('renders a synthesized report with export options', async function () {
    if (!haveModel) this.skip();
    const text = await mainText();
    expect(text).toContain('OVERVIEW');
    expect(text).toContain('KEY FINDINGS');
    for (const label of ['Markdown', 'PDF', 'PowerPoint']) {
      expect(await $(`button=${label}`).isEnabled()).toBe(true);
    }
  });
});
