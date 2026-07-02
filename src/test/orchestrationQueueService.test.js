import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(null),
  isTauri: vi.fn().mockReturnValue(false)
}));

const QUEUE_KEY = 'alphonso_orchestration_queue_transitions_v1';
const PACKET_KEY = 'alphonso_agent_bus_packets_v1';
const JOSE_COMMAND_KEY = 'alphonso_jose_command_routes_v2';

const {
  listOrchestrationQueueTransitions,
  recordOrchestrationQueueTransition,
  getOrchestrationQueueSnapshot,
  replayPacketFromDeadLetter,
  forceDeadLetterPacket,
  markPacketInterrupted,
  recoverInterruptedExecutions,
  getDeadLetterCount,
  getOldestDeadLetterTimestamp,
  retryDeadLetter,
  ORCHESTRATION_QUEUE_SCOPE
} = await import('../services/orchestrationQueueService.ts');

function seedPacket(id, status, extra = {}) {
  const raw = localStorage.getItem(PACKET_KEY);
  const packets = raw ? JSON.parse(raw) : [];
  packets.push({ id, status, payload: {}, retryCount: 0, ...extra });
  localStorage.setItem(PACKET_KEY, JSON.stringify(packets));
}

function seedJoseCommand(status) {
  const raw = localStorage.getItem(JOSE_COMMAND_KEY);
  const commands = raw ? JSON.parse(raw) : [];
  commands.push({ id: `cmd-${Date.now()}`, status });
  localStorage.setItem(JOSE_COMMAND_KEY, JSON.stringify(commands));
}

