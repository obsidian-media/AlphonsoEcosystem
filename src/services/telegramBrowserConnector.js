import { getConnectorCredential } from './connectors/connectorAuth.js';

const TELEGRAM_API_BASE = 'https://api.telegram.org/bot';

export async function browserSendTelegram({ botToken, chatId, text }) {
  const token = botToken || getConnectorCredential('telegram', 'TELEGRAM_BOT_TOKEN');
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN not set in connector credentials');
  }

  const url = `${TELEGRAM_API_BASE}${token}/sendMessage`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: String(chatId || ''),
      text: String(text || '')
    })
  });

  const data = await response.json().catch(() => ({}));
  return {
    ok: response.ok && data?.ok === true,
    connectorId: 'telegram',
    externalId: data?.result?.message_id ? String(data.result.message_id) : null,
    httpStatus: response.status,
    error: response.ok ? null : (data?.description || `HTTP ${response.status}`),
    trust: response.ok ? 'verified' : 'failed'
  };
}

export async function browserPollTelegram({ botToken, limit = 12 } = {}) {
  const token = botToken || getConnectorCredential('telegram', 'TELEGRAM_BOT_TOKEN');
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN not set in connector credentials');
  }

  const url = `${TELEGRAM_API_BASE}${token}/getUpdates`;
  const params = new URLSearchParams({ limit: String(limit), timeout: '10' });
  const response = await fetch(`${url}?${params}`, { method: 'GET' });

  if (!response.ok) {
    throw new Error(`Telegram poll failed: HTTP ${response.status}`);
  }

  const data = await response.json().catch(() => ({}));
  const updates = Array.isArray(data?.result) ? data.result : [];

  const messages = updates.map((update) => {
    const msg = update?.message || update?.edited_message || {};
    return {
      updateId: update?.update_id ?? null,
      chatId: String(msg?.chat?.id || ''),
      fromId: String(msg?.from?.id || ''),
      text: String(msg?.text || ''),
      messageId: String(msg?.message_id || '')
    };
  });

  return {
    ok: true,
    messages,
    cursor: updates.length > 0 ? updates[updates.length - 1].update_id : null,
    trust: 'verified'
  };
}
