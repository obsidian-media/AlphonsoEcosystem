import { build, preview } from 'vite';
import { join } from 'node:path';

const root = process.cwd();
const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || '127.0.0.1';
const configFile = join(root, 'vite.config.js');

// E2E exercises the production bundle. This avoids the Vite development
// optimizer, which can delay the local server from binding long enough for
// Playwright's webServer readiness check to time out on Windows.
await build({
  configFile,
  root,
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});

const server = await preview({
  configFile,
  root,
  preview: {
    host,
    port,
    strictPort: true
  }
});

server.printUrls();
