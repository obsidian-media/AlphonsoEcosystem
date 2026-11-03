// Publishes dist/ to the Firebase project's default Hosting site through the Hosting REST API,
// with a short-lived FIREBASE_TOKEN (never printed) and FIREBASE_PROJECT_ID. Sets the page's
// security headers here, so they ship with every version.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const project = String(process.env.FIREBASE_PROJECT_ID || '').trim();
const token = String(process.env.FIREBASE_TOKEN || '').trim();
if (!project || !token) { console.error('Set FIREBASE_PROJECT_ID and FIREBASE_TOKEN first.'); process.exit(1); }
if (!fs.existsSync(path.join(dist, 'index.html'))) { console.error('Run the build first (dist/index.html is missing).'); process.exit(1); }

const env = Object.fromEntries(fs.readFileSync(path.join(root, '.env.local'), 'utf8').split('\n').filter(Boolean).map((l) => l.split(/=(.*)/s).slice(0, 2)));
const authDomain = env.VITE_FB_AUTH_DOMAIN;
const api = 'https://firebasehosting.googleapis.com/v1beta1';
const headers = { authorization: `Bearer ${token}`, 'x-goog-user-project': project, 'content-type': 'application/json' };

async function call(method, url, body) {
  const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Hosting answered ${res.status}: ${out?.error?.message || 'no reason given'}`);
  return out;
}

const csp = [
  "default-src 'self'",
  "script-src 'self' https://apis.google.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com",
  `frame-src https://${authDomain}`,
  "frame-ancestors 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "object-src 'none'",
].join('; ');

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p); else files.push(p);
  }
})(dist);
const gz = new Map();
for (const f of files) {
  const data = zlib.gzipSync(fs.readFileSync(f), { level: 9 });
  const hash = crypto.createHash('sha256').update(data).digest('hex');
  gz.set('/' + path.relative(dist, f).split(path.sep).join('/'), { hash, data });
}

const sites = (await call('GET', `${api}/projects/${project}/sites`)).sites || [];
const site = sites.find((s) => s.type === 'DEFAULT_SITE');
if (!site) throw new Error('The Firebase project has no default Hosting site.');

const version = await call('POST', `${api}/${site.name}/versions`, {
  config: {
    headers: [
      { glob: '**', headers: { 'Content-Security-Policy': csp, 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Opener-Policy': 'same-origin-allow-popups' } },
      // The page itself is never cached, so a fix reaches everyone at once; its hashed files are.
      { glob: '**', headers: { 'Cache-Control': 'no-store' } },
      { glob: '/assets/**', headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } },
    ],
    rewrites: [{ glob: '**', path: '/index.html' }],
  },
});
const populate = await call('POST', `${api}/${version.name}:populateFiles`, { files: Object.fromEntries([...gz].map(([p, v]) => [p, v.hash])) });
for (const hash of populate.uploadRequiredHashes || []) {
  const entry = [...gz.values()].find((v) => v.hash === hash);
  const res = await fetch(`${populate.uploadUrl}/${hash}`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/octet-stream' }, body: entry.data });
  if (!res.ok) throw new Error(`Upload refused (${res.status}).`);
}
await call('PATCH', `${api}/${version.name}?update_mask=status`, { status: 'FINALIZED' });
await call('POST', `${api}/${site.name}/releases?versionName=${encodeURIComponent(version.name)}`, {});
console.log(`Published ${gz.size} files to ${site.defaultUrl}`);
