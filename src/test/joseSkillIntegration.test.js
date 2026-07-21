import { beforeEach, describe, expect, it } from 'vitest';
import { listSkillPacks } from '../services/skillPackService';
import { loadAgentSkillGuidance } from '../services/skillPackService';
import { validateSkillPackAgainstContract } from '../services/agentContractService';
import { JOSE_PROFILE } from '../agents/jose/joseProfile';

const JOSE_NEW_PACK_IDS = [
  'pack.jose-workflow-design',
  'pack.jose-strategic-planning',
  'pack.jose-dependency-mapping',
  'pack.jose-agent-coordination',
  'pack.jose-parallel-orchestration',
  'pack.jose-task-prioritization',
  'pack.jose-risk-assessment',
  'pack.jose-quality-gates',
  'pack.jose-compliance-checks',
  'pack.jose-progress-tracking',
  'pack.jose-status-reporting',
  'pack.jose-performance-metrics',
  'pack.jose-workflow-optimization',
  'pack.jose-bottleneck-detection',
  'pack.jose-continuous-improvement',
  'pack.jose-stakeholder-communication'
];

beforeEach(() => {
  localStorage.clear();
});

describe('Jose skill pack contract validation', () => {
  it('all 16 new packs pass contract validation for jose', () => {
    const packs = listSkillPacks();

    JOSE_NEW_PACK_IDS.forEach((id) => {
      const pack = packs.find((p) => p.id === id);
      expect(pack).toBeDefined();
      const result = validateSkillPackAgainstContract('jose', pack.permissions, pack.id);
      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new Error(`Pack ${id} failed contract validation: ${result.reason}`);
      }
    });
  });

  it('all existing Jose packs pass contract validation', () => {
    const packs = listSkillPacks();
    const existingJosePacks = [
      'pack.jose-professional-orchestration',
      'pack.jose-task-routing',
      'pack.jose-approval-gating',
      'pack.jose-cross-agent-synthesis',
      'pack.jose-pipeline-governance'
    ];

    existingJosePacks.forEach((id) => {
      const pack = packs.find((p) => p.id === id);
      expect(pack).toBeDefined();
      const result = validateSkillPackAgainstContract('jose', pack.permissions, pack.id);
      expect(result.ok).toBe(true);
    });
  });
});

describe('Jose skill guidance loading', () => {
  it('loadAgentSkillGuidance returns all Jose packs', () => {
    const result = loadAgentSkillGuidance('jose');
    expect(result.agent).toBe('jose');
    expect(result.activeSkills).toHaveLength(22);
  });

  it('loadAgentSkillGuidance includes guidance for all new packs', () => {
    const result = loadAgentSkillGuidance('jose');
    const guidanceIds = result.guidance.map((g) => g.skillId);

    JOSE_NEW_PACK_IDS.forEach((id) => {
      expect(guidanceIds).toContain(id);
    });
  });

  it('all guidance entries have non-empty guidance text', () => {
    const result = loadAgentSkillGuidance('jose');

    result.guidance.forEach((g) => {
      expect(typeof g.guidance).toBe('string');
      expect(g.guidance.length).toBeGreaterThan(0);
    });
  });

  it('recommendedSteps contains unique steps', () => {
    const result = loadAgentSkillGuidance('jose');
    const steps = result.recommendedSteps;
    const uniqueSteps = [...new Set(steps)];
    expect(steps.length).toBe(uniqueSteps.length);
  });

  it('recommendedSteps has at most 8 entries', () => {
    const result = loadAgentSkillGuidance('jose');
    expect(result.recommendedSteps.length).toBeLessThanOrEqual(8);
  });
});

describe('Jose profile integration', () => {
  it('profile skillPackIds matches registry pack IDs', () => {
    const packs = listSkillPacks();
    const registryIds = packs.filter((p) => p.ownerAgent === 'jose').map((p) => p.id);

    JOSE_PROFILE.skillPackIds.forEach((id) => {
      expect(registryIds).toContain(id);
    });
  });

  it('profile has skillFocus covering all major areas', () => {
    const focus = JOSE_PROFILE.skillFocus;
    expect(focus).toContain('Professional Orchestration');
    expect(focus).toContain('Task Routing');
    expect(focus).toContain('Approval Gating');
    expect(focus).toContain('Cross-Agent Synthesis');
    expect(focus).toContain('Pipeline Governance');
    expect(focus).toContain('Workflow Design');
    expect(focus).toContain('Strategic Planning');
    expect(focus).toContain('Agent Coordination');
    expect(focus).toContain('Risk Assessment');
    expect(focus).toContain('Quality Gates');
    expect(focus).toContain('Progress Tracking');
    expect(focus).toContain('Status Reporting');
    expect(focus).toContain('Workflow Optimization');
    expect(focus).toContain('Bottleneck Detection');
    expect(focus).toContain('Continuous Improvement');
    expect(focus).toContain('Stakeholder Communication');
  });
});
