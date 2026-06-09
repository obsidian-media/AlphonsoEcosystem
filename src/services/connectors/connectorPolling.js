import { invoke } from '@tauri-apps/api/core';
import { AGENTS, createAgentPacket, requestPacketRetry, sendPacketToDeadLetter, updatePacketStatus } from '../agentBusService';
import { appendSessionEvent } from '../sessionIntelligenceService';
import { TRUST_STATES, timestampMs } from '../trustModel';
import { createJoseCommandRoute } from '../joseCommandRouterService';
import { browserPollTelegram } from '../telegramBrowserConnector';
import {
  appendConnectorAudit,
  requireConnectorReady,
  verifyConnectorEnvironment
} from './connectorRegistry.js';
import {
  readAuthProfiles
} from './connectorAuth.js';

export function parseInboundConnectorMessage(connectorId, text, senderId = '') {
  const clean = String(text || '').trim();
  const lowered = clean.toLowerCase();
  let targetAgent = AGENTS.JOSE;
  if (lowered.startsWith('ask hector')) targetAgent = AGENTS.HECTOR;
  if (lowered.startsWith('ask miya')) targetAgent = AGENTS.MIYA;
  if (lowered.startsWith('ask alphonso')) targetAgent = AGENTS.ALPHONSO;

  const risky = /delete|remove|run|execute|upload|post|send|buy|purchase|deploy|restore/i.test(clean);
  const external = /upload|publish|post|youtube|telegram|whatsapp|send/i.test(clean);

  const authProfiles = readAuthProfiles();
  const profile = authProfiles[connectorId] || { enabled: false, allowlist: [], mode: 'allowlist_required' };
  const normalizedSender = String(senderId || '').trim();
  const allowlist = Array.isArray(profile.allowlist) ? profile.allowlist : [];
  const isAuthorized = profile.enabled && normalizedSender && allowlist.includes(normalizedSender);

  return {
    connectorId,
    senderId: normalizedSender || null,
    originalText: clean,
    routeTo: targetAgent,
    routedThrough: AGENTS.JOSE,
    requiresApproval: risky || external,
    riskLevel: external ? 'high' : risky ? 'medium' : 'low',
    parsedAtMs: timestampMs(),
    auth: {
      mode: profile.mode || 'allowlist_required',
      enabled: Boolean(profile.enabled),
      allowlistCount: allowlist.length,
      isAuthorized
    }
  };
}

export function createConnectorRoutePacket(connectorId, text, senderId = '') {
  const parsed = parseInboundConnectorMessage(connectorId, text, senderId);
  if (!parsed.auth.isAuthorized) {
    appendConnectorAudit(connectorId, 'route_rejected_unauthorized', {
      senderId: parsed.senderId,
      routeTo: parsed.routeTo,
      textPreview: parsed.originalText.slice(0, 120)
    });
    return {
      packet: null,
      rejected: true,
      reason: 'Sender is not authorized in connector allowlist.',
      parsed
    };
  }

  const packet = createAgentPacket({
    fromAgent: connectorId,
    toAgent: AGENTS.JOSE,
    title: `${connectorId} inbound route`,
    packetType: 'connector_inbound_message',
    payload: parsed,
    source: `${connectorId}-bridge`,
    confidence: TRUST_STATES.TEMPORARY,
    verificationState: TRUST_STATES.UNVERIFIED,
    requiresApproval: true,
    riskLevel: parsed.riskLevel,
    actionType: 'remote_message_route',
    commandPreview: parsed.originalText,
    fileChangePreview: 'No file change. Connector message route only.',
    rollbackAvailable: false
  });

  appendConnectorAudit(connectorId, 'route_packet_created', {
    packetId: packet.id,
    riskLevel: parsed.riskLevel,
    senderId: parsed.senderId,
    routeTo: parsed.routeTo
  });

  appendSessionEvent({
    category: 'connector',
    title: `${connectorId} inbound message routed to Jose`,
    details: { packetId: packet.id, riskLevel: parsed.riskLevel, routeTo: parsed.routeTo },
    agent: AGENTS.JOSE,
    confidence: TRUST_STATES.TEMPORARY,
    verificationState: TRUST_STATES.UNVERIFIED
  });

  return { packet, rejected: false, reason: null, parsed };
}

