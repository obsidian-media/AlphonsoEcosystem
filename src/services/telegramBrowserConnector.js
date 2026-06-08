import { timestampMs } from './trustModel';

const TELEGRAM_POLL_KEY = 'alphonso_telegram_poll_cursor_v1';
const TELEGRAM_POLL_AUDIT_KEY = 'alphonso_telegram_poll_audit_v1';

export function getTelegramPollCursor() {
  try {
    const raw = localStorage.getItem(TELEGRAM_POLL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed.cursor === 'number' ? parsed.cursor : null;
  } catch {
    return null;
  }
}

export function setTelegramPollCursor(cursor) {
  try {
    localStorage.setItem(
      TELEGRAM_POLL_KEY,
      JSON.stringify({ cursor, updatedAt: timestampMs() })
    );
  } catch {
    // ignore storage errors in tests/restricted environments
  }
}

function getAuditRows() {
  try {
    const raw = localStorage.getItem(TELEGRAM_POLL_AUDIT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function appendAudit(entry) {
  const next = [...getAuditRows(), { ...entry, id: `telegram_browser_${Date.now()}_${Math.random().toString(16).slice(2, 8)}` }].slice(-200);
  try {
    localStorage.setItem(TELEGRAM_POLL_AUDIT_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

export async function browserPollTelegram({ botToken, limit = 50 } = {}) {
  const token = (botToken || '').trim();
  if (!token) {
    appendAudit({ at: timestampMs(), kind: 'poll_failed', reason: 'missing_bot_token' });
    return { ok: false, count: 0, messages: [], error: 'bot_token_missing' };
  }

  const offset = getTelegramPollCursor();
  let endpoint = `https://api.telegram.org/bot${token}/getUpdates?limit=${limit}&timeout=10`;
  if (typeof offset === 'number' && Number.isFinite(offset)) {
    endpoint += `&offset=${offset + 1}`;
  }

  let response;
  try {
    response = await fetch(endpoint);
  } catch (error) {
    appendAudit({ at: timestampMs(), kind: 'poll_failed', reason: String(error) });
    return { ok: false, count: 0, messages: [], error: String(error) };
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    appendAudit({ at: timestampMs(), kind: 'poll_failed', reason: `http_${response.status}`, body: text });
    return { ok: false, count: 0, messages: [], error: `telegram_http_${response.status}` };
  }

  const body = await response.json();
  if (!body?.ok) {
    const description = body?.description || 'telegram_get_updates_failed';
    appendAudit({ at: timestampMs(), kind: 'poll_failed', reason: description });
    return { ok: false, count: 0, messages: [], error: description };
  }

  const result = Array.isArray(body.result) ? body.result : [];
  const lastUpdate = result.length ? result[result.length - 1] : null;
  const lastId = lastUpdate?.update_id ?? offset ?? null;
  if (typeof lastId === 'number') {
    setTelegramPollCursor(lastId);
  }

  const messages = [];
  for (const update of result) {
    const messageValue = update.message || update.edited_message;
    if (!messageValue) continue;

    const chat = messageValue.chat || {};
    const from = messageValue.from || {};
    const text = (messageValue.text || messageValue.caption || '').trim();
    if (!text) continue;

    messages.push({
      update_id: update.update_id,
      chat_id: String(chat.id ?? chat.username ?? ''),
      chat_type: chat.type || 'unknown',
      from_id: String(from.id ?? ''),
      from_username: from.username || null,
      text,
      date_unix: messageValue.date ?? Math.floor(Date.now() / 1000),
      received_at_ms: timestampMs()
    });
  }

  appendAudit({
    at: timestampMs(),
    kind: 'poll_success',
    count: messages.length,
    lastUpdateId: lastId,
    cursorAfter: lastId
  });

  return {
    ok: true,
    count: result.length,
    routed: messages.length,
    messages,
    cursor: typeof lastId === 'number' ? lastId : null
  };
}

export async function browserSendTelegram({ botToken, chatId, text }) {
  const target = String(chatId || '').trim();
  const body = String(text || '').trim();
  if (!target) return { ok: false, error: 'chat_id_required' };
  if (!body) return { ok: false, error: 'text_required' };

  const token = (botToken || '').trim();
  if (!token) return { ok: false, error: 'bot_token_missing' };

  const endpoint = `https://api.telegram.org/bot${token}/sendMessage`;
  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: target, text: body, disable_web_page_preview: true })
    });
  } catch (error) {
    appendAudit({ at: timestampMs(), kind: 'send_failed', reason: String(error), chatId: target });
    return { ok: false, error: String(error) };
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok) {
    const description = data?.description || `http_${response.status}`;
    appendAudit({ at: timestampMs(), kind: 'send_failed', reason: description, chatId: target });
    return { ok: false, error: description };
  }

  const messageId = data?.result?.message_id ?? null;
  appendAudit({
    at: timestampMs(),
    kind: 'send_success',
    chatId: target,
    messageId,
    preview: body.slice(0, 80)
  });

  return {
    ok: true,
    connector_id: 'telegram',
    target,
    external_id: typeof messageId === 'number' ? String(messageId) : null,
    sent_at_ms: timestampMs(),
    trust: 'verified',
    error: null
  };
}

export async function verifyTelegramBotEnvironment({ botToken } = {}) {
  const token = (botToken || '').trim();
  if (!token) {
    return {
      ok: false,
      botUsername: null,
      trust: 'failed',
      error: 'TELEGRAM_BOT_TOKEN is not configured.'
    };
  }

  let response;
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/getMe`);
  } catch (error) {
    return {
      ok: false,
      botUsername: null,
      trust: 'failed',
      error: String(error)
    };
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok) {
    return {
      ok: false,
      botUsername: null,
      trust: 'failed',
      error: data?.description || `telegram_getMe_failed_${response.status}`
    };
  }

  const botUsername = data?.result?.username || null;
  return {
    ok: true,
    botUsername: String(botUsername || ''),
    trust: 'verified',
    error: null
  };
}
