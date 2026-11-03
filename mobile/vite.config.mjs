// The phone app's web build: the desktop's phone screens (src/mobile) and styles, packaged
// by Capacitor (mobile/ios, mobile/android). Build settings such as VITE_PHONE_RELAY_URL
// come from the repository's environment files, as for the desktop build.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');

export default defineConfig({
  root: here,
  envDir: repo,
  base: './',
  plugins: [react()],
  resolve: { dedupe: ['react', 'react-dom'] },
  css: { postcss: repo },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Tailwind v4's CSS needs Safari 16.4: the iPhone app's minimum is iOS 16.4.
    target: 'safari16.4',
    sourcemap: false,
  },
});
