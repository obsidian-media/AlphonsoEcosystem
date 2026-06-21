import { logApprovalEvent, getAuditLog, clearAuditLog } from '../services/agentAuditService';

describe('agentAuditService', () => {
  beforeEach(() => {
    clearAuditLog();
  });

  describe('logApprovalEvent + getAuditLog', () => {
    it('stores an event and makes it retrievable', () => {
      logApprovalEvent('pkt-1', 'jose', 'publish_post', 'approved');
      const log = getAuditLog();
      expect(log.length).toBe(1);
      expect(log[0].packetId).toBe('pkt-1');
      expect(log[0].agent).toBe('jose');
      expect(log[0].action).toBe('publish_post');
      expect(log[0].outcome).toBe('approved');
      expect(typeof log[0].timestamp).toBe('number');
    });

    it('appends multiple events in insertion order', () => {
      logApprovalEvent('pkt-a', 'maria', 'audit_run', 'approved');
      logApprovalEvent('pkt-b', 'marcus', 'distribute', 'rejected');
      const log = getAuditLog();
      expect(log.length).toBe(2);
      expect(log[0].packetId).toBe('pkt-a');
      expect(log[1].packetId).toBe('pkt-b');
    });

    it('returns [] when log is empty after clear', () => {
      expect(getAuditLog()).toEqual([]);
    });
  });

  describe('ring buffer — max 100 entries', () => {
    it('does not exceed 100 entries', () => {
      for (let i = 0; i < 110; i++) {
        logApprovalEvent(`pkt-${i}`, 'alphonso', 'action', 'approved');
      }
      expect(getAuditLog().length).toBe(100);
    });

    it('evicts oldest entries when over 100', () => {
      for (let i = 0; i < 101; i++) {
        logApprovalEvent(`pkt-${i}`, 'alphonso', 'action', 'approved');
      }
      const log = getAuditLog();
      expect(log[0].packetId).toBe('pkt-1');
      expect(log[99].packetId).toBe('pkt-100');
    });
  });

  describe('clearAuditLog', () => {
    it('removes all entries', () => {
      logApprovalEvent('pkt-x', 'jose', 'task', 'approved');
      clearAuditLog();
      expect(getAuditLog()).toEqual([]);
    });
  });

  describe('getAuditLog error resilience', () => {
    it('returns [] if localStorage is corrupted', () => {
      localStorage.setItem('alphonso_approval_audit_v1', 'not-json');
      expect(getAuditLog()).toEqual([]);
    });
  });
});
