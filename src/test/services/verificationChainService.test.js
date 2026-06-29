import { describe, it, expect, beforeEach } from 'vitest';

describe('verificationChainService', () => {
  const storage = {};
  const localStorageMock = {
    getItem: (k) => storage[k] ?? null,
    setItem: (k, v) => { storage[k] = v; },
    removeItem: (k) => { delete storage[k]; },
    clear: () => { Object.keys(storage).forEach(k => delete storage[k]); }
  };

  let service;

  beforeEach(async () => {
    Object.keys(storage).forEach(k => delete storage[k]);
    vi.stubGlobal('localStorage', localStorageMock);
    service = await import('../../services/agentWorkshop/verificationChainService');
  });

  describe('createVerificationChain', () => {
    it('creates chain with default values', () => {
      const chain = service.createVerificationChain({
        traceId: 'trace-1',
        projectId: 'proj-1'
      });
      expect(chain).toHaveProperty('id');
      expect(chain.traceId).toBe('trace-1');
      expect(chain.projectId).toBe('proj-1');
      expect(chain.name).toBe('default_chain');
      expect(chain.stages).toEqual([]);
    });

    it('creates chain with custom name', () => {
      const chain = service.createVerificationChain({
        name: 'custom_chain'
      });
      expect(chain.name).toBe('custom_chain');
    });

    it('creates chain with stages', () => {
      const chain = service.createVerificationChain({
        traceId: 'trace-2',
        stages: [
          { agentId: 'miya', action: 'generate_ui', state: 'pending' }
        ]
      });
      expect(chain.stages.length).toBe(1);
      expect(chain.stages[0].agentId).toBe('miya');
    });

    it('generates unique chain IDs', () => {
      const chain1 = service.createVerificationChain({});
      const chain2 = service.createVerificationChain({});
      expect(chain1.id).not.toBe(chain2.id);
    });
  });

  describe('updateVerificationStage', () => {
    it('updates existing stage state', () => {
      const chain = service.createVerificationChain({
        stages: [{ agentId: 'miya', action: 'test', id: 'stage-1', state: 'pending' }]
      });
      const updated = service.updateVerificationStage(chain.id, 'stage-1', { state: 'completed' });
      expect(updated.stages[0].state).toBe('completed');
    });

    it('returns null for non-existent chain', () => {
      const result = service.updateVerificationStage('nonexistent', 'stage-1', { state: 'completed' });
      expect(result).toBeNull();
    });
  });

  describe('listVerificationChains', () => {
    it('returns empty array when no chains', () => {
      expect(service.listVerificationChains()).toEqual([]);
    });

    it('returns all chains when no filters', () => {
      service.createVerificationChain({ projectId: 'proj-1' });
      service.createVerificationChain({ projectId: 'proj-2' });
      const all = service.listVerificationChains();
      expect(all.length).toBe(2);
    });

    it('filters by projectId', () => {
      service.createVerificationChain({ projectId: 'proj-1' });
      service.createVerificationChain({ projectId: 'proj-2' });
      const filtered = service.listVerificationChains({ projectId: 'proj-1' });
      expect(filtered.length).toBe(1);
      expect(filtered[0].projectId).toBe('proj-1');
    });
  });

  describe('createDefaultCrossVerificationChain', () => {
    it('creates predefined chain structure', () => {
      const chain = service.createDefaultCrossVerificationChain({
        traceId: 'trace-test',
        projectId: 'proj-test'
      });
      expect(chain.name).toBe('ui_audit_runtime_integration');
      expect(chain.stages.length).toBe(4);
    });
  });
});