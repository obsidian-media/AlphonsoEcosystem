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

async function waitForAppDocument() {
  await browser.waitUntil(
    async () =>
      await browser.execute(() => {
        const href = window.location.href;
        const isRealAppDocument = href !== 'about:blank' && href !== 'about:blank/';
        const hasAppRoot = Boolean(
          document.querySelector('[data-alphonso-shell-ready="true"]') ||
            document.querySelector('[data-testid="setup-flow-root"]'),
        );
        return isRealAppDocument && hasAppRoot;
      }),
    {
      timeout: 60000,
      timeoutMsg: 'app window loaded, but no Alphonso shell or setup root appeared',
    },
  );
}

/** Every spec file starts on a fresh WebView profile, which would show the
 *  first-run Setup flow. Mark it complete and reload to reach the main shell. */
export async function enterShell() {
  await waitForPageLoad();
  await waitForAppDocument();

  const wroteStorage = await browser.execute(() => {
    try {
      window.localStorage.setItem('alphonso_setup_complete_v1', 'true');
      return window.localStorage.getItem('alphonso_setup_complete_v1') === 'true';
    } catch {
      return false;
    }
  });

  if (!wroteStorage) {
    // WebView2 can reject JS localStorage access while the document is still
    // transitioning origins. The WebDriver storage endpoint is the supported
    // protocol-level fallback once the app root is present.
    await browser.setLocalStorage('alphonso_setup_complete_v1', 'true');
    const stored = await browser.getLocalStorage('alphonso_setup_complete_v1');
    if (stored !== 'true' && stored?.value !== 'true') {
      throw new Error('desktop E2E could not persist the setup-complete flag');
    }
  }
  await browser.refresh();
  await $(SHELL_READY).waitForExist({ timeout: 60000 });
}

/** Visible text of the main content area, whitespace collapsed. */
export async function mainText() {
  return browser.execute(() => (document.querySelector('main')?.innerText || '').replace(/\s+/g, ' '));
}

/** Wait until the app has chosen a model, then load that model into Ollama
 *  through the real backend command. A cold load from a slow drive can take
 *  minutes (2.5 min seen on a USB hard drive, 2026-10-21); specs that check
 *  *what* the model writes should not also be timing the disk. Call from a
 *  `before` hook with `this.timeout(400000)`. Returns the model name. */
export async function warmSelectedModel() {
  let model = '';
  await browser.waitUntil(
    async () => {
      model = await browser.execute(() => {
        try { return JSON.parse(localStorage.getItem('alphonso_settings') || '{}').selectedModel || ''; } catch { return ''; }
      });
      return Boolean(model);
    },
    { timeout: 90000, interval: 1000, timeoutMsg: 'the app never chose a model to warm up' }
  );
  // Straight from the test runner, not through the window: WebDriver gives a
  // script 30 s, and a cold load can take minutes. This only loads the model.
  const response = await fetch('http://127.0.0.1:11434/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt: 'Reply with: ok', stream: false }),
    signal: AbortSignal.timeout(360000),
  });
  if (!response.ok) throw new Error(`warming ${model} failed: HTTP ${response.status} ${await response.text()}`);
  return model;
}

/** True once a local Ollama answers and has at least one model. The app
 *  starts Ollama itself at launch, so this waits up to ~30s for it. */
export async function ollamaHasModels() {
  for (let attempt = 0; attempt < 15; attempt += 1) {
    try {
      const response = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(3000) });
      if (response.ok) {
        const data = await response.json();
        return Array.isArray(data.models) && data.models.length > 0;
      }
    } catch {
      // Not up yet; the app may still be starting it.
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return false;
}

/** A visible button in the main area whose text contains `text`, ignoring
 *  case. Many buttons are upper-cased by CSS, so their DOM text differs from
 *  what is on screen; this matches either way. */
export function buttonByText(text) {
  const lower = text.toLowerCase();
  return $(
    `//main//button[contains(translate(normalize-space(.), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), "${lower}")]`
  );
}

/** Open a sidebar page by its Space id and nav item id (see Sidebar.tsx). */
export async function openPage(space, item) {
  await $(`[data-testid="space-pill-${space}"]`).click();
  const nav = await $(`[data-testid="sidebar-nav-${item}"]`);
  await nav.waitForDisplayed();
  await nav.click();
}
