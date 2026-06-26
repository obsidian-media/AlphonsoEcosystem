import { TRUST_STATES, timestampMs } from './trustModel';
import { persistScopeRows } from './runtimeLedgerService';
import { validateAgentExecutionContract } from './agentContractService';
import { durableGet, durableSet } from '../lib/durableStore';

const PACKET_KEY = 'alphonso_agent_bus_packets_v1';
export const PACKET_SCOPE = 'agent_bus_packets_v1';

function readPackets() {
  try {
    const raw = durableGet(PACKET_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePackets(items) {
  const rows = items.slice(-800);
  durableSet(PACKET_KEY, JSON.stringify(rows));
  persistScopeRows(PACKET_SCOPE, rows, (row) => ({
    id: row.id,
    data: row,
    status: row.status || 'recorded',
    confidence: row.confidence || TRUST_STATES.TEMPORARY,
    verificationState: row.verificationState || TRUST_STATES.UNVERIFIED,
    timestampMs: Number(row.updatedAtMs || row.createdAtMs || timestampMs())
  }));
}

export const AGENTS = {
  ALPHONSO: 'alphonso',
  MIYA: 'miya',
  JOSE: 'jose',
  HECTOR: 'hector',
  MARIA: 'maria',
  MARCUS: 'marcus',
  ECHO: 'echo',
  SENTINEL: 'sentinel',
  NOVA: 'nova'
};

export function listAgentPackets() {
  return readPackets();
}

export function createAgentPacket({
  fromAgent,
  toAgent,
  title,
  packetType,
  payload,
  source = 'ui',
  confidence = TRUST_STATES.TEMPORARY,
  verificationState = TRUST_STATES.UNVERIFIED,
  requiresApproval = true,
  riskLevel = 'medium',
  actionType = 'agent_handoff',
  commandPreview = '',
  fileChangePreview = '',
  rollbackAvailable = false
}) {
  const packets = readPackets();
  const packet = {
    id: `packet-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    fromAgent,
    toAgent,
    title,
    packetType,
    payload,
    source,
    confidence,
    verificationState,
    riskLevel,
    actionType,
    commandPreview,
    fileChangePreview,
    rollbackAvailable,
    status: requiresApproval ? 'pending_approval' : 'queued',
    requiresApproval,
    createdAtMs: timestampMs(),
    updatedAtMs: timestampMs(),
    references: [],
    executionResult: null
  };
  packets.push(packet);
  writePackets(packets);
  return packet;
}

export function updatePacketStatus(packetId, status, updates = {}) {
  const packets = readPackets().map((packet) => {
    if (packet.id !== packetId) return packet;
    return {
      ...packet,
      ...updates,
      status,
      updatedAtMs: timestampMs()
    };
  });
  writePackets(packets);
  return packets.find((packet) => packet.id === packetId) || null;
}

export function getPacketById(packetId) {
  return readPackets().find((packet) => packet.id === packetId) || null;
}

export function approvePacket(packetId, approvedBy = 'operator') {
  return updatePacketStatus(packetId, 'approved', {
    approvedBy,
    approvedAtMs: timestampMs()
  });
}

export function rejectPacket(packetId, reason = 'Rejected by operator') {
  return updatePacketStatus(packetId, 'rejected', {
    rejectionReason: reason
  });
}

export function markPacketExecuted(packetId, executionResult, verificationState = TRUST_STATES.VERIFIED) {
  return updatePacketStatus(packetId, 'executed', {
    executionResult,
    verificationState,
    confidence: verificationState
  });
}

export function markPacketFailed(packetId, failureReason, retryable = true) {
  const packet = getPacketById(packetId);
  if (!packet) return null;
  const retries = Number(packet.retryCount || 0);
  return updatePacketStatus(packetId, 'failed', {
    failureReason: String(failureReason || 'Unknown failure'),
    retryable: Boolean(retryable),
    retryCount: retries,
    confidence: TRUST_STATES.FAILED,
    verificationState: TRUST_STATES.FAILED
  });
}

export function requestPacketRetry(packetId, reason = 'Retry requested') {
  const packet = getPacketById(packetId);
  if (!packet) return null;
  const retryCount = Number(packet.retryCount || 0) + 1;
  return updatePacketStatus(packetId, 'queued', {
    retryCount,
    retryReason: reason,
    retryRequestedAtMs: timestampMs(),
    retryable: true,
    verificationState: TRUST_STATES.PENDING,
    confidence: TRUST_STATES.TEMPORARY
  });
}

export function sendPacketToDeadLetter(packetId, reason = 'Moved to dead-letter queue') {
  return updatePacketStatus(packetId, 'dead_letter', {
    deadLetterReason: String(reason || 'Dead-lettered'),
    deadLetterAtMs: timestampMs(),
    verificationState: TRUST_STATES.FAILED,
    confidence: TRUST_STATES.FAILED
  });
}

export function canExecutePacket(packet) {
  if (!packet) {
    return { ok: false, reason: 'Packet not found.' };
  }
  if (packet.status === 'rejected' || packet.status === 'dead_letter') {
    return { ok: false, reason: `Packet status is ${packet.status}.` };
  }
  if (packet.requiresApproval && packet.status !== 'approved' && packet.status !== 'queued') {
    return { ok: false, reason: 'Approval is required before execution.' };
  }
  if (isExternalRiskAction(packet) && packet.status !== 'approved') {
    return { ok: false, reason: 'Risky external action requires explicit approved status.' };
  }
  const contractGate = validateAgentExecutionContract(packet);
  if (!contractGate.ok) {
    return contractGate;
  }
  return { ok: true, reason: null };
}

export function attemptPacketExecution(packetId, executionResult = null) {
  const packet = getPacketById(packetId);
  const gate = canExecutePacket(packet);
  if (!gate.ok) {
    return {
      ok: false,
      packet: markPacketFailed(packetId, gate.reason, true),
      reason: gate.reason
    };
  }
  const next = markPacketExecuted(packetId, executionResult, TRUST_STATES.VERIFIED);
  return { ok: true, packet: next, reason: null };
}

export function addPacketReference(packetId, reference) {
  const packets = readPackets().map((packet) => {
    if (packet.id !== packetId) return packet;
    return {
      ...packet,
      references: [...(packet.references || []), reference],
      updatedAtMs: timestampMs()
    };
  });
  writePackets(packets);
  return packets.find((packet) => packet.id === packetId) || null;
}

export function listApprovalQueue() {
  return readPackets().filter((packet) => packet.status === 'pending_approval');
}

export function listPacketsByStatus(status) {
  return readPackets().filter((packet) => packet.status === status);
}

export function listDeadLetterPackets() {
  return readPackets().filter((packet) => packet.status === 'dead_letter');
}

export function listFailedRetryablePackets() {
  return readPackets().filter((packet) => packet.status === 'failed' && packet.retryable !== false);
}

// ── A2A Direct Messaging ─────────────────────────────────────────────────────

const MSG_RING_SIZE = 50;

function _msgKey(toAgent) {
  return `alphonso_agent_messages_${String(toAgent)}`;
}

export function sendAgentMessage(fromAgent, toAgent, message, context = {}) {
  const key = _msgKey(toAgent);
  let ring = [];
  try {
    const raw = localStorage.getItem(key);
    ring = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(ring)) ring = [];
  } catch { ring = []; }

  ring.push({
    id: `msg-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    fromAgent: String(fromAgent),
    toAgent: String(toAgent),
    message: String(message),
    context: context || {},
    sentAt: new Date().toISOString(),
    read: false,
  });

  localStorage.setItem(key, JSON.stringify(ring.slice(-MSG_RING_SIZE)));
}

export function getAgentMessages(toAgent) {
  try {
    const raw = localStorage.getItem(_msgKey(toAgent));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function clearAgentMessages(toAgent) {
  localStorage.removeItem(_msgKey(toAgent));
}

const _subscriptions = new Map();

export function subscribeToMessages(toAgent, callback) {
  let lastCount = getAgentMessages(toAgent).length;

  const interval = setInterval(() => {
    const msgs = getAgentMessages(toAgent);
    if (msgs.length > lastCount) {
      const newMsgs = msgs.slice(lastCount);
      lastCount = msgs.length;
      try { callback(newMsgs); } catch { /* non-critical */ }
    }
  }, 2000);

  const key = `${toAgent}_${interval}`;
  _subscriptions.set(key, interval);

  return function unsubscribe() {
    clearInterval(interval);
    _subscriptions.delete(key);
  };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function isExternalRiskAction(packet) {
  const action = String(packet?.actionType || '').toLowerCase();
  const preview = String(packet?.commandPreview || '').toLowerCase();
  if (/external|publish|upload|post|connector|remote/.test(action)) return true;
  return /upload|publish|post|youtube|telegram|whatsapp|send/.test(preview);
}
