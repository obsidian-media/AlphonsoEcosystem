// Fetches the phone app's Firebase config files for a build: GoogleService-Info.plist (iOS),
// google-services.json (Android), and firebase.xcconfig (Google sign-in's URL scheme for
// Xcode). They are never committed. Needs FIREBASE_PROJECT_ID and a short-lived
// FIREBASE_TOKEN (for example `gcloud auth print-access-token`); the token is never printed.
// Without them it writes an empty firebase.xcconfig, so the project still builds (no push,
// no sign-in), and says so.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mobile = path.resolve(here, '..');
const appId = JSON.parse(fs.readFileSync(path.join(mobile, 'capacitor.config.json'), 'utf8')).appId;
const project = String(process.env.FIREBASE_PROJECT_ID || '').trim();
const token = String(process.env.FIREBASE_TOKEN || '').trim();
const out = {
  plist: path.join(mobile, 'ios/App/App/GoogleService-Info.plist'),
  json: path.join(mobile, 'android/app/google-services.json'),
  xcconfig: path.join(mobile, 'ios/App/firebase.xcconfig'),
};

function writeXcconfig(reversedClientId) {
  fs.writeFileSync(out.xcconfig, `// Written by mobile/scripts/firebase-config.mjs; not committed.\nGOOGLE_REVERSED_CLIENT_ID = ${reversedClientId || ''}\n`);
}

if (!project || !token) {
  writeXcconfig('');
  console.log('No FIREBASE_PROJECT_ID / FIREBASE_TOKEN: built without Firebase (no sign-in or notifications).');
  process.exit(0);
}

const headers = { authorization: `Bearer ${token}`, 'x-goog-user-project': project };
const api = 'https://firebase.googleapis.com/v1beta1';
async function get(p) {
  const res = await fetch(`${api}/${p}`, { headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Firebase answered ${res.status} for ${p.split('/')[2] || p}: ${body?.error?.message || 'no reason given'}`);
  return body;
}

async function configFor(kind, idField) {
  const list = await get(`projects/${project}/${kind}`);
  const app = (list.apps || []).find((a) => a[idField] === appId);
  if (!app) throw new Error(`The Firebase project has no ${kind === 'iosApps' ? 'iOS' : 'Android'} app ${appId}.`);
  const cfg = await get(`projects/-/${kind}/${app.appId}/config`);
  return Buffer.from(cfg.configFileContents, 'base64');
}

const plist = await configFor('iosApps', 'bundleId');
fs.writeFileSync(out.plist, plist);
fs.writeFileSync(out.json, await configFor('androidApps', 'packageName'));
const reversed = /<key>REVERSED_CLIENT_ID<\/key>\s*<string>([^<]+)<\/string>/.exec(plist.toString('utf8'))?.[1] || '';
writeXcconfig(reversed);
console.log(`Firebase config written for ${appId}${reversed ? '' : ' (no Google sign-in client for iOS yet)'}.`);
