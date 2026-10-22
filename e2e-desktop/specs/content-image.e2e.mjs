// Content Studio with image generation: a job with Image enabled must queue
// the image on a real local ComfyUI, finish, and show the picture. Skipped
// when ComfyUI (port 8188) or an Ollama model is not available.
//
// Guards two desktop-only failures: ComfyUI refusing the app window's
// requests with 403, and the finished job overflowing localStorage and
// vanishing from the screen.
import { enterShell, mainText, buttonByText, openPage, ollamaHasModels, warmSelectedModel } from '../helpers.mjs';

async function comfyUiIsUp() {
  try {
    const response = await fetch('http://127.0.0.1:8188/system_stats', { signal: AbortSignal.timeout(3000) });
    return response.ok;
  } catch {
    return false;
  }
}

describe('Alphonso desktop Content Studio image generation', function () {
  // The first image after ComfyUI starts includes a cold checkpoint load.
  this.timeout(480000);

  before(async function () {
    if (!(await comfyUiIsUp())) this.skip();
    await enterShell();
    if (!(await ollamaHasModels())) this.skip();
    // Load the model first: these specs check what it writes, not how fast
    // a cold model comes off the disk.
    this.timeout(400000);
    await warmSelectedModel();
    await $('[data-testid="sidebar-chat-shortcut"]').click();
    await browser.waitUntil(
      async () => !(await mainText()).includes('Start Ollama to enable AI'),
      { timeout: 60000, timeoutMsg: 'the app never selected an Ollama model' }
    );
    await openPage('work', 'content');
  });

  it('generates and displays an image for a content job', async () => {
    const idea = await $('textarea[placeholder="What\'s the idea? (required)"]');
    await idea.waitForDisplayed();
    await idea.setValue('A cozy autumn coffee shop window with a pumpkin latte');
    const create = await buttonByText('create content job');
    await create.waitForEnabled();
    await create.click();
    await browser.waitUntil(async () => (await mainText()).includes('CREATIVE OUTPUT'), {
      timeout: 420000,
      interval: 3000,
      timeoutMsg: 'the job never produced output (a job that vanishes after the image step looks like this)',
    });
    const text = await mainText();
    expect(text).not.toContain('image generation failed');
    const images = await browser.execute(() =>
      [...document.querySelectorAll('main img')].map((img) => ({
        width: img.naturalWidth,
        height: img.naturalHeight,
        inline: String(img.src).startsWith('data:image/'),
      }))
    );
    expect(images.length).toBeGreaterThan(0);
    expect(images[0].inline).toBe(true);
    expect(images[0].width).toBeGreaterThan(0);
    expect(images[0].height).toBeGreaterThan(0);
  });
});
