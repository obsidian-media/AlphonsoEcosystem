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
        // Real measured coverage as of 2026-08-20 (post hook-test-coverage
        // recovery, 279 files / 4,199 tests): lines 53.08%, branches 41.06%,
        // functions 44.86%, statements 50.91%. Floors below set with margin
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
