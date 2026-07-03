import { timestampMs } from './trustModel';

const TELEGRAM_POLL_KEY = 'alphonso_telegram_poll_cursor_v1';
const TELEGRAM_POLL_AUDIT_KEY = 'alphonso_telegram_poll_audit_v1';

export interface TelegramMessage {
  update_id: number;
  chat_id: string;
  chat_type: string;
  from_id: string;
  from_username: string | null;
  text: string;
  date_unix: number;
  received_at_ms: number;
}

export interface TelegramPollResult {
  ok: boolean;
  count: number;
  routed?: number;
  messages: TelegramMessage[];
  cursor: number | null;
  error?: string;
}

export interface TelegramSendResult {
  ok: boolean;
  connector_id?: string;
  target?: string;
  external_id?: string | null;
  sent_at_ms?: number;
  trust?: string;
  error: string | null;
}

export interface TelegramBotVerifyResult {
  ok: boolean;
  botUsername: string | null;
  trust: string;
  error: string | null;
}

export interface TelegramAuditEntry {
  at: number;
  kind: string;
  reason?: string;
  body?: string;
  chatId?: string;
  count?: number;
  lastUpdateId?: number | null;
  cursorAfter?: number | null;
  messageId?: number | null;
  preview?: string;
  id?: string;
}

