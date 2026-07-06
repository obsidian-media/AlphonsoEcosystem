import { TRUST_STATES, timestampMs } from './trustModel';
import { persistScopeRows } from './runtimeLedgerService';
import { validateAgentExecutionContract } from './agentContractService';
import { durableGet, durableSet } from '../lib/durableStore';

const PACKET_KEY = 'alphonso_agent_bus_packets_v1';
export const PACKET_SCOPE = 'agent_bus_packets_v1';

export interface AgentPacket {
  id: string;
  fromAgent: string;
  toAgent: string;
  title: string;
  packetType: string;
  payload: Record<string, unknown>;
  source: string;
  confidence: string;
  verificationState: string;
  riskLevel: string;
  actionType: string;
  commandPreview: string;
  fileChangePreview: string;
  rollbackAvailable: boolean;
  status: string;
  requiresApproval: boolean;
  createdAtMs: number;
  updatedAtMs: number;
  references: unknown[];
  executionResult: unknown;
  approvedBy?: string;
  approvedAtMs?: number;
  rejectionReason?: string;
  failureReason?: string;
  retryable?: boolean;
  retryCount?: number;
  retryReason?: string;
  retryRequestedAtMs?: number;
  deadLetterReason?: string;
  deadLetterAtMs?: number;
}

export interface AgentPacketInput {
  fromAgent: string;
  toAgent: string;
  title: string;
  packetType: string;
  payload: Record<string, unknown>;
  source?: string;
  confidence?: string;
  verificationState?: string;
  requiresApproval?: boolean;
  riskLevel?: string;
  actionType?: string;
  commandPreview?: string;
  fileChangePreview?: string;
  rollbackAvailable?: boolean;
}

export interface PacketStatusUpdate {
  [key: string]: unknown;
}

export interface ExecutionGate {
  ok: boolean;
  reason: string | null;
}

export interface ExecutionAttemptResult {
  ok: boolean;
  packet: AgentPacket | null;
  reason: string | null;
}

export interface AgentMessage {
  id: string;
  fromAgent: string;
  toAgent: string;
  message: string;
  context: Record<string, unknown>;
  sentAt: string;
  read: boolean;
}

function readPackets(): AgentPacket[] {
  try {
    const raw = durableGet(PACKET_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePackets(items: AgentPacket[]): void {
  const rows = items.slice(-800);
  durableSet(PACKET_KEY, JSON.stringify(rows));
  persistScopeRows(PACKET_SCOPE, rows, (row: AgentPacket) => ({
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
} as const;

export type AgentName = typeof AGENTS[keyof typeof AGENTS];

export function listAgentPackets(): AgentPacket[] {
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
}: AgentPacketInput): AgentPacket {
  const packets = readPackets();
  const packet: AgentPacket = {
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

export function updatePacketStatus(packetId: string, status: string, updates: PacketStatusUpdate = {}): AgentPacket | null {
  const packets = readPackets().map((packet) => {
    if (packet.id !== packetId) return packet;
    return {
      ...packet,
      ...updates,
      status,
      updatedAtMs: timestampMs()
    } as AgentPacket;
  });
  writePackets(packets);
  return packets.find((packet) => packet.id === packetId) || null;
}

export function getPacketById(packetId: string): AgentPacket | null {
  return readPackets().find((packet) => packet.id === packetId) || null;
}

export function approvePacket(packetId: string, approvedBy = 'operator'): AgentPacket | null {
  return updatePacketStatus(packetId, 'approved', {
    approvedBy,
    approvedAtMs: timestampMs()
  });
}

export function rejectPacket(packetId: string, reason = 'Rejected by operator'): AgentPacket | null {
  return updatePacketStatus(packetId, 'rejected', {
    rejectionReason: reason
  });
}

export function markPacketExecuted(packetId: string, executionResult: unknown, verificationState = TRUST_STATES.VERIFIED): AgentPacket | null {
  return updatePacketStatus(packetId, 'executed', {
    executionResult,
    verificationState,
    confidence: verificationState
  });
}

export function markPacketFailed(packetId: string, failureReason: unknown, retryable = true): AgentPacket | null {
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

export function requestPacketRetry(packetId: string, reason = 'Retry requested'): AgentPacket | null {
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

export function sendPacketToDeadLetter(packetId: string, reason = 'Moved to dead-letter queue'): AgentPacket | null {
  return updatePacketStatus(packetId, 'dead_letter', {
    deadLetterReason: String(reason || 'Dead-lettered'),
    deadLetterAtMs: timestampMs(),
    verificationState: TRUST_STATES.FAILED,
    confidence: TRUST_STATES.FAILED
  });
}

export function canExecutePacket(packet: AgentPacket | null): ExecutionGate {
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

export function attemptPacketExecution(packetId: string, executionResult: unknown = null): ExecutionAttemptResult {
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

export function addPacketReference(packetId: string, reference: unknown): AgentPacket | null {
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

export function listApprovalQueue(): AgentPacket[] {
  return readPackets().filter((packet) => packet.status === 'pending_approval');
}

export function listPacketsByStatus(status: string): AgentPacket[] {
  return readPackets().filter((packet) => packet.status === status);
}

export function listDeadLetterPackets(): AgentPacket[] {
  return readPackets().filter((packet) => packet.status === 'dead_letter');
}

export function listFailedRetryablePackets(): AgentPacket[] {
  return readPackets().filter((packet) => packet.status === 'failed' && packet.retryable !== false);
}

// ── A2A Direct Messaging ─────────────────────────────────────────────────────

const MSG_RING_SIZE = 50;

function _msgKey(toAgent: string): string {
  return `alphonso_agent_messages_${String(toAgent)}`;
}

export function sendAgentMessage(fromAgent: string, toAgent: string, message: string, context: Record<string, unknown> = {}): void {
  const key = _msgKey(toAgent);
  let ring: AgentMessage[] = [];
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

export function getAgentMessages(toAgent: string): AgentMessage[] {
  try {
    const raw = localStorage.getItem(_msgKey(toAgent));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function clearAgentMessages(toAgent: string): void {
  localStorage.removeItem(_msgKey(toAgent));
}

const _subscriptions = new Map<string, ReturnType<typeof setInterval>>();

export function subscribeToMessages(toAgent: string, callback: (messages: AgentMessage[]) => void): () => void {
  const seen = new Set(getAgentMessages(toAgent).map(m => m.id));

  const interval = setInterval(() => {
    const msgs = getAgentMessages(toAgent);
    const newMsgs = msgs.filter(m => !seen.has(m.id));
    if (newMsgs.length > 0) {
      newMsgs.forEach(m => seen.add(m.id));
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

function isExternalRiskAction(packet: AgentPacket): boolean {
  const action = String(packet?.actionType || '').toLowerCase();
  const preview = String(packet?.commandPreview || '').toLowerCase();
  if (/external|publish|upload|post|connector|remote/.test(action)) return true;
  return /upload|publish|post|youtube|telegram|whatsapp|send/.test(preview);
}
