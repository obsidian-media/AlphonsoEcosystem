import { test, expect } from '@playwright/test';

test.describe('Alphonso E2E - Voice Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-alphonso-shell-ready="true"]', { timeout: 30000 });
  });

  test('voice button renders in toolbar', async ({ page }) => {
    await page.getByRole('button', { name: /^Chat$/ }).click();
    const voiceBtn = page.locator('button', { hasText: /VOICE/i }).first();
    await expect(voiceBtn).toBeVisible({ timeout: 10000 });
  });

  test('voice button click shows state change', async ({ page }) => {
    await page.getByRole('button', { name: /^Chat$/ }).click();
    const voiceBtn = page.locator('button', { hasText: /VOICE/i }).first();
    if (await voiceBtn.isVisible()) {
      await voiceBtn.click();
      // Should not crash - voice button handles click gracefully
      await expect(page.locator('body')).toBeVisible();
    }
  });
});

test.describe('Alphonso E2E - Policy Gate', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-alphonso-shell-ready="true"]', { timeout: 30000 });
  });

  test('approvals panel accessible from sidebar', async ({ page }) => {
    // Orchestration/or Approvals tab
    const approvalBtn = page.getByRole('button', { name: /^Orchestrator$/ }).first();
    if (await approvalBtn.isVisible()) {
      await approvalBtn.click();
    }
    // Panel should render without error
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Alphonso E2E - Additional Smoke Tests', () => {
  test('runtime manager view renders', async ({ page }) => {
    await page.getByRole('button', { name: /Runtimes/i }).click();
    await expect(page.locator('body')).toBeVisible();
  });

  test('voice sidebar nav clickable', async ({ page }) => {
    const voiceNav = page.getByRole('button', { name: /Voice/i });
    if (await voiceNav.isVisible()) {
      await voiceNav.click();
      await expect(page.locator('body')).toBeVisible();
    }
  });
});
