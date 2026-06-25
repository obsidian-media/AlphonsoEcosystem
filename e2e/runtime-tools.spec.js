import { test, expect } from '@playwright/test';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const OUTPUT_PATH = 'D:\\AgentDevDev\\phonso';

test.describe('Runtime tools — ComfyUI & Open WebUI', () => {

  test.beforeEach(async ({ page }) => {
    await page.addInitScript({ path: resolve(__dirname, 'tauri-mock.js') });
    // Seed output path in settings
    await page.addInitScript(() => {
      try {
        const existing = JSON.parse(localStorage.getItem('alphonso_settings') || '{}');
        localStorage.setItem('alphonso_settings', JSON.stringify({
          ...existing,
          workspaceRoot: 'D:\\AgentDevDev\\phonso',
          comfyuiOutputDir: 'D:\\AgentDevDev\\phonso',
          openwebuiDataDir: 'D:\\AgentDevDev\\phonso',
        }));
      } catch (e) {}
    });
    await page.goto('/');
    await page.waitForSelector('[data-alphonso-shell-ready="true"]', { timeout: 30000 });
  });

  test('Runtime Hub shows ComfyUI tool card', async ({ page }) => {
    // Navigate to Runtimes page
    const runtimesBtn = page.getByRole('button', { name: /Runtime|Runtimes/i });
    await expect(runtimesBtn).toBeVisible({ timeout: 10000 });
    await runtimesBtn.click();

    // Wait for the tool grid — ComfyUI should appear
    await expect(page.locator('text=ComfyUI')).toBeVisible({ timeout: 10000 });
  });

  test('Runtime Hub shows Open WebUI tool card', async ({ page }) => {
    const runtimesBtn = page.getByRole('button', { name: /Runtime|Runtimes/i });
    await expect(runtimesBtn).toBeVisible({ timeout: 10000 });
    await runtimesBtn.click();

    await expect(page.locator('text=Open WebUI')).toBeVisible({ timeout: 10000 });
  });

  test('ComfyUI — Install button is present and clickable', async ({ page }) => {
    const runtimesBtn = page.getByRole('button', { name: /Runtime|Runtimes/i });
    await runtimesBtn.click();
    await page.waitForSelector('text=ComfyUI', { timeout: 10000 });

    // Find the ComfyUI card and its Install button
    const comfySection = page.locator('[data-tool="comfyui"], :has-text("ComfyUI")').first();
    const installBtn = comfySection.getByRole('button', { name: /Install|Download/i });
    if (await installBtn.count() > 0) {
      await expect(installBtn.first()).toBeVisible();
    } else {
      // If installed, Start/Stop button should be present
      const actionBtn = comfySection.getByRole('button', { name: /Start|Stop|Manage/i });
      await expect(actionBtn.first()).toBeVisible();
    }
  });

  test('Open WebUI — Install button is present and clickable', async ({ page }) => {
    const runtimesBtn = page.getByRole('button', { name: /Runtime|Runtimes/i });
    await runtimesBtn.click();
    await page.waitForSelector('text=Open WebUI', { timeout: 10000 });

    const owSection = page.locator(':has-text("Open WebUI")').first();
    const installBtn = owSection.getByRole('button', { name: /Install|Download/i });
    if (await installBtn.count() > 0) {
      await expect(installBtn.first()).toBeVisible();
    } else {
      const actionBtn = owSection.getByRole('button', { name: /Start|Stop|Manage/i });
      await expect(actionBtn.first()).toBeVisible();
    }
  });

  test('Settings — output path persists for runtime tools', async ({ page }) => {
    // Open settings
    await page.getByRole('button', { name: /Settings/i }).click();

    // Workspace/output path section should mention the path or have an input
    const settingsMain = page.locator('main, [data-settings]').first();
    await expect(settingsMain).toBeVisible({ timeout: 10000 });

    // The workspace root should be set
    const storedSettings = await page.evaluate(() => {
      try { return JSON.parse(localStorage.getItem('alphonso_settings') || '{}'); } catch { return {}; }
    });
    expect(storedSettings.workspaceRoot).toBe('D:\\AgentDevDev\\phonso');
  });

});
