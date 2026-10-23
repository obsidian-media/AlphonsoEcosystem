// Creative Studio (Miya): generate a package from an idea with a real local
// model. The package must either come from the model's reply or say plainly
// that it is the built-in template; it must never be the template presented
// as if it were generated. Skipped when no Ollama model is reachable.
import { enterShell, mainText, buttonByText, openPage, ollamaHasModels } from '../helpers.mjs';

const TEMPLATE_HOOK = 'What if your next launch could convert in 30 seconds?';
const TEMPLATE_NOTE = "The model's reply could not be read as a package";

describe('Alphonso desktop Creative Studio', () => {
  before(async function () {
    await enterShell();
    if (!(await ollamaHasModels())) this.skip();
    await openPage('work', 'miya');
  });

  it('generates a package from an idea', async () => {
    // The one-shot generator is the "Quick package" tab since the content
    // factory (2026-10-22). The view is lazy-loaded; wait for it first.
    await (await buttonByText('quick package')).click();
    await browser.waitUntil(async () => (await mainText()).includes('No package generated yet.'), {
      timeoutMsg: 'Creative Studio never rendered',
    });
    const fields = await $$('main input');
    await fields[0].setValue('A 30 second ad for a local coffee shop called Bean There');
    const generate = await buttonByText('generate package');
    await generate.waitForEnabled();
    await generate.click();
    await browser.waitUntil(async () => !(await mainText()).includes('No package generated yet.'), {
      timeout: 300000,
      interval: 2000,
      timeoutMsg: 'no package within 5 minutes',
    });
    const text = await mainText();
    for (const section of ['HOOK', 'SCENES', 'NARRATION']) expect(text).toContain(section);
    const isSilentTemplate = text.includes(TEMPLATE_HOOK) && !text.includes(TEMPLATE_NOTE);
    expect(isSilentTemplate).toBe(false);
  });
});
