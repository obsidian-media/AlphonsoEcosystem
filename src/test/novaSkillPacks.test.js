import { beforeEach, describe, expect, it } from 'vitest';
import { listSkillPacks } from '../services/skillPackService';
import { NOVA_PROFILE } from '../agents/nova/novaProfile';

const NOVA_PACK_IDS = [
  'pack.analysis.opportunities', 'pack.trends.scoring', 'pack.nova-opportunity-analysis',
  'pack.nova-market-analysis', 'pack.nova-prioritization-matrix', 'pack.nova-risk-reward',
  'pack.nova-timing-analysis', 'pack.nova-effort-estimation', 'pack.nova-strategic-alignment',
  'pack.nova-growth-analysis', 'pack.nova-competitive-intelligence', 'pack.nova-value-scoring',
  'pack.nova-resource-optimization', 'pack.nova-scenario-modeling', 'pack.nova-decision-support',
  'pack.nova-capability-assessment', 'pack.nova-trend-forecasting', 'pack.nova-portfolio-analysis',
  'pack.nova-recommendation-engine'
];

beforeEach(() => { localStorage.clear(); });

describe('Nova skill packs', () => {
  it('has all 19 Nova skill packs in the registry', () => {
    const packs = listSkillPacks();
    const ids = packs.map((p) => p.id);
    NOVA_PACK_IDS.forEach((id) => { expect(ids).toContain(id); });
  });

  it('seeds exactly 19 Nova-owned packs', () => {
    const packs = listSkillPacks();
    const novaPacks = packs.filter((p) => p.ownerAgent === 'nova');
    expect(novaPacks).toHaveLength(19);
  });

  it('has valid manifest structure for all new Nova packs', () => {
    const packs = listSkillPacks();
    const existingIds = ['pack.analysis.opportunities', 'pack.trends.scoring', 'pack.nova-opportunity-analysis'];
    NOVA_PACK_IDS.filter((id) => !existingIds.includes(id)).forEach((id) => {
      const pack = packs.find((p) => p.id === id);
      expect(pack).toBeDefined();
      expect(pack.version).toBe('1.0.0');
      expect(pack.enabled).toBe(true);
      expect(pack.category).toBe('agent_skill');
      expect(pack.ownerAgent).toBe('nova');
    });
  });

  it('all Nova pack IDs are in the profile skillPackIds', () => {
    NOVA_PACK_IDS.forEach((id) => { expect(NOVA_PROFILE.skillPackIds).toContain(id); });
  });

  it('profile skillPackIds has exactly 19 entries', () => {
    expect(NOVA_PROFILE.skillPackIds).toHaveLength(19);
  });

  it('has no duplicate pack IDs', () => {
    const packs = listSkillPacks();
    const novaPacks = packs.filter((p) => p.ownerAgent === 'nova');
    const ids = novaPacks.map((p) => p.id);
    expect(ids.length).toBe([...new Set(ids)].length);
  });
});

describe('Nova skill pack permissions', () => {
  it('all permissions use allowed prefixes (opportunity., analysis., prioritization., strategy.)', () => {
    const packs = listSkillPacks();
    const allowedPrefixes = ['opportunity.', 'analysis.', 'prioritization.', 'strategy.'];
    const existingIds = ['pack.analysis.opportunities', 'pack.trends.scoring', 'pack.nova-opportunity-analysis'];
    NOVA_PACK_IDS.filter((id) => !existingIds.includes(id)).forEach((id) => {
      const pack = packs.find((p) => p.id === id);
      pack.permissions.forEach((permission) => {
        expect(allowedPrefixes.some((prefix) => permission.startsWith(prefix))).toBe(true);
      });
    });
  });
});