describe('orchestrationQueueService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('recordOrchestrationQueueTransition', () => {
    it('returns null when packetId is missing', () => {
      const result = recordOrchestrationQueueTransition({ toStatus: 'queued' });
      expect(result).toBeNull();
    });

    it('creates a transition with correct fields', () => {
      const result = recordOrchestrationQueueTransition({
        commandId: 'cmd-1',
        packetId: 'pkt-1',
        agent: 'jose',
        fromStatus: 'pending_approval',
        toStatus: 'queued',
        reason: 'Approved by operator'
      });
      expect(result).not.toBeNull();
      expect(result.id).toMatch(/^qtx-/);
      expect(result.commandId).toBe('cmd-1');
      expect(result.packetId).toBe('pkt-1');
      expect(result.agent).toBe('jose');
      expect(result.fromStatus).toBe('pending_approval');
      expect(result.toStatus).toBe('queued');
      expect(result.reason).toBe('Approved by operator');
    });

    it('persists to localStorage', () => {
      recordOrchestrationQueueTransition({
        packetId: 'pkt-2',
        toStatus: 'queued'
      });
      const raw = localStorage.getItem(QUEUE_KEY);
      expect(raw).toBeTruthy();
      const transitions = JSON.parse(raw);
      expect(transitions).toHaveLength(1);
      expect(transitions[0].packetId).toBe('pkt-2');
    });

    it('defaults toStatus to recorded when not provided', () => {
      const result = recordOrchestrationQueueTransition({ packetId: 'pkt-3' });
      expect(result.toStatus).toBe('recorded');
    });

    it('defaults agent to jose', () => {
      const result = recordOrchestrationQueueTransition({ packetId: 'pkt-4', toStatus: 'queued' });
      expect(result.agent).toBe('jose');
    });

    it('stores multiple transitions in order', () => {
      recordOrchestrationQueueTransition({ packetId: 'pkt-a', toStatus: 'queued' });
      recordOrchestrationQueueTransition({ packetId: 'pkt-b', toStatus: 'executing' });
      const raw = localStorage.getItem(QUEUE_KEY);
      const transitions = JSON.parse(raw);
      expect(transitions).toHaveLength(2);
      expect(transitions[0].packetId).toBe('pkt-a');
      expect(transitions[1].packetId).toBe('pkt-b');
    });
  });

  describe('listOrchestrationQueueTransitions', () => {
    it('returns empty array when no transitions exist', () => {
      const result = listOrchestrationQueueTransitions();
      expect(result).toEqual([]);
    });

    it('returns transitions in reverse order (most recent first)', () => {
      recordOrchestrationQueueTransition({ packetId: 'pkt-1', toStatus: 'queued' });
      recordOrchestrationQueueTransition({ packetId: 'pkt-2', toStatus: 'executing' });
      const result = listOrchestrationQueueTransitions();
      expect(result).toHaveLength(2);
      expect(result[0].packetId).toBe('pkt-2');
      expect(result[1].packetId).toBe('pkt-1');
    });

    it('filters by commandId', () => {
      recordOrchestrationQueueTransition({ commandId: 'cmd-1', packetId: 'pkt-1', toStatus: 'queued' });
      recordOrchestrationQueueTransition({ commandId: 'cmd-2', packetId: 'pkt-2', toStatus: 'queued' });
      const result = listOrchestrationQueueTransitions({ commandId: 'cmd-1' });
      expect(result).toHaveLength(1);
      expect(result[0].commandId).toBe('cmd-1');
    });

    it('filters by packetId', () => {
      recordOrchestrationQueueTransition({ packetId: 'pkt-a', toStatus: 'queued' });
      recordOrchestrationQueueTransition({ packetId: 'pkt-b', toStatus: 'queued' });
      const result = listOrchestrationQueueTransitions({ packetId: 'pkt-b' });
      expect(result).toHaveLength(1);
      expect(result[0].packetId).toBe('pkt-b');
    });

    it('filters by toStatus', () => {
      recordOrchestrationQueueTransition({ packetId: 'pkt-1', toStatus: 'queued' });
      recordOrchestrationQueueTransition({ packetId: 'pkt-2', toStatus: 'dead_letter' });
      recordOrchestrationQueueTransition({ packetId: 'pkt-3', toStatus: 'queued' });
      const result = listOrchestrationQueueTransitions({ toStatus: 'dead_letter' });
      expect(result).toHaveLength(1);
      expect(result[0].toStatus).toBe('dead_letter');
    });

    it('filters by agent', () => {
      recordOrchestrationQueueTransition({ packetId: 'pkt-1', agent: 'jose', toStatus: 'queued' });
      recordOrchestrationQueueTransition({ packetId: 'pkt-2', agent: 'alphonso', toStatus: 'queued' });
      const result = listOrchestrationQueueTransitions({ agent: 'alphonso' });
      expect(result).toHaveLength(1);
      expect(result[0].agent).toBe('alphonso');
    });

    it('combines multiple filters', () => {
      recordOrchestrationQueueTransition({ commandId: 'cmd-1', packetId: 'pkt-1', agent: 'jose', toStatus: 'queued' });
      recordOrchestrationQueueTransition({ commandId: 'cmd-1', packetId: 'pkt-2', agent: 'alphonso', toStatus: 'dead_letter' });
      recordOrchestrationQueueTransition({ commandId: 'cmd-2', packetId: 'pkt-3', agent: 'jose', toStatus: 'queued' });
      const result = listOrchestrationQueueTransitions({ commandId: 'cmd-1', agent: 'jose' });
      expect(result).toHaveLength(1);
      expect(result[0].packetId).toBe('pkt-1');
    });
  });

  describe('state transitions', () => {
    it('records new → pending_approval transition', () => {
      const result = recordOrchestrationQueueTransition({
        packetId: 'pkt-1',
        fromStatus: 'new',
        toStatus: 'pending_approval'
      });
      expect(result.fromStatus).toBe('new');
      expect(result.toStatus).toBe('pending_approval');
    });

    it('records pending_approval → queued transition', () => {
      const result = recordOrchestrationQueueTransition({
        packetId: 'pkt-1',
        fromStatus: 'pending_approval',
        toStatus: 'queued'
      });
      expect(result.fromStatus).toBe('pending_approval');
      expect(result.toStatus).toBe('queued');
    });

    it('records queued → reported_to_jose transition', () => {
      const result = recordOrchestrationQueueTransition({
        packetId: 'pkt-1',
        fromStatus: 'queued',
        toStatus: 'reported_to_jose'
      });
      expect(result.fromStatus).toBe('queued');
      expect(result.toStatus).toBe('reported_to_jose');
    });

    it('records queued → dead_letter transition', () => {
      const result = recordOrchestrationQueueTransition({
        packetId: 'pkt-1',
        fromStatus: 'queued',
        toStatus: 'dead_letter'
      });
      expect(result.fromStatus).toBe('queued');
      expect(result.toStatus).toBe('dead_letter');
    });

    it('records queued → failed transition', () => {
      const result = recordOrchestrationQueueTransition({
        packetId: 'pkt-1',
        fromStatus: 'queued',
        toStatus: 'failed'
      });
      expect(result.fromStatus).toBe('queued');
      expect(result.toStatus).toBe('failed');
    });

    it('tracks full lifecycle through multiple transitions', () => {
      recordOrchestrationQueueTransition({ packetId: 'pkt-1', fromStatus: 'new', toStatus: 'pending_approval' });
      recordOrchestrationQueueTransition({ packetId: 'pkt-1', fromStatus: 'pending_approval', toStatus: 'queued' });
      recordOrchestrationQueueTransition({ packetId: 'pkt-1', fromStatus: 'queued', toStatus: 'reported_to_jose' });
      const all = listOrchestrationQueueTransitions({ packetId: 'pkt-1' });
      expect(all).toHaveLength(3);
      expect(all.map((r) => r.toStatus)).toEqual(['reported_to_jose', 'queued', 'pending_approval']);
    });
  });

  describe('getOrchestrationQueueSnapshot', () => {
    it('returns zero counts when empty', () => {
      const snapshot = getOrchestrationQueueSnapshot();
      expect(snapshot.queued).toBe(0);
      expect(snapshot.executing).toBe(0);
      expect(snapshot.pendingApproval).toBe(0);
      expect(snapshot.failed).toBe(0);
      expect(snapshot.deadLetter).toBe(0);
      expect(snapshot.reportedToJose).toBe(0);
      expect(snapshot.commandsInProgress).toBe(0);
      expect(snapshot.commandsReported).toBe(0);
      expect(snapshot.timestampMs).toBeGreaterThan(0);
    });

    it('counts packets by status', () => {
      seedPacket('p1', 'queued');
      seedPacket('p2', 'queued');
      seedPacket('p3', 'executing');
      seedPacket('p4', 'pending_approval');
      seedPacket('p5', 'dead_letter');
      seedPacket('p6', 'failed');
      seedPacket('p7', 'reported_to_jose');

      const snapshot = getOrchestrationQueueSnapshot();
      expect(snapshot.queued).toBe(2);
      expect(snapshot.executing).toBe(1);
      expect(snapshot.pendingApproval).toBe(1);
      expect(snapshot.failed).toBe(1);
      expect(snapshot.deadLetter).toBe(1);
      expect(snapshot.reportedToJose).toBe(1);
    });

    it('counts jose commands in progress', () => {
      seedJoseCommand('distributed');
      seedJoseCommand('in_progress');
      seedJoseCommand('retrying');
      seedJoseCommand('reported_to_shayan');

      const snapshot = getOrchestrationQueueSnapshot();
      expect(snapshot.commandsInProgress).toBe(3);
      expect(snapshot.commandsReported).toBe(1);
    });
  });

  describe('forceDeadLetterPacket', () => {
    it('returns error when packet not found', () => {
      const result = forceDeadLetterPacket('nonexistent');
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('Packet not found.');
    });

    it('moves packet to dead_letter and records transition', () => {
      seedPacket('pkt-dl', 'queued');
      const result = forceDeadLetterPacket('pkt-dl', 'Quality gate failed');
      expect(result.ok).toBe(true);
      expect(result.packet).not.toBeNull();
      expect(result.packet.status).toBe('dead_letter');
      expect(result.transition).not.toBeNull();
      expect(result.transition.toStatus).toBe('dead_letter');
      expect(result.transition.reason).toBe('Quality gate failed');

      const packet = JSON.parse(localStorage.getItem(PACKET_KEY)).find((p) => p.id === 'pkt-dl');
      expect(packet.status).toBe('dead_letter');
    });

    it('uses default reason when not provided', () => {
      seedPacket('pkt-dl2', 'queued');
      const result = forceDeadLetterPacket('pkt-dl2');
      expect(result.transition.reason).toBe('Manual dead-letter action requested.');
    });
  });

  describe('replayPacketFromDeadLetter', () => {
    it('returns error when packet not found', () => {
      const result = replayPacketFromDeadLetter('nonexistent');
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('Packet is not in dead-letter state.');
    });

    it('returns error when packet is not in dead_letter status', () => {
      seedPacket('pkt-rp', 'queued');
      const result = replayPacketFromDeadLetter('pkt-rp');
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('Packet is not in dead-letter state.');
    });

    it('replays dead_letter packet to queued and records transition', () => {
      seedPacket('pkt-rp2', 'dead_letter');
      const result = replayPacketFromDeadLetter('pkt-rp2', 'Retrying after fix');
      expect(result.ok).toBe(true);
      expect(result.packet).not.toBeNull();
      expect(result.packet.status).toBe('queued');
      expect(result.transition).not.toBeNull();
      expect(result.transition.fromStatus).toBe('dead_letter');
      expect(result.transition.toStatus).toBe('queued');
      expect(result.transition.reason).toBe('Retrying after fix');

      const packet = JSON.parse(localStorage.getItem(PACKET_KEY)).find((p) => p.id === 'pkt-rp2');
      expect(packet.status).toBe('queued');
    });

    it('increments retry count on replay', () => {
      seedPacket('pkt-rp3', 'dead_letter', { retryCount: 2 });
      const result = replayPacketFromDeadLetter('pkt-rp3');
      expect(result.ok).toBe(true);
      expect(result.packet.retryCount).toBe(3);
    });
  });

  describe('markPacketInterrupted', () => {
    it('returns error when packet not found', () => {
      const result = markPacketInterrupted('nonexistent');
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('Packet not found.');
    });

    it('marks packet as failed and records transition', () => {
      seedPacket('pkt-int', 'queued');
      const result = markPacketInterrupted('pkt-int', 'Operator cancelled');
      expect(result.ok).toBe(true);
      expect(result.packet).not.toBeNull();
      expect(result.packet.status).toBe('failed');
      expect(result.packet.failureReason).toBe('Operator cancelled');
      expect(result.packet.retryable).toBe(true);
      expect(result.transition).not.toBeNull();
      expect(result.transition.toStatus).toBe('failed');
      expect(result.transition.reason).toBe('Operator cancelled');
    });

    it('uses default reason when not provided', () => {
      seedPacket('pkt-int2', 'executing');
      const result = markPacketInterrupted('pkt-int2');
      expect(result.transition.reason).toBe('Pipeline interrupted.');
    });

    it('sets confidence and verificationState to failed', () => {
      seedPacket('pkt-int3', 'queued');
      const result = markPacketInterrupted('pkt-int3');
      expect(result.packet.confidence).toBe('failed');
      expect(result.packet.verificationState).toBe('failed');
    });
  });

  describe('recoverInterruptedExecutions', () => {
    it('returns zero recovered when no packets are queued/executing', () => {
      seedPacket('p1', 'reported_to_jose');
      seedPacket('p2', 'dead_letter');
      const result = recoverInterruptedExecutions();
      expect(result.recoveredCount).toBe(0);
      expect(result.packetIds).toEqual([]);
    });

    it('recovers packets stuck in queued or executing state', () => {
      seedPacket('p1', 'queued');
      seedPacket('p2', 'executing');
      seedPacket('p3', 'reported_to_jose');
      const result = recoverInterruptedExecutions();
      expect(result.recoveredCount).toBe(2);
      expect(result.packetIds.sort()).toEqual(['p1', 'p2']);
    });

    it('marks recovered packets as failed and retryable via markPacketInterrupted', () => {
      seedPacket('p1', 'queued');
      recoverInterruptedExecutions();
      const raw = localStorage.getItem(PACKET_KEY);
      const packets = JSON.parse(raw);
      const recovered = packets.find((p) => p.id === 'p1');
      expect(recovered.status).toBe('failed');
      expect(recovered.retryable).toBe(true);
      expect(recovered.failureReason).toContain('auto-recovered as interrupted on boot');
    });
  });

  describe('getDeadLetterCount', () => {
    it('returns 0 when no dead letter packets exist', () => {
      seedPacket('p1', 'queued');
      seedPacket('p2', 'executing');
      const count = getDeadLetterCount();
      expect(count).toBe(0);
    });

    it('returns the count of dead_letter packets', () => {
      seedPacket('p1', 'dead_letter');
      seedPacket('p2', 'dead_letter');
      seedPacket('p3', 'queued');
      seedPacket('p4', 'dead_letter');
      const count = getDeadLetterCount();
      expect(count).toBe(3);
    });

    it('returns 0 when localStorage is empty', () => {
      const count = getDeadLetterCount();
      expect(count).toBe(0);
    });
  });

  describe('getOldestDeadLetterTimestamp', () => {
    it('returns null when no dead letter packets exist', () => {
      seedPacket('p1', 'queued');
      const result = getOldestDeadLetterTimestamp();
      expect(result).toBeNull();
    });

    it('returns ISO string of the oldest dead_letter packet', () => {
      const t1 = Date.now() - 60000;
      const t2 = Date.now() - 30000;
      seedPacket('p-dl-old', 'dead_letter', { createdAtMs: t1 });
      seedPacket('p-dl-new', 'dead_letter', { createdAtMs: t2 });
      seedPacket('p-queued', 'queued', { createdAtMs: Date.now() });
      const result = getOldestDeadLetterTimestamp();
      expect(result).toBe(new Date(t1).toISOString());
    });
  });

  describe('retryDeadLetter', () => {
    it('returns 0 when no dead letter packets exist', () => {
      seedPacket('p1', 'queued');
      const count = retryDeadLetter();
      expect(count).toBe(0);
    });

    it('replays all dead_letter packets and returns requeued count', () => {
      seedPacket('p-dl-1', 'dead_letter');
      seedPacket('p-dl-2', 'dead_letter');
      seedPacket('p-ok', 'queued');
      const count = retryDeadLetter();
      expect(count).toBe(2);
      const packets = JSON.parse(localStorage.getItem(PACKET_KEY));
      const dl1 = packets.find((p) => p.id === 'p-dl-1');
      const dl2 = packets.find((p) => p.id === 'p-dl-2');
      const ok = packets.find((p) => p.id === 'p-ok');
      expect(dl1.status).toBe('queued');
      expect(dl2.status).toBe('queued');
      expect(ok.status).toBe('queued');
    });

    it('handles already-replayed packets gracefully (no double replay)', () => {
      seedPacket('p-dl-1', 'dead_letter');
      const first = retryDeadLetter();
      expect(first).toBe(1);
      const second = retryDeadLetter();
      expect(second).toBe(0);
    });
  });

  describe('ORCHESTRATION_QUEUE_SCOPE', () => {
    it('exports the correct scope constant', () => {
      expect(ORCHESTRATION_QUEUE_SCOPE).toBe('orchestration_queue_transitions_v1');
    });
  });
});
