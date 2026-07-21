import { beforeEach, describe, expect, it } from 'vitest';
import { listSkillPacks } from '../services/skillPackService';
import { loadAgentSkillGuidance } from '../services/skillPackService';
import { validateSkillPackAgainstContract } from '../services/agentContractService';
import { HECTOR_PROFILE } from '../agents/hector/hectorProfile';

const HECTOR_NEW_PACK_IDS = [
  'pack.hector-api-documentation-research',
  'pack.hector-compliance-research',
  'pack.hector-trend-analysis',
  'pack.hector-code-pattern-research',
  'pack.hector-api-integration-research',
  'pack.hector-security-research',
  'pack.hector-technical-architecture-research',
  'pack.hector-open-source-analysis',
  'pack.hector-market-intelligence',
  'pack.hector-data-gathering',
  'pack.hector-content-research',
  'pack.hector-documentation-audit',
  'pack.hector-survey-design',
  'pack.hector-source-curation',
  'pack.hector-confidence-scoring',
  'pack.hector-research-briefing'
];

beforeEach(() => {
  localStorage.clear();
});

describe('Hector skill pack contract validation', () => {
  it('all 16 new packs pass contract validation for hector', () => {
    const packs = listSkillPacks();

    HECTOR_NEW_PACK_IDS.forEach((id) => {
      const pack = packs.find((p) => p.id === id);
      expect(pack).toBeDefined();
      const result = validateSkillPackAgainstContract('hector', pack.permissions, pack.id);
      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new Error(`Pack ${id} failed contract validation: ${result.reason}`);
      }
    });
  });

  it('all existing Hector packs pass contract validation', () => {
    const packs = listSkillPacks();
    const existingHectorPacks = [
      'pack.hector-professional-marketing',
      'pack.hector-market-research',
      'pack.hector-competitive-analysis',
      'pack.hector-source-verification',
      'pack.hector-rss-monitoring'
    ];

    existingHectorPacks.forEach((id) => {
      const pack = packs.find((p) => p.id === id);
      expect(pack).toBeDefined();
      const result = validateSkillPackAgainstContract('hector', pack.permissions, pack.id);
      expect(result.ok).toBe(true);
    });
  });
});

describe('Hector skill guidance loading', () => {
  it('loadAgentSkillGuidance returns all Hector packs', () => {
    const result = loadAgentSkillGuidance('hector');
    expect(result.agent).toBe('hector');
    expect(result.activeSkills).toHaveLength(23);
  });

  it('loadAgentSkillGuidance includes guidance for all new packs', () => {
    const result = loadAgentSkillGuidance('hector');
    const guidanceIds = result.guidance.map((g) => g.skillId);

    HECTOR_NEW_PACK_IDS.forEach((id) => {
      expect(guidanceIds).toContain(id);
    });
  });

  it('all guidance entries have non-empty guidance text', () => {
    const result = loadAgentSkillGuidance('hector');

    result.guidance.forEach((g) => {
      expect(typeof g.guidance).toBe('string');
      expect(g.guidance.length).toBeGreaterThan(0);
    });
  });

  it('recommendedSteps contains unique steps', () => {
    const result = loadAgentSkillGuidance('hector');
    const steps = result.recommendedSteps;
    const uniqueSteps = [...new Set(steps)];
    expect(steps.length).toBe(uniqueSteps.length);
  });

  it('recommendedSteps has at most 8 entries', () => {
    const result = loadAgentSkillGuidance('hector');
    expect(result.recommendedSteps.length).toBeLessThanOrEqual(8);
  });
});

describe('Hector profile integration', () => {
  it('profile skillPackIds matches registry pack IDs', () => {
    const packs = listSkillPacks();
    const registryIds = packs.filter((p) => p.ownerAgent === 'hector').map((p) => p.id);

    HECTOR_PROFILE.skillPackIds.forEach((id) => {
      expect(registryIds).toContain(id);
    });
  });

  it('profile has skillFocus covering all major areas', () => {
    const focus = HECTOR_PROFILE.skillFocus;
    expect(focus).toContain('Professional Marketing');
    expect(focus).toContain('Market Research');
    expect(focus).toContain('Competitive Analysis');
    expect(focus).toContain('Source Verification');
    expect(focus).toContain('RSS Monitoring');
    expect(focus).toContain('API Documentation Research');
    expect(focus).toContain('Compliance Research');
    expect(focus).toContain('Trend Analysis');
    expect(focus).toContain('Code Pattern Research');
    expect(focus).toContain('API Integration Research');
    expect(focus).toContain('Security Research');
    expect(focus).toContain('Technical Architecture Research');
    expect(focus).toContain('Open Source Analysis');
    expect(focus).toContain('Market Intelligence');
    expect(focus).toContain('Data Gathering');
    expect(focus).toContain('Content Research');
    expect(focus).toContain('Documentation Audit');
    expect(focus).toContain('Survey Design');
    expect(focus).toContain('Source Curation');
    expect(focus).toContain('Confidence Scoring');
    expect(focus).toContain('Research Briefing');
  });
});
