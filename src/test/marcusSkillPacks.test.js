import { beforeEach, describe, expect, it } from 'vitest';
import { listSkillPacks } from '../services/skillPackService';
import { MARCUS_PROFILE } from '../agents/marcus/marcusProfile';

const MARCUS_PACK_IDS = [
  'pack.workflow.executing-plans',
  'pack.marcus-distribution-execution',
  'pack.marcus-github-releases',
  'pack.marcus-slack-notifications',
  'pack.marcus-release-readiness',
  'pack.marcus-integration-validation',
  'pack.marcus-deployment-execution',
  'pack.marcus-changelog-generation',
  'pack.marcus-asset-distribution',
  'pack.marcus-notification-routing',
  'pack.marcus-approval-gatekeeping',
  'pack.marcus-version-management',
  'pack.marcus-rollback-execution',
  'pack.marcus-release-reporting',
  'pack.marcus-compliance-distribution',
  'pack.marcus-team-communication'
];

beforeEach(() => {
  localStorage.clear();
});

describe('Marcus skill packs', () => {
  it('has all 20 Marcus skill packs in the registry', () => {
    const packs = listSkillPacks();
    const ids = packs.map((pack) => pack.id);
    MARCUS_PACK_IDS.forEach((id) => { expect(ids).toContain(id); });
  });

  it('seeds exactly 15 Marcus-owned packs plus one shared pack', () => {
    const packs = listSkillPacks();
    const marcusPacks = packs.filter((pack) => pack.ownerAgent === 'marcus');
    expect(marcusPacks).toHaveLength(15);
  });

  it('has valid manifest structure for all new Marcus packs', () => {
    const packs = listSkillPacks();
    const existingIds = ['pack.workflow.executing-plans', 'pack.github.releases', 'pack.slack.notifications', 'pack.marcus-distribution-execution'];
    MARCUS_PACK_IDS.filter((id) => !existingIds.includes(id)).forEach((id) => {
      const pack = packs.find((p) => p.id === id);
      expect(pack).toBeDefined();
      expect(pack.version).toBe('1.0.0');
      expect(pack.enabled).toBe(true);
      expect(pack.category).toBe('agent_skill');
      expect(pack.ownerAgent).toBe('marcus');
      expect(pack.trust).toBeDefined();
    });
  });

  it('has exampleTasks for all new Marcus packs', () => {
    const packs = listSkillPacks();
    const existingIds = ['pack.workflow.executing-plans', 'pack.github.releases', 'pack.slack.notifications', 'pack.marcus-distribution-execution'];
    MARCUS_PACK_IDS.filter((id) => !existingIds.includes(id)).forEach((id) => {
      const pack = packs.find((p) => p.id === id);
      expect(Array.isArray(pack.exampleTasks)).toBe(true);
      expect(pack.exampleTasks.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('all Marcus pack IDs are in the profile skillPackIds', () => {
    MARCUS_PACK_IDS.forEach((id) => { expect(MARCUS_PROFILE.skillPackIds).toContain(id); });
  });

  it('profile skillPackIds has exactly 16 entries', () => {
    expect(MARCUS_PROFILE.skillPackIds).toHaveLength(16);
  });

  it('has no duplicate pack IDs', () => {
    const packs = listSkillPacks();
    const marcusPacks = packs.filter((pack) => pack.ownerAgent === 'marcus');
    const ids = marcusPacks.map((p) => p.id);
    expect(ids.length).toBe([...new Set(ids)].length);
  });
});

describe('Marcus skill pack permissions', () => {
  it('all permissions use allowed prefixes (distribution., engagement., performance., approved_)', () => {
    const packs = listSkillPacks();
    const allowedPrefixes = ['distribution.', 'engagement.', 'performance.', 'approved_'];
    const existingIds = ['pack.workflow.executing-plans', 'pack.github.releases', 'pack.slack.notifications', 'pack.marcus-distribution-execution'];
    MARCUS_PACK_IDS.filter((id) => !existingIds.includes(id)).forEach((id) => {
      const pack = packs.find((p) => p.id === id);
      pack.permissions.forEach((permission) => {
        expect(allowedPrefixes.some((prefix) => permission.startsWith(prefix))).toBe(true);
      });
    });
  });
});

// Security is Sentinel's and risk review Maria's (owner, 2026-10-23).
describe('Marcus has no security or risk packs', () => {
  it('lists neither pack, and a stale saved install of one is not shown', () => {
    localStorage.setItem('alphonso_skill_packs_v1', JSON.stringify([{ id: 'pack.marcus-security-audit', ownerAgent: 'marcus', enabled: true, permissions: [] }]));
    const ids = listSkillPacks().map((p) => p.id);
    for (const id of ['pack.marcus-security-audit', 'pack.marcus-risk-detection']) {
      expect(ids).not.toContain(id);
      expect(MARCUS_PROFILE.skillPackIds).not.toContain(id);
    }
  });
});
