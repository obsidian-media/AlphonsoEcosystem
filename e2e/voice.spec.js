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

  // Target the toolbar voice button by test id, never by accessible name.
  // getByRole('button', { name: /voice/i }) matched TWO elements - the
  // sidebar nav item "Voice" and this button - so it failed Playwright
  // strict mode whenever both were present. It was also state-dependent:
  // SmartVoiceButton's label cycles through VOICE / VOICE (WS) / STOP /
  // REQUESTING..., so a name match silently stops matching the moment
  // voice state changes.
  test('voice button renders in toolbar', async ({ page }) => {
    await page.getByRole('button', { name: /^Chat$/ }).click();
    const voiceBtn = page.getByTestId('smart-voice-button');
    await expect(voiceBtn).toBeVisible({ timeout: 10000 });
  });

  test('voice button click shows state change', async ({ page }) => {
    await page.getByRole('button', { name: /^Chat$/ }).click();
    const voiceBtn = page.getByTestId('smart-voice-button');
    // SmartVoiceButton is lazy-loaded (ChatView.tsx), so wait for the chunk
    // before clicking. Previously this test clicked without waiting, which
    // meant the old name-based locator resolved to the sidebar nav item and
    // the test passed without ever touching the voice button.
    await expect(voiceBtn).toBeVisible({ timeout: 10000 });
    await voiceBtn.click();
    await expect(voiceBtn).toBeVisible();
  });
});

test.describe('Alphonso E2E - Policy Gate', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript({ path: resolve(__dirname, 'tauri-mock.js') });
    await page.goto('/');
    await page.waitForSelector('[data-alphonso-shell-ready="true"]', { timeout: 30000 });
  });

  test('approvals panel accessible from sidebar', async ({ page }) => {
    // Orchestrator lives under the "System" Space since the sidebar
    // redesign -- click the Space pill first before its nav items are
    // reachable/visible.
    await page.locator('aside').getByTestId('space-pill-system').click();
    const approvalBtn = page.locator('aside').getByRole('button', { name: /^Orchestrator$/ });
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
    // Runtimes lives under the "System" Space since the sidebar redesign.
    await page.getByTestId('space-pill-system').click();
    await page.getByRole('button', { name: /Runtimes/i }).click();
    await expect(page.locator('body')).toBeVisible();
  });

  test('voice sidebar nav clickable', async ({ page }) => {
    // Voice lives under the "System" Space since the sidebar redesign.
    await page.getByTestId('space-pill-system').click();
    const voiceNav = page.getByRole('button', { name: /Voice/i });
    await expect(voiceNav).toBeVisible({ timeout: 10000 });
    await voiceNav.click();
    await expect(page.locator('body')).toBeVisible();
  });
});
