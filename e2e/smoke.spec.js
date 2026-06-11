import { test, expect } from '@playwright/test';

test.describe('Alphonso E2E smoke tests', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-alphonso-shell-ready="true"]', { timeout: 15000 });
  });

  test('launch renders shell', async ({ page }) => {
    await expect(page.locator('[data-alphonso-shell-ready="true"]')).toBeVisible();
  });

  test('navigate to Chat tab and verify input renders', async ({ page }) => {
    await page.getByRole('button', { name: /^Chat$/ }).click();
    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 5000 });
  });

  test('navigate to Dashboard tab', async ({ page }) => {
    await page.getByRole('button', { name: /^Dashboard$/ }).click();
    await expect(page.locator('main')).toBeVisible();
  });

  test('navigate to Settings tab and verify settings render', async ({ page }) => {
    await page.getByRole('button', { name: 'Open settings' }).click();
    await expect(page.getByText('Active Inference Model')).toBeVisible({ timeout: 5000 });
  });

  test('navigate to Connectors tab', async ({ page }) => {
    await page.getByRole('button', { name: /^Connectors$/ }).click();
    await expect(page.locator('main')).toBeVisible();
  });

  test('send message and verify response', async ({ page }) => {
    await page.getByRole('button', { name: /^Chat$/ }).click();
    const input = page.locator('textarea').first();
    await input.fill('Hello, what is 2 + 2?');
    await input.press('Enter');
    await expect(page.locator('[data-role="assistant"], .message-bubble, .assistant-message')).toBeVisible({ timeout: 30000 });
  });

});
