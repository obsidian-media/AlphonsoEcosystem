import { preview } from 'vite';

const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '127.0.0.1';

const server = await preview({
  configFile: false,
  root: process.cwd(),
  preview: {
    host,
    port,
    strictPort: true
  }
});

server.printUrls();
