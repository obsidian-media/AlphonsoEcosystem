import http from 'node:http';
import { createRateLimiter, readBodyWithLimit, redactGatewayDetails } from './security.js';

const PORT = Number(process.env.PORT || 8081);
// Shared secret every inbound POST /webhook/:sourceId must present.
const WEBHOOK_TOKEN = String(process.env.WEBHOOK_SHARED_SECRET || '').trim();
// Separate token for /queue/drain — do not reuse WEBHOOK_TOKEN; falls back to it if unset.
const DRAIN_TOKEN = String(process.env.ALPHONSO_DRAIN_TOKEN || '').trim();
const MAX_WEBHOOK_BODY_BYTES = Number(process.env.WEBHOOK_MAX_BODY_BYTES || 256 * 1024);
const MAX_QUEUE_SIZE = Number(process.env.WEBHOOK_MAX_QUEUE_SIZE || 500);
const gatewayRateLimiter = createRateLimiter({
  windowMs: Number(process.env.WEBHOOK_RATE_WINDOW_MS || 60_000),
  maxRequests: Number(process.env.WEBHOOK_RATE_MAX_REQUESTS || 60)
});

// In-memory event queue — stores inbound webhook events until Alphonso drains them.
// Same shape as the WhatsApp Cloud gateway's queue, generalized: any external
// service can POST to /webhook/:sourceId with a shared secret and Alphonso
// picks the event up on its next poll without a bespoke connector.
const eventQueue = [];

function enqueue(event) {
  if (eventQueue.length >= MAX_QUEUE_SIZE) eventQueue.shift();
  eventQueue.push({ ...event, queuedAtMs: Date.now() });
}

function drainQueue(limit = 100) {
  return eventQueue.splice(0, Math.min(limit, eventQueue.length));
}

function isRequestAuthorized(request, url, expectedToken) {
  if (!expectedToken) return false;
  const auth = String(request.headers['authorization'] || '');
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const headerToken = String(request.headers['x-webhook-token'] || '');
  const query = url.searchParams.get('token') || '';
  return bearer === expectedToken || headerToken === expectedToken || query === expectedToken;
}

function safeLog(message, details = {}) {
  process.stdout.write(`[generic-webhook-gateway] ${message} ${JSON.stringify(redactGatewayDetails(details))}\n`);
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

  if (request.method === 'GET' && url.pathname === '/health') {
    return sendJson(response, 200, { ok: true, status: 'ok', queueLength: eventQueue.length });
  }

  // Alphonso polls this endpoint to drain queued inbound events.
  if (request.method === 'GET' && url.pathname === '/queue/drain') {
    const expectedToken = DRAIN_TOKEN || WEBHOOK_TOKEN;
    if (!isRequestAuthorized(request, url, expectedToken)) {
      return sendJson(response, 401, { ok: false, status: 'unauthorized' });
    }
    const limit = Math.min(Number(url.searchParams.get('limit') || 100), 500);
    const events = drainQueue(limit);
    return sendJson(response, 200, { ok: true, events, count: events.length });
  }

  const webhookMatch = request.method === 'POST' && url.pathname.match(/^\/webhook\/([a-zA-Z0-9_-]+)$/);
  if (webhookMatch) {
    const sourceId = webhookMatch[1];
    const rateLimit = gatewayRateLimiter.allow(clientKeyFromRequest(request));
    if (!rateLimit.allowed) {
      safeLog('Rate limit exceeded', { sourceId, retryAfterMs: rateLimit.retryAfterMs });
      response.setHeader('retry-after', String(Math.max(1, Math.ceil(rateLimit.retryAfterMs / 1000))));
      return sendJson(response, 429, { ok: false, status: 'blocked', reason: 'rate_limited' });
    }

    if (!isRequestAuthorized(request, url, WEBHOOK_TOKEN)) {
      safeLog('Webhook rejected — unauthorized', { sourceId });
      return sendJson(response, 401, { ok: false, status: 'unauthorized' });
    }

    let rawBody;
    try {
      rawBody = await readBodyWithLimit(request, { maxBytes: MAX_WEBHOOK_BODY_BYTES });
    } catch (error) {
      safeLog('Webhook body rejected', { sourceId, reason: error?.code || error?.message || 'body_limit' });
      return sendJson(response, error?.code === 'PAYLOAD_TOO_LARGE' ? 413 : 400, {
        ok: false,
        status: 'blocked',
        reason: error?.code === 'PAYLOAD_TOO_LARGE' ? 'request_too_large' : 'body_read_failed'
      });
    }

    let payload = {};
    if (rawBody.length > 0) {
      try {
        payload = JSON.parse(rawBody.toString('utf8'));
      } catch {
        safeLog('Invalid JSON payload', { sourceId });
        return sendJson(response, 400, { ok: false, status: 'failed', reason: 'invalid_json' });
      }
    }

    enqueue({ sourceId, payload });
    safeLog('Inbound event queued', { sourceId, queueLength: eventQueue.length });
    return sendJson(response, 200, { ok: true, status: 'queued', queueLength: eventQueue.length });
  }

  return sendJson(response, 404, { ok: false, status: 'not_found' });
});

server.listen(PORT, () => {
  const actualPort = server.address()?.port || PORT;
  safeLog('Gateway listening', {
    port: actualPort,
    webhookTokenConfigured: Boolean(WEBHOOK_TOKEN),
    drainTokenConfigured: Boolean(DRAIN_TOKEN)
  });
});
