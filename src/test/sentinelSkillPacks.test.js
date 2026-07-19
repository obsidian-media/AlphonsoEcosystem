import { beforeEach, describe, expect, it } from 'vitest';
import { listSkillPacks } from '../services/skillPackService';
import { SENTINEL_PROFILE } from '../agents/sentinel/sentinelProfile';

const SENTINEL_PACK_IDS = [
  'pack.security.monitoring', 'pack.policy.audit', 'pack.sentinel-vuln-scan',
  'pack.sentinel-connector-risk', 'pack.sentinel-secret-hygiene', 'pack.sentinel-permission-audit',
  'pack.sentinel-automation-safety', 'pack.sentinel-policy-compliance', 'pack.sentinel-threat-detection',
  'pack.sentinel-csp-audit', 'pack.sentinel-dependency-audit', 'pack.sentinel-connector-gating',
  'pack.sentinel-runtime-monitoring', 'pack.sentinel-approval-enforcement', 'pack.sentinel-data-protection',
  'pack.sentinel-injection-scan', 'pack.sentinel-auth-audit', 'pack.sentinel-risk-scoring',
  'pack.sentinel-security-reporting'
];

beforeEach(() => { localStorage.clear(); });

describe('Sentinel skill packs', () => {
  it('has all 19 Sentinel skill packs in the registry', () => {
    const packs = listSkillPacks();
    const ids = packs.map((p) => p.id);
    SENTINEL_PACK_IDS.forEach((id) => { expect(ids).toContain(id); });
  });

  it('seeds exactly 19 Sentinel-owned packs', () => {
    const packs = listSkillPacks();
    const sentinelPacks = packs.filter((p) => p.ownerAgent === 'sentinel');
    expect(sentinelPacks).toHaveLength(19);
  });

  it('has valid manifest structure for all new Sentinel packs', () => {
    const packs = listSkillPacks();
    const existingIds = ['pack.security.monitoring', 'pack.policy.audit', 'pack.sentinel-vuln-scan'];
    SENTINEL_PACK_IDS.filter((id) => !existingIds.includes(id)).forEach((id) => {
      const pack = packs.find((p) => p.id === id);
      expect(pack).toBeDefined();
      expect(pack.version).toBe('1.0.0');
      expect(pack.enabled).toBe(true);
      expect(pack.category).toBe('agent_skill');
      expect(pack.ownerAgent).toBe('sentinel');
    });
  });

  it('all Sentinel pack IDs are in the profile skillPackIds', () => {
    SENTINEL_PACK_IDS.forEach((id) => { expect(SENTINEL_PROFILE.skillPackIds).toContain(id); });
  });

  it('profile skillPackIds has exactly 19 entries', () => {
    expect(SENTINEL_PROFILE.skillPackIds).toHaveLength(19);
  });

  it('has no duplicate pack IDs', () => {
    const packs = listSkillPacks();
    const sentinelPacks = packs.filter((p) => p.ownerAgent === 'sentinel');
    const ids = sentinelPacks.map((p) => p.id);
    expect(ids.length).toBe([...new Set(ids)].length);
  });
});

describe('Sentinel skill pack permissions', () => {
  it('all permissions use allowed prefixes (security., risk., permission., audit.)', () => {
    const packs = listSkillPacks();
    const allowedPrefixes = ['security.', 'risk.', 'permission.', 'audit.'];
    const existingIds = ['pack.security.monitoring', 'pack.policy.audit', 'pack.sentinel-vuln-scan'];
    SENTINEL_PACK_IDS.filter((id) => !existingIds.includes(id)).forEach((id) => {
      const pack = packs.find((p) => p.id === id);
      pack.permissions.forEach((permission) => {
        expect(allowedPrefixes.some((prefix) => permission.startsWith(prefix))).toBe(true);
      });
    });
  });
});
