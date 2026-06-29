import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./runtimeLedgerService', () => ({
  persistScopeRows: vi.fn()
}));

vi.mock('./trustModel', () => ({
  TRUST_STATES: { VERIFIED: 'verified', UNVERIFIED: 'unverified', TEMPORARY: 'temporary' },
  timestampMs: () => Date.now()
}));

const localStorageMock = {
  getItem: vi.fn(() => null),
  setItem: vi.fn()
};
vi.stubGlobal('localStorage', localStorageMock);

describe('orchestrationGovernanceService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
  });

  describe('listGovernanceDecisions', () => {
    it('exports listGovernanceDecisions function', async () => {
      const { listGovernanceDecisions } = await import('../../services/orchestrationGovernanceService');
      expect(typeof listGovernanceDecisions).toBe('function');
    });

    it('returns empty array when no decisions', async () => {
      const { listGovernanceDecisions } = await import('../../services/orchestrationGovernanceService');
      const result = listGovernanceDecisions();
      expect(result).toEqual([]);
    });
  });

  describe('recordGovernanceDecision', () => {
    it('exports recordGovernanceDecision function', async () => {
      const { recordGovernanceDecision } = await import('../../services/orchestrationGovernanceService');
      expect(typeof recordGovernanceDecision).toBe('function');
    });

    it('creates decision with default values', async () => {
      const { recordGovernanceDecision } = await import('../../services/orchestrationGovernanceService');
      const result = recordGovernanceDecision({ title: 'Test' });
      expect(result.title).toBe('Test');
      expect(result.source).toBe('jose-orchestrator');
    });

    it('generates unique id format jose-decision-timestamp-random', async () => {
      const { recordGovernanceDecision } = await import('../../services/orchestrationGovernanceService');
      const result = recordGovernanceDecision({ title: 'Test' });
      expect(result.id).toMatch(/^jose-decision-/);
    });

    it('sets default title when empty', async () => {
      const { recordGovernanceDecision } = await import('../../services/orchestrationGovernanceService');
      const result = recordGovernanceDecision({});
      expect(result.title).toBe('Untitled governance decision');
    });

    it('includes timestamp in decision', async () => {
      const { recordGovernanceDecision } = await import('../../services/orchestrationGovernanceService');
      const result = recordGovernanceDecision({ title: 'Test' });
      expect(result).toHaveProperty('timestampMs');
    });
  });

  describe('summarizeAgentWorkload', () => {
    it('exports summarizeAgentWorkload function', async () => {
      const { summarizeAgentWorkload } = await import('../../services/orchestrationGovernanceService');
      expect(typeof summarizeAgentWorkload).toBe('function');
    });

    it('returns workload for all 9 agents', async () => {
      const { summarizeAgentWorkload } = await import('../../services/orchestrationGovernanceService');
      const result = summarizeAgentWorkload([]);
      expect(result).toHaveLength(9);
    });

    it('counts inbound packets per agent', async () => {
      const { summarizeAgentWorkload } = await import('../../services/orchestrationGovernanceService');
      const packets = [
        { toAgent: 'jose', status: 'pending_approval' },
        { toAgent: 'jose', status: 'queued' },
        { toAgent: 'miya', status: 'executed' }
      ];
      const result = summarizeAgentWorkload(packets);
      const jose = result.find(r => r.agent === 'jose');
      expect(jose.inbound).toBe(2);
    });

    it('counts outbound packets per agent', async () => {
      const { summarizeAgentWorkload } = await import('../../services/orchestrationGovernanceService');
      const packets = [
        { fromAgent: 'jose', status: 'pending_approval' },
        { fromAgent: 'jose', status: 'executed' }
      ];
      const result = summarizeAgentWorkload(packets);
      const jose = result.find(r => r.agent === 'jose');
      expect(jose.outbound).toBe(2);
    });

    it('counts pending packets', async () => {
      const { summarizeAgentWorkload } = await import('../../services/orchestrationGovernanceService');
      const packets = [
        { toAgent: 'jose', status: 'pending_approval' },
        { toAgent: 'jose', status: 'queued' },
        { toAgent: 'jose', status: 'executed' }
      ];
      const result = summarizeAgentWorkload(packets);
      const jose = result.find(r => r.agent === 'jose');
      expect(jose.pending).toBe(2);
      expect(jose.completed).toBe(1);
    });
  });

  describe('GOVERNANCE_SCOPE', () => {
    it('exports GOVERNANCE_SCOPE constant', async () => {
      const mod = await import('../../services/orchestrationGovernanceService');
      expect(mod.GOVERNANCE_SCOPE).toBe('jose_governance_decisions_v1');
    });
  });
});