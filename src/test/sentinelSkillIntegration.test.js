import { beforeEach, describe, expect, it } from 'vitest';
import { listSkillPacks, loadAgentSkillGuidance } from '../services/skillPackService';
import { validateSkillPackAgainstContract } from '../services/agentContractService';
import { SENTINEL_PROFILE } from '../agents/sentinel/sentinelProfile';

const SENTINEL_NEW_PACK_IDS = [
  'pack.sentinel-connector-risk', 'pack.sentinel-secret-hygiene', 'pack.sentinel-permission-audit',
  'pack.sentinel-automation-safety', 'pack.sentinel-policy-compliance', 'pack.sentinel-threat-detection',
  'pack.sentinel-csp-audit', 'pack.sentinel-dependency-audit', 'pack.sentinel-connector-gating',
  'pack.sentinel-runtime-monitoring', 'pack.sentinel-approval-enforcement', 'pack.sentinel-data-protection',
  'pack.sentinel-injection-scan', 'pack.sentinel-auth-audit', 'pack.sentinel-risk-scoring',
  'pack.sentinel-security-reporting'
];

beforeEach(() => { localStorage.clear(); });

describe('Sentinel skill pack contract validation', () => {
  it('all 16 new packs pass contract validation for sentinel', () => {
    const packs = listSkillPacks();
    SENTINEL_NEW_PACK_IDS.forEach((id) => {
      const pack = packs.find((p) => p.id === id);
      expect(pack).toBeDefined();
      const result = validateSkillPackAgainstContract('sentinel', pack.permissions, pack.id);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(`Pack ${id} failed: ${result.reason}`);
    });
  });
});

describe('Sentinel skill guidance loading', () => {
  it('loadAgentSkillGuidance returns all Sentinel packs', () => {
    const result = loadAgentSkillGuidance('sentinel');
    expect(result.agent).toBe('sentinel');
    expect(result.activeSkills).toHaveLength(19);
  });

  it('includes guidance for all new packs', () => {
    const result = loadAgentSkillGuidance('sentinel');
    const guidanceIds = result.guidance.map((g) => g.skillId);
    SENTINEL_NEW_PACK_IDS.forEach((id) => { expect(guidanceIds).toContain(id); });
  });
});

describe('Sentinel profile integration', () => {
  it('profile skillPackIds matches registry', () => {
    const packs = listSkillPacks();
    const registryIds = packs.filter((p) => p.ownerAgent === 'sentinel').map((p) => p.id);
    SENTINEL_PROFILE.skillPackIds.forEach((id) => { expect(registryIds).toContain(id); });
  });
});
