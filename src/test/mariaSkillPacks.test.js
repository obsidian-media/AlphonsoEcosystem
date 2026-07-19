import { beforeEach, describe, expect, it } from 'vitest';
import { listSkillPacks } from '../services/skillPackService';
import { MARIA_PROFILE } from '../agents/maria/mariaProfile';

const MARIA_PACK_IDS = [
  'pack.maria-audit-governance',
  'pack.maria-trust-verification',
  'pack.maria-requirements-analysis',
  'pack.maria-risk-classification',
  'pack.maria-compliance-auditing',
  'pack.maria-approval-workflow',
  'pack.maria-evidence-collection',
  'pack.maria-claim-verification',
  'pack.maria-policy-enforcement',
  'pack.maria-audit-trail',
  'pack.maria-trust-audit',
  'pack.maria-state-verification',
  'pack.maria-brand-safety',
  'pack.maria-content-moderation',
  'pack.maria-quality-assurance',
  'pack.maria-documentation-review',
  'pack.maria-stakeholder-reporting',
  'pack.maria-incident-response'
];

beforeEach(() => {
  localStorage.clear();
});

describe('Maria skill packs', () => {
  it('has all 18 Maria skill packs in the registry', () => {
    const packs = listSkillPacks();
    const ids = packs.map((pack) => pack.id);

    MARIA_PACK_IDS.forEach((id) => {
      expect(ids).toContain(id);
    });
  });

  it('seeds exactly 18 Maria-owned packs', () => {
    const packs = listSkillPacks();
    const mariaPacks = packs.filter((pack) => pack.ownerAgent === 'maria');
    expect(mariaPacks).toHaveLength(18);
  });

  it('has valid manifest structure for all new Maria packs', () => {
    const packs = listSkillPacks();

    const newPacks = MARIA_PACK_IDS.filter(
      (id) => !['pack.maria-audit-governance', 'pack.maria-trust-verification'].includes(id)
    );

    newPacks.forEach((id) => {
      const pack = packs.find((p) => p.id === id);
      expect(pack).toBeDefined();
      expect(pack.id).toBe(id);
      expect(typeof pack.name).toBe('string');
      expect(pack.name.length).toBeGreaterThan(0);
      expect(pack.version).toBe('1.0.0');
      expect(pack.enabled).toBe(true);
      expect(Array.isArray(pack.permissions)).toBe(true);
      expect(pack.permissions.length).toBeGreaterThan(0);
      expect(pack.category).toBe('agent_skill');
      expect(pack.ownerAgent).toBe('maria');
      expect(pack.trust).toBeDefined();
    });
  });

  it('has exampleTasks for all new Maria packs', () => {
    const packs = listSkillPacks();

    const newPacks = MARIA_PACK_IDS.filter(
      (id) => !['pack.maria-audit-governance', 'pack.maria-trust-verification'].includes(id)
    );

    newPacks.forEach((id) => {
      const pack = packs.find((p) => p.id === id);
      expect(pack).toBeDefined();
      expect(Array.isArray(pack.exampleTasks)).toBe(true);
      expect(pack.exampleTasks.length).toBeGreaterThanOrEqual(2);
      pack.exampleTasks.forEach((task) => {
        expect(typeof task).toBe('string');
        expect(task.length).toBeGreaterThan(0);
      });
    });
  });

  it('all Maria pack IDs are in the profile skillPackIds', () => {
    MARIA_PACK_IDS.forEach((id) => {
      expect(MARIA_PROFILE.skillPackIds).toContain(id);
    });
  });

  it('profile skillPackIds has exactly 18 entries (2 existing + 16 new)', () => {
    expect(MARIA_PROFILE.skillPackIds).toHaveLength(18);
  });

  it('has no duplicate pack IDs', () => {
    const packs = listSkillPacks();
    const mariaPacks = packs.filter((pack) => pack.ownerAgent === 'maria');
    const ids = mariaPacks.map((p) => p.id);
    const uniqueIds = [...new Set(ids)];
    expect(ids.length).toBe(uniqueIds.length);
  });
});

describe('Maria skill pack permissions', () => {
  it('all permissions use allowed prefixes (workflow.audit., risk., claim., approval., trust., receipt., evidence., state., agent_report.)', () => {
    const packs = listSkillPacks();
    const allowedPrefixes = ['workflow.audit.', 'risk.', 'claim.', 'approval.', 'trust.', 'receipt.', 'evidence.', 'state.', 'agent_report.'];

    const newPacks = MARIA_PACK_IDS.filter(
      (id) => !['pack.maria-audit-governance', 'pack.maria-trust-verification'].includes(id)
    );

    newPacks.forEach((id) => {
      const pack = packs.find((p) => p.id === id);
      pack.permissions.forEach((permission) => {
        const matches = allowedPrefixes.some((prefix) => permission.startsWith(prefix));
        expect(matches).toBe(true);
      });
    });
  });

  it('governance packs have correct permissions', () => {
    const packs = listSkillPacks();

    const requirementsAnalysis = packs.find((p) => p.id === 'pack.maria-requirements-analysis');
    expect(requirementsAnalysis.permissions).toContain('workflow.audit.requirements');
    expect(requirementsAnalysis.permissions).toContain('workflow.audit.analysis');
    expect(requirementsAnalysis.permissions).toContain('workflow.audit.organize');

    const riskClassification = packs.find((p) => p.id === 'pack.maria-risk-classification');
    expect(riskClassification.permissions).toContain('risk.classify');
    expect(riskClassification.permissions).toContain('risk.assess');
    expect(riskClassification.permissions).toContain('risk.categorize');
  });

  it('compliance packs have correct permissions', () => {
    const packs = listSkillPacks();

    const complianceAuditing = packs.find((p) => p.id === 'pack.maria-compliance-auditing');
    expect(complianceAuditing.permissions).toContain('workflow.audit.compliance');
    expect(complianceAuditing.permissions).toContain('workflow.audit.verify');
    expect(complianceAuditing.permissions).toContain('workflow.audit.enforce');

    const policyEnforcement = packs.find((p) => p.id === 'pack.maria-policy-enforcement');
    expect(policyEnforcement.permissions).toContain('policy.enforce');
    expect(policyEnforcement.permissions).toContain('policy.audit');
    expect(policyEnforcement.permissions).toContain('policy.verify');
  });

  it('audit packs have correct permissions', () => {
    const packs = listSkillPacks();

    const auditTrail = packs.find((p) => p.id === 'pack.maria-audit-trail');
    expect(auditTrail.permissions).toContain('receipt.audit');
    expect(auditTrail.permissions).toContain('receipt.track');
    expect(auditTrail.permissions).toContain('receipt.verify');

    const trustAudit = packs.find((p) => p.id === 'pack.maria-trust-audit');
    expect(trustAudit.permissions).toContain('trust.audit');
    expect(trustAudit.permissions).toContain('trust.verify');
    expect(trustAudit.permissions).toContain('trust.validate');
  });
});
