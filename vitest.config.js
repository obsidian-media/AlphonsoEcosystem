import { defineConfig } from 'vitest/config';

export default defineConfig({
  optimizeDeps: {
    exclude: ['@tauri-apps/api']
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setupTests.js',
    globals: true,
    include: ['src/**/*.{test,spec}.{js,jsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/**/*.{js,jsx,ts,tsx}'],
      exclude: ['src/test/**', 'src/**/*.test.{js,jsx}', 'src/**/*.spec.{js,jsx}'],
      thresholds: {
        lines: 20
      }
    }
  }
});
