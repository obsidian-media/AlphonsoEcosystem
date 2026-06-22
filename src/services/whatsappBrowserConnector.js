import { getConnectorCredential } from './connectors/connectorAuth.js';

const GRAPH_API_BASE = 'https://graph.facebook.com/v17.0';

function normalizePhone(phone) {
  return String(phone || '').replace(/^\+/, '').replace(/\D/g, '');
}

export async function browserSendWhatsApp({ to, text }) {
  const accessToken = getConnectorCredential('whatsapp', 'WHATSAPP_ACCESS_TOKEN');
  const phoneNumberId = getConnectorCredential('whatsapp', 'WHATSAPP_PHONE_NUMBER_ID');

  if (!accessToken || !phoneNumberId) {
    throw new Error('WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID not set in connector credentials');
  }

  const toNorm = normalizePhone(to);
  const NON_RETRYABLE = new Set([400, 401, 403]);
  const MAX_ATTEMPTS = 3;
  let response;
  let data = {};
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      response = await fetch(`${GRAPH_API_BASE}/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: toNorm,
          type: 'text',
          text: { body: String(text || '') }
        })
      });
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) throw error;
      const backoff = 1000 * Math.pow(2, attempt - 1);
      console.warn(`[WhatsApp] send attempt ${attempt} failed (network error), retrying in ${backoff}ms`, error);
      await new Promise((r) => setTimeout(r, backoff));
      continue;
    }

    if (NON_RETRYABLE.has(response.status)) {
      data = await response.json().catch(() => ({}));
      return {
        ok: false,
        connectorId: 'whatsapp',
        externalId: null,
        httpStatus: response.status,
        error: data?.error?.message || `HTTP ${response.status}`,
        trust: 'failed'
      };
    }

    data = await response.json().catch(() => ({}));
    if (response.ok) break;

    if (attempt < MAX_ATTEMPTS) {
      const backoff = 1000 * Math.pow(2, attempt - 1);
      console.warn(`[WhatsApp] send attempt ${attempt} failed (HTTP ${response.status}), retrying in ${backoff}ms`);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }

  return {
    ok: response.ok,
    connectorId: 'whatsapp',
    externalId: data?.messages?.[0]?.id || null,
    httpStatus: response.status,
    error: response.ok ? null : (data?.error?.message || `HTTP ${response.status}`),
    trust: response.ok ? 'verified' : 'failed'
  };
}

export async function browserPollWhatsAppGateway({ limit = 12 } = {}) {
  const drainUrl = getConnectorCredential('whatsapp', 'WHATSAPP_CLOUD_GATEWAY_DRAIN_URL');
  const token = getConnectorCredential('whatsapp', 'WHATSAPP_VERIFY_TOKEN');

  if (!drainUrl) {
    throw new Error('WHATSAPP_CLOUD_GATEWAY_DRAIN_URL not set in connector credentials');
  }

  const url = new URL(drainUrl);
  url.searchParams.set('limit', String(limit));

  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(url.toString(), { method: 'GET', headers });
  if (!response.ok) {
    throw new Error(`Gateway drain failed: HTTP ${response.status}`);
  }

  const data = await response.json().catch(() => ({}));
  const messages = Array.isArray(data?.messages)
    ? data.messages
    : Array.isArray(data)
      ? data
      : [];

  return {
    ok: true,
    messages: messages.map((msg) => ({
      provider: 'whatsapp_cloud_api',
      chatId: String(msg?.from || msg?.chatId || ''),
      fromId: String(msg?.from || msg?.fromId || ''),
      text: String(msg?.text || ''),
      messageId: String(msg?.messageId || msg?.id || ''),
      phoneNumber: msg?.to || null,
      receivedAtMs: msg?.queuedAtMs || msg?.receivedAtMs || Date.now()
    })),
    cursor: null,
    trust: 'verified'
  };
}
