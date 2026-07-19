import { beforeEach, describe, expect, it } from 'vitest';
import { listSkillPacks, loadAgentSkillGuidance } from '../services/skillPackService';
import { validateSkillPackAgainstContract } from '../services/agentContractService';
import { NOVA_PROFILE } from '../agents/nova/novaProfile';

const NOVA_NEW_PACK_IDS = [
  'pack.nova-market-analysis', 'pack.nova-prioritization-matrix', 'pack.nova-risk-reward',
  'pack.nova-timing-analysis', 'pack.nova-effort-estimation', 'pack.nova-strategic-alignment',
  'pack.nova-growth-analysis', 'pack.nova-competitive-intelligence', 'pack.nova-value-scoring',
  'pack.nova-resource-optimization', 'pack.nova-scenario-modeling', 'pack.nova-decision-support',
  'pack.nova-capability-assessment', 'pack.nova-trend-forecasting', 'pack.nova-portfolio-analysis',
  'pack.nova-recommendation-engine'
];

beforeEach(() => { localStorage.clear(); });

describe('Nova skill pack contract validation', () => {
  it('all 16 new packs pass contract validation for nova', () => {
    const packs = listSkillPacks();
    NOVA_NEW_PACK_IDS.forEach((id) => {
      const pack = packs.find((p) => p.id === id);
      expect(pack).toBeDefined();
      const result = validateSkillPackAgainstContract('nova', pack.permissions, pack.id);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(`Pack ${id} failed: ${result.reason}`);
    });
  });
});

describe('Nova skill guidance loading', () => {
  it('loadAgentSkillGuidance returns all Nova packs', () => {
    const result = loadAgentSkillGuidance('nova');
    expect(result.agent).toBe('nova');
    expect(result.activeSkills).toHaveLength(19);
  });

  it('includes guidance for all new packs', () => {
    const result = loadAgentSkillGuidance('nova');
    const guidanceIds = result.guidance.map((g) => g.skillId);
    NOVA_NEW_PACK_IDS.forEach((id) => { expect(guidanceIds).toContain(id); });
  });
});

describe('Nova profile integration', () => {
  it('profile skillPackIds matches registry', () => {
    const packs = listSkillPacks();
    const registryIds = packs.filter((p) => p.ownerAgent === 'nova').map((p) => p.id);
    NOVA_PROFILE.skillPackIds.forEach((id) => { expect(registryIds).toContain(id); });
  });
});
