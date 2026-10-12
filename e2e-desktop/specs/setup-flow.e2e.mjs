// First-run Setup flow on a clean profile, up to (not including) installing
// anything: intro -> real hardware scan -> intent picker -> recommendation.
// It stops before the install queue so nothing is downloaded or installed.
import { SETUP_ROOT, SHELL_READY, waitForPageLoad } from '../helpers.mjs';

describe('Alphonso desktop first-run setup', () => {
  before(waitForPageLoad);

  it('shows the Setup flow instead of the app shell on a fresh profile', async () => {
    await $(SETUP_ROOT).waitForExist({ timeout: 60000 });
    expect(await $(SHELL_READY).isExisting()).toBe(false);
  });

  it('lets the user skip the intro and shows real scan results', async () => {
    await $('[aria-label="Skip intro"]').click();
    await $('h2=System Scan Results').waitForDisplayed({ timeout: 60000 });
  });

  it('offers all five intents after the scan', async () => {
    await $('button=Continue').click();
    const group = await $('[aria-label="What do you want Alphonso to do?"]');
    await group.waitForDisplayed();
    for (const label of ['Chat Only', 'Chat + Images', 'Chat + Voice', 'Full Power Mode', 'Custom']) {
      expect(await $(`[aria-label^="${label}."]`).isDisplayed()).toBe(true);
    }
  });

  it('shows a recommendation for Chat Only without marking setup complete', async () => {
    await $('[aria-label^="Chat Only."]').click();
    // This screen checks Runtime Hub status and the local Ollama model list
    // first. With an unresponsive Ollama those two timeouts run back to back
    // (measured ~24s), so allow well past that.
    await $('h2=Recommended Setup').waitForDisplayed({ timeout: 60000 });
    const flag = await browser.execute(() => window.localStorage.getItem('alphonso_setup_complete_v1'));
    expect(flag).toBe(null);
  });
});
