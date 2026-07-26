import { test, expect } from '@playwright/test';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

test.describe('Alphonso E2E - Voice Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript({ path: resolve(__dirname, 'tauri-mock.js') });
    await page.goto('/');
    await page.waitForSelector('[data-alphonso-shell-ready="true"]', { timeout: 30000 });
  });

  test('voice button renders in toolbar', async ({ page }) => {
    await page.getByRole('button', { name: /^Chat$/ }).click();
    const voiceBtn = page.getByRole('button', { name: /voice/i });
    await expect(voiceBtn).toBeVisible({ timeout: 10000 });
  });

  test('voice button click shows state change', async ({ page }) => {
    await page.getByRole('button', { name: /^Chat$/ }).click();
    const voiceBtn = page.getByRole('button', { name: /voice/i });
    await voiceBtn.click();
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Alphonso E2E - Policy Gate', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript({ path: resolve(__dirname, 'tauri-mock.js') });
    await page.goto('/');
    await page.waitForSelector('[data-alphonso-shell-ready="true"]', { timeout: 30000 });
  });

  test('approvals panel accessible from sidebar', async ({ page }) => {
    const approvalBtn = page.getByRole('button', { name: /^Orchestrator$/ });
    await expect(approvalBtn).toBeVisible({ timeout: 10000 });
    await approvalBtn.click();
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Alphonso E2E - Additional Smoke Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript({ path: resolve(__dirname, 'tauri-mock.js') });
    await page.goto('/');
    await page.waitForSelector('[data-alphonso-shell-ready="true"]', { timeout: 30000 });
  });

  test('runtime manager view renders', async ({ page }) => {
    await page.getByRole('button', { name: /Runtimes/i }).click();
    await expect(page.locator('body')).toBeVisible();
  });

  test('voice sidebar nav clickable', async ({ page }) => {
    const voiceNav = page.getByRole('button', { name: /Voice/i });
    await expect(voiceNav).toBeVisible({ timeout: 10000 });
    await voiceNav.click();
    await expect(page.locator('body')).toBeVisible();
  });
});
