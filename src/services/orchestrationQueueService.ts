import { invoke } from '@tauri-apps/api/core';
import { getPacketById, listAgentPackets, requestPacketRetry, sendPacketToDeadLetter, updatePacketStatus } from './agentBusService';
import { persistScopeRows } from './runtimeLedgerService';
import { TRUST_STATES, timestampMs } from './trustModel';

const QUEUE_KEY = 'alphonso_orchestration_queue_transitions_v1';
const JOSE_COMMAND_KEY = 'alphonso_jose_command_routes_v2';
export const ORCHESTRATION_QUEUE_SCOPE = 'orchestration_queue_transitions_v1';
const MAX_TRANSITIONS = 4000;

export interface QueueTransition {
  id: string;
  commandId: string | null;
  packetId: string;
  agent: string;
  fromStatus: string;
  toStatus: string;
  reason: string;
  retryCount: number;
  confidence: string;
  verificationState: string;
  timestampMs: number;
}

export interface QueueTransitionFilters {
  commandId?: string;
  packetId?: string;
  toStatus?: string;
  agent?: string;
}

export interface QueueSnapshot {
  queued: number;
  executing: number;
  pendingApproval: number;
  failed: number;
  deadLetter: number;
  reportedToJose: number;
  commandsInProgress: number;
  commandsReported: number;
  timestampMs: number;
}

export interface ReplayResult {
  ok: boolean;
  reason?: string;
  packet?: any;
  transition?: QueueTransition | null;
}

export interface ForceDeadLetterResult {
  ok: boolean;
  reason?: string;
  packet?: any;
  transition?: QueueTransition | null;
}

function readTransitions(): QueueTransition[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readJoseCommands(): any[] {
  try {
    const raw = localStorage.getItem(JOSE_COMMAND_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeTransitions(rows: QueueTransition[]): void {
  const next = rows.slice(-MAX_TRANSITIONS);
  try {
    invoke('kv_set', { key: QUEUE_KEY, value: JSON.stringify(next) }).catch(() => {});
  } catch {
    // SQLite not available in browser
  }
  localStorage.setItem(QUEUE_KEY, JSON.stringify(next));
  persistScopeRows(ORCHESTRATION_QUEUE_SCOPE, next, (row: QueueTransition) => ({
    id: row.id,
    data: row,
    status: row.toStatus || (row as unknown as Record<string, string>).status || 'recorded',
    confidence: row.confidence || TRUST_STATES.TEMPORARY,
    verificationState: row.verificationState || TRUST_STATES.UNVERIFIED,
    timestampMs: Number(row.timestampMs || timestampMs())
  }));
}

export function listOrchestrationQueueTransitions(filters: QueueTransitionFilters = {}): QueueTransition[] {
  const rows = readTransitions().slice().reverse();
  return rows.filter((row) => {
    if (filters.commandId && row.commandId !== filters.commandId) return false;
    if (filters.packetId && row.packetId !== filters.packetId) return false;
    if (filters.toStatus && row.toStatus !== filters.toStatus) return false;
    if (filters.agent && row.agent !== filters.agent) return false;
    return true;
  });
}

export function recordOrchestrationQueueTransition({
  commandId = null,
  packetId,
  agent = 'jose',
  fromStatus = 'unknown',
  toStatus,
  reason = '',
  retryCount = 0,
  confidence = TRUST_STATES.TEMPORARY,
  verificationState = TRUST_STATES.UNVERIFIED
}: {
  commandId?: string | null;
  packetId: string;
  agent?: string;
  fromStatus?: string;
  toStatus?: string;
  reason?: string;
  retryCount?: number;
  confidence?: string;
  verificationState?: string;
}): QueueTransition | null {
  if (!packetId) return null;
  const rows = readTransitions();
  const transition: QueueTransition = {
    id: `qtx-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    commandId: commandId ?? null,
    packetId,
    agent,
    fromStatus,
    toStatus: toStatus || 'recorded',
    reason: reason || '',
    retryCount: Number(retryCount || 0),
    confidence,
    verificationState,
    timestampMs: timestampMs()
  };
  rows.push(transition);
  writeTransitions(rows);
  return transition;
}

export function getOrchestrationQueueSnapshot(): QueueSnapshot {
  const packets = listAgentPackets();
  const commands = readJoseCommands();
  return {
    queued: packets.filter((packet) => packet.status === 'queued').length,
    executing: packets.filter((packet) => packet.status === 'executing').length,
    pendingApproval: packets.filter((packet) => packet.status === 'pending_approval').length,
    failed: packets.filter((packet) => packet.status === 'failed').length,
    deadLetter: packets.filter((packet) => packet.status === 'dead_letter').length,
    reportedToJose: packets.filter((packet) => packet.status === 'reported_to_jose').length,
    commandsInProgress: commands.filter((item) => ['distributed', 'in_progress', 'retrying'].includes(item.status)).length,
    commandsReported: commands.filter((item) => item.status === 'reported_to_shayan').length,
    timestampMs: timestampMs()
  };
}

export function replayPacketFromDeadLetter(packetId: string, reason: string = 'Manual dead-letter replay requested.'): ReplayResult {
  const packet = getPacketById(packetId);
  if (!packet || packet.status !== 'dead_letter') {
    return { ok: false, reason: 'Packet is not in dead-letter state.' };
  }
  const retried = requestPacketRetry(packetId, reason);
  if (!retried) {
    return { ok: false, reason: 'Retry request could not be created.' };
  }
  const transition = recordOrchestrationQueueTransition({
    commandId: packet?.payload?.joseCommandId || null,
    packetId,
    agent: 'jose',
    fromStatus: 'dead_letter',
    toStatus: 'queued',
    reason,
    retryCount: retried.retryCount || 0,
    confidence: TRUST_STATES.TEMPORARY,
    verificationState: TRUST_STATES.PENDING
  });
  return { ok: true, packet: retried, transition };
}

export function forceDeadLetterPacket(packetId: string, reason: string = 'Manual dead-letter action requested.'): ForceDeadLetterResult {
  const packet = getPacketById(packetId);
  if (!packet) return { ok: false, reason: 'Packet not found.' };
  const dead = sendPacketToDeadLetter(packetId, reason);
  const transition = recordOrchestrationQueueTransition({
    commandId: packet?.payload?.joseCommandId || null,
    packetId,
    agent: 'jose',
    fromStatus: packet.status || 'unknown',
    toStatus: 'dead_letter',
    reason,
    retryCount: packet.retryCount || 0,
    confidence: TRUST_STATES.FAILED,
    verificationState: TRUST_STATES.FAILED
  });
  return { ok: true, packet: dead, transition };
}

export function markPacketInterrupted(packetId: string, reason: string = 'Pipeline interrupted.'): ReplayResult {
  const packet = getPacketById(packetId);
  if (!packet) return { ok: false, reason: 'Packet not found.' };
  const updated = updatePacketStatus(packetId, 'failed', {
    failureReason: reason,
    retryable: true,
    verificationState: TRUST_STATES.FAILED,
    confidence: TRUST_STATES.FAILED
  });
  const transition = recordOrchestrationQueueTransition({
    commandId: packet?.payload?.joseCommandId || null,
    packetId,
    agent: 'jose',
    fromStatus: packet.status || 'unknown',
    toStatus: 'failed',
    reason,
    retryCount: updated?.retryCount || packet.retryCount || 0,
    confidence: TRUST_STATES.FAILED,
    verificationState: TRUST_STATES.FAILED
  });
  return { ok: true, packet: updated, transition };
}
