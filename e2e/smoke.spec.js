import { test, expect } from '@playwright/test';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

test.describe('Alphonso E2E smoke tests', () => {

  test.beforeEach(async ({ page }) => {
    await page.addInitScript({ path: resolve(__dirname, 'tauri-mock.js') });
    await page.goto('/');
    await page.waitForSelector('[data-alphonso-shell-ready="true"]', { timeout: 30000 });
  });

  test('shell renders with data attribute', async ({ page }) => {
    await expect(page.locator('[data-alphonso-shell-ready="true"]')).toBeVisible();
  });

  test('sidebar navigation buttons are present', async ({ page }) => {
    await expect(page.getByRole('button', { name: /^Chat$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Dashboard$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open settings', exact: true })).toBeVisible();
    await expect(page.locator('[data-alphonso-shell-ready="true"]')).toBeVisible();
    await expect(page.locator('main')).toBeVisible();
  });

  // Epic 1 Task 1: Chat flow
  test('chat flow — send message and receive streamed response', async ({ page }) => {
    // Navigate to Chat tab (default, but ensure it)
    await page.getByRole('button', { name: /^Chat$/ }).click();

    // Wait for ChatView textarea
    const textarea = page.locator('textarea').last();
    await expect(textarea).toBeVisible({ timeout: 10000 });

    // Type a message
    await textarea.fill('Hello Alphonso');

    // Send via button
    const sendBtn = page.getByRole('button', { name: /Send message/i });
    await expect(sendBtn).toBeVisible();
    await sendBtn.click();

    // Mock returns { response: 'Hello!', done: true } — wait for it to appear in the message list
    await expect(page.locator('text=Hello!').first()).toBeVisible({ timeout: 15000 });
  });

  // Epic 1 Task 2: Workflow builder
  test('workflow builder — navigate and render', async ({ page }) => {
    // Click Workflows in sidebar
    await page.getByRole('button', { name: /^Workflows$/ }).click();

    // AutomationView / WorkflowBuilderView should load
    // Look for the "New Workflow" button or workflow list header that WorkflowBuilderView renders
    await expect(
      page.locator('text=New Workflow, text=Workflows, text=Build and run').first()
    ).toBeVisible({ timeout: 15000 });
  });

  // Epic 1 Task 3: Connector health panel
  test('connector health — navigate and render panel', async ({ page }) => {
    // Click Connectors in sidebar
    await page.getByRole('button', { name: /^Connectors$/ }).click();

    // ConnectorHealthPanel should render with tabs
    await expect(
      page.locator('text=Health Monitor, text=Setup').first()
    ).toBeVisible({ timeout: 15000 });
  });

});
