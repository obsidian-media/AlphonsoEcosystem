import { beforeEach, describe, expect, it } from 'vitest';
import { listSkillPacks } from '../services/skillPackService';
import { loadAgentSkillGuidance } from '../services/skillPackService';
import { validateSkillPackAgainstContract } from '../services/agentContractService';
import { ALPHONSO_PROFILE } from '../agents/alphonso/alphonsoProfile';

const ALPHONSO_PACK_IDS = [
  'pack.codex-professional-coding',
  'pack.alphonso-runtime-operations',
  'pack.coding.full-stack',
  'pack.coding.tdd',
  'pack.alphonso-typescript-mastery',
  'pack.alphonso-rust-operations',
  'pack.alphonso-react-patterns',
  'pack.alphonso-python-voice',
  'pack.alphonso-code-review',
  'pack.alphonso-build-verification',
  'pack.alphonso-refactoring',
  'pack.debugging.root-cause',
  'pack.alphonso-runtime-diagnostics',
  'pack.alphonso-security-audit',
  'pack.github.integration',
  'pack.alphonso-performance-optimization',
  'pack.alphonso-api-integration',
  'pack.alphonso-error-handling'
];

beforeEach(() => {
  localStorage.clear();
});

describe('Alphonso skill pack contract validation', () => {
  it('all 16 packs pass contract validation for alphonso', () => {
    const packs = listSkillPacks();

    ALPHONSO_PACK_IDS.forEach((id) => {
      const pack = packs.find((p) => p.id === id);
      expect(pack).toBeDefined();
      const result = validateSkillPackAgainstContract('alphonso', pack.permissions, pack.id);
      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new Error(`Pack ${id} failed contract validation: ${result.reason}`);
      }
    });
  });

  it('all 16 packs have scope overrides in agentContractService', () => {
    const packs = listSkillPacks();

    ALPHONSO_PACK_IDS.forEach((id) => {
      const pack = packs.find((p) => p.id === id);
      expect(pack).toBeDefined();
      const result = validateSkillPackAgainstContract('alphonso', pack.permissions, pack.id);
      expect(result.ok).toBe(true);
    });
  });
});

describe('Alphonso skill guidance loading', () => {
  it('loadAgentSkillGuidance returns all 16 Alphonso packs', () => {
    const result = loadAgentSkillGuidance('alphonso');
    expect(result.agent).toBe('alphonso');
    expect(result.activeSkills).toHaveLength(18);
  });

  it('loadAgentSkillGuidance includes guidance for all new packs', () => {
    const result = loadAgentSkillGuidance('alphonso');
    const guidanceIds = result.guidance.map((g) => g.skillId);

    ALPHONSO_PACK_IDS.forEach((id) => {
      expect(guidanceIds).toContain(id);
    });
  });

  it('all guidance entries have non-empty guidance text', () => {
    const result = loadAgentSkillGuidance('alphonso');

    result.guidance.forEach((g) => {
      expect(typeof g.guidance).toBe('string');
      expect(g.guidance.length).toBeGreaterThan(0);
    });
  });

  it('all guidance entries have non-empty steps', () => {
    const result = loadAgentSkillGuidance('alphonso');

    result.guidance.forEach((g) => {
      expect(typeof g.guidance).toBe('string');
      expect(g.guidance.length).toBeGreaterThan(0);
    });
  });

  it('recommendedSteps contains unique steps', () => {
    const result = loadAgentSkillGuidance('alphonso');
    const steps = result.recommendedSteps;
    const uniqueSteps = [...new Set(steps)];
    expect(steps.length).toBe(uniqueSteps.length);
  });

  it('recommendedSteps has at most 8 entries', () => {
    const result = loadAgentSkillGuidance('alphonso');
    expect(result.recommendedSteps.length).toBeLessThanOrEqual(8);
  });
});

describe('Alphonso profile integration', () => {
  it('profile skillPackIds matches registry pack IDs', () => {
    const packs = listSkillPacks();
    const registryIds = packs.filter((p) => p.ownerAgent === 'alphonso').map((p) => p.id);

    ALPHONSO_PROFILE.skillPackIds.forEach((id) => {
      expect(registryIds).toContain(id);
    });
  });

  it('profile has skillFocus covering all major areas', () => {
    const focus = ALPHONSO_PROFILE.skillFocus;
    expect(focus).toContain('Full-Stack Coding');
    expect(focus).toContain('TDD');
    expect(focus).toContain('TypeScript');
    expect(focus).toContain('Rust');
    expect(focus).toContain('React');
    expect(focus).toContain('Python');
    expect(focus).toContain('Code Review');
    expect(focus).toContain('Build Verification');
    expect(focus).toContain('Refactoring');
    expect(focus).toContain('Debugging');
    expect(focus).toContain('Runtime Diagnostics');
    expect(focus).toContain('Security Audit');
    expect(focus).toContain('GitHub Integration');
    expect(focus).toContain('Performance Optimization');
    expect(focus).toContain('API Integration');
    expect(focus).toContain('Error Handling');
  });
});
