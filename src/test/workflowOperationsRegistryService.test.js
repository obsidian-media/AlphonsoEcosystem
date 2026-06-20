import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(null),
  isTauri: vi.fn().mockReturnValue(false)
}));

const {
  listWorkflowOperations,
  getWorkflowOperation,
  updateWorkflowOperationStatus,
  WORKFLOW_OPS_SCOPE
} = await import('../services/workflowOperationsRegistryService.js');

describe('workflowOperationsRegistryService', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  describe('listWorkflowOperations', () => {
    it('returns all default workflow operations', () => {
      const ops = listWorkflowOperations();
      expect(ops.length).toBeGreaterThanOrEqual(16);
    });

    it('seeds defaults into localStorage', () => {
      listWorkflowOperations();
      const raw = localStorage.getItem('alphonso_workflow_operations_registry_v1');
      expect(raw).toBeTruthy();
      const stored = JSON.parse(raw);
      expect(stored.length).toBeGreaterThanOrEqual(16);
    });

    it('returns same ids on repeated calls', () => {
      const first = listWorkflowOperations().map((o) => o.id);
      const second = listWorkflowOperations().map((o) => o.id);
      expect(first).toEqual(second);
    });
  });

  describe('operation structure', () => {
    const REQUIRED_FIELDS = ['id', 'name', 'purpose', 'triggerTypes', 'agentSequence', 'requiredApprovals', 'riskLevel', 'allowedActions', 'blockedActions', 'memoryBehavior', 'receiptsGenerated', 'connectorRequirements', 'setupRequired', 'finalReportFormat'];

    it('every operation has all required fields', () => {
      const ops = listWorkflowOperations();
      for (const op of ops) {
        for (const field of REQUIRED_FIELDS) {
          expect(op).toHaveProperty(field);
          expect(op[field]).toBeDefined();
        }
      }
    });

    it('every operation has a non-empty id', () => {
      const ops = listWorkflowOperations();
      for (const op of ops) {
        expect(typeof op.id).toBe('string');
        expect(op.id.length).toBeGreaterThan(0);
      }
    });

    it('every operation has a non-empty name', () => {
      const ops = listWorkflowOperations();
      for (const op of ops) {
        expect(typeof op.name).toBe('string');
        expect(op.name.length).toBeGreaterThan(0);
      }
    });

    it('every operation has a non-empty agentSequence array', () => {
      const ops = listWorkflowOperations();
      for (const op of ops) {
        expect(Array.isArray(op.agentSequence)).toBe(true);
        expect(op.agentSequence.length).toBeGreaterThan(0);
      }
    });

    it('every operation has a valid riskLevel', () => {
      const ops = listWorkflowOperations();
      const validLevels = ['low', 'medium', 'high', 'critical'];
      for (const op of ops) {
        expect(validLevels).toContain(op.riskLevel);
      }
    });
  });

  describe('specific workflow operations are registered', () => {
    const EXPECTED_IDS = [
      'wf-marketing-operations',
      'wf-social-media-management',
      'wf-content-production',
      'wf-learning-skill-development',
      'wf-startup-product-development',
      'wf-opportunity-discovery',
      'wf-construction-operations',
      'wf-knowledge-preservation',
      'wf-content-repurposing',
      'wf-automation-governance',
      'wf-research-operations',
      'wf-crisis-management-operations',
      'wf-ecosystem-learning-operations',
      'wf-human-collaboration-operations',
      'wf-financial-intelligence-operations',
      'wf-reputation-brand-monitoring-operations'
    ];

    for (const id of EXPECTED_IDS) {
      it(`registers operation: ${id}`, () => {
        const ops = listWorkflowOperations();
        const ids = ops.map((o) => o.id);
        expect(ids).toContain(id);
      });
    }
  });

  describe('getWorkflowOperation', () => {
    it('returns a specific operation by id', () => {
      const op = getWorkflowOperation('wf-marketing-operations');
      expect(op).not.toBeNull();
      expect(op.id).toBe('wf-marketing-operations');
      expect(op.name).toBe('Marketing Operations');
    });

    it('returns null for unknown id', () => {
      const op = getWorkflowOperation('wf-nonexistent');
      expect(op).toBeNull();
    });

    it('returns an object with correct fields', () => {
      const op = getWorkflowOperation('wf-content-production');
      expect(op.id).toBe('wf-content-production');
      expect(op.name).toBe('Content Production');
      expect(op.riskLevel).toBe('medium');
      expect(op.agentSequence).toContain('hector');
      expect(op.agentSequence).toContain('miya');
    });

    it('returns different operations for different ids', () => {
      const a = getWorkflowOperation('wf-marketing-operations');
      const b = getWorkflowOperation('wf-learning-skill-development');
      expect(a.id).not.toBe(b.id);
      expect(a.name).not.toBe(b.name);
    });
  });

  describe('updateWorkflowOperationStatus', () => {
    it('updates the status of an operation', () => {
      const result = updateWorkflowOperationStatus('wf-marketing-operations', 'disabled');
      expect(result).not.toBeNull();
      expect(result.status).toBe('disabled');
    });

    it('applies patch fields to the operation', () => {
      const result = updateWorkflowOperationStatus('wf-marketing-operations', 'active', {
        customField: 'customValue'
      });
      expect(result.customField).toBe('customValue');
    });

    it('updates updatedAtMs timestamp', () => {
      const before = getWorkflowOperation('wf-marketing-operations');
      const beforeTime = before.updatedAtMs;
      const result = updateWorkflowOperationStatus('wf-marketing-operations', 'disabled');
      expect(result.updatedAtMs).toBeGreaterThanOrEqual(beforeTime);
    });

    it('returns null for unknown id', () => {
      const result = updateWorkflowOperationStatus('wf-nonexistent', 'disabled');
      expect(result).toBeNull();
    });

    it('persists status change to localStorage', () => {
      updateWorkflowOperationStatus('wf-marketing-operations', 'disabled');
      const op = getWorkflowOperation('wf-marketing-operations');
      expect(op.status).toBe('disabled');
    });
  });

  describe('WORKFLOW_OPS_SCOPE', () => {
    it('exports the correct scope constant', () => {
      expect(WORKFLOW_OPS_SCOPE).toBe('workflow_operations_registry_v1');
    });
  });
});
