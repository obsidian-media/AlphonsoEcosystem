import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom']
  },
  build: {
    // Real production crash on macOS: a user hit a boot-time
    // "SyntaxError: Unexpected token '{'" inside a dynamically-imported
    // chunk before React ever mounted (stack trace: parseModule ->
    // asyncFunctionResume -> promiseReactionJob - a lazy-loaded module
    // failing to parse in the OS's own WebKit). Root cause: this project
    // never set build.target, so it fell back to Vite's default
    // 'baseline-widely-available', which resolves to safari16.4+
    // (requires macOS Ventura 13.3, released 2023-03) - but
    // src-tauri/tauri.conf.json's bundle.macOS.minimumSystemVersion
    // promises support down to "10.15" (Catalina, whose last Safari was
    // 13.1.x). Any user on macOS 10.15 through 13.2 was shipped syntax
    // (likely ES2022 class static blocks or similar, probably from a
    // vendor dependency, not app code) their WebKit can't parse - a
    // build-target/declared-OS-support mismatch, not a code bug in any
    // one file. Pinning target to the OS version this app already
    // promises to support, rather than silently narrowing that promise.
    // (2026-09-30: minimumSystemVersion is now "11.0" because releases are
    // Apple Silicon only, which needs macOS 11+. safari13.1 is kept as a
    // conservative floor; it is strictly more compatible than needed.)
    target: 'safari13.1',
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
          // jspdf/pptxgenjs are only reached via a dynamic import() inside
          // hectorExportService.ts (the PDF/PowerPoint export buttons) --
          // the catch-all 'vendor' bucket below lumps every node_modules
          // package together regardless of static vs. dynamic import, which
          // silently pulled these two large, rarely-used libraries into the
          // main eagerly-loaded bundle and pushed it over the 2MB CI cap.
          // Giving them their own chunk keeps them out of the initial load.
          if (id.includes('jspdf') || id.includes('pptxgenjs') || id.includes('jszip') || id.includes('image-size')) return 'export-libs';
          return 'vendor';
        }
      }
    }
  }
})
