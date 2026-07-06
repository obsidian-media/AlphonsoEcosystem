import { invoke } from '@tauri-apps/api/core';
import { appendConnectorAudit, createConnectorRoutePacket } from './connectorRegistryService';
import { createJoseCommandRoute } from './joseCommandRouterService';
import { timestampMs } from './trustModel';
import { browserPollTelegram, browserSendTelegram, handleTelegramBotCommand } from './telegramBrowserConnector';
import { getConnectorCredential, getConnectorCredentials } from './connectors/connectorAuth';

const TELEGRAM_AUTO_POLL_STATE_KEY = 'alphonso_telegram_auto_poll_state_v1';

interface TelegramAutoPollState {
  enabled: boolean;
  lastPolledAtMs: number | null;
  errors: number;
}

export function getTelegramAutoPollState(): TelegramAutoPollState {
  try {
    const raw = localStorage.getItem(TELEGRAM_AUTO_POLL_STATE_KEY);
    if (!raw) return { enabled: false, lastPolledAtMs: null, errors: 0 };
    const parsed = JSON.parse(raw);
    return {
      enabled: Boolean(parsed.enabled),
      lastPolledAtMs: typeof parsed.lastPolledAtMs === 'number' ? parsed.lastPolledAtMs : null,
      errors: typeof parsed.errors === 'number' ? parsed.errors : 0
    };
  } catch {
    return { enabled: false, lastPolledAtMs: null, errors: 0 };
  }
}

function setTelegramAutoPollState(state: TelegramAutoPollState): void {
  try {
    invoke('kv_set', { key: TELEGRAM_AUTO_POLL_STATE_KEY, value: JSON.stringify(state) }).catch(() => {});
  } catch {
    // SQLite not available in browser
  }
  try {
    localStorage.setItem(TELEGRAM_AUTO_POLL_STATE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

interface PollResult {
  ok: boolean;
  reason?: string;
  count?: number;
  routed?: number;
  rejected?: number;
  commandReplies?: number;
}

export async function runSingleTelegramPoll({ limit = 12 } = {}): Promise<PollResult> {
  const token = getConnectorCredential('telegram', 'TELEGRAM_BOT_TOKEN');
  if (!token) {
    appendConnectorAudit('telegram', 'poll_failed', { reason: 'missing_bot_token' });
    return { ok: false, reason: 'missing_bot_token' };
  }

  const creds = getConnectorCredentials('telegram');
  const allowedChatIds = String(creds.TELEGRAM_ALLOWED_CHAT_IDS || '')
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);

  const proof = await browserPollTelegram({ botToken: token, limit } as { botToken: string; limit: number });
  const state = getTelegramAutoPollState();
  state.lastPolledAtMs = timestampMs();
  state.errors = proof.ok ? 0 : state.errors + 1;
  setTelegramAutoPollState(state);

  if (!proof.ok) {
    appendConnectorAudit('telegram', 'poll_failed', {
      error: proof.error || 'unknown_poll_failure'
    });
    return { ok: false, reason: proof.error || 'poll_failed', count: 0 };
  }

  const messages = Array.isArray(proof.messages) ? proof.messages : [];
  let routed = 0;
  let rejected = 0;
  let commandReplies = 0;

  for (const message of messages) {
    const chatId = message?.chat_id || '';
    const senderId = message?.from_id || chatId;
    const text = message?.text || '';

    if (text.startsWith('/')) {
      if (allowedChatIds.length > 0 && !allowedChatIds.includes(chatId) && !allowedChatIds.includes(senderId)) {
        rejected += 1;
        appendConnectorAudit('telegram', 'poll_message_rejected', {
          chatId,
          updateId: message?.update_id || null,
          reason: 'chat_id_not_allowlisted'
        });
        continue;
      }
      try {
        const cmd = text.split(/\s+/)[0].slice(1).toLowerCase().replace(/@\w+$/, '');
        const args = text.split(/\s+/).slice(1).join(' ');
        if (cmd === 'ask' && args) {
          await createJoseCommandRoute({ commandText: args, source: 'telegram' }).catch(() => {});
        }
        await handleTelegramBotCommand({ text, chatId, botToken: token });
        commandReplies += 1;
        appendConnectorAudit('telegram', 'bot_command_handled', { cmd, chatId, updateId: message?.update_id || null });
      } catch (error) {
        appendConnectorAudit('telegram', 'bot_command_failed', { error: String(error), chatId });
      }
      continue;
    }

    const route = createConnectorRoutePacket('telegram', text, senderId);
    if (route?.rejected) {
      rejected += 1;
      appendConnectorAudit('telegram', 'poll_message_rejected', {
        chatId,
        updateId: message?.update_id || null
      });
      continue;
    }
    if (route?.packet) {
      routed += 1;
      appendConnectorAudit('telegram', 'poll_message_routed', {
        packetId: route.packet.id,
        chatId,
        updateId: message?.update_id || null
      });
      try {
        await createJoseCommandRoute({
          commandText: route?.parsed?.originalText || text,
          source: 'telegram'
        });
        await browserSendTelegram({ botToken: token, chatId, text: '📨 Received. Jose is processing your request.' }).catch(() => {});
      } catch (error) {
        appendConnectorAudit('telegram', 'jose_routing_failed', {
          packetId: route.packet?.id || null,
          error: String(error)
        });
      }
    }
  }

  appendConnectorAudit('telegram', 'poll_success', {
    count: messages.length,
    routed,
    rejected,
    commandReplies,
    lastUpdateId: proof.cursor || null
  });

  return { ok: true, count: messages.length, routed, rejected, commandReplies };
}

export function getTelegramEnvSafe(): { TELEGRAM_BOT_TOKEN: string } {
  const token = getConnectorCredential('telegram', 'TELEGRAM_BOT_TOKEN');
  return { TELEGRAM_BOT_TOKEN: token || '' };
}
