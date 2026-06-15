import { test, expect } from '@playwright/test';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

test.describe('Alphonso boot sequence', () => {

  test.beforeEach(async ({ page }) => {
    await page.addInitScript({ path: resolve(__dirname, 'tauri-mock.js') });
  });

  test('shell renders within 3 seconds', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/');
    await page.waitForSelector('[data-alphonso-shell-ready="true"]', { timeout: 30000 });
    const elapsed = Date.now() - startTime;
    console.log(`Boot time: ${elapsed}ms`);
    expect(elapsed).toBeLessThan(30000);
  });

  test('boot performance marks are recorded', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-alphonso-shell-ready="true"]', { timeout: 30000 });
    const marks = await page.evaluate(() => {
      return performance.getEntriesByType('mark')
        .filter((m) => m.name.startsWith('alphonso:'))
        .map((m) => m.name);
    });
    expect(marks).toContain('alphonso:main:start');
    expect(marks).toContain('alphonso:main:render-start');
    expect(marks).toContain('alphonso:main:boot-ready');
  });

});
