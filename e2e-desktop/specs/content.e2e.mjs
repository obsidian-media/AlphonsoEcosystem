// Content Studio: create a content job and check the copy was written by a
// real local model, or is clearly labelled as the template. Image/video production is
// not covered here (it needs ComfyUI or Runway). Skipped when no Ollama
// model is reachable.
import { enterShell, mainText, buttonByText, openPage, ollamaHasModels } from '../helpers.mjs';

const IDEA = 'Announce our new seasonal pumpkin latte';

describe('Alphonso desktop Content Studio', () => {
  before(async function () {
    await enterShell();
    if (!(await ollamaHasModels())) this.skip();
    // A job uses the model the app has selected; on a fresh profile that
    // takes a moment after launch.
    await $('[data-testid="sidebar-chat-shortcut"]').click();
    await browser.waitUntil(
      async () => !(await mainText()).includes('Start Ollama to enable AI'),
      { timeout: 60000, timeoutMsg: 'the app never selected an Ollama model' }
    );
    await openPage('work', 'content');
  });

  it('drafts copy with the local model', async () => {
    const idea = await $('textarea[placeholder="What\'s the idea? (required)"]');
    await idea.waitForDisplayed();
    await idea.setValue(IDEA);
    const create = await buttonByText('create content job');
    await create.waitForEnabled();
    await create.click();
    await browser.waitUntil(async () => (await mainText()).includes('CREATIVE OUTPUT'), {
      timeout: 300000,
      interval: 2000,
      timeoutMsg: 'no draft within 5 minutes',
    });
    const notice = await $('[data-testid="content-draft-template-notice"]');
    if (await notice.isExisting()) {
      // A labelled template is acceptable only when the model answered with
      // something unreadable (models do that occasionally). Any other reason
      // means the job never reached the model, which is the bug this guards.
      const reason = await notice.getText();
      if (!reason.includes('could not be read as a draft')) throw new Error(`draft never reached the model: ${reason}`);
      return;
    }
    const text = await mainText();
    expect(text).toContain('HOOK');
    // The template's hook is "Introducing <idea> with a confident and polished launch angle."
    expect(text).not.toContain('with a confident and polished launch angle');
  });
});
