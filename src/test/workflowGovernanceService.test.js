import { beforeEach, describe, expect, it, vi } from 'vitest';

const listConnectors = vi.fn().mockReturnValue([]);

vi.mock('../services/connectorRegistryService.js', () => ({
  listConnectors: (...args) => listConnectors(...args)
}));

const { evaluateWorkflowGovernance, getAgentWorkflowParticipation, WORKFLOW_EXECUTION_STATES } = await import('../services/workflowGovernanceService.js');

describe('workflowGovernanceService', () => {
  beforeEach(() => {
    listConnectors.mockReset();
    listConnectors.mockReturnValue([]);
  });

  describe('WORKFLOW_EXECUTION_STATES', () => {
    it('exports an array of execution states', () => {
      expect(Array.isArray(WORKFLOW_EXECUTION_STATES)).toBe(true);
      expect(WORKFLOW_EXECUTION_STATES.length).toBeGreaterThan(0);
    });

    it('includes expected states', () => {
      expect(WORKFLOW_EXECUTION_STATES).toContain('queued');
      expect(WORKFLOW_EXECUTION_STATES).toContain('executed');
      expect(WORKFLOW_EXECUTION_STATES).toContain('failed');
      expect(WORKFLOW_EXECUTION_STATES).toContain('completed');
      expect(WORKFLOW_EXECUTION_STATES).toContain('approval_required');
    });
  });

  describe('evaluateWorkflowGovernance', () => {
    it('returns ok true when no connectors are required', () => {
      const result = evaluateWorkflowGovernance({ id: 'w1', connectorRequirements: [] });
      expect(result.ok).toBe(true);
    });

    it('sets workflowId from workflow', () => {
      const result = evaluateWorkflowGovernance({ id: 'w-test', connectorRequirements: [] });
      expect(result.workflowId).toBe('w-test');
    });

    it('defaults workflowId to null', () => {
      const result = evaluateWorkflowGovernance({ connectorRequirements: [] });
      expect(result.workflowId).toBeNull();
    });

    it('detects unavailable connectors', () => {
      listConnectors.mockReturnValue([
        { id: 'youtube', status: 'not_configured' }
      ]);
      const result = evaluateWorkflowGovernance({
        id: 'w1',
        connectorRequirements: ['youtube']
      });
      expect(result.setupRequired).toBe(true);
      expect(result.unavailableConnectors).toContain('youtube');
    });

    it('returns ok true when all connectors are configured', () => {
      listConnectors.mockReturnValue([
        { id: 'youtube', status: 'configured' }
      ]);
      const result = evaluateWorkflowGovernance({
        id: 'w1',
        connectorRequirements: ['youtube']
      });
      expect(result.setupRequired).toBe(false);
      expect(result.unavailableConnectors).toHaveLength(0);
    });

    it('detects required approvals', () => {
      const result = evaluateWorkflowGovernance({
        id: 'w1',
        connectorRequirements: [],
        requiredApprovals: ['shayan_approval']
      });
      expect(result.requiresApproval).toBe(true);
    });

    it('filters out none_high_risk_default from approvals', () => {
      const result = evaluateWorkflowGovernance({
        id: 'w1',
        connectorRequirements: [],
        requiredApprovals: ['none_high_risk_default']
      });
      expect(result.requiresApproval).toBe(false);
      expect(result.normalizedApprovals).toHaveLength(0);
    });

    it('blocks paid connectors in zero-cost mode', () => {
      listConnectors.mockReturnValue([
        { id: 'chatgpt', status: 'configured' }
      ]);
      const result = evaluateWorkflowGovernance(
        { id: 'w1', connectorRequirements: ['chatgpt'] },
        { zeroCostMode: true }
      );
      expect(result.blocked).toBe(true);
      expect(result.blockedByZeroCost).toBe(true);
      expect(result.ok).toBe(false);
    });

    it('does not block paid connectors when zero-cost mode is off', () => {
      listConnectors.mockReturnValue([
        { id: 'chatgpt', status: 'configured' }
      ]);
      const result = evaluateWorkflowGovernance(
        { id: 'w1', connectorRequirements: ['chatgpt'] },
        { zeroCostMode: false }
      );
      expect(result.blocked).toBe(false);
      expect(result.ok).toBe(true);
    });

    it('defaults riskLevel to medium', () => {
      const result = evaluateWorkflowGovernance({ connectorRequirements: [] });
      expect(result.riskLevel).toBe('medium');
    });

    it('uses workflow riskLevel', () => {
      const result = evaluateWorkflowGovernance({ connectorRequirements: [], riskLevel: 'high' });
      expect(result.riskLevel).toBe('high');
    });

    it('provides confidence as verified when no issues', () => {
      const result = evaluateWorkflowGovernance({ connectorRequirements: [] });
      expect(result.confidence).toBe('verified');
    });

    it('provides confidence as pending when setup is required', () => {
      listConnectors.mockReturnValue([{ id: 'tg', status: 'not_configured' }]);
      const result = evaluateWorkflowGovernance({ connectorRequirements: ['telegram'] });
      expect(result.confidence).toBe('pending');
    });

    it('includes notes array', () => {
      const result = evaluateWorkflowGovernance({ connectorRequirements: [] });
      expect(Array.isArray(result.notes)).toBe(true);
      expect(result.notes.length).toBeGreaterThan(0);
    });

    it('filters out none_required connector requirements', () => {
      const result = evaluateWorkflowGovernance({
        connectorRequirements: ['none_required']
      });
      expect(result.unavailableConnectors).toHaveLength(0);
    });

    it('filters out depends_on_automation_target connector requirements', () => {
      const result = evaluateWorkflowGovernance({
        connectorRequirements: ['depends_on_automation_target']
      });
      expect(result.unavailableConnectors).toHaveLength(0);
    });
  });

  describe('getAgentWorkflowParticipation', () => {
    it('returns empty array when no agent sequence', () => {
      const result = getAgentWorkflowParticipation({});
      expect(result).toEqual([]);
    });

    it('returns participation entries for each agent', () => {
      const result = getAgentWorkflowParticipation({ agentSequence: ['hector', 'miya'] });
      expect(result).toHaveLength(2);
      expect(result[0].agent).toBe('hector');
      expect(result[0].order).toBe(1);
      expect(result[1].agent).toBe('miya');
      expect(result[1].order).toBe(2);
    });

    it('marks shayan_approval as requiring human approval', () => {
      const result = getAgentWorkflowParticipation({ agentSequence: ['jose', 'shayan_approval', 'marcus'] });
      expect(result[1].requiresHumanApprovalStage).toBe(true);
      expect(result[1].canExecute).toBe(false);
    });

    it('marks user_approval as requiring human approval', () => {
      const result = getAgentWorkflowParticipation({ agentSequence: ['user_approval'] });
      expect(result[0].requiresHumanApprovalStage).toBe(true);
    });

    it('marks regular agents as executable', () => {
      const result = getAgentWorkflowParticipation({ agentSequence: ['alphonso', 'jose'] });
      expect(result[0].canExecute).toBe(true);
      expect(result[1].canExecute).toBe(true);
    });
  });
});
