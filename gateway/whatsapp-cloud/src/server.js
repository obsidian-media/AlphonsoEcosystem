import http from 'node:http';
import { normalizeInboundPayload } from './normalize.js';
import { forwardNormalizedPacket } from './forward.js';
import { createRateLimiter, readBodyWithLimit, redactGatewayDetails } from './security.js';
import { verifyChallenge, verifySignature } from './verify.js';

const PORT = Number(process.env.PORT || 8080);
const VERIFY_TOKEN = String(process.env.WHATSAPP_VERIFY_TOKEN || '').trim();
const APP_SECRET = String(process.env.WHATSAPP_APP_SECRET || '').trim();
const FORWARD_URL = String(process.env.ALPHONSO_FORWARD_URL || '').trim();
const ALLOWLIST = String(process.env.WHATSAPP_ALLOWLIST || process.env.ALPHONSO_FORWARD_ALLOWLIST || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const FORWARD_TIMEOUT_MS = Number(process.env.FORWARD_TIMEOUT_MS || 5000);
const MAX_WEBHOOK_BODY_BYTES = Number(process.env.WHATSAPP_MAX_WEBHOOK_BODY_BYTES || 1024 * 1024);
const gatewayRateLimiter = createRateLimiter({
  windowMs: Number(process.env.WHATSAPP_RATE_WINDOW_MS || 60_000),
  maxRequests: Number(process.env.WHATSAPP_RATE_MAX_REQUESTS || 60)
});

function safeLog(message, details = {}) {
  process.stdout.write(`[whatsapp-gateway] ${message} ${JSON.stringify(redactGatewayDetails(details))}\n`);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'content-type': 'application/json' });
  response.end(JSON.stringify(payload));
}

function clientKeyFromRequest(request) {
  const forwarded = String(request.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || request.socket?.remoteAddress || 'unknown';
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  const rateLimit = gatewayRateLimiter.allow(clientKeyFromRequest(request));

  if (!rateLimit.allowed && request.method === 'POST' && url.pathname === '/webhook') {
    safeLog('Rate limit exceeded', { retryAfterMs: rateLimit.retryAfterMs, clientKey: clientKeyFromRequest(request) });
    response.setHeader('retry-after', String(Math.max(1, Math.ceil(rateLimit.retryAfterMs / 1000))));
    return sendJson(response, 429, { ok: false, status: 'blocked', reason: 'rate_limited' });
  }

  if (request.method === 'GET' && url.pathname === '/health') {
    return sendJson(response, 200, {
      ok: true,
      status: VERIFY_TOKEN && APP_SECRET ? (FORWARD_URL ? 'ready' : 'setup_required') : 'setup_required',
      forwardConfigured: Boolean(FORWARD_URL),
      verifyTokenConfigured: Boolean(VERIFY_TOKEN),
      appSecretConfigured: Boolean(APP_SECRET),
      allowlistCount: ALLOWLIST.length,
      requiredEnv: {
        WHATSAPP_VERIFY_TOKEN: VERIFY_TOKEN ? 'present' : 'missing',
        WHATSAPP_APP_SECRET: APP_SECRET ? 'present' : 'missing',
        ALPHONSO_FORWARD_URL: FORWARD_URL ? 'present' : 'missing'
      }
    });
  }

  if (request.method === 'GET' && url.pathname === '/webhook') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    if (verifyChallenge({ mode, token, expectedToken: VERIFY_TOKEN, challenge })) {
      safeLog('Challenge verified', { mode, challenge: Boolean(challenge) });
      response.writeHead(200, { 'content-type': 'text/plain' });
      return response.end(challenge || '');
    }
    safeLog('Challenge rejected', { mode, tokenPresent: Boolean(token), challengePresent: Boolean(challenge) });
    return sendJson(response, 403, { ok: false, status: 'blocked' });
  }

  if (request.method === 'POST' && url.pathname === '/webhook') {
    let rawBody;
    try {
      rawBody = await readBodyWithLimit(request, { maxBytes: MAX_WEBHOOK_BODY_BYTES });
    } catch (error) {
      safeLog('Webhook body rejected', { reason: error?.code || error?.message || 'body_limit' });
      return sendJson(response, error?.code === 'PAYLOAD_TOO_LARGE' ? 413 : 400, {
        ok: false,
        status: 'blocked',
        reason: error?.code === 'PAYLOAD_TOO_LARGE' ? 'request_too_large' : 'body_read_failed'
      });
    }
    const signatureHeader = String(request.headers['x-hub-signature-256'] || '');
    const signatureProof = verifySignature({ rawBody, signatureHeader, appSecret: APP_SECRET });
    if (!signatureProof.ok) {
      safeLog('Signature rejected', { ok: false, reason: signatureProof.reason || 'signature_mismatch' });
      return sendJson(response, 403, { ok: false, status: 'blocked' });
    }

    let payload = {};
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      safeLog('Invalid JSON payload');
      return sendJson(response, 400, { ok: false, status: 'failed', reason: 'invalid_json' });
    }

    const messages = normalizeInboundPayload(payload);
    const results = [];
    for (const message of messages) {
      const result = await forwardNormalizedPacket({
        forwardUrl: FORWARD_URL,
        packet: message,
        allowlist: ALLOWLIST,
        timeoutMs: FORWARD_TIMEOUT_MS
      });
      results.push(result);
    }

    const accepted = results.some((result) => result.ok);
    safeLog('Inbound normalized', { messages: messages.length, accepted, forwardConfigured: Boolean(FORWARD_URL) });
    return sendJson(response, accepted ? 200 : 202, {
      ok: accepted,
      normalizedCount: messages.length,
      results: results.map((result) => ({
        ok: result.ok,
        status: result.status,
        httpStatus: result.httpStatus || null,
        reason: result.reason || null
      }))
    });
  }

  return sendJson(response, 404, { ok: false, status: 'not_found' });
});

server.listen(PORT, () => {
  const actualPort = server.address()?.port || PORT;
  safeLog('Gateway listening', {
    port: actualPort,
    forwardConfigured: Boolean(FORWARD_URL),
    allowlistCount: ALLOWLIST.length,
    verifyTokenConfigured: Boolean(VERIFY_TOKEN),
    appSecretConfigured: Boolean(APP_SECRET)
  });
});
