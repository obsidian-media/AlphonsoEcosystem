import { TRUST_STATES, timestampMs } from './trustModel';

import {
  approvePacket,
  createAgentPacket,
  getPacketById,
  markPacketExecuted,
  markPacketFailed,
  rejectPacket
} from './agentBusService';
import { resolveAgentPairingRoute } from './agentPairingRegistryService';

interface PairingEvent {
  id: string;
  pairingId: string;
  status: string;
  payload: Record<string, unknown>;
  createdAtMs: number;
}

function logPairingEvent(pairingId: string, status: string, payload: Record<string, unknown> = {}): void {
  try {
    const raw = localStorage.getItem('alphonso_pairing_events_v1');
    const events: PairingEvent[] = raw ? JSON.parse(raw) : [];
    events.push({
      id: `pe-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      pairingId,
      status,
      payload,
      createdAtMs: timestampMs()
    });
    localStorage.setItem('alphonso_pairing_events_v1', JSON.stringify(events.slice(-200)));
  } catch {
    // Ignore logging failures.
  }
}

interface PairingRoute {
  from: string;
  to: string;
  type: string;
  approvalMode: string;
  riskLevel: string;
}

interface PairingExecutionResult {
  ok: boolean;
  pairingId: string;
  packetId?: string;
  route?: PairingRoute;
  status?: string;
  error?: string;
}

export function executeAgentPairing(pairingId: string, context: Record<string, unknown> = {}): PairingExecutionResult {
  const route = resolveAgentPairingRoute(pairingId) as PairingRoute | null;
  if (!route) {
    return { ok: false, pairingId, error: 'Unknown pairing.' };
  }

  const packet = createAgentPacket({
    fromAgent: route.from,
    toAgent: route.to,
    title: `Agent pairing: ${route.from} -> ${route.to}`,
    packetType: 'agent_pairing',
    payload: {
      pairingId,
      routeType: route.type,
      context,
      createdAtMs: timestampMs()
    },
    source: 'agent_pairing_service',
    confidence: TRUST_STATES.TEMPORARY,
    verificationState: TRUST_STATES.UNVERIFIED,
    requiresApproval: true,
    riskLevel: route.riskLevel || 'medium',
    actionType: route.type,
    commandPreview: `Pair ${route.from} -> ${route.to}.`,
    fileChangePreview: 'No direct file change. Pairing executes via agent bus only.',
    rollbackAvailable: false
  });

  logPairingEvent(pairingId, 'packet_created', { packetId: packet.id });

  if (route.approvalMode === 'auto') {
    approvePacket(packet.id, 'pairing_system');
    logPairingEvent(pairingId, 'auto_approved', { packetId: packet.id });
  }

  const executionResult = {
    pairingId,
    packetId: packet.id,
    routeType: route.type,
    input: context,
    receivedAtMs: timestampMs()
  };

  const executed = markPacketExecuted(packet.id, executionResult, TRUST_STATES.TEMPORARY);
  logPairingEvent(pairingId, 'executed', { packetId: packet.id });

  return {
    ok: true,
    pairingId,
    packetId: packet.id,
    route,
    status: executed.status
  };
}

interface RejectResult {
  ok: boolean;
  pairingId?: string;
  packetId?: string;
  packet?: unknown;
  error?: string;
}

export function rejectAgentPairing(pairingId: string, reason = 'Denied by operator'): RejectResult {
  try {
    const raw = localStorage.getItem('alphonso_agent_bus_packets_v1');
    const packets: Array<{ id: string; payload?: { pairingId?: string }; status: string }> = raw ? JSON.parse(raw) : [];
    const match = packets.find((item) => item.payload?.pairingId === pairingId && item.status === 'pending_approval');
    if (!match) return { ok: false, error: 'No pending pairing packet found.' };
    const updated = rejectPacket(match.id, reason);
    logPairingEvent(pairingId, 'rejected', { packetId: match.id, reason });
    return { ok: true, pairingId, packetId: match.id, packet: updated };
  } catch {
    return { ok: false, error: 'Failed to reject pairing.' };
  }
}

export function listPairingEvents(limit = 50): PairingEvent[] {
  try {
    const raw = localStorage.getItem('alphonso_pairing_events_v1');
    const events: PairingEvent[] = raw ? JSON.parse(raw) : [];
    return events.slice(-limit);
  } catch {
    return [];
  }
}
