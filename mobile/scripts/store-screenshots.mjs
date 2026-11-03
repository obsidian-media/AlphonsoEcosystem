// App Store screenshots from "Try a demo" (phone app phase 3 part C). Serves the built app (mobile/dist,
// run `npm run build` first), opens it in a phone-sized Chromium and saves each screen at Apple's
// 6.9-inch iPhone size, 1320 × 2868 (440 × 956 points at 3x). Only sample data is shown.
// Run from mobile/: node scripts/store-screenshots.mjs
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { chromium } from 'playwright';

const DIST = resolve('dist');
const OUT = resolve('..', 'docs', 'store', 'screenshots', 'iphone-6.9');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json' };

const server = http.createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  const file = join(DIST, path || 'index.html');
  if (!file.startsWith(DIST)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(200, { 'content-type': 'text/html' }).end(await readFile(join(DIST, 'index.html')));
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 440, height: 956 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
// Face ID can't be shown in a browser: open without it, as the demo never asks anyway.
await page.addInitScript(() => localStorage.setItem('alphonso_phone_lock_v1', 'off'));
await page.goto(base);
await page.getByRole('button', { name: 'Try a demo' }).click();
await page.getByText('Demo · sample data, nothing is sent').waitFor();

const shot = async (name) => { await page.waitForTimeout(400); await page.screenshot({ path: join(OUT, `${name}.png`) }); console.log(`saved ${name}.png`); };

await page.getByRole('tab', { name: 'Chat' }).click();
await shot('1-chat');
await page.getByRole('tab', { name: 'Requests' }).click();
await page.getByText('Find when our customers buy bread', { exact: false }).first().click().catch(() => undefined);
await shot('2-requests');
await page.getByRole('tab', { name: 'Studio' }).click();
await page.getByRole('button', { name: /Morning bread video/ }).click();
const picture = page.getByTestId('studio-media-demo/scenes/v1-s1.svg');
if (await picture.count()) { await picture.click(); await page.getByRole('img').first().waitFor().catch(() => undefined); }
await shot('3-studio');
await page.getByRole('tab', { name: 'Calendar' }).click();
await shot('4-calendar');

await browser.close();
server.close();
