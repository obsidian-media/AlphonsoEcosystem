// OpenRouter (2026-10-30) in the real app, with no key: Chat's OpenRouter tab stays off and
// says what to set up, and Settings → Connectors → AI Models has the OpenRouter section, whose
// Test says plainly that no key works. The live check with a key is in live-accounts.e2e.mjs.
import { enterShell, mainText } from '../helpers.mjs';

describe('Alphonso desktop: OpenRouter without a key', function () {
  this.timeout(240000);

  before(async () => {
    await enterShell();
  });

  it("Chat's OpenRouter tab is off and says what to set up", async () => {
    await $('[data-testid="sidebar-chat-shortcut"]').click();
    await $('[data-testid="chat-compose-input"]').waitForDisplayed({ timeout: 30000 });
    let tab;
    await browser.waitUntil(async () => {
      for (const t of await $$('button[title^="OpenRouter"]')) if (await t.isDisplayed()) { tab = t; return true; }
      return false;
    }, { timeout: 30000, timeoutMsg: "Chat has no OpenRouter tab" });
    expect(await tab.isEnabled()).toBe(false);
    expect(await tab.getAttribute('title')).toBe('OpenRouter is not configured — add a key in Settings → Connectors');
  });

  it('Settings has the OpenRouter section, and its Test says no key works', async () => {
    await $('[aria-label="Open settings"]').click();
    const connectors = await $('//nav//button[normalize-space(.)="Connectors"]');
    await connectors.waitForClickable({ timeout: 30000 });
    await connectors.click();
    const category = await $('[data-testid="connector-category-ai_models"]');
    await category.waitForExist({ timeout: 30000 });
    if ((await category.getAttribute('aria-expanded')) !== 'true') await category.click();
    const field = await $('input[placeholder="sk-or-..."]');
    await field.waitForDisplayed({ timeout: 30000 });
    expect(await mainText()).toMatch(/those models count as paid steps/);
    const test = await $('button[aria-label="Test OpenRouter"]');
    await test.scrollIntoView();
    await test.click();
    await browser.waitUntil(async () => /OpenRouter did not answer for this key/.test(await mainText()), {
      timeout: 30000, timeoutMsg: 'the Test said nothing',
    });
  });
});
