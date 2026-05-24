import { invoke } from '@tauri-apps/api/core';
import { AGENTS, createConnectorRoutePacket, normalizeWhatsAppCloudInboundPayload, appendConnectorAudit } from './connectorRegistryService';
import { appendOrchestrationReceipt } from './orchestrationReceiptService';
import { updatePacketStatus } from './agentBusService';
import { TRUST_STATES, timestampMs } from './trustModel';

const WEBHOOK_EVENTS_KEY = 'alphonso_whatsapp_webhook_events_v1';
export const WHATSAPP_WEBHOOK_SCOPE = 'whatsapp_webhook_events_v1';

function readEvents() {
  try {
    const raw = localStorage.getItem(WEBHOOK_EVENTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeEvents(rows) {
  const next = rows.slice(-500);
  localStorage.setItem(WEBHOOK_EVENTS_KEY, JSON.stringify(next));
}

function recordEvent(eventType, details = {}) {
  const rows = readEvents();
  const entry = {
    id: `whatsapp-webhook-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    eventType,
    details,
    timestampMs: timestampMs(),
    trust: details?.trust || TRUST_STATES.TEMPORARY
  };
  rows.push(entry);
  writeEvents(rows);
  return entry;
}

function coerceBody(body) {
  if (typeof body === 'string') {
    try {
      return {
        rawBody: body,
        payload: body.trim() ? JSON.parse(body) : {},
        error: null
      };
    } catch (error) {
      return {
        rawBody: body,
        payload: null,
        error: `Invalid WhatsApp webhook JSON payload: ${String(error)}`
      };
    }
  }

  if (body && typeof body === 'object') {
    return {
      rawBody: JSON.stringify(body),
      payload: body,
      error: null
    };
  }

  return {
    rawBody: '{}',
    payload: {},
    error: null
  };
}

function normalizeMessages(payload, rustProof) {
  if (rustProof?.ok && Array.isArray(rustProof.messages)) {
    return rustProof.messages.map((message) => ({
      provider: 'whatsapp_cloud_api',
      chatId: message.chatId || '',
      fromId: message.fromId || '',
      text: message.text || '',
      messageId: message.messageId || '',
      phoneNumber: message.phoneNumber || null,
      receivedAtMs: message.receivedAtMs || timestampMs()
    }));
  }

  return normalizeWhatsAppCloudInboundPayload(payload || {});
}

function buildReceiptDetails({
  mode = 'process',
  challenge = null,
  trust = TRUST_STATES.TEMPORARY,
  error = null,
  count = 0,
  routedCount = 0,
  rejectedCount = 0
}) {
  return {
    mode,
    challengePresent: Boolean(challenge),
    trust,
    error,
    count,
    routedCount,
    rejectedCount
  };
}

export async function verifyWebhook(token, challenge, options = {}) {
  const mode = options.mode || 'subscribe';
  const proof = await invoke('verify_whatsapp_cloud_webhook_challenge', {
    mode,
    verifyToken: token || null,
    challenge: challenge || null
  }).catch((error) => ({
    ok: false,
    mode,
    verifyTokenPresent: Boolean(token),
    challenge: challenge || null,
    responseChallenge: null,
    checkedAtMs: timestampMs(),
    trust: TRUST_STATES.FAILED,
    error: String(error)
  }));

  const trust = proof?.trust || (proof?.ok ? TRUST_STATES.VERIFIED : TRUST_STATES.FAILED);
  const receiptDetails = buildReceiptDetails({
    mode: proof?.mode || mode,
    challenge,
    trust,
    error: proof?.error || null
  });

  recordEvent('verify_webhook', {
    ...receiptDetails,
    verified: Boolean(proof?.ok)
  });
  appendConnectorAudit('whatsapp', proof?.ok ? 'webhook_verify_success' : 'webhook_verify_failed', receiptDetails);
  appendOrchestrationReceipt({
    workflowId: 'whatsapp_webhook',
    commandId: options.commandId || null,
    packetId: options.packetId || null,
    eventType: proof?.ok ? 'whatsapp_webhook_verified' : 'whatsapp_webhook_verify_failed',
    status: proof?.ok ? 'verified' : 'failed',
    agent: AGENTS.JOSE,
    connectorId: 'whatsapp',
    actionType: 'webhook_verify',
    riskLevel: 'low',
    approved: Boolean(proof?.ok),
    blocked: !proof?.ok,
    setupRequired: !proof?.ok && trust === 'setup_required',
    details: receiptDetails,
    confidence: proof?.ok ? TRUST_STATES.VERIFIED : TRUST_STATES.FAILED,
    verificationState: proof?.ok ? TRUST_STATES.VERIFIED : TRUST_STATES.FAILED
  });

  return proof;
}

export async function processInbound(body, options = {}) {
  const { rawBody, payload, error: parseError } = coerceBody(body);
  if (parseError) {
    const details = {
      error: parseError,
      trust: TRUST_STATES.FAILED
    };
    recordEvent('process_inbound_failed', details);
    appendConnectorAudit('whatsapp', 'webhook_payload_invalid', details);
    appendOrchestrationReceipt({
      workflowId: 'whatsapp_webhook',
      commandId: options.commandId || null,
      packetId: options.packetId || null,
      eventType: 'whatsapp_webhook_rejected',
      status: 'failed',
      agent: AGENTS.JOSE,
      connectorId: 'whatsapp',
      actionType: 'webhook_inbound',
      riskLevel: 'high',
      approved: false,
      blocked: true,
      setupRequired: false,
      details,
      confidence: TRUST_STATES.FAILED,
      verificationState: TRUST_STATES.FAILED
    });
    return {
      ok: false,
      provider: 'whatsapp_cloud_api',
      error: parseError,
      trust: TRUST_STATES.FAILED,
      count: 0,
      routedCount: 0,
      rejectedCount: 0,
      packets: [],
      routed: [],
      rejected: []
    };
  }

  const allowUnsigned = Boolean(options.allowUnsigned);
  const signatureHeader = options.signatureHeader || options.signature || null;
  let signatureProof = null;
  if (!allowUnsigned) {
    if (!signatureHeader) {
      const error = 'X-Hub-Signature-256 header is missing.';
      const details = { error, trust: TRUST_STATES.FAILED };
      recordEvent('process_inbound_failed', details);
      appendConnectorAudit('whatsapp', 'webhook_signature_missing', details);
      appendOrchestrationReceipt({
        workflowId: 'whatsapp_webhook',
        commandId: options.commandId || null,
        packetId: options.packetId || null,
        eventType: 'whatsapp_webhook_rejected',
        status: 'failed',
        agent: AGENTS.JOSE,
        connectorId: 'whatsapp',
        actionType: 'webhook_inbound',
        riskLevel: 'high',
        approved: false,
        blocked: true,
        setupRequired: false,
        details,
        confidence: TRUST_STATES.FAILED,
        verificationState: TRUST_STATES.FAILED
      });
      return {
        ok: false,
        provider: 'whatsapp_cloud_api',
        error,
        trust: TRUST_STATES.FAILED,
        count: 0,
        routedCount: 0,
        rejectedCount: 0,
        packets: [],
        routed: [],
        rejected: []
      };
    }

    signatureProof = await invoke('verify_whatsapp_cloud_webhook_signature', {
      rawBody,
      signatureHeader
    }).catch((error) => ({
      ok: false,
      signatureHeaderPresent: Boolean(signatureHeader),
      appSecretPresent: false,
      expectedSignature: null,
      receivedSignature: signatureHeader,
      checkedAtMs: timestampMs(),
      trust: TRUST_STATES.FAILED,
      error: String(error)
    }));

    if (!signatureProof?.ok) {
      const details = {
        error: signatureProof?.error || 'Webhook signature rejected.',
        trust: signatureProof?.trust || TRUST_STATES.FAILED
      };
      recordEvent('process_inbound_failed', details);
      appendConnectorAudit('whatsapp', 'webhook_signature_failed', details);
      appendOrchestrationReceipt({
        workflowId: 'whatsapp_webhook',
        commandId: options.commandId || null,
        packetId: options.packetId || null,
        eventType: 'whatsapp_webhook_rejected',
        status: 'failed',
        agent: AGENTS.JOSE,
        connectorId: 'whatsapp',
        actionType: 'webhook_inbound',
        riskLevel: 'high',
        approved: false,
        blocked: true,
        setupRequired: Boolean(signatureProof?.trust === 'setup_required'),
        details,
        confidence: TRUST_STATES.FAILED,
        verificationState: TRUST_STATES.FAILED
      });
      return {
        ok: false,
        provider: 'whatsapp_cloud_api',
        error: details.error,
        trust: details.trust,
        signatureProof,
        count: 0,
        routedCount: 0,
        rejectedCount: 0,
        packets: [],
        routed: [],
        rejected: []
      };
    }
  }

  const normalizedProof = await invoke('normalize_whatsapp_cloud_inbound', {
    rawBody
  }).catch((error) => ({
    ok: false,
    provider: 'whatsapp_cloud_api',
    count: 0,
    messages: [],
    checkedAtMs: timestampMs(),
    trust: TRUST_STATES.FAILED,
    error: String(error)
  }));

  const messages = normalizeMessages(payload, normalizedProof);
  const routed = [];
  const rejected = [];
  const packets = [];

  for (const message of messages) {
    const senderId = message?.fromId || message?.chatId || '';
    const route = createConnectorRoutePacket('whatsapp', message?.text || '', senderId);
    if (route?.rejected) {
      rejected.push({
        ...message,
        reason: route.reason || 'Sender is not authorized in connector allowlist.'
      });
      appendConnectorAudit('whatsapp', 'webhook_message_rejected', {
        senderId,
        messageId: message?.messageId || null,
        reason: route.reason || 'Sender is not authorized in connector allowlist.'
      });
      appendOrchestrationReceipt({
        workflowId: 'whatsapp_webhook',
        commandId: options.commandId || null,
        packetId: route?.packet?.id || null,
        eventType: 'whatsapp_webhook_message_rejected',
        status: 'blocked',
        agent: AGENTS.JOSE,
        connectorId: 'whatsapp',
        actionType: 'webhook_inbound',
        riskLevel: 'high',
        approved: false,
        blocked: true,
        setupRequired: false,
        details: {
          senderId,
          messageId: message?.messageId || null,
          reason: route.reason || 'Sender is not authorized in connector allowlist.'
        },
        confidence: TRUST_STATES.FAILED,
        verificationState: TRUST_STATES.FAILED
      });
      continue;
    }

    if (route?.packet) {
      const executedPacket = updatePacketStatus(route.packet.id, 'reported_to_jose', {
        connectorWebhook: true,
        verificationState: TRUST_STATES.VERIFIED,
        confidence: TRUST_STATES.VERIFIED,
        inboundSource: 'whatsapp_webhook',
        inboundReceivedAtMs: timestampMs()
      }) || route.packet;

      packets.push(executedPacket);
      routed.push({
        ...message,
        packetId: executedPacket.id
      });

      appendConnectorAudit('whatsapp', 'webhook_message_routed', {
        packetId: executedPacket.id,
        senderId,
        messageId: message?.messageId || null
      });
      appendOrchestrationReceipt({
        workflowId: 'whatsapp_webhook',
        commandId: options.commandId || null,
        packetId: executedPacket.id,
        eventType: 'whatsapp_webhook_message_routed',
        status: 'recorded',
        agent: AGENTS.JOSE,
        connectorId: 'whatsapp',
        actionType: 'webhook_inbound',
        riskLevel: 'medium',
        approved: true,
        blocked: false,
        setupRequired: false,
        details: {
          senderId,
          messageId: message?.messageId || null,
          textPreview: String(message?.text || '').slice(0, 120)
        },
        confidence: TRUST_STATES.VERIFIED,
        verificationState: TRUST_STATES.VERIFIED
      });
    }
  }

  const trust = signatureProof?.trust || normalizedProof?.trust || TRUST_STATES.VERIFIED;
  const result = {
    ok: true,
    provider: 'whatsapp_cloud_api',
    trust,
    signatureProof,
    normalizationProof: normalizedProof,
    count: messages.length,
    routedCount: routed.length,
    rejectedCount: rejected.length,
    routed,
    rejected,
    packets
  };

  recordEvent('process_inbound_completed', {
    trust,
    count: messages.length,
    routedCount: routed.length,
    rejectedCount: rejected.length
  });

  return result;
}
