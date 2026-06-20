import { test, expect } from '@playwright/test';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

test.describe('Alphonso E2E smoke tests', () => {

  test.beforeEach(async ({ page }) => {
    await page.addInitScript({ path: resolve(__dirname, 'tauri-mock.js') });
    await page.goto('/');
    await page.waitForSelector('[data-alphonso-shell-ready="true"]', { timeout: 30000 });
  });

  test('shell renders with data attribute', async ({ page }) => {
    await expect(page.locator('[data-alphonso-shell-ready="true"]')).toBeVisible();
  });

  test('sidebar navigation buttons are present', async ({ page }) => {
    await expect(page.getByRole('button', { name: /^Chat$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Dashboard$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open settings', exact: true })).toBeVisible();
    await expect(page.locator('[data-alphonso-shell-ready="true"]')).toBeVisible();
    await expect(page.locator('main')).toBeVisible();
  });

});
