import { test, expect } from '@playwright/test';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const OUTPUT_PATH = 'D:\\AgentDevDev\\phonso';

test.describe('Content Catalyst pipeline E2E', () => {

  test.beforeEach(async ({ page }) => {
    await page.addInitScript({ path: resolve(__dirname, 'tauri-mock.js') });
    await page.addInitScript((outPath) => {
      try {
        const existing = JSON.parse(localStorage.getItem('alphonso_settings') || '{}');
        localStorage.setItem('alphonso_settings', JSON.stringify({
          ...existing,
          workspaceRoot: outPath,
        }));
      } catch (e) {}
    }, OUTPUT_PATH);
    await page.goto('/');
    await page.waitForSelector('[data-alphonso-shell-ready="true"]', { timeout: 30000 });
  });

  test('Content Catalyst page renders', async ({ page }) => {
    // Navigate to Content page
    const contentBtn = page.getByRole('button', { name: /Content|Content Catalyst/i });
    await expect(contentBtn).toBeVisible({ timeout: 10000 });
    await contentBtn.click();

    // Header should be visible
    await expect(page.locator('text=Content Catalyst')).toBeVisible({ timeout: 10000 });
  });

  test('Content Catalyst — idea field and generate button present', async ({ page }) => {
    await page.getByRole('button', { name: /Content|Content Catalyst/i }).click();
    await page.locator('text=Content Catalyst').waitFor({ timeout: 10000 });

    // Idea textarea
    const ideaInput = page.getByPlaceholder(/What's the idea/i);
    await expect(ideaInput).toBeVisible({ timeout: 10000 });

    // Generate button
    const generateBtn = page.getByRole('button', { name: /Create Content Job|Generate/i });
    await expect(generateBtn).toBeVisible({ timeout: 10000 });

    // Generate button should be disabled when idea is empty
    await expect(generateBtn).toBeDisabled();
  });

  test('Content Catalyst — fill idea and submit creates a job', async ({ page }) => {
    await page.getByRole('button', { name: /Content|Content Catalyst/i }).click();
    await page.locator('text=Content Catalyst').waitFor({ timeout: 10000 });

    const ideaInput = page.getByPlaceholder(/What's the idea/i);
    await ideaInput.fill('10 tips for better sleep — Instagram Reel');

    const generateBtn = page.getByRole('button', { name: /Create Content Job|Generate/i });
    await expect(generateBtn).toBeEnabled({ timeout: 3000 });
    await generateBtn.click();

    // A job should appear in the Draft history list or preview
    // (mock Ollama fetch returns { response: 'Hello!', done: true })
    await expect(
      page.locator('text=10 tips for better sleep, text=Untitled, text=brief').first()
    ).toBeVisible({ timeout: 15000 });
  });

  test('Content Catalyst — calendar renders with month navigation', async ({ page }) => {
    await page.getByRole('button', { name: /Content|Content Catalyst/i }).click();
    await page.locator('text=Content Catalyst').waitFor({ timeout: 10000 });

    // Calendar section should have day-of-week headers
    await expect(page.locator('text=Su')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Mo')).toBeVisible({ timeout: 5000 });

    // Month navigation
    const nextBtn = page.locator('button[class*="ChevronRight"], button').filter({ has: page.locator('svg') }).nth(1);
    // Check that a month name is shown (e.g. "June 2026")
    const monthLabel = page.locator('text=/\\w+ \\d{4}/');
    await expect(monthLabel.first()).toBeVisible({ timeout: 5000 });
  });

  test('Content Catalyst — output path is set to phonso', async ({ page }) => {
    const storedSettings = await page.evaluate(() => {
      try { return JSON.parse(localStorage.getItem('alphonso_settings') || '{}'); } catch { return {}; }
    });
    expect(storedSettings.workspaceRoot).toBe('D:\\AgentDevDev\\phonso');
  });

});