export async function pollTelegramConnector(limit = 12) {
  const readiness = await requireConnectorReady('telegram', 'inbound_poll', `poll limit ${limit}`);
  if (!readiness.ok) {
    return { ok: false, count: 0, routed: 0, rejected: 0, messages: [], ...readiness };
  }
  let proof;
  try {
    proof = await invoke('connector_poll_telegram', { limit });
  } catch (error) {
    const env = getConnectorEnvironment();
    const token = env?.TELEGRAM_BOT_TOKEN || '';
    if (token) {
      try {
        proof = await browserPollTelegram({ botToken: token, limit });
      } catch (browserError) {
        appendConnectorAudit('telegram', 'poll_failed', { error: String(browserError) });
        return {
          ok: false,
          count: 0,
          routed: 0,
          rejected: 0,
          messages: [],
          error: String(browserError)
        };
      }
    } else {
      appendConnectorAudit('telegram', 'poll_failed', { error: String(error) });
      return {
        ok: false,
        count: 0,
        routed: 0,
        rejected: 0,
        messages: [],
        error: String(error)
      };
    }
  }

  const messages = Array.isArray(proof?.messages) ? proof.messages : [];
  let routed = 0;
  let rejected = 0;
  let joseDistributed = 0;
  let joseFailures = 0;
  const packets = [];
  for (const message of messages) {
    const senderId = message?.fromId || message?.chatId || '';
    const route = createConnectorRoutePacket('telegram', message?.text || '', senderId);
    if (route?.rejected) {
      rejected += 1;
      continue;
    }
    if (route?.packet) {
      routed += 1;
      packets.push(route.packet);
      appendConnectorAudit('telegram', 'poll_message_routed', {
        packetId: route.packet.id,
        updateId: message?.updateId ?? null,
        chatId: message?.chatId ?? null
      });
      try {
        const command = await createJoseCommandRoute({
          commandText: route?.parsed?.originalText || message?.text || '',
          source: 'telegram'
        });
        if (command?.id) {
          joseDistributed += 1;
          updatePacketStatus(route.packet.id, 'reported_to_jose', {
            joseCommandId: command.id,
            commandDistributedAtMs: timestampMs(),
            verificationState: TRUST_STATES.VERIFIED,
            confidence: TRUST_STATES.VERIFIED
          });
          appendConnectorAudit('telegram', 'jose_command_distributed', {
            packetId: route.packet.id,
            commandId: command.id,
            assignmentCount: command.assignments?.length || 0
          });
        }
      } catch (error) {
        joseFailures += 1;
        const retried = requestPacketRetry(route.packet.id, `Jose distribution failed: ${String(error)}`);
        const retryCount = Number(retried?.retryCount || 0);
        if (retryCount >= 3) {
          sendPacketToDeadLetter(route.packet.id, 'Connector route exceeded retry attempts during Jose distribution.');
        }
        appendConnectorAudit('telegram', 'jose_command_distribution_failed', {
          packetId: route.packet.id,
          error: String(error),
          retryCount
        });
      }
    }
  }

  return {
    ok: Boolean(proof?.ok),
    count: messages.length,
    routed,
    rejected,
    joseDistributed,
    joseFailures,
    packets,
    cursor: proof?.cursor ?? null,
    trust: proof?.trust || TRUST_STATES.TEMPORARY,
    error: proof?.error || null
  };
}

export async function pollWhatsAppConnector(limit = 12) {
  const readiness = await requireConnectorReady('whatsapp', 'inbound_poll', `poll limit ${limit}`);
  if (!readiness.ok) {
    return { ok: false, count: 0, routed: 0, rejected: 0, messages: [], ...readiness };
  }
  let proof;
  try {
    proof = await invoke('connector_poll_whatsapp', { limit });
  } catch (error) {
    appendConnectorAudit('whatsapp', 'poll_failed', { error: String(error) });
    return {
      ok: false,
      count: 0,
      routed: 0,
      rejected: 0,
      messages: [],
      error: String(error)
    };
  }

  const messages = Array.isArray(proof?.messages) ? proof.messages : [];
  let routed = 0;
  let rejected = 0;
  let joseDistributed = 0;
  let joseFailures = 0;
  const packets = [];

  for (const message of messages) {
    const senderId = message?.fromId || message?.chatId || '';
    const route = createConnectorRoutePacket('whatsapp', message?.text || '', senderId);
    if (route?.rejected) {
      rejected += 1;
      continue;
    }
    if (route?.packet) {
      routed += 1;
      packets.push(route.packet);
      appendConnectorAudit('whatsapp', 'poll_message_routed', {
        packetId: route.packet.id,
        chatId: message?.chatId ?? null
      });
      try {
        const command = await createJoseCommandRoute({
          commandText: route?.parsed?.originalText || message?.text || '',
          source: 'whatsapp'
        });
        if (command?.id) {
          joseDistributed += 1;
          updatePacketStatus(route.packet.id, 'reported_to_jose', {
            joseCommandId: command.id,
            commandDistributedAtMs: timestampMs(),
            verificationState: TRUST_STATES.VERIFIED,
            confidence: TRUST_STATES.VERIFIED
          });
          appendConnectorAudit('whatsapp', 'jose_command_distributed', {
            packetId: route.packet.id,
            commandId: command.id,
            assignmentCount: command.assignments?.length || 0
          });
        }
      } catch (error) {
        joseFailures += 1;
        const retried = requestPacketRetry(route.packet.id, `Jose distribution failed: ${String(error)}`);
        const retryCount = Number(retried?.retryCount || 0);
        if (retryCount >= 3) {
          sendPacketToDeadLetter(route.packet.id, 'Connector route exceeded retry attempts during Jose distribution.');
        }
        appendConnectorAudit('whatsapp', 'jose_command_distribution_failed', {
          packetId: route.packet.id,
          error: String(error),
          retryCount
        });
      }
    }
  }

  return {
    ok: Boolean(proof?.ok),
    count: messages.length,
    routed,
    rejected,
    joseDistributed,
    joseFailures,
    packets,
    cursor: proof?.cursor ?? null,
    trust: proof?.trust || TRUST_STATES.TEMPORARY,
    error: proof?.error || null
  };
}

