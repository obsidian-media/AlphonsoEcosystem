import { test, expect } from '@playwright/test';

test('launch → chat send → response render', async ({ page }) => {
  await page.goto('/');
  // Wait for the app shell to load
  await page.waitForSelector('[data-alphonso-shell-ready="true"]', { timeout: 15000 });

  // Find the chat input and send a message
  const input = page.locator('textarea, input[type="text"]').first();
  await input.fill('Hello, what is 2 + 2?');
  await input.press('Enter');

  // Wait for a response to appear (any assistant message bubble)
  await expect(page.locator('[data-role="assistant"], .message-bubble, .assistant-message')).toBeVisible({ timeout: 30000 });
});
