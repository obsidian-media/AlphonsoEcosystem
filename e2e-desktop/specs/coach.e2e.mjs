// Coach Mode opens as a separate Tauri window. It once opened with no
// permissions at all (nothing inside could work), so this checks the window
// really appears and renders its own content, then closes it.
import { enterShell } from '../helpers.mjs';

describe('Alphonso desktop Coach Mode', () => {
  before(enterShell);

  it('opens a working Coach window', async () => {
    const main = await browser.getWindowHandle();
    const before = await browser.getWindowHandles();
    await $('[aria-label="Open Coach mode"]').click();
    await browser.waitUntil(async () => (await browser.getWindowHandles()).length > before.length, {
      timeout: 30000,
      timeoutMsg: 'no Coach window appeared',
    });
    const coach = (await browser.getWindowHandles()).find((handle) => !before.includes(handle));
    try {
      await browser.switchToWindow(coach);
      await browser.waitUntil(
        async () => (await browser.execute(() => document.body.innerText || '')).toUpperCase().includes('COACH MODE'),
        { timeout: 30000, timeoutMsg: 'the Coach window never rendered its content' }
      );
      expect(await browser.getUrl()).toContain('coach=1');
      // The window needs its own Tauri permissions to do anything useful.
      expect(await browser.execute(() => Boolean(window.__TAURI_INTERNALS__))).toBe(true);
      await browser.closeWindow();
    } finally {
      await browser.switchToWindow(main);
    }
  });
});
