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

function logPairingEvent(pairingId, status, payload = {}) {
  try {
    const raw = localStorage.getItem('alphonso_pairing_events_v1');
    const events = raw ? JSON.parse(raw) : [];
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

export function executeAgentPairing(pairingId, context = {}) {
  const route = resolveAgentPairingRoute(pairingId);
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
    const approved = approvePacket(packet.id, 'pairing_system');
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

export function rejectAgentPairing(pairingId, reason = 'Denied by operator') {
  const queue = [];
  try {
    const raw = localStorage.getItem('alphonso_agent_bus_packets_v1');
    const packets = raw ? JSON.parse(raw) : [];
    const match = packets.find((item) => item.payload?.pairingId === pairingId && item.status === 'pending_approval');
    if (!match) return { ok: false, error: 'No pending pairing packet found.' };
    const updated = rejectPacket(match.id, reason);
    logPairingEvent(pairingId, 'rejected', { packetId: match.id, reason });
    return { ok: true, pairingId, packetId: match.id, packet: updated };
  } catch {
    return { ok: false, error: 'Failed to reject pairing.' };
  }
}

export function listPairingEvents(limit = 50) {
  try {
    const raw = localStorage.getItem('alphonso_pairing_events_v1');
    const events = raw ? JSON.parse(raw) : [];
    return events.slice(-limit);
  } catch {
    return [];
  }
}
