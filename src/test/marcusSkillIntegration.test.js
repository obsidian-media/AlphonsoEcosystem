import { beforeEach, describe, expect, it } from 'vitest';
import { listSkillPacks, loadAgentSkillGuidance } from '../services/skillPackService';
import { validateSkillPackAgainstContract } from '../services/agentContractService';
import { MARCUS_PROFILE } from '../agents/marcus/marcusProfile';

const MARCUS_NEW_PACK_IDS = [
  'pack.marcus-github-releases', 'pack.marcus-slack-notifications', 'pack.marcus-release-readiness',
  'pack.marcus-security-audit', 'pack.marcus-risk-detection', 'pack.marcus-integration-validation',
  'pack.marcus-deployment-execution', 'pack.marcus-changelog-generation', 'pack.marcus-asset-distribution',
  'pack.marcus-notification-routing', 'pack.marcus-approval-gatekeeping', 'pack.marcus-version-management',
  'pack.marcus-rollback-execution', 'pack.marcus-release-reporting', 'pack.marcus-compliance-distribution',
  'pack.marcus-team-communication'
];

beforeEach(() => { localStorage.clear(); });

describe('Marcus skill pack contract validation', () => {
  it('all 16 new packs pass contract validation for marcus', () => {
    const packs = listSkillPacks();
    MARCUS_NEW_PACK_IDS.forEach((id) => {
      const pack = packs.find((p) => p.id === id);
      expect(pack).toBeDefined();
      const result = validateSkillPackAgainstContract('marcus', pack.permissions, pack.id);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(`Pack ${id} failed: ${result.reason}`);
    });
  });
});

describe('Marcus skill guidance loading', () => {
  it('loadAgentSkillGuidance returns all Marcus packs', () => {
    const result = loadAgentSkillGuidance('marcus');
    expect(result.agent).toBe('marcus');
    expect(result.activeSkills).toHaveLength(18);
  });

  it('includes guidance for all new packs', () => {
    const result = loadAgentSkillGuidance('marcus');
    const guidanceIds = result.guidance.map((g) => g.skillId);
    MARCUS_NEW_PACK_IDS.forEach((id) => { expect(guidanceIds).toContain(id); });
  });

  it('all guidance entries have non-empty text', () => {
    const result = loadAgentSkillGuidance('marcus');
    result.guidance.forEach((g) => { expect(g.guidance.length).toBeGreaterThan(0); });
  });
});

describe('Marcus profile integration', () => {
  it('profile skillPackIds matches registry', () => {
    const packs = listSkillPacks();
    const registryIds = packs.map((p) => p.id);
    MARCUS_PROFILE.skillPackIds.forEach((id) => { expect(registryIds).toContain(id); });
  });

  it('profile has skillFocus covering all areas', () => {
    const focus = MARCUS_PROFILE.skillFocus;
    expect(focus).toContain('GitHub Releases');
    expect(focus).toContain('Slack Notifications');
    expect(focus).toContain('Release Readiness');
    expect(focus).toContain('Security Audit');
    expect(focus).toContain('Risk Detection');
    expect(focus).toContain('Deployment');
    expect(focus).toContain('Rollback');
    expect(focus).toContain('Compliance');
  });
});
