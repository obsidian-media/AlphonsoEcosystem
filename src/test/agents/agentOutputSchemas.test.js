import { describe, it, expect } from 'vitest';
import { AgentOutputTypes, createAgentOutput } from '../../agents/shared/agentOutputSchemas';

describe('agentOutputSchemas', () => {
  describe('AgentOutputTypes', () => {
    it('has 10 output types', () => {
      const keys = Object.keys(AgentOutputTypes);
      expect(keys).toHaveLength(10);
    });

    it('is frozen', () => {
      expect(Object.isFrozen(AgentOutputTypes)).toBe(true);
    });

    it('PROJECT_BREAKDOWN is ProjectBreakdown', () => {
      expect(AgentOutputTypes.PROJECT_BREAKDOWN).toBe('ProjectBreakdown');
    });

    it('AGENT_TASK_PACKET is AgentTaskPacket', () => {
      expect(AgentOutputTypes.AGENT_TASK_PACKET).toBe('AgentTaskPacket');
    });

    it('RESEARCH_REPORT is ResearchReport', () => {
      expect(AgentOutputTypes.RESEARCH_REPORT).toBe('ResearchReport');
    });

    it('CODE_PROPOSAL is CodeProposal', () => {
      expect(AgentOutputTypes.CODE_PROPOSAL).toBe('CodeProposal');
    });

    it('APPROVAL_REQUEST is ApprovalRequest', () => {
      expect(AgentOutputTypes.APPROVAL_REQUEST).toBe('ApprovalRequest');
    });

    it('AUDIT_REPORT is AuditReport', () => {
      expect(AgentOutputTypes.AUDIT_REPORT).toBe('AuditReport');
    });

    it('RELEASE_READINESS_REPORT is ReleaseReadinessReport', () => {
      expect(AgentOutputTypes.RELEASE_READINESS_REPORT).toBe('ReleaseReadinessReport');
    });
  });

  describe('createAgentOutput', () => {
    it('creates output with correct type', () => {
      const output = createAgentOutput('ProjectBreakdown', {
        agentId: 'jose',
        projectId: 'proj-1',
        title: 'Test',
        summary: 'Summary',
      });
      expect(output.type).toBe('ProjectBreakdown');
    });

    it('generates id matching pattern type-timestamp-hex', () => {
      const output = createAgentOutput('CodeProposal', {
        agentId: 'alphonso',
        projectId: 'proj-1',
        title: 'Test',
        summary: 'Summary',
      });
      expect(output.id).toMatch(/^CodeProposal-\d+-[0-9a-f]{6}$/);
    });

    it('sets createdAt as valid ISO string', () => {
      const output = createAgentOutput('AuditReport', {
        agentId: 'marcus',
        projectId: 'proj-1',
        title: 'Test',
        summary: 'Summary',
      });
      expect(new Date(output.createdAt).toISOString()).toBe(output.createdAt);
    });

    it('applies default status of draft', () => {
      const output = createAgentOutput('ResearchReport', {
        agentId: 'hector',
        projectId: 'proj-1',
        title: 'Test',
        summary: 'Summary',
      });
      expect(output.status).toBe('draft');
    });

    it('applies default confidence of inferred', () => {
      const output = createAgentOutput('RiskReport', {
        agentId: 'sentinel',
        projectId: 'proj-1',
        title: 'Test',
        summary: 'Summary',
      });
      expect(output.confidence).toBe('inferred');
    });

    it('applies default riskLevel of medium', () => {
      const output = createAgentOutput('ApprovalRequest', {
        agentId: 'jose',
        projectId: 'proj-1',
        title: 'Test',
        summary: 'Summary',
      });
      expect(output.riskLevel).toBe('medium');
    });

    it('applies default requiresApproval of false', () => {
      const output = createAgentOutput('AgentTaskPacket', {
        agentId: 'jose',
        projectId: 'proj-1',
        title: 'Test',
        summary: 'Summary',
      });
      expect(output.requiresApproval).toBe(false);
    });

    it('applies default empty arrays for list fields', () => {
      const output = createAgentOutput('UIProposal', {
        agentId: 'miya',
        projectId: 'proj-1',
        title: 'Test',
        summary: 'Summary',
      });
      expect(output.assumptions).toEqual([]);
      expect(output.verifiedFacts).toEqual([]);
      expect(output.openQuestions).toEqual([]);
      expect(output.recommendedNextSteps).toEqual([]);
      expect(output.relatedFiles).toEqual([]);
      expect(output.proposedChanges).toEqual([]);
    });

    it('payload overrides defaults', () => {
      const output = createAgentOutput('ProjectBreakdown', {
        agentId: 'jose',
        projectId: 'proj-1',
        title: 'Custom Title',
        summary: 'Custom Summary',
        status: 'published',
        confidence: 'verified',
        riskLevel: 'high',
        requiresApproval: true,
        assumptions: ['assumption-1'],
      });
      expect(output.status).toBe('published');
      expect(output.confidence).toBe('verified');
      expect(output.riskLevel).toBe('high');
      expect(output.requiresApproval).toBe(true);
      expect(output.assumptions).toEqual(['assumption-1']);
    });

    it('includes all required fields in output', () => {
      const output = createAgentOutput('BuildVerificationReport', {
        agentId: 'alphonso',
        projectId: 'proj-1',
        title: 'Build Report',
        summary: 'Build passed',
      });
      const expectedKeys = [
        'type', 'id', 'createdAt', 'agentId', 'projectId', 'title', 'summary',
        'status', 'confidence', 'riskLevel', 'assumptions', 'verifiedFacts',
        'openQuestions', 'recommendedNextSteps', 'requiresApproval', 'relatedFiles',
        'proposedChanges',
      ];
      for (const key of expectedKeys) {
        expect(output).toHaveProperty(key);
      }
    });
  });
});
