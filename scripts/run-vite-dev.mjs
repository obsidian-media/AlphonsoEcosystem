import { createServer } from 'vite';
import { join } from 'node:path';

const root = process.cwd();
const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || '127.0.0.1';

const server = await createServer({
  configFile: join(root, 'vite.config.js'),
  root,
  server: {
    host,
    port,
    strictPort: true
  }
});

await server.listen();
server.printUrls();
