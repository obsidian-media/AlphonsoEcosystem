import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  optimizeDeps: {
    exclude: ['@tauri-apps/api']
  },
  resolve: {
    alias: {
      express: path.resolve(__dirname, 'bridge/tests/__mocks__/express.js'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setupTests.js',
    globals: true,
    testTimeout: 30000,
    include: ['src/**/*.{test,spec}.{js,jsx,ts,tsx}', 'bridge/**/*.{test,spec}.{js,jsx,ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/**/*.{js,jsx,ts,tsx}'],
      exclude: ['src/test/**', 'src/**/*.test.{js,jsx}', 'src/**/*.spec.{js,jsx}'],
      thresholds: {
        // Real measured coverage as of 2026-09-05 (post test-coverage-gap
        // remediation, 317 files / 4,815 tests): lines 57.81%, branches 45.62%,
        // functions 50.32%, statements 55.65%. Floors below set with margin
        // to lock in the gain without being fragile to minor fluctuation.
        // `functions` was previously hard-set to 0 to unblock CI years ago
        // and never revisited despite real functions coverage climbing well
        // past that — raised to a real enforced floor.
        lines: 48,
        branches: 38,
        functions: 30,
        statements: 48
      }
    }
  }
});
