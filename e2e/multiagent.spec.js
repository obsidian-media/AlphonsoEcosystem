import { test, expect } from '@playwright/test';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

/**
 * T2 — Multi-Agent E2E Test
 *
 * Scope:
 * - Open the app at localhost:5173
 * - Submit a command that triggers Jose intake
 * - Confirm the policy gate fires (check for the policy receipt or a blocked/approved response)
 * - Confirm the activity log shows an agent entry
 *
 * Note: This test is marked @slow because it exercises the full
 *       orchestration pipeline in a real browser context.
 *       Ollama is mocked via tauri-mock.js so no local LLM is required.
 */

test.describe.slow('Multi-Agent Orchestration Pipeline', () => {

  test.beforeEach(async ({ page }) => {
    await page.addInitScript({ path: resolve(__dirname, 'tauri-mock.js') });
    await page.goto('/');
    await page.waitForSelector('[data-alphonso-shell-ready="true"]', { timeout: 30000 });
  });

  test('Jose intake — policy gate fires on risky command', async ({ page }) => {
    // Navigate to Chat tab
    await page.getByRole('button', { name: /^Chat$/ }).click();

    // Find the chat textarea
    const textarea = page.locator('textarea').last();
    await expect(textarea).toBeVisible({ timeout: 10000 });

    // Submit a command that the router should classify as needing Jose
    // (a command with a connector or filesystem action keyword)
    await textarea.fill('Send a message to the Telegram channel about project status');

    const sendBtn = page.getByRole('button', { name: /Send message/i });
    await expect(sendBtn).toBeVisible();
    await sendBtn.click();

    // Wait for the assistant response to appear (the mock returns a stub response)
    await expect(page.locator('[role="log"] .assistant, [data-testid="assistant-message"]').first()).toBeVisible({ timeout: 15000 });

    // Verify policy receipt or blocked/approved indicator appears
    // ApprovalPanel renders when a high-risk action triggers policy gate
    await expect(page.locator('[data-testid="approval-panel"], [data-alphonso-policy-gate="triggered"], text=Policy, text=Approval, text=Blocked, text=Approved').first()).toBeVisible({ timeout: 15000 });
  });

  test('Activity log shows agent entry after pipeline', async ({ page }) => {
    await page.getByRole('button', { name: /^Chat$/ }).click();

    const textarea = page.locator('textarea').last();
    await expect(textarea).toBeVisible({ timeout: 10000 });

    await textarea.fill('Analyze the current project for security risks');

    const sendBtn = page.getByRole('button', { name: /Send message/i });
    await sendBtn.click();

    // Wait for a response
    await expect(page.locator('[role="log"] .assistant, [data-testid="assistant-message"]').first()).toBeVisible({ timeout: 15000 });

    // Navigate to Runtime / Activity tab and check for agent activity entry
    // The RightPanel should show an agent entry (e.g., "Sentinel", "Jose", or activity badge)
    await expect(page.locator('[data-testid="agent-activity"], [data-alphonso-activity], text=Agent, text=Jose, text=Sentinel, text=activity').first()).toBeVisible({ timeout: 15000 });
  });

  test('Receipt persists after page reload', async ({ page }) => {
    await page.getByRole('button', { name: /^Chat$/ }).click();

    const textarea = page.locator('textarea').last();
    await expect(textarea).toBeVisible({ timeout: 10000 });

    await textarea.fill('Run a workflow for marketing campaign');

    const sendBtn = page.getByRole('button', { name: /Send message/i });
    await sendBtn.click();

    // Wait for orchestration to register
    await expect(page.locator('[role="log"] .assistant, [data-testid="assistant-message"]').first()).toBeVisible({ timeout: 15000 });

    // Reload page
    await page.reload();
    await page.waitForSelector('[data-alphonso-shell-ready="true"]', { timeout: 30000 });

    // After reload, the chat should still show the previous assistant response
    // confirming that receipts were persisted
    await expect(page.locator('[role="log"] .assistant, [data-testid="assistant-message"]').first()).toBeVisible({ timeout: 15000 });
  });

});