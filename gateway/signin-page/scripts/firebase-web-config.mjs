// Writes .env.local with the sign-in page's Firebase web config, read from the Firebase project
// (the web app named SIGNIN_WEB_APP_NAME, default "Alphonso sign-in page"). Needs
// FIREBASE_PROJECT_ID and a short-lived FIREBASE_TOKEN (e.g. `gcloud auth print-access-token`);
// the token is never printed. A web API key is not a secret, but the file is still not committed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const project = String(process.env.FIREBASE_PROJECT_ID || '').trim();
const token = String(process.env.FIREBASE_TOKEN || '').trim();
const name = String(process.env.SIGNIN_WEB_APP_NAME || 'Alphonso sign-in page').trim();
if (!project || !token) {
  console.error('Set FIREBASE_PROJECT_ID and FIREBASE_TOKEN first.');
  process.exit(1);
}
const headers = { authorization: `Bearer ${token}`, 'x-goog-user-project': project };
async function get(p) {
  const res = await fetch(`https://firebase.googleapis.com/v1beta1/${p}`, { headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Firebase answered ${res.status}: ${body?.error?.message || 'no reason given'}`);
  return body;
}
const apps = (await get(`projects/${project}/webApps`)).apps || [];
const app = apps.find((a) => a.displayName === name && a.state === 'ACTIVE');
if (!app) throw new Error(`The Firebase project has no web app named "${name}".`);
const cfg = await get(`projects/-/webApps/${app.appId}/config`);
const lines = [
  `VITE_FB_API_KEY=${cfg.apiKey}`,
  `VITE_FB_AUTH_DOMAIN=${cfg.authDomain}`,
  `VITE_FB_PROJECT_ID=${cfg.projectId}`,
  `VITE_FB_APP_ID=${cfg.appId}`,
  `VITE_SIGNIN_APPLE=${process.env.SIGNIN_APPLE === 'on' ? 'on' : 'off'}`,
];
fs.writeFileSync(path.join(here, '.env.local'), lines.join('\n') + '\n');
console.log(`Web config written for ${project}.`);
