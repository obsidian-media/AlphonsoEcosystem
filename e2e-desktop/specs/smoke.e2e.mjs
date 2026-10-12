// Desktop smoke suite: boots the real app and proves the basics that the
// mocked web-mode Playwright suite cannot: the real window loads, the real
// Rust backend answers, and every sidebar page renders without crashing.
//
// Navigation targets mirror SPACES in src/components/Sidebar.tsx. A page
// added there without being added here is not covered by this suite.
const SPACES = [
  { id: 'home', items: ['mission', 'session_history'] },
  { id: 'work', items: ['project_execution', 'content', 'automation', 'miya'] },
  { id: 'research', items: ['hector'] },
  { id: 'boardroom', items: ['mission_room'] },
  {
    id: 'system',
    items: ['orchestrator', 'ecosystem', 'agent_performance', 'runtimes', 'voice', 'connectors', 'operator'],
  },
];

const SHELL_READY = '[data-alphonso-shell-ready="true"]';

async function pageErrors() {
  return browser.execute(() => window.__alphonsoE2eErrors || []);
}

async function crashText() {
  // ViewErrorBoundary renders "<label> crashed"; the boot failure screen
  // renders "Boot error".
  return browser.execute(() => {
    const text = document.body.innerText || '';
    const match = text.match(/^.*(crashed|Boot error).*$/m);
    return match ? match[0] : null;
  });
}

describe('Alphonso desktop smoke', () => {
  before(async () => {
    // Fresh profile means the first-run Setup flow would show. That flow has
    // its own spec to earn; here we mark it complete and reload so the main
    // shell is what gets tested.
    await browser.waitUntil(async () => (await browser.execute(() => document.readyState)) === 'complete', {
      timeoutMsg: 'app window never finished loading',
    });
    await browser.execute(() => {
      window.localStorage.setItem('alphonso_setup_complete_v1', 'true');
    });
    await browser.refresh();
    await $(SHELL_READY).waitForExist({ timeout: 60000 });
    await browser.execute(() => {
      window.__alphonsoE2eErrors = [];
      window.addEventListener('error', (event) => {
        window.__alphonsoE2eErrors.push(String(event.message));
      });
      window.addEventListener('unhandledrejection', (event) => {
        window.__alphonsoE2eErrors.push(`unhandledrejection: ${String(event.reason)}`);
      });
    });
  });

  it('runs inside a real Tauri window', async () => {
    const isTauri = await browser.execute(() => Boolean(window.__TAURI_INTERNALS__));
    expect(isTauri).toBe(true);
  });

  it('gets a real answer from the Rust backend', async () => {
    const result = await browser.execute(() =>
      window.__TAURI_INTERNALS__
        .invoke('runtime_check_prerequisites')
        .then((value) => ({ ok: true, value }))
        .catch((error) => ({ ok: false, error: String(error) }))
    );
    expect(result.ok).toBe(true);
    expect(typeof result.value).toBe('object');
    expect(result.value).not.toBe(null);
  });

  for (const space of SPACES) {
    for (const item of space.items) {
      it(`opens ${space.id} / ${item} without crashing`, async () => {
        await $(`[data-testid="space-pill-${space.id}"]`).click();
        const nav = await $(`[data-testid="sidebar-nav-${item}"]`);
        await nav.waitForDisplayed();
        await nav.click();
        // Lazy-loaded views: give the chunk time to load and render.
        await browser.pause(1500);
        expect(await crashText()).toBe(null);
        expect(await $(SHELL_READY).isExisting()).toBe(true);
        const mainText = await browser.execute(() => (document.querySelector('main')?.innerText || '').trim());
        expect(mainText.length).toBeGreaterThan(0);
      });
    }
  }

  it('opens Settings without crashing', async () => {
    await $('[aria-label="Open settings"]').click();
    await browser.pause(1500);
    expect(await crashText()).toBe(null);
  });

  it('raised no uncaught page errors along the way', async () => {
    expect(await pageErrors()).toEqual([]);
  });
});
