import { TRUST_STATES, timestampMs } from './trustModel';
import {
  createAgentPacket,
  updatePacketStatus,
  markPacketExecuted,
  markPacketFailed,
  requestPacketRetry,
  sendPacketToDeadLetter,
  listAgentPackets
} from './agentBusService';
import { appendConnectorAudit } from './connectorRegistryService';
import { browserPollTelegram, browserSendTelegram } from './telegramBrowserConnector';

const POLL_STATE_KEY = 'alphonso_telegram_auto_poll_state_v1';

export function getAutoPollState() {
  try {
    const raw = localStorage.getItem(POLL_STATE_KEY);
    if (!raw) return { enabled: false, lastPolledAtMs: null, errors: 0 };
    return JSON.parse(raw);
  } catch {
    return { enabled: false, lastPolledAtMs: null, errors: 0 };
  }
}

function setAutoPollState(state) {
  try {
    localStorage.setItem(POLL_STATE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export async function runSingleTelegramPoll({ limit = 12 } = {}) {
  const state = getAutoPollState();
  state.lastPolledAtMs = timestampMs();

  let proof;
  try {
    proof = await browserPollTelegram({ limit });
  } catch (error) {
    state.errors += 1;
    setAutoPollState(state);
    appendConnectorAudit('telegram', 'poll_failed', { error: String(error) });
    return { ok: false, reason: String(error), count: 0 };
  }

  state.errors = proof.ok ? 0 : state.errors + 1;
  setAutoPollState(state);

  if (!proof.ok) {
    appendConnectorAudit('telegram', 'poll_failed', { error: proof.error || 'unknown_poll_failure' });
    return { ok: false, reason: proof.error || 'unknown_poll_failure', count: 0 };
  }

  const packets = listAgentPackets();
  let created = 0;
  for (const message of proof.messages || []) {
    const packet = createAgentPacket({
      fromAgent: 'telegram',
      toAgent: 'jose',
      title: 'Telegram inbound route',
      packetType: 'telegram_inbound',
      payload: {
        chatId: message.chatId,
        from: message.from,
        text: message.text,
        receivedAtMs: message.receivedAtMs
      },
      source: 'telegram_bridge',
      confidence: TRUST_STATES.TEMPORARY,
      verificationState: TRUST_STATES.UNVERIFIED,
      requiresApproval: true,
      riskLevel: 'low',
      actionType: 'connector_inbound_message'
    });
    created += 1;
  }

  appendConnectorAudit('telegram', 'poll_success', {
    count: (proof.messages || []).length,
    created
  });

  return { ok: true, count: (proof.messages || []).length, created };
}

export async function sendTelegramProof(chatId, text) {
  let result;
  try {
    const envRaw = localStorage.getItem('alphonso_connector_registry_v2');
    const env = envRaw ? JSON.parse(envRaw).envPresence || {} : {};
    result = await browserSendTelegram({ botToken: env.TELEGRAM_BOT_TOKEN || '', chatId, text });
  } catch (error) {
    appendConnectorAudit('telegram', 'send_failed', { error: String(error), chatId });
    return { ok: false, error: String(error) };
  }

  appendConnectorAudit('telegram', result.ok ? 'send_success' : 'send_failed', {
    chatId,
    error: result.error || null,
    externalId: result.external_id || null
  });

  return result;
}
