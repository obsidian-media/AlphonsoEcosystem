import { test, expect } from '@playwright/test';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const OUTPUT_PATH = 'D:\\AgentDevDev\\phonso';

test.describe('Content Studio pipeline E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript({ path: resolve(__dirname, 'tauri-mock.js') });
    await page.addInitScript((workspaceRoot) => {
      const existing = JSON.parse(localStorage.getItem('alphonso_settings') || '{}');
      localStorage.setItem('alphonso_settings', JSON.stringify({ ...existing, workspaceRoot }));
    }, OUTPUT_PATH);
    await page.goto('/');
    await page.waitForSelector('[data-alphonso-shell-ready="true"]', { timeout: 30000 });
  });

  async function openContentStudio(page) {
    await page.getByRole('button', { name: 'Content' }).click();
    await page.getByRole('heading', { name: 'Content Studio' }).waitFor({ timeout: 10000 });
  }

  test('Content Studio page renders', async ({ page }) => {
    await openContentStudio(page);
    await expect(page.getByRole('button', { name: 'Create', exact: true })).toBeVisible();
  });

  test('Content Studio idea field and generate button are present', async ({ page }) => {
    await openContentStudio(page);
    const ideaInput = page.getByPlaceholder(/What's the idea/i);
    const generateButton = page.getByRole('button', { name: 'Create Content Job' });

    await expect(ideaInput).toBeVisible();
    await expect(generateButton).toBeDisabled();
  });

  test('Content Studio submits an idea into a job', async ({ page }) => {
    await openContentStudio(page);
    await page.getByPlaceholder(/What's the idea/i).fill('10 tips for better sleep — Instagram Reel');
    const generateButton = page.getByRole('button', { name: 'Create Content Job' });
    await expect(generateButton).toBeEnabled();
    await generateButton.click();

    await expect(page.getByText(/10 tips for better sleep|Untitled|brief/).first()).toBeVisible({ timeout: 15000 });
  });

  test('Content Studio calendar renders after its tab is selected', async ({ page }) => {
    await openContentStudio(page);
    await page.getByRole('button', { name: 'Calendar' }).click();

    await expect(page.getByText('Schedule', { exact: true })).toBeVisible();
    await expect(page.getByText('Su', { exact: true })).toBeVisible();
    await expect(page.getByText('Mo', { exact: true })).toBeVisible();
    await expect(page.getByText(/^[A-Z][a-z]+ \d{4}$/).first()).toBeVisible();
  });

  test('Content Studio receives the E2E workspace root', async ({ page }) => {
    const storedSettings = await page.evaluate(() => JSON.parse(localStorage.getItem('alphonso_settings') || '{}'));
    expect(storedSettings.workspaceRoot).toBe(OUTPUT_PATH);
  });
});
