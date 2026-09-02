import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    headless: true,
    viewport: { width: 1280, height: 800 }
  },
  webServer: {
    command: 'npm run e2e:server',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    timeout: 120000
  },
  timeout: 60000,
  retries: 2
});
