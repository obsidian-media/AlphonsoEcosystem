import { beforeEach, describe, expect, it } from 'vitest';
import { listSkillPacks } from '../services/skillPackService';
import { loadAgentSkillGuidance } from '../services/skillPackService';
import { validateSkillPackAgainstContract } from '../services/agentContractService';
import { MARIA_PROFILE } from '../agents/maria/mariaProfile';

const MARIA_NEW_PACK_IDS = [
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

describe('Maria skill pack contract validation', () => {
  it('all 16 new packs pass contract validation for maria', () => {
    const packs = listSkillPacks();

    MARIA_NEW_PACK_IDS.forEach((id) => {
      const pack = packs.find((p) => p.id === id);
      expect(pack).toBeDefined();
      const result = validateSkillPackAgainstContract('maria', pack.permissions, pack.id);
      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new Error(`Pack ${id} failed contract validation: ${result.reason}`);
      }
    });
  });

  it('all existing Maria packs pass contract validation', () => {
    const packs = listSkillPacks();
    const existingMariaPacks = [
      'pack.maria-audit-governance',
      'pack.maria-trust-verification'
    ];

    existingMariaPacks.forEach((id) => {
      const pack = packs.find((p) => p.id === id);
      expect(pack).toBeDefined();
      const result = validateSkillPackAgainstContract('maria', pack.permissions, pack.id);
      expect(result.ok).toBe(true);
    });
  });
});

describe('Maria skill guidance loading', () => {
  it('loadAgentSkillGuidance returns all Maria packs', () => {
    const result = loadAgentSkillGuidance('maria');
    expect(result.agent).toBe('maria');
    expect(result.activeSkills).toHaveLength(18);
  });

  it('loadAgentSkillGuidance includes guidance for all new packs', () => {
    const result = loadAgentSkillGuidance('maria');
    const guidanceIds = result.guidance.map((g) => g.skillId);

    MARIA_NEW_PACK_IDS.forEach((id) => {
      expect(guidanceIds).toContain(id);
    });
  });

  it('all guidance entries have non-empty guidance text', () => {
    const result = loadAgentSkillGuidance('maria');

    result.guidance.forEach((g) => {
      expect(typeof g.guidance).toBe('string');
      expect(g.guidance.length).toBeGreaterThan(0);
    });
  });

  it('recommendedSteps contains unique steps', () => {
    const result = loadAgentSkillGuidance('maria');
    const steps = result.recommendedSteps;
    const uniqueSteps = [...new Set(steps)];
    expect(steps.length).toBe(uniqueSteps.length);
  });

  it('recommendedSteps has at most 8 entries', () => {
    const result = loadAgentSkillGuidance('maria');
    expect(result.recommendedSteps.length).toBeLessThanOrEqual(8);
  });
});

describe('Maria profile integration', () => {
  it('profile skillPackIds matches registry pack IDs', () => {
    const packs = listSkillPacks();
    const registryIds = packs.filter((p) => p.ownerAgent === 'maria').map((p) => p.id);

    MARIA_PROFILE.skillPackIds.forEach((id) => {
      expect(registryIds).toContain(id);
    });
  });

  it('profile has skillFocus covering all major areas', () => {
    const focus = MARIA_PROFILE.skillFocus;
    expect(focus).toContain('Audit Governance');
    expect(focus).toContain('Trust Verification');
    expect(focus).toContain('Requirements Analysis');
    expect(focus).toContain('Risk Classification');
    expect(focus).toContain('Compliance Auditing');
    expect(focus).toContain('Approval Workflow');
    expect(focus).toContain('Evidence Collection');
    expect(focus).toContain('Claim Verification');
    expect(focus).toContain('Policy Enforcement');
    expect(focus).toContain('Audit Trail');
    expect(focus).toContain('Trust Audit');
    expect(focus).toContain('State Verification');
    expect(focus).toContain('Brand Safety');
    expect(focus).toContain('Content Moderation');
    expect(focus).toContain('Quality Assurance');
    expect(focus).toContain('Documentation Review');
    expect(focus).toContain('Stakeholder Reporting');
    expect(focus).toContain('Incident Response');
  });
});
