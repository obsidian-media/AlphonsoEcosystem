import { test, expect } from '@playwright/test';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const OUTPUT_PATH = 'D:\\AgentDevDev\\phonso';

test.describe('Runtime tools — supported local-service controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript({ path: resolve(__dirname, 'tauri-mock.js') });
    await page.addInitScript((workspaceRoot) => {
      const existing = JSON.parse(localStorage.getItem('alphonso_settings') || '{}');
      localStorage.setItem('alphonso_settings', JSON.stringify({ ...existing, workspaceRoot }));
    }, OUTPUT_PATH);
    await page.goto('/');
    await page.waitForSelector('[data-alphonso-shell-ready="true"]', { timeout: 30000 });
  });

  test('Runtime Hub opens the managed runtime view', async ({ page }) => {
    await page.getByRole('button', { name: 'Runtimes' }).click();
    await expect(page.getByRole('heading', { name: 'AI Runtime Manager' })).toBeVisible({ timeout: 10000 });
  });

  test('ComfyUI is configured from Settings local services', async ({ page }) => {
    await page.getByRole('button', { name: 'Open settings', exact: true }).click();
    await page.getByRole('button', { name: 'Runtime', exact: true }).click();

    await expect(page.getByText('Local Services', { exact: true })).toBeVisible();
    await expect(page.getByText('ComfyUI', { exact: true })).toBeVisible();
    await expect(page.getByPlaceholder('C:\\ComfyUI')).toBeVisible();

    // A missing directory must block the launch locally. This deliberately
    // avoids attempting an installation or an external process launch in E2E.
    await page.getByText('ComfyUI', { exact: true }).locator('xpath=../..')
      .getByRole('button', { name: 'Launch Now' }).click();
    await expect(page.getByText('Set ComfyUI directory first.')).toBeVisible();
  });

  test('Settings retains the configured workspace root', async ({ page }) => {
    await page.getByRole('button', { name: 'Open settings', exact: true }).click();
    const storedSettings = await page.evaluate(() => JSON.parse(localStorage.getItem('alphonso_settings') || '{}'));
    expect(storedSettings.workspaceRoot).toBe(OUTPUT_PATH);
  });
});
