// The sign-in page's build. Its Firebase web config comes from .env.local, written by
// scripts/firebase-web-config.mjs from the Firebase project (never committed).
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  root: here,
  base: '/',
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false, target: 'es2022' },
});
