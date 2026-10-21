// A real chat round trip: a typed message reaches a local Ollama model and a
// real reply renders. Skipped (not failed) when no Ollama with at least one
// model is reachable, so the suite stays usable on machines without it.
//
// Relies on the isolated backend profile (see isolation.e2e.mjs): the
// conversation lands in the throwaway test store, not real chat history.
import { enterShell, ollamaHasModels, warmSelectedModel } from '../helpers.mjs';

describe('Alphonso desktop chat', () => {
  before(async function () {
    await enterShell();
    if (!(await ollamaHasModels())) this.skip();
    // Load the model first: these specs check what it writes, not how fast
    // a cold model comes off the disk.
    this.timeout(400000);
    await warmSelectedModel();
  });

  it('sends a message and renders a real model reply', async () => {
    await $('[data-testid="sidebar-chat-shortcut"]').click();
    const input = await $('[data-testid="chat-compose-input"]');
    await input.waitForDisplayed();
    // On a fresh profile the app needs a moment to see Ollama and pick a
    // default model; sending before that fails with "No Ollama model is
    // selected". The compose bar shows this hint until a model is chosen.
    await browser.waitUntil(
      async () => !(await browser.execute(() => document.querySelector('main')?.innerText || '')).includes('Start Ollama to enable AI'),
      { timeout: 60000, timeoutMsg: 'the app never selected an Ollama model' }
    );
    await input.setValue('What is 2 + 2? Reply with just the number.');
    const send = await $('[data-testid="chat-send-button"]');
    // Typing reflows the compose area, so wait until nothing overlaps the button.
    await send.waitForClickable();
    await send.click();

    await $('[data-testid="chat-message-user"]').waitForExist();
    // First reply can include a cold model load.
    await browser.waitUntil(
      async () => {
        const replies = await $$('[data-testid="chat-message-assistant"]');
        if (replies.length === 0) return false;
        const text = await replies[replies.length - 1].getText();
        return /\b4\b|four/i.test(text);
      },
      { timeout: 150000, interval: 1000, timeoutMsg: 'no model reply containing the answer within 150s' }
    );
  });
});
