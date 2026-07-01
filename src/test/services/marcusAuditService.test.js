import { describe, it, expect, vi } from 'vitest';
import {
  generateRiskScore, generateAuditChecklist, auditProjectPlan,
  auditCodeProposal, auditSecurityModel, auditReleaseReadiness
} from '../../services/audit/marcusAuditService';

vi.mock('../../agents/shared/agentOutputSchemas', () => ({
  createAgentOutput: vi.fn((type, data) => ({ type, ...data })),
  AgentOutputTypes: { AUDIT_REPORT: 'audit_report', RELEASE_READINESS_REPORT: 'release_readiness_report' }
}));

describe('marcusAuditService', () => {
  describe('generateRiskScore', () => {
    it('returns low risk for empty input', () => {
      const result = generateRiskScore({});
      expect(result.level).toBe('low');
      expect(result.score).toBe(0);
    });

    it('detects payment signals', () => {
      const result = generateRiskScore({ text: 'paypal integration stripe payout' });
      expect(result.score).toBeGreaterThan(0);
    });

    it('detects auth signals', () => {
      const result = generateRiskScore({ text: 'auth session token firebase auth' });
      expect(result.score).toBeGreaterThan(0);
    });

    it('detects critical risk', () => {
      const result = generateRiskScore({
        text: 'paypal stripe payout cashout payment auth session token firebase auth firestore database pii user data deploy production'
      });
      expect(result.level).toBe('critical');
    });

    it('detects medium risk', () => {
      const result = generateRiskScore({ text: 'deploy production' });
      expect(result.level).toBe('medium');
    });
  });

  describe('generateAuditChecklist', () => {
    it('returns 7 checklist items', () => {
      const checklist = generateAuditChecklist({ id: 'test' });
      expect(checklist.length).toBe(7);
    });

    it('each item has required fields', () => {
      const checklist = generateAuditChecklist({ id: 'test' });
      checklist.forEach(item => {
        expect(item.id).toContain('audit-');
        expect(item.required).toBe(true);
        expect(item.status).toBe('pending');
      });
    });

    it('links to project id', () => {
      const checklist = generateAuditChecklist({ id: 'proj-1' });
      expect(checklist[0].projectId).toBe('proj-1');
    });
  });

  describe('auditProjectPlan', () => {
    it('returns audit report output', () => {
      const result = auditProjectPlan({ id: 'test', projectName: 'Test' });
      expect(result.agentId).toBe('marcus');
      expect(result.status).toBe('ready');
    });
  });

  describe('auditCodeProposal', () => {
    it('returns audit report output', () => {
      const result = auditCodeProposal({ projectId: 'test' });
      expect(result.agentId).toBe('marcus');
    });
  });

  describe('auditSecurityModel', () => {
    it('delegates to auditCodeProposal', () => {
      const result = auditSecurityModel({ projectId: 'test' });
      expect(result.agentId).toBe('marcus');
    });
  });

  describe('auditReleaseReadiness', () => {
    it('returns release readiness report', () => {
      const result = auditReleaseReadiness({ id: 'test', projectName: 'Test' });
      expect(result.type).toBe('release_readiness_report');
    });
  });
});
