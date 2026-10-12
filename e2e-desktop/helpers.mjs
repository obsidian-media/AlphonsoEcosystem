// Shared helpers for the desktop specs.
export const SHELL_READY = '[data-alphonso-shell-ready="true"]';
export const SETUP_ROOT = '[data-testid="setup-flow-root"]';

/** Call a real Tauri command from inside the app window. Never throws:
 *  resolves to { ok: true, value } or { ok: false, error }. */
export async function invoke(command, args = {}) {
  try {
    return await browser.execute(
      async (cmd, payload) => {
        try {
          return { ok: true, value: await window.__TAURI_INTERNALS__.invoke(cmd, payload) };
        } catch (error) {
          return { ok: false, error: String(error) };
        }
      },
      command,
      args
    );
  } catch (error) {
    // Some WebView2 driver versions report a rejected command as a script
    // error instead of letting the in-page catch handle it.
    return { ok: false, error: String(error?.message ?? error) };
  }
}

export async function waitForPageLoad() {
  await browser.waitUntil(async () => (await browser.execute(() => document.readyState)) === 'complete', {
    timeoutMsg: 'app window never finished loading',
  });
}

/** Every spec file starts on a fresh WebView profile, which would show the
 *  first-run Setup flow. Mark it complete and reload to reach the main shell. */
export async function enterShell() {
  await waitForPageLoad();
  await browser.execute(() => {
    window.localStorage.setItem('alphonso_setup_complete_v1', 'true');
  });
  await browser.refresh();
  await $(SHELL_READY).waitForExist({ timeout: 60000 });
}
