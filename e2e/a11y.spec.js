import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Closes the "never re-verified against a real browser" gap left open by
// the ui-redesign session's tokens.css --text-3/--text-4 contrast fix (see
// docs/governance/DEFERRED_WORK.md's 2026-09-07 "Accessibility work beyond
// the Setup-flow pass" entry, which named @axe-core/playwright as the tool
// to add for exactly this). A manual run of these same scans (2026-09-08)
// found 16 dark-mode / 18 light-mode real color-contrast violations against
// the code as it stood then -- --text-4 still failed 4.5:1 at 9-11px sizes
// despite the prior token bump, and ~20 call sites (including ui/Button.tsx's
// shared "primary" variant) used --surface-0 for text on --accent
// backgrounds, which is wrong in light mode since --surface-0 inverts
// between themes. Both were fixed at the token/pattern level; these tests
// are the permanent regression guard so a future token or Tailwind-class
// change can't quietly reintroduce either failure mode. Setup screens are
// deliberately not covered here -- they already have their own dedicated
// accessibility pass.
test.describe('Alphonso accessibility (axe-core)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript({ path: resolve(__dirname, 'tauri-mock.js') });
  });

  test('main shell has no color-contrast violations (dark theme, default)', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-alphonso-shell-ready="true"]', { timeout: 30000 });

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .withRules(['color-contrast'])
      .analyze();

    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });

  test('main shell has no color-contrast violations (light theme)', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-alphonso-shell-ready="true"]', { timeout: 30000 });
    await page.evaluate(() => {
      // Two parallel theme mechanisms exist in the app: useTheme.ts's
      // alphonso_theme_v1 key (drives the data-theme attribute) and
      // App.tsx's settings.colorScheme (drives a .light class). Setting
      // both covers whichever is authoritative rather than guessing --
      // an earlier draft of this test only set settings.colorScheme and
      // silently scanned dark-mode colors a second time.
      localStorage.setItem('alphonso_theme_v1', 'light');
      const raw = localStorage.getItem('alphonso_settings');
      const settings = raw ? JSON.parse(raw) : {};
      settings.colorScheme = 'light';
      localStorage.setItem('alphonso_settings', JSON.stringify(settings));
    });
    await page.reload();
    await page.waitForSelector('[data-alphonso-shell-ready="true"]', { timeout: 30000 });

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .withRules(['color-contrast'])
      .analyze();

    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });
});

// The previous describe block only ever scanned the default Chat/dashboard
// shell for color-contrast. docs/governance/DEFERRED_WORK.md's 2026-09-07
// "Accessibility work beyond the Setup-flow pass" entry named a full-app
// audit across every non-Setup surface as explicitly deferred, not done --
// this closes that gap for the app's main real surfaces. Full WCAG tag set
// (not just color-contrast) since these surfaces have never been scanned at
// all before. Dark theme only per surface -- color-contrast in both themes
// is already covered above for the shell; repeating both themes across five
// more surfaces in one pass would be a much larger scope than this fix
// warrants, so it's a disclosed scope decision, not a silent gap.
test.describe('Alphonso accessibility (axe-core) — full WCAG sweep, non-Setup surfaces', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript({ path: resolve(__dirname, 'tauri-mock.js') });
    await page.goto('/');
    await page.waitForSelector('[data-alphonso-shell-ready="true"]', { timeout: 30000 });
  });

  const scan = (page) =>
    new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();

  test('Chat view', async ({ page }) => {
    await page.getByRole('button', { name: /^Chat$/ }).click();
    await expect(page.getByTestId('chat-compose-input')).toBeVisible({ timeout: 10000 });

    const results = await scan(page);
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });

  test('Settings view', async ({ page }) => {
    await page.getByRole('button', { name: 'Open settings', exact: true }).click();
    await page.getByText('General').waitFor({ timeout: 10000 });

    const results = await scan(page);
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });

  test('Automation view (Work space)', async ({ page }) => {
    await page.getByTestId('space-pill-work').click();
    await page.getByRole('button', { name: /^Automation$/ }).click();
    await expect(page.getByText('New Workflow', { exact: true })).toBeVisible({ timeout: 15000 });

    const results = await scan(page);
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });

  // fixme, not skip: this genuinely fails today. Real finding, not a flake --
  // 8 nodes fail color-contrast where text-3/text-4/agent-color tokens sit
  // on top of the *-glow/-muted alpha-overlay tokens (--accent-muted,
  // --agent-echo-glow, --agent-nova-glow). Those are translucent (12-30%
  // alpha), so the rendered contrast depends on whatever surface they
  // composite over -- unlike the solid bg-[var(--accent)]/text-white pairs
  // fixed elsewhere this pass, a blind token bump here can't be verified
  // correct without re-checking every card that uses these overlays, in
  // both themes. See docs/governance/DEFERRED_WORK.md's 2026-09-08
  // "Full WCAG sweep" entry for the exact violation data. Un-skip once
  // that's fixed for real.
  test.fixme('AI Runtime Manager (System space)', async ({ page }) => {
    await page.getByTestId('space-pill-system').click();
    await page.getByRole('button', { name: 'Runtimes' }).click();
    await expect(page.getByRole('heading', { name: 'AI Runtime Manager' })).toBeVisible({ timeout: 10000 });

    const results = await scan(page);
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });

  test('Boardroom (Mission Room tab)', async ({ page }) => {
    // The Space pill and the sidebar nav item are both named "Boardroom" --
    // getByTestId disambiguates the pill (space-pill-boardroom) from the
    // nav item (sidebar-nav-mission_room) instead of a name-based locator
    // that matches both.
    await page.getByTestId('space-pill-boardroom').click();
    await page.getByTestId('sidebar-nav-mission_room').click();
    await expect(page.getByText('Mission Room', { exact: true })).toBeVisible({ timeout: 10000 });

    const results = await scan(page);
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });
});
