import { describe, it, expect, beforeEach, vi } from 'vitest';

const store = {};
const mockDurableGet = vi.fn((key) => store[key] ?? null);
const mockDurableSet = vi.fn((key, val) => { store[key] = val; });
vi.mock('../../lib/durableStore', () => ({
  durableGet: (...args) => mockDurableGet(...args),
  durableSet: (...args) => mockDurableSet(...args),
}));

vi.mock('../../services/runtimeLedgerService', () => ({
  persistScopeRows: vi.fn(),
}));

vi.mock('../../services/agentContractService', () => ({
  validateAgentExecutionContract: vi.fn(() => ({ ok: true, reason: null })),
}));

import {
  AGENTS,
  listAgentPackets,
  createAgentPacket,
  updatePacketStatus,
  getPacketById,
  approvePacket,
  rejectPacket,
  markPacketExecuted,
  markPacketFailed,
  requestPacketRetry,
  sendPacketToDeadLetter,
  canExecutePacket,
  attemptPacketExecution,
  addPacketReference,
  listApprovalQueue,
  listPacketsByStatus,
  listDeadLetterPackets,
  listFailedRetryablePackets,
  sendAgentMessage,
  getAgentMessages,
  clearAgentMessages,
} from '../../services/agentBusService';

describe('agentBusService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(store).forEach(k => delete store[k]);
    localStorage.clear();
  });

  describe('AGENTS constants', () => {
    it('defines all 9 agents', () => {
      expect(Object.keys(AGENTS)).toHaveLength(9);
      expect(AGENTS.ALPHONSO).toBe('alphonso');
      expect(AGENTS.MIYA).toBe('miya');
      expect(AGENTS.JOSE).toBe('jose');
      expect(AGENTS.HECTOR).toBe('hector');
      expect(AGENTS.MARIA).toBe('maria');
      expect(AGENTS.MARCUS).toBe('marcus');
      expect(AGENTS.ECHO).toBe('echo');
      expect(AGENTS.SENTINEL).toBe('sentinel');
      expect(AGENTS.NOVA).toBe('nova');
    });
  });

  describe('createAgentPacket', () => {
    it('creates packet with generated id', () => {
      const packet = createAgentPacket({
        fromAgent: 'jose',
        toAgent: 'hector',
        title: 'Research task',
        packetType: 'task',
        payload: { query: 'test' },
      });
      expect(packet.id).toMatch(/^packet-/);
      expect(packet.fromAgent).toBe('jose');
      expect(packet.toAgent).toBe('hector');
      expect(packet.title).toBe('Research task');
    });

    it('sets status to pending_approval when requiresApproval is true', () => {
      const packet = createAgentPacket({
        fromAgent: 'jose',
        toAgent: 'hector',
        title: 'test',
        packetType: 'task',
        payload: {},
        requiresApproval: true,
      });
      expect(packet.status).toBe('pending_approval');
    });

    it('sets status to queued when requiresApproval is false', () => {
      const packet = createAgentPacket({
        fromAgent: 'jose',
        toAgent: 'hector',
        title: 'test',
        packetType: 'task',
        payload: {},
        requiresApproval: false,
      });
      expect(packet.status).toBe('queued');
    });

    it('uses defaults for optional fields', () => {
      const packet = createAgentPacket({
        fromAgent: 'jose',
        toAgent: 'hector',
        title: 'test',
        packetType: 'task',
        payload: {},
      });
      expect(packet.source).toBe('ui');
      expect(packet.riskLevel).toBe('medium');
      expect(packet.actionType).toBe('agent_handoff');
      expect(packet.requiresApproval).toBe(true);
      expect(packet.rollbackAvailable).toBe(false);
      expect(packet.references).toEqual([]);
      expect(packet.executionResult).toBeNull();
    });
  });

  describe('getPacketById', () => {
    it('returns null for non-existent packet', () => {
      expect(getPacketById('nonexistent')).toBeNull();
    });

    it('returns packet by id', () => {
      const created = createAgentPacket({
        fromAgent: 'jose', toAgent: 'miya', title: 't', packetType: 'task', payload: {}
      });
      const found = getPacketById(created.id);
      expect(found).not.toBeNull();
      expect(found.id).toBe(created.id);
    });
  });

  describe('updatePacketStatus', () => {
    it('updates status', () => {
      const packet = createAgentPacket({
        fromAgent: 'jose', toAgent: 'hector', title: 't', packetType: 'task', payload: {}
      });
      const updated = updatePacketStatus(packet.id, 'approved');
      expect(updated.status).toBe('approved');
    });

    it('returns null for non-existent packet', () => {
      expect(updatePacketStatus('nonexistent', 'approved')).toBeNull();
    });
  });

  describe('approvePacket', () => {
    it('sets status to approved with approvedBy', () => {
      const packet = createAgentPacket({
        fromAgent: 'jose', toAgent: 'hector', title: 't', packetType: 'task', payload: {}
      });
      const approved = approvePacket(packet.id, 'operator');
      expect(approved.status).toBe('approved');
      expect(approved.approvedBy).toBe('operator');
      expect(approved.approvedAtMs).toBeGreaterThan(0);
    });
  });

  describe('rejectPacket', () => {
    it('sets status to rejected with reason', () => {
      const packet = createAgentPacket({
        fromAgent: 'jose', toAgent: 'hector', title: 't', packetType: 'task', payload: {}
      });
      const rejected = rejectPacket(packet.id, 'Not needed');
      expect(rejected.status).toBe('rejected');
      expect(rejected.rejectionReason).toBe('Not needed');
    });
  });

  describe('markPacketExecuted', () => {
    it('sets status to executed with result', () => {
      const packet = createAgentPacket({
        fromAgent: 'jose', toAgent: 'hector', title: 't', packetType: 'task', payload: {}
      });
      const executed = markPacketExecuted(packet.id, { output: 'done' });
      expect(executed.status).toBe('executed');
      expect(executed.executionResult).toEqual({ output: 'done' });
    });
  });

  describe('markPacketFailed', () => {
    it('sets status to failed with reason', () => {
      const packet = createAgentPacket({
        fromAgent: 'jose', toAgent: 'hector', title: 't', packetType: 'task', payload: {}
      });
      const failed = markPacketFailed(packet.id, 'Timeout');
      expect(failed.status).toBe('failed');
      expect(failed.failureReason).toBe('Timeout');
      expect(failed.retryable).toBe(true);
    });

    it('returns null for non-existent packet', () => {
      expect(markPacketFailed('nonexistent', 'err')).toBeNull();
    });
  });

  describe('requestPacketRetry', () => {
    it('increments retry count and sets status to queued', () => {
      const packet = createAgentPacket({
        fromAgent: 'jose', toAgent: 'hector', title: 't', packetType: 'task', payload: {}
      });
      markPacketFailed(packet.id, 'err');
      const retried = requestPacketRetry(packet.id, 'try again');
      expect(retried.status).toBe('queued');
      expect(retried.retryCount).toBe(1);
      expect(retried.retryReason).toBe('try again');
    });

    it('returns null for non-existent packet', () => {
      expect(requestPacketRetry('nonexistent')).toBeNull();
    });
  });

  describe('sendPacketToDeadLetter', () => {
    it('sets status to dead_letter', () => {
      const packet = createAgentPacket({
        fromAgent: 'jose', toAgent: 'hector', title: 't', packetType: 'task', payload: {}
      });
      const dead = sendPacketToDeadLetter(packet.id, 'Permanent failure');
      expect(dead.status).toBe('dead_letter');
      expect(dead.deadLetterReason).toBe('Permanent failure');
    });
  });

  describe('canExecutePacket', () => {
    it('returns ok for valid packet', () => {
      const packet = createAgentPacket({
        fromAgent: 'jose', toAgent: 'hector', title: 't', packetType: 'task', payload: {}, requiresApproval: false
      });
      expect(canExecutePacket(packet).ok).toBe(true);
    });

    it('returns error for null packet', () => {
      expect(canExecutePacket(null).ok).toBe(false);
    });

    it('returns error for rejected packet', () => {
      const packet = createAgentPacket({
        fromAgent: 'jose', toAgent: 'hector', title: 't', packetType: 'task', payload: {}
      });
      rejectPacket(packet.id);
      const rejected = getPacketById(packet.id);
      expect(canExecutePacket(rejected).ok).toBe(false);
    });

    it('returns error for dead_letter packet', () => {
      const packet = createAgentPacket({
        fromAgent: 'jose', toAgent: 'hector', title: 't', packetType: 'task', payload: {}
      });
      sendPacketToDeadLetter(packet.id);
      const dead = getPacketById(packet.id);
      expect(canExecutePacket(dead).ok).toBe(false);
    });
  });

  describe('attemptPacketExecution', () => {
    it('executes approved packet', () => {
      const packet = createAgentPacket({
        fromAgent: 'jose', toAgent: 'hector', title: 't', packetType: 'task', payload: {}
      });
      approvePacket(packet.id);
      const result = attemptPacketExecution(packet.id, { output: 'done' });
      expect(result.ok).toBe(true);
      expect(result.packet.status).toBe('executed');
    });

    it('fails unapproved packet requiring approval', () => {
      const packet = createAgentPacket({
        fromAgent: 'jose', toAgent: 'hector', title: 't', packetType: 'task', payload: {}, requiresApproval: true
      });
      const result = attemptPacketExecution(packet.id);
      expect(result.ok).toBe(false);
    });
  });

  describe('addPacketReference', () => {
    it('adds reference to packet', () => {
      const packet = createAgentPacket({
        fromAgent: 'jose', toAgent: 'hector', title: 't', packetType: 'task', payload: {}
      });
      const updated = addPacketReference(packet.id, 'ref-123');
      expect(updated.references).toContain('ref-123');
    });
  });

  describe('list functions', () => {
    it('listApprovalQueue returns pending_approval packets', () => {
      createAgentPacket({
        fromAgent: 'jose', toAgent: 'hector', title: 't', packetType: 'task', payload: {}, requiresApproval: true
      });
      createAgentPacket({
        fromAgent: 'jose', toAgent: 'miya', title: 't2', packetType: 'task', payload: {}, requiresApproval: false
      });
      const queue = listApprovalQueue();
      expect(queue).toHaveLength(1);
      expect(queue[0].status).toBe('pending_approval');
    });

    it('listPacketsByStatus filters correctly', () => {
      createAgentPacket({
        fromAgent: 'jose', toAgent: 'hector', title: 't', packetType: 'task', payload: {}, requiresApproval: true
      });
      expect(listPacketsByStatus('pending_approval')).toHaveLength(1);
      expect(listPacketsByStatus('executed')).toHaveLength(0);
    });

    it('listDeadLetterPackets returns dead_letter packets', () => {
      const packet = createAgentPacket({
        fromAgent: 'jose', toAgent: 'hector', title: 't', packetType: 'task', payload: {}
      });
      sendPacketToDeadLetter(packet.id);
      expect(listDeadLetterPackets()).toHaveLength(1);
    });

    it('listFailedRetryablePackets returns failed retryable', () => {
      const packet = createAgentPacket({
        fromAgent: 'jose', toAgent: 'hector', title: 't', packetType: 'task', payload: {}
      });
      markPacketFailed(packet.id, 'err');
      expect(listFailedRetryablePackets()).toHaveLength(1);
    });
  });

  describe('A2A Direct Messaging', () => {
    it('sendAgentMessage stores message', () => {
      sendAgentMessage('jose', 'hector', 'hello', { priority: 'high' });
      const msgs = getAgentMessages('hector');
      expect(msgs).toHaveLength(1);
      expect(msgs[0].fromAgent).toBe('jose');
      expect(msgs[0].toAgent).toBe('hector');
      expect(msgs[0].message).toBe('hello');
      expect(msgs[0].read).toBe(false);
    });

    it('getAgentMessages returns empty for unknown agent', () => {
      expect(getAgentMessages('unknown')).toEqual([]);
    });

    it('clearAgentMessages removes messages', () => {
      sendAgentMessage('jose', 'hector', 'hi');
      clearAgentMessages('hector');
      expect(getAgentMessages('hector')).toEqual([]);
    });

    it('enforces ring buffer limit of 50', () => {
      for (let i = 0; i < 55; i++) {
        sendAgentMessage('jose', 'hector', `msg-${i}`);
      }
      const msgs = getAgentMessages('hector');
      expect(msgs).toHaveLength(50);
      expect(msgs[0].message).toBe('msg-5'); // oldest kept
    });
  });
});
