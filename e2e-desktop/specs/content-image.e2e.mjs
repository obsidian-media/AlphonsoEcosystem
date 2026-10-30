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
  // Hooks' limits are set here: this harness ignores this.timeout() inside a hook (QA batch 1).
  this.timeout(480000);

  before(async function () {
    if (!(await comfyUiIsUp())) this.skip();
    await enterShell();
    if (!(await ollamaHasModels())) this.skip();
    // Load the model first: these specs check what it writes, not how fast
    // a cold model comes off the disk.
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
    try {
      await browser.waitUntil(async () => (await mainText()).includes('CREATIVE OUTPUT'), { timeout: 420000, interval: 3000 });
    } catch {
      // Say what the job was doing, so an intermittent failure (QA Bug 29)
      // can be diagnosed from the log.
      const state = await browser.execute(() => {
        let jobs = [];
        try { jobs = JSON.parse(localStorage.getItem('alphonso_content_catalyst_jobs_v1') || '[]'); } catch { /* unreadable */ }
        const job = Array.isArray(jobs) ? jobs[0] : null;
        return {
          jobs: Array.isArray(jobs) ? jobs.length : 0,
          storedChars: (localStorage.getItem('alphonso_content_catalyst_jobs_v1') || '').length,
          status: job?.status,
          step: job?.currentStep,
          logs: (job?.logs || []).slice(-5).map((l) => `${l.level}: ${l.message}`),
          errors: (window.__alphonsoE2eErrors || []).map(String).slice(-3),
          screen: (document.querySelector('main')?.innerText || '').replace(/\s+/g, ' ').slice(-400),
        };
      });
      throw new Error(`the job never produced output: ${JSON.stringify(state)}`);
    }
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
