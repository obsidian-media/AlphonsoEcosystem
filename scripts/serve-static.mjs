import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { join, extname, resolve, relative, isAbsolute } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DIST = join(__dirname, '../dist');
const PORT = Number(process.env.PORT || 4173);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.webp': 'image/webp',
};

function resolveStaticFilePath(requestPath) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(requestPath);
  } catch {
    return null;
  }
  if (!decodedPath.startsWith('/') || decodedPath.includes('\0')) return null;

  const candidate = resolve(DIST, `.${decodedPath === '/' ? '/index.html' : decodedPath}`);
  const pathFromDist = relative(DIST, candidate);
  if (pathFromDist === '..' || pathFromDist.startsWith('../') || isAbsolute(pathFromDist)) return null;
  return candidate;
}

createServer(async (req, res) => {
  const urlPath = new URL(req.url, 'http://localhost').pathname;

  if (urlPath === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }

  const filePath = resolveStaticFilePath(urlPath);
  if (!filePath) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    const content = await readFile(filePath);
    const mime = MIME[extname(filePath)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(content);
  } catch {
    try {
      const html = await readFile(join(DIST, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  }
}).listen(PORT, '0.0.0.0', () => {
  console.log(`Alphonso web UI ready on http://0.0.0.0:${PORT}`);
});
