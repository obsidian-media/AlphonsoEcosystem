import { test, expect } from '@playwright/test';

test.describe('Visual Regression Snapshots', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-alphonso-shell-ready="true"]', { timeout: 30000 });
  });

  test('app shell layout', async ({ page }) => {
    // Sidebar + topbar + main area at 1280×800
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page).toHaveScreenshot('shell-layout.png', { threshold: 0.2 });
  });

  test('sidebar expanded', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    // Wait for sidebar to render
    await expect(page.getByRole('button', { name: /^Chat$/ })).toBeVisible();
    await expect(page).toHaveScreenshot('sidebar-expanded.png', { threshold: 0.2 });
  });

  test('settings panel renders', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.getByRole('button', { name: 'Open settings' }).click();
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('settings-panel.png', { threshold: 0.2 });
  });
});
