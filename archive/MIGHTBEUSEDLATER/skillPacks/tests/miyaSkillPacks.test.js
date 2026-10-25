import { beforeEach, describe, expect, it } from 'vitest';
import { listSkillPacks } from '../services/skillPackService';
import { MIYA_PROFILE } from '../agents/miya/miyaProfile';

const MIYA_PACK_IDS = [
  'pack.miya-runway-video-generation',
  'pack.miya-creative-image',
  'pack.miya-ui-ux-design',
  'pack.miya-brand-identity',
  'pack.miya-motion-graphics',
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

describe('Miya skill packs', () => {
  it('has all 21 Miya skill packs in the registry', () => {
    const packs = listSkillPacks();
    const ids = packs.map((pack) => pack.id);

    MIYA_PACK_IDS.forEach((id) => {
      expect(ids).toContain(id);
    });
  });

  it('seeds exactly 21 Miya-owned packs', () => {
    const packs = listSkillPacks();
    const miyaPacks = packs.filter((pack) => pack.ownerAgent === 'miya');
    expect(miyaPacks).toHaveLength(21);
  });

  it('has valid manifest structure for all new Miya packs', () => {
    const packs = listSkillPacks();
    const existingIds = ['pack.miya-runway-video-generation', 'pack.miya-creative-image', 'pack.miya-ui-ux-design', 'pack.miya-brand-identity', 'pack.miya-motion-graphics'];

    MIYA_PACK_IDS.filter((id) => !existingIds.includes(id)).forEach((id) => {
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
      expect(pack.ownerAgent).toBe('miya');
      expect(pack.trust).toBeDefined();
    });
  });

  it('has exampleTasks for all new Miya packs', () => {
    const packs = listSkillPacks();
    const existingIds = ['pack.miya-runway-video-generation', 'pack.miya-creative-image', 'pack.miya-ui-ux-design', 'pack.miya-brand-identity', 'pack.miya-motion-graphics'];

    MIYA_PACK_IDS.filter((id) => !existingIds.includes(id)).forEach((id) => {
      const pack = packs.find((p) => p.id === id);
      expect(pack).toBeDefined();
      expect(Array.isArray(pack.exampleTasks)).toBe(true);
      expect(pack.exampleTasks.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('all Miya pack IDs are in the profile skillPackIds', () => {
    MIYA_PACK_IDS.forEach((id) => {
      expect(MIYA_PROFILE.skillPackIds).toContain(id);
    });
  });

  it('profile skillPackIds has exactly 21 entries', () => {
    expect(MIYA_PROFILE.skillPackIds).toHaveLength(21);
  });

  it('has no duplicate pack IDs', () => {
    const packs = listSkillPacks();
    const miyaPacks = packs.filter((pack) => pack.ownerAgent === 'miya');
    const ids = miyaPacks.map((p) => p.id);
    const uniqueIds = [...new Set(ids)];
    expect(ids.length).toBe(uniqueIds.length);
  });
});

describe('Miya skill pack permissions', () => {
  it('all permissions use allowed prefixes (media., video., image., creative., runway.)', () => {
    const packs = listSkillPacks();
    const allowedPrefixes = ['media.', 'video.', 'image.', 'creative.', 'runway.'];
    const existingIds = ['pack.miya-runway-video-generation', 'pack.miya-creative-image', 'pack.miya-ui-ux-design', 'pack.miya-brand-identity', 'pack.miya-motion-graphics'];

    MIYA_PACK_IDS.filter((id) => !existingIds.includes(id)).forEach((id) => {
      const pack = packs.find((p) => p.id === id);
      pack.permissions.forEach((permission) => {
        const matches = allowedPrefixes.some((prefix) => permission.startsWith(prefix));
        expect(matches).toBe(true);
      });
    });
  });

  it('design system packs have correct permissions', () => {
    const packs = listSkillPacks();
    const typography = packs.find((p) => p.id === 'pack.miya-typography-system');
    expect(typography.permissions).toContain('creative.typography');

    const color = packs.find((p) => p.id === 'pack.miya-color-palette');
    expect(color.permissions).toContain('creative.color');

    const designSystem = packs.find((p) => p.id === 'pack.miya-design-system');
    expect(designSystem.permissions).toContain('creative.design_system');
  });

  it('video packs have correct permissions', () => {
    const packs = listSkillPacks();
    const storyboard = packs.find((p) => p.id === 'pack.miya-video-storyboarding');
    expect(storyboard.permissions).toContain('video.storyboard');

    const videoEdit = packs.find((p) => p.id === 'pack.miya-video-editing');
    expect(videoEdit.permissions).toContain('video.editing');
  });
});
