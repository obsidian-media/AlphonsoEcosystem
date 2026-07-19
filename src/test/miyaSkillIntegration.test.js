import { beforeEach, describe, expect, it } from 'vitest';
import { listSkillPacks } from '../services/skillPackService';
import { loadAgentSkillGuidance } from '../services/skillPackService';
import { validateSkillPackAgainstContract } from '../services/agentContractService';
import { MIYA_PROFILE } from '../agents/miya/miyaProfile';

const MIYA_NEW_PACK_IDS = [
  'pack.miya-typography-system',
  'pack.miya-color-palette',
  'pack.miya-content-strategy',
  'pack.miya-video-storyboarding',
  'pack.miya-social-media-design',
  'pack.miya-editorial-design',
  'pack.miya-animation-design',
  'pack.miya-illustration-style',
  'pack.miya-video-editing',
  'pack.miya-landing-page',
  'pack.miya-dashboard-design',
  'pack.miya-brand-guidelines',
  'pack.miya-icon-system',
  'pack.miya-design-system',
  'pack.miya-user-research',
  'pack.miya-motion-system'
];

beforeEach(() => {
  localStorage.clear();
});

describe('Miya skill pack contract validation', () => {
  it('all 16 new packs pass contract validation for miya', () => {
    const packs = listSkillPacks();

    MIYA_NEW_PACK_IDS.forEach((id) => {
      const pack = packs.find((p) => p.id === id);
      expect(pack).toBeDefined();
      const result = validateSkillPackAgainstContract('miya', pack.permissions, pack.id);
      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new Error(`Pack ${id} failed contract validation: ${result.reason}`);
      }
    });
  });

  it('all existing Miya packs pass contract validation', () => {
    const packs = listSkillPacks();
    const existingMiyaPacks = ['pack.miya-runway-video-generation', 'pack.miya-creative-image', 'pack.miya-ui-ux-design', 'pack.miya-brand-identity', 'pack.miya-motion-graphics'];

    existingMiyaPacks.forEach((id) => {
      const pack = packs.find((p) => p.id === id);
      expect(pack).toBeDefined();
      const result = validateSkillPackAgainstContract('miya', pack.permissions, pack.id);
      expect(result.ok).toBe(true);
    });
  });
});

describe('Miya skill guidance loading', () => {
  it('loadAgentSkillGuidance returns all Miya packs', () => {
    const result = loadAgentSkillGuidance('miya');
    expect(result.agent).toBe('miya');
    expect(result.activeSkills).toHaveLength(21);
  });

  it('loadAgentSkillGuidance includes guidance for all new packs', () => {
    const result = loadAgentSkillGuidance('miya');
    const guidanceIds = result.guidance.map((g) => g.skillId);

    MIYA_NEW_PACK_IDS.forEach((id) => {
      expect(guidanceIds).toContain(id);
    });
  });

  it('all guidance entries have non-empty guidance text', () => {
    const result = loadAgentSkillGuidance('miya');
    result.guidance.forEach((g) => {
      expect(typeof g.guidance).toBe('string');
      expect(g.guidance.length).toBeGreaterThan(0);
    });
  });

  it('recommendedSteps contains unique steps', () => {
    const result = loadAgentSkillGuidance('miya');
    const steps = result.recommendedSteps;
    const uniqueSteps = [...new Set(steps)];
    expect(steps.length).toBe(uniqueSteps.length);
  });
});

describe('Miya profile integration', () => {
  it('profile skillPackIds matches registry pack IDs', () => {
    const packs = listSkillPacks();
    const registryIds = packs.filter((p) => p.ownerAgent === 'miya').map((p) => p.id);

    MIYA_PROFILE.skillPackIds.forEach((id) => {
      expect(registryIds).toContain(id);
    });
  });

  it('profile has skillFocus covering all major areas', () => {
    const focus = MIYA_PROFILE.skillFocus;
    expect(focus).toContain('Typography');
    expect(focus).toContain('Color Palette');
    expect(focus).toContain('Content Strategy');
    expect(focus).toContain('Video Storyboarding');
    expect(focus).toContain('Social Media');
    expect(focus).toContain('Editorial');
    expect(focus).toContain('Animation');
    expect(focus).toContain('Illustration');
    expect(focus).toContain('Video Editing');
    expect(focus).toContain('Landing Page');
    expect(focus).toContain('Dashboard');
    expect(focus).toContain('Brand Guidelines');
    expect(focus).toContain('Icon System');
    expect(focus).toContain('Design System');
    expect(focus).toContain('User Research');
    expect(focus).toContain('Motion System');
  });
});
