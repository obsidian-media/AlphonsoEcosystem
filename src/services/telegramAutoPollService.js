import { invoke } from '@tauri-apps/api/core';
import { appendConnectorAudit, createConnectorRoutePacket } from './connectorRegistryService';
import { createJoseCommandRoute } from './joseCommandRouterService';
import { timestampMs } from './trustModel';
import { browserPollTelegram } from './telegramBrowserConnector';

const TELEGRAM_AUTO_POLL_STATE_KEY = 'alphonso_telegram_auto_poll_state_v1';

export function getTelegramAutoPollState() {
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

function setTelegramAutoPollState(state) {
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

export async function runSingleTelegramPoll({ limit = 12 } = {}) {
  const env = getTelegramEnvSafe();
  const token = env?.TELEGRAM_BOT_TOKEN || '';
  if (!token) {
    appendConnectorAudit('telegram', 'poll_failed', { reason: 'missing_bot_token' });
    return { ok: false, reason: 'missing_bot_token' };
  }

  const proof = await browserPollTelegram({ botToken: token, limit });
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

  for (const message of messages) {
    const senderId = message?.from_id || message?.chat_id || '';
    const route = createConnectorRoutePacket('telegram', message?.text || '', senderId);
    if (route?.rejected) {
      rejected += 1;
      appendConnectorAudit('telegram', 'poll_message_rejected', {
        chatId: message?.chat_id || null,
        updateId: message?.update_id || null
      });
      continue;
    }
    if (route?.packet) {
      routed += 1;
      appendConnectorAudit('telegram', 'poll_message_routed', {
        packetId: route.packet.id,
        chatId: message?.chat_id || null,
        updateId: message?.update_id || null
      });
      try {
        await createJoseCommandRoute({
          commandText: route?.parsed?.originalText || message?.text || '',
          source: 'telegram'
        });
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
    lastUpdateId: proof.cursor || null
  });

  return { ok: true, count: messages.length, routed, rejected };
}

export function getTelegramEnvSafe() {
  const raw = localStorage.getItem('alphonso_connector_registry_v2');
  const parsed = raw ? JSON.parse(raw) : {};
  if (parsed?.envPresence && typeof parsed.envPresence === 'object') return parsed.envPresence;
  const rows = Array.isArray(parsed?.rows) ? parsed.rows : [];
  const telegram = rows.find((row) => row?.id === 'telegram');
  return telegram?.envPresence || {};
}
