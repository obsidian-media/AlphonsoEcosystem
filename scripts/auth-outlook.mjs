/**
 * auth-outlook.mjs
 * Gets Microsoft Outlook OAuth tokens and writes them to .env.
 * Covers: Outlook Mail (send, read), Calendar (optional).
 *
 * Setup (one-time, ~5 min):
 *   1. Go to https://portal.azure.com/ → Azure Active Directory → App registrations
 *   2. Click "New registration"
 *      Name: Alphonso
 *      Supported account types: "Accounts in any organizational directory and personal Microsoft accounts"
 *      Redirect URI: Web → http://localhost:8087/callback
 *   3. After creation, copy the Application (client) ID
 *   4. Certificates & secrets → New client secret → copy the Value
 *   5. API permissions → Add permission → Microsoft Graph → Delegated:
 *      Mail.Send, Mail.ReadWrite, offline_access
 *      (Click "Grant admin consent" if available)
 *
 * Run:
 *   node scripts/auth-outlook.mjs
 *
 * The refresh token is written to .env automatically.
 */

import http from 'node:http';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { randomUUID, randomBytes, createHash } from 'crypto';
import { exec } from 'node:child_process';
import { URL, URLSearchParams } from 'node:url';
import { join } from 'node:path';

const PORT = 8087;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const STATE = randomUUID();
const SCOPES = 'Mail.Send Mail.ReadWrite offline_access User.Read';
// Use 'common' tenant to support both personal and work/school accounts
const TENANT = 'common';
const ENV_PATH = join(process.cwd(), '.env');

function readEnv() {
  if (!existsSync(ENV_PATH)) return '';
  return readFileSync(ENV_PATH, 'utf8');
}

function upsertEnvVar(content, key, value) {
  const escaped = String(value).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/#/g, '\\#');
  const line = `${key}=${escaped}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(content)) return content.replace(re, line);
  return content.trimEnd() + '\n' + line + '\n';
}

// PKCE helpers
function generateCodeVerifier() {
  return randomBytes(48).toString('base64url');
}
async function generateCodeChallenge(verifier) {
  const hash = createHash('sha256').update(verifier).digest();
  return hash.toString('base64url');
}

function prompt(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); });
  });
}

function openBrowser(url) {
  const cmd = process.platform === 'win32' ? `start "" "${url}"` : `open "${url}"`;
  exec(cmd, (err) => { if (err) console.log('\nCould not auto-open browser. Open manually:\n' + url); });
}

async function waitForCode() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${PORT}`);
      if (url.pathname !== '/callback') { res.writeHead(404); res.end(); return; }
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
      const errorDesc = url.searchParams.get('error_description') || '';
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<html><body style="font-family:sans-serif;padding:2rem;">
        <h2>${error ? '❌ Authorization denied' : '✅ Authorization complete'}</h2>
        <p>${error ? `${error}: ${errorDesc}` : 'You can close this tab and return to the terminal.'}</p>
      </body></html>`);
      server.close();
      if (error) reject(new Error(`${error}: ${errorDesc}`));
      else resolve(code);
    });
    server.listen(PORT, '127.0.0.1', () => console.log(`\nListening for OAuth callback on http://127.0.0.1:${PORT}/callback`));
    server.on('error', reject);
  });
}

async function exchangeCode(clientId, clientSecret, code, codeVerifier) {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: REDIRECT_URI,
    grant_type: 'authorization_code',
    scope: SCOPES,
    code_verifier: codeVerifier,
  });
  const res = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  return res.json();
}

async function fetchUserProfile(accessToken) {
  const res = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.json();
}

async function main() {
  console.log('\n── Outlook / Microsoft OAuth Setup ─────────────────────────────\n');
  console.log('You need an Azure App Registration with Mail.Send, Mail.ReadWrite, offline_access.');
  console.log('Redirect URI to add in Azure:  http://localhost:8087/callback\n');

  const clientId = await prompt('Paste your Azure APPLICATION (CLIENT) ID: ');
  const clientSecret = await prompt('Paste your Azure CLIENT SECRET value: ');

  if (!clientId || !clientSecret) {
    console.error('Client ID and secret are required.');
    process.exit(1);
  }

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  const authUrl = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize?` + new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    response_mode: 'query',
    prompt: 'select_account',
    state: STATE,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  }).toString();

  console.log('\nOpening browser for Microsoft authorization...');
  openBrowser(authUrl);

  let code;
  try {
    code = await waitForCode();
  } catch (err) {
    console.error('Authorization failed:', err.message);
    process.exit(1);
  }

  console.log('\nExchanging code for tokens...');
  const tokens = await exchangeCode(clientId, clientSecret, code, codeVerifier);

  if (!tokens.refresh_token) {
    console.error('❌ No refresh token returned.');
    console.error('   Make sure "offline_access" is in the scopes and granted in Azure.');
    if (tokens.error_description) {
      console.error('OAuth error details:', tokens.error_description);
    } else {
      console.error('Token response keys:', Object.keys(tokens));
    }
    process.exit(1);
  }

  // Fetch account email
  let email = '';
  try {
    const profile = await fetchUserProfile(tokens.access_token);
    email = profile.mail || profile.userPrincipalName || '';
    if (email) console.log(`   Authorized account: ${email}`);
  } catch {
    // non-fatal
  }

  let env = readEnv();
  env = upsertEnvVar(env, 'OUTLOOK_CLIENT_ID', clientId);
  env = upsertEnvVar(env, 'OUTLOOK_CLIENT_SECRET', clientSecret);
  env = upsertEnvVar(env, 'OUTLOOK_REFRESH_TOKEN', tokens.refresh_token);
  env = upsertEnvVar(env, 'OUTLOOK_TENANT', TENANT);
  if (email) env = upsertEnvVar(env, 'OUTLOOK_USER_EMAIL', email);
  writeFileSync(ENV_PATH, env, 'utf8');

  console.log('\n✅ Outlook credentials written to .env');
  console.log('   OUTLOOK_CLIENT_ID      ✓');
  console.log('   OUTLOOK_CLIENT_SECRET  ✓');
  console.log('   OUTLOOK_REFRESH_TOKEN  ✓');
  console.log('   OUTLOOK_TENANT         ✓ (common — works for personal + work accounts)');
  if (email) console.log(`   OUTLOOK_USER_EMAIL     ✓ (${email})`);
  console.log('\nRestart the Alphonso app after credentials are written.\n');
}

main().catch((err) => { console.error(err); process.exit(1); });
