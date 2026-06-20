import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/runtimeLedgerService.js', () => ({
  persistScopeRows: vi.fn()
}));

vi.mock('../services/agentContractService', () => ({
  validateAgentExecutionContract: vi.fn().mockReturnValue({ ok: true, reason: null })
}));

const { createAgentPacket, listAgentPackets, updatePacketStatus, getPacketById, approvePacket, rejectPacket, markPacketExecuted, markPacketFailed, requestPacketRetry, sendPacketToDeadLetter, canExecutePacket, attemptPacketExecution, addPacketReference, listApprovalQueue, listPacketsByStatus, listDeadLetterPackets, listFailedRetryablePackets, AGENTS } = await import('../services/agentBusService.js');

describe('agentBusService', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('AGENTS constant', () => {
    it('exports all 9 agent identifiers', () => {
      expect(Object.keys(AGENTS)).toHaveLength(9);
    });

    it('includes expected agent keys', () => {
      expect(AGENTS).toHaveProperty('ALPHONSO');
      expect(AGENTS).toHaveProperty('MIYA');
      expect(AGENTS).toHaveProperty('JOSE');
      expect(AGENTS).toHaveProperty('HECTOR');
      expect(AGENTS).toHaveProperty('MARIA');
      expect(AGENTS).toHaveProperty('MARCUS');
      expect(AGENTS).toHaveProperty('ECHO');
      expect(AGENTS).toHaveProperty('SENTINEL');
      expect(AGENTS).toHaveProperty('NOVA');
    });
  });

  describe('createAgentPacket', () => {
    it('creates a packet with auto-generated id', () => {
      const packet = createAgentPacket({ fromAgent: 'alphonso', toAgent: 'jose', title: 'Test', packetType: 'task', payload: {} });
      expect(packet.id).toMatch(/^packet-\d+-[a-f0-9]+$/);
    });

    it('sets fromAgent and toAgent', () => {
      const packet = createAgentPacket({ fromAgent: 'miya', toAgent: 'hector', title: 'T', packetType: 'task', payload: {} });
      expect(packet.fromAgent).toBe('miya');
      expect(packet.toAgent).toBe('hector');
    });

    it('defaults status to pending_approval when requiresApproval is true', () => {
      const packet = createAgentPacket({ fromAgent: 'a', toAgent: 'b', title: 'T', packetType: 'task', payload: {}, requiresApproval: true });
      expect(packet.status).toBe('pending_approval');
    });

    it('defaults status to queued when requiresApproval is false', () => {
      const packet = createAgentPacket({ fromAgent: 'a', toAgent: 'b', title: 'T', packetType: 'task', payload: {}, requiresApproval: false });
      expect(packet.status).toBe('queued');
    });

    it('persists to localStorage', () => {
      createAgentPacket({ fromAgent: 'a', toAgent: 'b', title: 'T', packetType: 'task', payload: {} });
      const raw = localStorage.getItem('alphonso_agent_bus_packets_v1');
      expect(raw).toBeTruthy();
      const stored = JSON.parse(raw);
      expect(stored.length).toBe(1);
    });

    it('stores timestamps as positive numbers', () => {
      const packet = createAgentPacket({ fromAgent: 'a', toAgent: 'b', title: 'T', packetType: 'task', payload: {} });
      expect(packet.createdAtMs).toBeGreaterThan(0);
      expect(packet.updatedAtMs).toBeGreaterThan(0);
    });

    it('defaults fields correctly', () => {
      const packet = createAgentPacket({ fromAgent: 'a', toAgent: 'b', title: 'T', packetType: 'task', payload: {} });
      expect(packet.source).toBe('ui');
      expect(packet.riskLevel).toBe('medium');
      expect(packet.actionType).toBe('agent_handoff');
      expect(packet.rollbackAvailable).toBe(false);
      expect(packet.executionResult).toBeNull();
      expect(packet.references).toEqual([]);
    });
  });

  describe('listAgentPackets', () => {
    it('returns empty array when no packets exist', () => {
      expect(listAgentPackets()).toEqual([]);
    });

    it('returns all stored packets', () => {
      createAgentPacket({ fromAgent: 'a', toAgent: 'b', title: '1', packetType: 'task', payload: {} });
      createAgentPacket({ fromAgent: 'c', toAgent: 'd', title: '2', packetType: 'task', payload: {} });
      expect(listAgentPackets()).toHaveLength(2);
    });
  });

  describe('getPacketById', () => {
    it('returns null for non-existent id', () => {
      expect(getPacketById('non-existent')).toBeNull();
    });

    it('returns the matching packet', () => {
      const created = createAgentPacket({ fromAgent: 'a', toAgent: 'b', title: 'Find me', packetType: 'task', payload: {} });
      const found = getPacketById(created.id);
      expect(found.title).toBe('Find me');
    });
  });

  describe('updatePacketStatus', () => {
    it('updates the status of a packet', () => {
      const created = createAgentPacket({ fromAgent: 'a', toAgent: 'b', title: 'T', packetType: 'task', payload: {} });
      const updated = updatePacketStatus(created.id, 'approved');
      expect(updated.status).toBe('approved');
    });

    it('applies additional updates', () => {
      const created = createAgentPacket({ fromAgent: 'a', toAgent: 'b', title: 'T', packetType: 'task', payload: {} });
      const updated = updatePacketStatus(created.id, 'executed', { executionResult: { ok: true } });
      expect(updated.executionResult).toEqual({ ok: true });
    });

    it('returns null for non-existent packet', () => {
      expect(updatePacketStatus('bad-id', 'approved')).toBeNull();
    });

    it('updates the updatedAtMs timestamp', () => {
      const created = createAgentPacket({ fromAgent: 'a', toAgent: 'b', title: 'T', packetType: 'task', payload: {} });
      const before = created.updatedAtMs;
      const updated = updatePacketStatus(created.id, 'approved');
      expect(updated.updatedAtMs).toBeGreaterThanOrEqual(before);
    });
  });

  describe('approvePacket', () => {
    it('sets status to approved', () => {
      const created = createAgentPacket({ fromAgent: 'a', toAgent: 'b', title: 'T', packetType: 'task', payload: {} });
      const approved = approvePacket(created.id);
      expect(approved.status).toBe('approved');
    });

    it('records approvedBy', () => {
      const created = createAgentPacket({ fromAgent: 'a', toAgent: 'b', title: 'T', packetType: 'task', payload: {} });
      const approved = approvePacket(created.id, 'shayan');
      expect(approved.approvedBy).toBe('shayan');
    });

    it('defaults approvedBy to operator', () => {
      const created = createAgentPacket({ fromAgent: 'a', toAgent: 'b', title: 'T', packetType: 'task', payload: {} });
      const approved = approvePacket(created.id);
      expect(approved.approvedBy).toBe('operator');
    });
  });

  describe('rejectPacket', () => {
    it('sets status to rejected', () => {
      const created = createAgentPacket({ fromAgent: 'a', toAgent: 'b', title: 'T', packetType: 'task', payload: {} });
      const rejected = rejectPacket(created.id);
      expect(rejected.status).toBe('rejected');
    });

    it('stores rejection reason', () => {
      const created = createAgentPacket({ fromAgent: 'a', toAgent: 'b', title: 'T', packetType: 'task', payload: {} });
      const rejected = rejectPacket(created.id, 'Not safe');
      expect(rejected.rejectionReason).toBe('Not safe');
    });

    it('uses default rejection reason', () => {
      const created = createAgentPacket({ fromAgent: 'a', toAgent: 'b', title: 'T', packetType: 'task', payload: {} });
      const rejected = rejectPacket(created.id);
      expect(rejected.rejectionReason).toBe('Rejected by operator');
    });
  });

  describe('markPacketExecuted', () => {
    it('sets status to executed', () => {
      const created = createAgentPacket({ fromAgent: 'a', toAgent: 'b', title: 'T', packetType: 'task', payload: {} });
      const executed = markPacketExecuted(created.id, { output: 'done' });
      expect(executed.status).toBe('executed');
    });

    it('stores execution result', () => {
      const created = createAgentPacket({ fromAgent: 'a', toAgent: 'b', title: 'T', packetType: 'task', payload: {} });
      const result = { logs: ['step1'] };
      const executed = markPacketExecuted(created.id, result);
      expect(executed.executionResult).toEqual(result);
    });
  });

  describe('markPacketFailed', () => {
    it('sets status to failed', () => {
      const created = createAgentPacket({ fromAgent: 'a', toAgent: 'b', title: 'T', packetType: 'task', payload: {} });
      const failed = markPacketFailed(created.id, 'timeout');
      expect(failed.status).toBe('failed');
    });

    it('stores failure reason', () => {
      const created = createAgentPacket({ fromAgent: 'a', toAgent: 'b', title: 'T', packetType: 'task', payload: {} });
      const failed = markPacketFailed(created.id, 'connection lost');
      expect(failed.failureReason).toBe('connection lost');
    });

    it('returns null for non-existent packet', () => {
      expect(markPacketFailed('no-such-id', 'reason')).toBeNull();
    });

    it('defaults retryable to true', () => {
      const created = createAgentPacket({ fromAgent: 'a', toAgent: 'b', title: 'T', packetType: 'task', payload: {} });
      const failed = markPacketFailed(created.id, 'err');
      expect(failed.retryable).toBe(true);
    });
  });

  describe('requestPacketRetry', () => {
    it('sets status back to queued', () => {
      const created = createAgentPacket({ fromAgent: 'a', toAgent: 'b', title: 'T', packetType: 'task', payload: {} });
      markPacketFailed(created.id, 'err');
      const retried = requestPacketRetry(created.id);
      expect(retried.status).toBe('queued');
    });

    it('increments retry count', () => {
      const created = createAgentPacket({ fromAgent: 'a', toAgent: 'b', title: 'T', packetType: 'task', payload: {} });
      requestPacketRetry(created.id);
      const retried = requestPacketRetry(created.id);
      expect(retried.retryCount).toBe(2);
    });

    it('returns null for non-existent packet', () => {
      expect(requestPacketRetry('no-id')).toBeNull();
    });

    it('stores retry reason', () => {
      const created = createAgentPacket({ fromAgent: 'a', toAgent: 'b', title: 'T', packetType: 'task', payload: {} });
      const retried = requestPacketRetry(created.id, 'network blip');
      expect(retried.retryReason).toBe('network blip');
    });
  });

  describe('sendPacketToDeadLetter', () => {
    it('sets status to dead_letter', () => {
      const created = createAgentPacket({ fromAgent: 'a', toAgent: 'b', title: 'T', packetType: 'task', payload: {} });
      const dead = sendPacketToDeadLetter(created.id);
      expect(dead.status).toBe('dead_letter');
    });

    it('stores dead letter reason', () => {
      const created = createAgentPacket({ fromAgent: 'a', toAgent: 'b', title: 'T', packetType: 'task', payload: {} });
      const dead = sendPacketToDeadLetter(created.id, 'Unrecoverable');
      expect(dead.deadLetterReason).toBe('Unrecoverable');
    });
  });

  describe('canExecutePacket', () => {
    it('returns ok false for null packet', () => {
      const result = canExecutePacket(null);
      expect(result.ok).toBe(false);
    });

    it('returns ok false for rejected packet', () => {
      const created = createAgentPacket({ fromAgent: 'a', toAgent: 'b', title: 'T', packetType: 'task', payload: {} });
      rejectPacket(created.id);
      const packet = getPacketById(created.id);
      const result = canExecutePacket(packet);
      expect(result.ok).toBe(false);
    });

    it('returns ok false for dead_letter packet', () => {
      const created = createAgentPacket({ fromAgent: 'a', toAgent: 'b', title: 'T', packetType: 'task', payload: {} });
      sendPacketToDeadLetter(created.id);
      const packet = getPacketById(created.id);
      const result = canExecutePacket(packet);
      expect(result.ok).toBe(false);
    });

    it('returns ok true for approved packet requiring approval', () => {
      const created = createAgentPacket({ fromAgent: 'alphonso', toAgent: 'jose', title: 'T', packetType: 'task', payload: {}, requiresApproval: true });
      approvePacket(created.id);
      const packet = getPacketById(created.id);
      const result = canExecutePacket(packet);
      expect(result.ok).toBe(true);
    });

    it('returns ok true for queued packet without approval requirement', () => {
      const created = createAgentPacket({ fromAgent: 'alphonso', toAgent: 'jose', title: 'T', packetType: 'task', payload: {}, requiresApproval: false });
      const packet = getPacketById(created.id);
      const result = canExecutePacket(packet);
      expect(result.ok).toBe(true);
    });
  });

  describe('attemptPacketExecution', () => {
    it('marks packet as executed when gate passes', () => {
      const created = createAgentPacket({ fromAgent: 'alphonso', toAgent: 'jose', title: 'T', packetType: 'task', payload: {}, requiresApproval: false });
      const result = attemptPacketExecution(created.id, { output: 'ok' });
      expect(result.ok).toBe(true);
      expect(result.packet.status).toBe('executed');
    });

    it('returns ok and executed status for a valid packet', () => {
      const created = createAgentPacket({ fromAgent: 'alphonso', toAgent: 'jose', title: 'T', packetType: 'task', payload: {}, requiresApproval: false });
      const result = attemptPacketExecution(created.id, { output: 'done' });
      expect(result.ok).toBe(true);
      expect(result.packet).toBeTruthy();
      expect(result.reason).toBeNull();
    });
  });

  describe('addPacketReference', () => {
    it('appends a reference to the packet', () => {
      const created = createAgentPacket({ fromAgent: 'a', toAgent: 'b', title: 'T', packetType: 'task', payload: {} });
      const updated = addPacketReference(created.id, { link: 'doc-1' });
      expect(updated.references).toHaveLength(1);
      expect(updated.references[0]).toEqual({ link: 'doc-1' });
    });

    it('accumulates multiple references', () => {
      const created = createAgentPacket({ fromAgent: 'a', toAgent: 'b', title: 'T', packetType: 'task', payload: {} });
      addPacketReference(created.id, { link: 'a' });
      const updated = addPacketReference(created.id, { link: 'b' });
      expect(updated.references).toHaveLength(2);
    });
  });

  describe('listApprovalQueue', () => {
    it('returns only pending_approval packets', () => {
      createAgentPacket({ fromAgent: 'a', toAgent: 'b', title: 'Pending', packetType: 'task', payload: {}, requiresApproval: true });
      createAgentPacket({ fromAgent: 'a', toAgent: 'b', title: 'Queued', packetType: 'task', payload: {}, requiresApproval: false });
      const queue = listApprovalQueue();
      expect(queue).toHaveLength(1);
      expect(queue[0].title).toBe('Pending');
    });
  });

  describe('listPacketsByStatus', () => {
    it('filters packets by status', () => {
      const p1 = createAgentPacket({ fromAgent: 'a', toAgent: 'b', title: 'A', packetType: 'task', payload: {} });
      const p2 = createAgentPacket({ fromAgent: 'a', toAgent: 'b', title: 'B', packetType: 'task', payload: {} });
      approvePacket(p1.id);
      const approved = listPacketsByStatus('approved');
      expect(approved).toHaveLength(1);
      expect(approved[0].id).toBe(p1.id);
    });
  });

  describe('listDeadLetterPackets', () => {
    it('returns only dead_letter packets', () => {
      const p1 = createAgentPacket({ fromAgent: 'a', toAgent: 'b', title: 'A', packetType: 'task', payload: {} });
      createAgentPacket({ fromAgent: 'a', toAgent: 'b', title: 'B', packetType: 'task', payload: {} });
      sendPacketToDeadLetter(p1.id);
      const dead = listDeadLetterPackets();
      expect(dead).toHaveLength(1);
      expect(dead[0].id).toBe(p1.id);
    });
  });

  describe('listFailedRetryablePackets', () => {
    it('returns only failed retryable packets', () => {
      const p1 = createAgentPacket({ fromAgent: 'a', toAgent: 'b', title: 'A', packetType: 'task', payload: {} });
      const p2 = createAgentPacket({ fromAgent: 'a', toAgent: 'b', title: 'B', packetType: 'task', payload: {} });
      markPacketFailed(p1.id, 'err1');
      markPacketFailed(p2.id, 'err2', false);
      const retryable = listFailedRetryablePackets();
      expect(retryable).toHaveLength(1);
      expect(retryable[0].id).toBe(p1.id);
    });
  });
});
