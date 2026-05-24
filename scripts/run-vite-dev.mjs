import { createServer } from 'vite';

const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || '127.0.0.1';

const server = await createServer({
  configFile: false,
  root: process.cwd(),
  server: {
    host,
    port,
    strictPort: false
  }
});

await server.listen();
server.printUrls();