function getConnectorEnvironment() {
  try {
    const raw = localStorage.getItem('alphonso_connector_registry_v2');
    const parsed = raw ? JSON.parse(raw) : {};
    if (parsed?.envPresence && typeof parsed.envPresence === 'object') return parsed.envPresence;
    const rows = Array.isArray(parsed?.rows) ? parsed.rows : [];
    const telegram = rows.find((row) => row?.id === 'telegram');
    const presence = telegram?.envPresence || {};
    return presence;
  } catch {
    return {};
  }
}

export function normalizeWhatsAppCloudInboundPayload(payload) {
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];
  const messages = [];
  entries.forEach((entry) => {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    changes.forEach((change) => {
      const value = change?.value || {};
      const metaPhone = value?.metadata?.display_phone_number || null;
      const incoming = Array.isArray(value?.messages) ? value.messages : [];
      incoming.forEach((msg) => {
        const text = msg?.text?.body ? String(msg.text.body).trim() : '';
        if (!text) return;
        messages.push({
          provider: 'whatsapp_cloud_api',
          chatId: String(msg?.from || ''),
          fromId: String(msg?.from || ''),
          text,
          messageId: String(msg?.id || ''),
          phoneNumber: metaPhone,
          receivedAtMs: timestampMs()
        });
      });
    });
  });
  return messages;
}

export async function verifyWhatsAppCloudWebhookChallenge({ mode, verifyToken, challenge }) {
  try {
    return await invoke('verify_whatsapp_cloud_webhook_challenge', {
      mode: mode || null,
      verifyToken: verifyToken || null,
      challenge: challenge || null
    });
  } catch (error) {
    return {
      ok: false,
      trust: TRUST_STATES.FAILED,
      error: String(error),
      checkedAtMs: timestampMs()
    };
  }
}

export async function verifyWhatsAppCloudWebhookSignature({ rawBody, signatureHeader }) {
  try {
    return await invoke('verify_whatsapp_cloud_webhook_signature', {
      rawBody: String(rawBody || ''),
      signatureHeader: signatureHeader || null
    });
  } catch (error) {
    return {
      ok: false,
      trust: TRUST_STATES.FAILED,
      error: String(error),
      checkedAtMs: timestampMs()
    };
  }
}

export async function simulateWhatsAppCloudInbound(payload) {
  let messages = normalizeWhatsAppCloudInboundPayload(payload);
  try {
    const proof = await invoke('normalize_whatsapp_cloud_inbound', {
      rawBody: JSON.stringify(payload || {})
    });
    if (proof?.ok && Array.isArray(proof.messages)) {
      messages = proof.messages.map((message) => ({
        provider: 'whatsapp_cloud_api',
        chatId: message.chatId || '',
        fromId: message.fromId || '',
        text: message.text || '',
        messageId: '',
        phoneNumber: null,
        receivedAtMs: message.receivedAtMs || timestampMs()
      }));
    }
  } catch {
    // Fall back to JS normalization.
  }
  const routed = [];
  const rejected = [];
  messages.forEach((message) => {
    const result = createConnectorRoutePacket('whatsapp', message.text, message.fromId);
    if (result?.rejected) {
      rejected.push({
        ...message,
        reason: result.reason
      });
      return;
    }
    if (result?.packet) {
      updatePacketStatus(result.packet.id, 'reported_to_jose', {
        connectorSimulation: true,
        verificationState: TRUST_STATES.TEMPORARY
      });
      appendConnectorAudit('whatsapp', 'cloud_inbound_simulated_route', {
        packetId: result.packet.id,
        fromId: message.fromId,
        messageId: message.messageId
      });
      routed.push({
        ...message,
        packetId: result.packet.id
      });
    }
  });
  return {
    ok: true,
    provider: 'whatsapp_cloud_api',
    setupRequired: true,
    setupRequiredReason: 'Cloud API inbound needs hosted webhook endpoint + signature verification wiring in deployment environment.',
    count: messages.length,
    routedCount: routed.length,
    rejectedCount: rejected.length,
    routed,
    rejected
  };
}
