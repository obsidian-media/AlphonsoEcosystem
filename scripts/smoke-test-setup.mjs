/**
 * One-off manual smoke-test script for the Smart Installer Setup flow.
 * NOT part of the permanent e2e suite (e2e/*.spec.js) — this is a throwaway
 * verification tool for PR #233, run against `npm run dev` (a plain browser
 * host). It exercises the UI/flow-correctness half of the smoke test only;
 * it cannot verify real hardware scan, real installs, or the real Tauri
 * launch transition — those need the native `npm run tauri dev` window.
 *
 * Usage: node scripts/smoke-test-setup.mjs http://127.0.0.1:5181
 */
import { chromium } from 'playwright';

const baseUrl = process.argv[2] || 'http://127.0.0.1:5181';
const shotDir = 'D:\\AgentDevWork\\repos\\AlphonsoEcosystem\\.claude\\worktrees\\smart-installer\\.smoke-shots';

import { mkdirSync } from 'node:fs';
mkdirSync(shotDir, { recursive: true });

const errors = [];
let shotIndex = 0;

async function shot(page, label) {
  shotIndex += 1;
  const path = `${shotDir}\\${String(shotIndex).padStart(2, '0')}-${label}.png`;
  await page.screenshot({ path, fullPage: true });
  console.log(`[shot] ${label} -> ${path}`);
}

async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[console.error] ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`));

  // Force first-run Setup: clear both the new and legacy completion flags.
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.removeItem('alphonso_setup_complete_v1');
    localStorage.removeItem('alphonso_onboarding_complete_v1');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });

  console.log('=== PASS 1: Chat Only -> Recommended Setup -> Install Queue ===');
  await page.waitForTimeout(2000);
  await shot(page, 'scan-screen');

  // SystemScan resolves (degraded/unknown in a browser host) into a results
  // screen with a Continue button -- it does not auto-advance.
  await page.waitForSelector('text=/System Scan Results/i', { timeout: 15000 }).catch(() => null);
  const scanContinue = page.getByText('Continue', { exact: true }).first();
  if (await scanContinue.isVisible().catch(() => false)) {
    await scanContinue.click();
  } else {
    errors.push('[flow] SystemScan "Continue" button not found/visible');
  }
  await page.waitForSelector('text=/Chat Only/i', { timeout: 15000 }).catch(() => null);
  await shot(page, 'intent-selection');

  const chatOnlyTile = page.getByText(/Chat Only/i).first();
  if (await chatOnlyTile.isVisible().catch(() => false)) {
    await chatOnlyTile.click();
    await page.waitForTimeout(1500);
    await shot(page, 'recommended-setup');
  } else {
    errors.push('[flow] Chat Only intent tile not found/visible');
  }

  const looksGood = page.getByText(/Looks Good/i).first();
  if (await looksGood.isVisible().catch(() => false)) {
    await looksGood.click();
    await page.waitForTimeout(1500);
    await shot(page, 'install-queue');
  } else {
    errors.push('[flow] "Looks Good -> Install" button not found/visible on RecommendedSetup');
  }

  await browser.close();

  console.log('\n=== PASS 2: Custom -> AgentGrid path ===');
  const browser2 = await chromium.launch();
  const page2 = await browser2.newPage({ viewport: { width: 1280, height: 900 } });
  page2.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[console.error][pass2] ${msg.text()}`);
  });
  page2.on('pageerror', (err) => errors.push(`[pageerror][pass2] ${err.message}`));

  await page2.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page2.evaluate(() => {
    localStorage.removeItem('alphonso_setup_complete_v1');
    localStorage.removeItem('alphonso_onboarding_complete_v1');
  });
  await page2.reload({ waitUntil: 'domcontentloaded' });

  await page2.waitForSelector('text=/System Scan Results/i', { timeout: 15000 }).catch(() => null);
  const scanContinue2 = page2.getByText('Continue', { exact: true }).first();
  if (await scanContinue2.isVisible().catch(() => false)) {
    await scanContinue2.click();
  } else {
    errors.push('[flow][pass2] SystemScan "Continue" button not found/visible');
  }
  await page2.waitForSelector('text=/Custom/i', { timeout: 15000 }).catch(() => null);

  const customTile = page2.getByText(/^Custom$/i).first();
  if (await customTile.isVisible().catch(() => false)) {
    await customTile.click();
    await page2.waitForTimeout(1500);
    await shot(page2, 'agent-grid');
  } else {
    errors.push('[flow] Custom intent tile not found/visible');
  }

  const alphonsoTile = page2.getByText(/Alphonso/i).first();
  const alphonsoVisible = await alphonsoTile.isVisible().catch(() => false);
  if (!alphonsoVisible) errors.push('[flow] AgentGrid: Alphonso tile not visible');

  const miyaTile = page2.getByText(/Miya/i).first();
  const miyaVisible = await miyaTile.isVisible().catch(() => false);
  if (!miyaVisible) errors.push('[flow] AgentGrid: Miya tile not visible');

  await browser2.close();

  console.log('\n=== RESULT ===');
  if (errors.length === 0) {
    console.log('NO ERRORS CAPTURED');
  } else {
    console.log(`${errors.length} ISSUE(S):`);
    for (const e of errors) console.log(' - ' + e);
  }
  process.exitCode = errors.length === 0 ? 0 : 1;
}

run().catch((err) => {
  console.error('[fatal]', err);
  process.exitCode = 1;
});
