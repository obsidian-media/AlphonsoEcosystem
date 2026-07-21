import { beforeEach, describe, expect, it } from 'vitest';
import { listSkillPacks } from '../services/skillPackService';
import { HECTOR_PROFILE } from '../agents/hector/hectorProfile';

const HECTOR_PACK_IDS = [
  'pack.hector-professional-marketing',
  'pack.hector-market-research',
  'pack.hector-competitive-analysis',
  'pack.hector-source-verification',
  'pack.hector-rss-monitoring',
  'pack.workflow.executing-plans',
  'pack.github.research',
  'pack.hector-api-documentation-research',
  'pack.hector-compliance-research',
  'pack.hector-trend-analysis',
  'pack.hector-code-pattern-research',
  'pack.hector-api-integration-research',
  'pack.hector-security-research',
  'pack.hector-technical-architecture-research',
  'pack.hector-open-source-analysis',
  'pack.hector-market-intelligence',
  'pack.hector-data-gathering',
  'pack.hector-content-research',
  'pack.hector-documentation-audit',
  'pack.hector-survey-design',
  'pack.hector-source-curation',
  'pack.hector-confidence-scoring',
  'pack.hector-research-briefing'
];

beforeEach(() => {
  localStorage.clear();
});

describe('Hector skill packs', () => {
  it('has all 23 Hector skill packs in the registry', () => {
    const packs = listSkillPacks();
    const ids = packs.map((pack) => pack.id);

    HECTOR_PACK_IDS.forEach((id) => {
      expect(ids).toContain(id);
    });
  });

  it('seeds exactly 23 Hector-owned packs', () => {
    const packs = listSkillPacks();
    const hectorPacks = packs.filter((pack) => pack.ownerAgent === 'hector');
    expect(hectorPacks).toHaveLength(23);
  });

  it('has valid manifest structure for all new Hector packs', () => {
    const packs = listSkillPacks();

    const newPackIds = HECTOR_PACK_IDS.filter(
      (id) => !['pack.hector-professional-marketing', 'pack.hector-market-research', 'pack.hector-competitive-analysis', 'pack.hector-source-verification', 'pack.hector-rss-monitoring', 'pack.workflow.executing-plans', 'pack.github.research'].includes(id)
    );

    newPackIds.forEach((id) => {
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
      expect(pack.ownerAgent).toBe('hector');
      expect(pack.trust).toBeDefined();
    });
  });

  it('has exampleTasks for all new Hector packs', () => {
    const packs = listSkillPacks();

    const newPackIds = HECTOR_PACK_IDS.filter(
      (id) => !['pack.hector-professional-marketing', 'pack.hector-market-research', 'pack.hector-competitive-analysis', 'pack.hector-source-verification', 'pack.hector-rss-monitoring', 'pack.workflow.executing-plans', 'pack.github.research'].includes(id)
    );

    newPackIds.forEach((id) => {
      const pack = packs.find((p) => p.id === id);
      expect(pack).toBeDefined();
      expect(Array.isArray(pack.exampleTasks)).toBe(true);
      expect(pack.exampleTasks.length).toBeGreaterThanOrEqual(2);
      pack.exampleTasks.forEach((task) => {
        expect(typeof task).toBe('string');
        expect(task.length).toBeGreaterThan(0);
      });
    });
  });

  it('all Hector pack IDs are in the profile skillPackIds', () => {
    HECTOR_PACK_IDS.forEach((id) => {
      expect(HECTOR_PROFILE.skillPackIds).toContain(id);
    });
  });

  it('profile skillPackIds has exactly 23 entries', () => {
    expect(HECTOR_PROFILE.skillPackIds).toHaveLength(23);
  });

  it('has no duplicate pack IDs', () => {
    const packs = listSkillPacks();
    const hectorPacks = packs.filter((pack) => pack.ownerAgent === 'hector');
    const ids = hectorPacks.map((p) => p.id);
    const uniqueIds = [...new Set(ids)];
    expect(ids.length).toBe(uniqueIds.length);
  });
});

describe('Hector skill pack permissions', () => {
  it('all permissions use allowed prefixes', () => {
    const packs = listSkillPacks();
    const allowedPrefixes = ['market_research', 'content_strategy', 'campaign_planning', 'workflow_review', 'research', 'competitive_scan', 'source_verification', 'citation_gathering', 'confidence_scoring', 'feed_monitoring'];

    const newPackIds = HECTOR_PACK_IDS.filter(
      (id) => !['pack.hector-professional-marketing', 'pack.hector-market-research', 'pack.hector-competitive-analysis', 'pack.hector-source-verification', 'pack.hector-rss-monitoring', 'pack.workflow.executing-plans', 'pack.github.research'].includes(id)
    );

    newPackIds.forEach((id) => {
      const pack = packs.find((p) => p.id === id);
      pack.permissions.forEach((permission) => {
        const matches = allowedPrefixes.some((prefix) => permission.startsWith(prefix));
        expect(matches).toBe(true);
      });
    });
  });

  it('API research packs have correct permissions', () => {
    const packs = listSkillPacks();

    const apiDoc = packs.find((p) => p.id === 'pack.hector-api-documentation-research');
    expect(apiDoc.permissions).toContain('research');
    expect(apiDoc.permissions).toContain('source_verification');
    expect(apiDoc.permissions).toContain('citation_gathering');

    const apiIntegration = packs.find((p) => p.id === 'pack.hector-api-integration-research');
    expect(apiIntegration.permissions).toContain('research');
    expect(apiIntegration.permissions).toContain('source_verification');
    expect(apiIntegration.permissions).toContain('citation_gathering');
  });

  it('security and compliance packs have correct permissions', () => {
    const packs = listSkillPacks();

    const security = packs.find((p) => p.id === 'pack.hector-security-research');
    expect(security.permissions).toContain('research');
    expect(security.permissions).toContain('source_verification');
    expect(security.permissions).toContain('confidence_scoring');

    const compliance = packs.find((p) => p.id === 'pack.hector-compliance-research');
    expect(compliance.permissions).toContain('research');
    expect(compliance.permissions).toContain('source_verification');
    expect(compliance.permissions).toContain('confidence_scoring');
  });

  it('market and competitive packs have correct permissions', () => {
    const packs = listSkillPacks();

    const marketIntel = packs.find((p) => p.id === 'pack.hector-market-intelligence');
    expect(marketIntel.permissions).toContain('market_research');
    expect(marketIntel.permissions).toContain('competitive_scan');
    expect(marketIntel.permissions).toContain('content_strategy');

    const trendAnalysis = packs.find((p) => p.id === 'pack.hector-trend-analysis');
    expect(trendAnalysis.permissions).toContain('market_research');
    expect(trendAnalysis.permissions).toContain('competitive_scan');
    expect(trendAnalysis.permissions).toContain('citation_gathering');
  });
});
