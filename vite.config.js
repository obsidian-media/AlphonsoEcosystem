import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom']
  },
  build: {
    // Regression fix for a real QA finding: 'hidden' still WRITES .map files
    // to dist/ (it only omits the //# sourceMappingURL comment referencing
    // them) — Tauri packages everything under dist/ into the installer
    // regardless, so this shipped the app's full, unminified source map
    // (109 files / 5.4 MB, ~57% of the built payload) inside every install.
    // Nothing in this repo's CI/scripts ever uploads or reads these maps
    // (checked — no Sentry/error-tracking source-map step exists), so there
    // was no benefit being traded away by disabling them outright.
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('react-dom')) return 'react-dom';
          if (id.includes('/react/') && !id.includes('react-dom')) return 'react';
          if (id.includes('framer-motion') || id.includes('motion-dom')) return 'vendor';
          if (id.includes('@tauri-apps/api')) return 'tauri-api';
          return 'vendor';
        }
      }
    }
  }
})
