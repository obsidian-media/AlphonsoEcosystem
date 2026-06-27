import { test, expect } from '@playwright/test';

test.skip(!!process.env.CI, 'Requires Ollama running locally');

test('multi-agent pipeline triggers Jose activity', async ({ page }) => {
  await page.goto('/');

  // Wait for app shell to load
  await page.waitForSelector('[data-testid="chat-input"], textarea, input[placeholder*="command" i], input[placeholder*="message" i]', {
    timeout: 10_000,
  });

  const input = page.locator('textarea, input[type="text"]').first();
  await input.fill('research the latest AI news');
  await input.press('Enter');

  // Wait for Jose/agent activity to appear (up to 30s for LLM response)
  await page.waitForFunction(
    () => {
      const text = document.body.innerText;
      return (
        text.includes('Jose') ||
        text.includes('Hector') ||
        text.includes('agent') ||
        text.includes('activity')
      );
    },
    { timeout: 30_000 }
  );

  // Verify at least something appeared in the activity log or chat
  const bodyText = await page.innerText('body');
  expect(bodyText.length).toBeGreaterThan(100);
});
