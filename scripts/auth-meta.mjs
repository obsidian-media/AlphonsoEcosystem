/**
 * auth-meta.mjs
 * Gets Meta (Facebook / Instagram / WhatsApp) long-lived tokens and writes them to .env.
 * Covers: Facebook Pages, Instagram Business, WhatsApp Business Cloud API.
 *
 * Setup (one-time, ~10 min):
 *   1. Go to https://developers.facebook.com/ → My Apps → Create App
 *      App type: Business
 *   2. Add products: "WhatsApp" and "Instagram Graph API" (from the App Dashboard)
 *   3. Settings → Basic → copy App ID and App Secret
 *   4. In App → WhatsApp → Getting Started:
 *      - Note your test phone number ID and phone number
 *   5. Authorized redirect URIs for Facebook Login:
 *      http://localhost:8086/callback
 *      (Settings → Facebook Login → Valid OAuth Redirect URIs)
 *
 * Run:
 *   node scripts/auth-meta.mjs
 *
 * The script will:
 *   - Open a browser for Facebook authorization
 *   - Exchange the short-lived token for a 60-day long-lived token
 *   - Fetch your Page access token and Instagram Business Account ID
 *   - Write all values to .env
 */

import http from 'node:http';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { randomUUID, randomBytes, createHash } from 'crypto';
import { exec } from 'node:child_process';
import { URL, URLSearchParams } from 'node:url';
import { join } from 'node:path';

const PORT = 8086;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const STATE = randomUUID();
const GRAPH_VERSION = 'v20.0';
const SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'pages_manage_metadata',
  'instagram_basic',
  'instagram_content_publish',
  'instagram_manage_comments',
  'instagram_manage_insights',
  'whatsapp_business_messaging',
  'whatsapp_business_management',
  'business_management',
  'public_profile',
].join(',');

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
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<html><body style="font-family:sans-serif;padding:2rem;">
        <h2>${error ? '❌ Authorization denied' : '✅ Authorization complete'}</h2>
        <p>${error ? error : 'You can close this tab and return to the terminal.'}</p>
      </body></html>`);
      server.close();
      if (error) reject(new Error(error));
      else resolve(code);
    });
    server.listen(PORT, '127.0.0.1', () => console.log(`\nListening for OAuth callback on http://127.0.0.1:${PORT}/callback`));
    server.on('error', reject);
  });
}

