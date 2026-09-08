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
