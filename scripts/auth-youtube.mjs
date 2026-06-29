/**
 * auth-youtube.mjs
 * Gets a YouTube OAuth refresh token and writes it to .env.
 *
 * Setup (one-time, ~5 min):
 *   1. Go to https://console.cloud.google.com/
 *   2. Create a project (or pick an existing one)
 *   3. Enable "YouTube Data API v3"
 *   4. APIs & Services → Credentials → Create Credentials → OAuth client ID
 *      Application type: Web application
 *      Authorized redirect URIs: http://localhost:8085/callback
 *   5. Download the client ID and client secret
 *
 * Run:
 *   node scripts/auth-youtube.mjs
 *
 * Then paste your client ID and client secret when prompted.
 * A browser window will open — sign in and allow access.
 * The refresh token is written to .env automatically.
 */

import http from 'node:http';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { randomUUID } from 'crypto';
import { exec } from 'node:child_process';
import { URL, URLSearchParams } from 'node:url';
import { join } from 'node:path';

const PORT = 8085;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const STATE = randomUUID();
const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/youtube.readonly',
].join(' ');

const ENV_PATH = join(process.cwd(), '.env');

function readEnv() {
  if (!existsSync(ENV_PATH)) return '';
  return readFileSync(ENV_PATH, 'utf8');
}

function upsertEnvVar(content, key, value) {
  const escaped = value.replace(/\\/g, '\\\\');
  const line = `${key}=${escaped}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(content)) {
    return content.replace(re, line);
  }
  return content.trimEnd() + '\n' + line + '\n';
}

function prompt(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); });
  });
}

function openBrowser(url) {
  const cmd = process.platform === 'win32' ? `start "" "${url}"` : `open "${url}"`;
  exec(cmd, (err) => { if (err) console.log('\nCould not auto-open browser. Open this URL manually:\n' + url); });
}

async function exchangeCode(clientId, clientSecret, code) {
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: REDIRECT_URI,
    grant_type: 'authorization_code',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  return res.json();
}

async function waitForCode() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${PORT}`);
      if (url.pathname !== '/callback') {
        res.writeHead(404);
        res.end();
        return;
      }
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      const stateReturned = url.searchParams.get('state');
      if (stateReturned !== STATE) {
        res.writeHead(400);
        res.end('Invalid state');
        server.close();
        reject(new Error('OAuth state mismatch. Possible CSRF attack.'));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<html><body style="font-family:sans-serif;padding:2rem;">
        <h2>${error ? '❌ Authorization denied' : '✅ Authorization complete'}</h2>
        <p>${error ? error : 'You can close this tab and return to the terminal.'}</p>
      </body></html>`);
      server.close();
      if (error) reject(new Error(error));
      else resolve(code);
    });
    server.listen(PORT, () => {
      console.log(`\nListening for OAuth callback on http://localhost:${PORT}/callback`);
    });
    server.on('error', reject);
  });
}

async function main() {
  console.log('\n── YouTube OAuth Setup ──────────────────────────────────────────\n');
  console.log('You need a Google Cloud project with YouTube Data API v3 enabled.');
  console.log('Create OAuth credentials (Web application) with redirect URI:');
  console.log('  http://localhost:8085/callback\n');

  const clientId = await prompt('Paste your Google CLIENT_ID: ');
  const clientSecret = await prompt('Paste your Google CLIENT_SECRET: ');

  if (!clientId || !clientSecret) {
    console.error('Client ID and secret are required.');
    process.exit(1);
  }

  const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state: STATE,
  }).toString();

  console.log('\nOpening browser for authorization...');
  openBrowser(authUrl);

  let code;
  try {
    code = await waitForCode();
  } catch (err) {
    console.error('Authorization failed:', err.message);
    process.exit(1);
  }

  console.log('\nExchanging code for tokens...');
  const tokens = await exchangeCode(clientId, clientSecret, code);

  if (!tokens.refresh_token) {
    console.error('\n❌ No refresh token returned. This usually means the account already');
    console.error('   authorized this app. Go to https://myaccount.google.com/permissions,');
    console.error('   revoke access for your app, then run this script again.\n');
    // Log only an error description if present; otherwise a minimal hint.
    if (tokens.error_description) {
      console.error('OAuth error details:', tokens.error_description);
    } else {
      console.error('No refresh_token in response. The server may have returned:',
        typeof tokens === 'object' ? Object.keys(tokens) : tokens);
    }
    process.exit(1);
  }

  let env = readEnv();
  env = upsertEnvVar(env, 'YOUTUBE_CLIENT_ID', clientId);
  env = upsertEnvVar(env, 'YOUTUBE_CLIENT_SECRET', clientSecret);
  env = upsertEnvVar(env, 'YOUTUBE_REFRESH_TOKEN', tokens.refresh_token);
  writeFileSync(ENV_PATH, env, 'utf8');

  console.log('\n✅ YouTube credentials written to .env');
  console.log('   YOUTUBE_CLIENT_ID     ✓');
  console.log('   YOUTUBE_CLIENT_SECRET ✓');
  console.log('   YOUTUBE_REFRESH_TOKEN ✓');
  console.log('\nReminder: set YOUTUBE_CHANNEL_ID in .env manually (your channel ID from YouTube Studio).');
  console.log('Restart the Alphonso app and click "Verify env (local)" in the Connector Setup panel.\n');
}

main().catch((err) => { console.error(err); process.exit(1); });