async function graphGet(path, token) {
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}${path}&access_token=${token}`);
  return res.json();
}

async function main() {
  console.log('\n── Meta OAuth Setup (Facebook / Instagram / WhatsApp) ───────────\n');
  console.log('You need a Meta Developer App with WhatsApp and Instagram products added.');
  console.log('Add this redirect URI in Facebook Login settings:');
  console.log('  http://localhost:8086/callback\n');

  const appId = await prompt('Paste your Meta APP_ID: ');
  const appSecret = await prompt('Paste your Meta APP_SECRET: ');

  if (!appId || !appSecret) {
    console.error('App ID and App Secret are required.');
    process.exit(1);
  }

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  const authUrl = `https://www.facebook.com/v20.0/dialog/oauth?` + new URLSearchParams({
    client_id: appId,
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    response_type: 'code',
    state: STATE,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  }).toString();

  console.log('\nOpening browser for Meta authorization...');
  openBrowser(authUrl);

  let code;
  try {
    code = await waitForCode();
  } catch (err) {
    console.error('Authorization failed:', err.message);
    process.exit(1);
  }

  // Exchange code for short-lived token (client_secret in POST body, not URL)
  console.log('\nExchanging code for short-lived token...');
  const tokenBody = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: REDIRECT_URI,
    code,
  });
  const tokenRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenBody.toString(),
  });
  const tokenData = await tokenRes.json();

  if (!tokenData.access_token) {
    console.error('❌ Failed to get access token.');
    if (tokenData.error_description) {
      console.error('Meta error details:', tokenData.error_description);
    } else {
      console.error('Token response keys:', Object.keys(tokenData));
    }
    process.exit(1);
  }

  // Exchange for long-lived token (60 days) — client_secret in POST body
  console.log('Exchanging for long-lived token (60-day)...');
  const longBody = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: tokenData.access_token,
  });
  const longRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: longBody.toString(),
  });
  const longData = await longRes.json();
  const longToken = longData.access_token || tokenData.access_token;

  // Fetch pages
  console.log('Fetching Facebook Pages...');
  const pagesData = await graphGet(`/me/accounts?fields=id,name,access_token,instagram_business_account`, longToken);
  const pages = Array.isArray(pagesData.data) ? pagesData.data : [];

  let pageId = '';
  let pageToken = '';
  let instagramAccountId = '';

  if (pages.length === 0) {
    console.warn('\n⚠  No Facebook Pages found on this account.');
    console.warn('   Create a Page at https://www.facebook.com/pages/create before re-running.\n');
  } else if (pages.length === 1) {
    pageId = pages[0].id;
    pageToken = pages[0].access_token;
    instagramAccountId = pages[0].instagram_business_account?.id || '';
    console.log(`   Found page: ${pages[0].name} (${pageId})`);
    if (instagramAccountId) console.log(`   Instagram Business Account: ${instagramAccountId}`);
  } else {
    console.log('\nMultiple Pages found:');
    pages.forEach((p, i) => console.log(`  [${i}] ${p.name} (${p.id})`));
    const choice = await prompt('Enter the number of the page to use: ');
    const idx = parseInt(choice, 10);
    const chosen = pages[isNaN(idx) ? 0 : Math.min(idx, pages.length - 1)];
    pageId = chosen.id;
    pageToken = chosen.access_token;
    instagramAccountId = chosen.instagram_business_account?.id || '';
    console.log(`   Selected: ${chosen.name} (${pageId})`);
  }

  // Fetch WhatsApp Business Account ID
  console.log('Fetching WhatsApp Business accounts...');
  const wabaData = await graphGet(`/me/businesses?fields=id,name`, longToken);
  let wabaId = '';
  if (Array.isArray(wabaData.data) && wabaData.data.length > 0) {
    wabaId = wabaData.data[0].id;
    console.log(`   WhatsApp Business Account: ${wabaId}`);
  }

  // Fetch user ID for reference
  const meData = await graphGet(`/me?fields=id,name`, longToken);
  console.log(`   Meta user: ${meData.name || 'unknown'} (${meData.id || 'unknown'})`);

  // Write to .env
  let env = readEnv();
  env = upsertEnvVar(env, 'META_APP_ID', appId);
  env = upsertEnvVar(env, 'META_APP_SECRET', appSecret);
  env = upsertEnvVar(env, 'META_ACCESS_TOKEN', longToken);
  env = upsertEnvVar(env, 'META_GRAPH_API_VERSION', GRAPH_VERSION);
  if (pageId)               env = upsertEnvVar(env, 'META_PAGE_ID', pageId);
  if (pageToken)            env = upsertEnvVar(env, 'META_PAGE_ACCESS_TOKEN', pageToken);
  if (instagramAccountId)   env = upsertEnvVar(env, 'INSTAGRAM_BUSINESS_ACCOUNT_ID', instagramAccountId);
  if (wabaId)               env = upsertEnvVar(env, 'WHATSAPP_BUSINESS_ACCOUNT_ID', wabaId);
  // WhatsApp Cloud API also needs the App Secret for webhook signature verification
  env = upsertEnvVar(env, 'WHATSAPP_APP_SECRET', appSecret);
  writeFileSync(ENV_PATH, env, 'utf8');

  console.log('\n✅ Meta credentials written to .env');
  console.log('   META_APP_ID                    ✓');
  console.log('   META_APP_SECRET                ✓');
  console.log('   META_ACCESS_TOKEN              ✓ (60-day token — re-run script to refresh)');
  console.log('   META_GRAPH_API_VERSION         ✓');
  if (pageId)             console.log('   META_PAGE_ID                   ✓');
  if (pageToken)          console.log('   META_PAGE_ACCESS_TOKEN         ✓');
  if (instagramAccountId) console.log('   INSTAGRAM_BUSINESS_ACCOUNT_ID  ✓');
  if (wabaId)             console.log('   WHATSAPP_BUSINESS_ACCOUNT_ID   ✓');
  console.log('   WHATSAPP_APP_SECRET            ✓');

  console.log('\nStill needed in .env (from WhatsApp → Getting Started in Meta Dashboard):');
  console.log('   WHATSAPP_PHONE_NUMBER_ID   — the test or production phone number ID');
  console.log('   WHATSAPP_ACCESS_TOKEN      — the system user or temporary token from the dashboard');
  console.log('   WHATSAPP_VERIFY_TOKEN      — any string you choose (used to verify your webhook)');
  console.log('\nRestart the Alphonso app and click "Verify env (local)" in the Connector Setup panel.\n');
}

main().catch((err) => { console.error(err); process.exit(1); });