export function getTelegramPollCursor(): number | null {
  try {
    const raw = localStorage.getItem(TELEGRAM_POLL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed.cursor === 'number' ? parsed.cursor : null;
  } catch {
    return null;
  }
}

export function setTelegramPollCursor(cursor: number): void {
  try {
    localStorage.setItem(
      TELEGRAM_POLL_KEY,
      JSON.stringify({ cursor, updatedAt: timestampMs() })
    );
  } catch {
    // ignore storage errors in tests/restricted environments
  }
}

function getAuditRows(): TelegramAuditEntry[] {
  try {
    const raw = localStorage.getItem(TELEGRAM_POLL_AUDIT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function appendAudit(entry: TelegramAuditEntry): void {
  const next = [...getAuditRows(), { ...entry, id: `telegram_browser_${Date.now()}_${Math.random().toString(16).slice(2, 8)}` }].slice(-200);
  try {
    localStorage.setItem(TELEGRAM_POLL_AUDIT_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

export async function browserPollTelegram({ botToken, limit = 50 }: { botToken?: string; limit?: number } = {}): Promise<TelegramPollResult> {
  const token = (botToken || '').trim();
  if (!token) {
    appendAudit({ at: timestampMs(), kind: 'poll_failed', reason: 'missing_bot_token' });
    return { ok: false, count: 0, messages: [], error: 'bot_token_missing', cursor: null };
  }

  const offset = getTelegramPollCursor();
  let endpoint = `https://api.telegram.org/bot${token}/getUpdates?limit=${limit}&timeout=10`;
  if (typeof offset === 'number' && Number.isFinite(offset)) {
    endpoint += `&offset=${offset + 1}`;
  }

  let response: Response;
  try {
    response = await fetch(endpoint);
  } catch (error) {
    appendAudit({ at: timestampMs(), kind: 'poll_failed', reason: String(error) });
    return { ok: false, count: 0, messages: [], error: String(error), cursor: null };
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    appendAudit({ at: timestampMs(), kind: 'poll_failed', reason: `http_${response.status}`, body: text });
    return { ok: false, count: 0, messages: [], error: `telegram_http_${response.status}`, cursor: null };
  }

  const body = await response.json();
  if (!body?.ok) {
    const description = body?.description || 'telegram_get_updates_failed';
    appendAudit({ at: timestampMs(), kind: 'poll_failed', reason: description });
    return { ok: false, count: 0, messages: [], error: description, cursor: null };
  }

  const result = Array.isArray(body.result) ? body.result : [];
  const lastUpdate = result.length ? result[result.length - 1] : null;
  const lastId: number | null = lastUpdate?.update_id ?? offset ?? null;
  if (typeof lastId === 'number') {
    setTelegramPollCursor(lastId);
  }

  const messages: TelegramMessage[] = [];
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

export async function browserSendTelegram({ botToken, chatId, text }: { botToken?: string; chatId?: string; text?: string }): Promise<TelegramSendResult> {
  const target = String(chatId || '').trim();
  const body = String(text || '').trim();
  if (!target) return { ok: false, error: 'chat_id_required' };
  if (!body) return { ok: false, error: 'text_required' };

  const token = (botToken || '').trim();
  if (!token) return { ok: false, error: 'bot_token_missing' };

  const endpoint = `https://api.telegram.org/bot${token}/sendMessage`;
  const NON_RETRYABLE = new Set([400, 401, 403]);
  const MAX_ATTEMPTS = 3;
  let response: Response;
  let data: Record<string, unknown> = {};
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: target, text: body, disable_web_page_preview: true })
      });
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) {
        appendAudit({ at: timestampMs(), kind: 'send_failed', reason: String(error), chatId: target });
        return { ok: false, error: String(error) };
      }
      const backoff = 1000 * Math.pow(2, attempt - 1);
      console.warn(`[Telegram] send attempt ${attempt} failed (network error), retrying in ${backoff}ms`, error);
      await new Promise((r) => setTimeout(r, backoff));
      continue;
    }

    if (NON_RETRYABLE.has(response.status)) {
      data = await response.json().catch(() => ({}));
      const description = (data?.description as string) || `http_${response.status}`;
      appendAudit({ at: timestampMs(), kind: 'send_failed', reason: description, chatId: target });
      return { ok: false, error: description };
    }

    data = await response.json().catch(() => ({}));
    if (response.ok && data?.ok) break;

    if (attempt < MAX_ATTEMPTS) {
      const backoff = 1000 * Math.pow(2, attempt - 1);
      console.warn(`[Telegram] send attempt ${attempt} failed (HTTP ${response.status}), retrying in ${backoff}ms`);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }

  if (!response!.ok || !data?.ok) {
    const description = (data?.description as string) || `http_${response!.status}`;
    appendAudit({ at: timestampMs(), kind: 'send_failed', reason: description, chatId: target });
    return { ok: false, error: description };
  }

  const messageId = (data?.result as { message_id?: number })?.message_id ?? null;
  appendAudit({
    at: timestampMs(),
    kind: 'send_success',
    chatId: target,
    messageId: messageId as number | null,
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

export function parseTelegramCommand(text: string): { cmd: string; args: string } | null {
  const trimmed = (text || '').trim();
  if (!trimmed.startsWith('/')) return null;
  const parts = trimmed.slice(1).split(/\s+/);
  const cmd = (parts[0] || '').toLowerCase().replace(/@\w+$/, '');
  const args = parts.slice(1).join(' ');
  return { cmd, args };
}

export async function handleTelegramBotCommand({ text, chatId, botToken }: { text?: string; chatId?: string; botToken?: string }): Promise<{ ok: boolean; error?: string; reply?: string }> {
  const parsed = parseTelegramCommand(text || '');
  if (!parsed) return { ok: false, error: 'not_a_command' };

  let reply = '';
  if (parsed.cmd === 'start') {
    reply = 'Hi! I\'m Alphonso, your local AI companion.\n\nAvailable commands:\n/ask <question> — Ask me anything\n/status — System status\n/help — Show all commands';
  } else if (parsed.cmd === 'help') {
    reply = 'Commands:\n/ask <text> — Route a question to Jose (Orchestrator)\n/status — Get Alphonso system status\n/start — Welcome message\n/help — This help message';
  } else if (parsed.cmd === 'status') {
    reply = 'Alphonso is online.\nAgents: Jose, Hector, Miya, Maria, Marcus, Echo, Sentinel, Nova + Alphonso (9 active)\nTelegram: polling active\nOllama: local inference on demand';
  } else if (parsed.cmd === 'ask') {
    if (!parsed.args.trim()) {
      reply = 'Usage: /ask <your question>\nExample: /ask Summarize today\'s tasks';
    } else {
      const preview = parsed.args.slice(0, 80) + (parsed.args.length > 80 ? '...' : '');
      reply = `Routing to Jose: "${preview}"\n\nJose will process your request. Check the app for results.`;
    }
  } else {
    return { ok: false, error: 'unknown_command' };
  }

  if (!reply) return { ok: true, reply: '' };
  if (botToken && chatId) {
    return browserSendTelegram({ botToken, chatId, text: reply });
  }
  return { ok: true, reply };
}

export async function verifyTelegramBotEnvironment({ botToken }: { botToken?: string } = {}): Promise<TelegramBotVerifyResult> {
  const token = (botToken || '').trim();
  if (!token) {
    return {
      ok: false,
      botUsername: null,
      trust: 'failed',
      error: 'TELEGRAM_BOT_TOKEN is not configured.'
    };
  }

  let response: Response;
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
