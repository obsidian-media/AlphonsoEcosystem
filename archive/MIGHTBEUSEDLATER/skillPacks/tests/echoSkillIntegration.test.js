import { beforeEach, describe, expect, it } from 'vitest';
import { listSkillPacks, loadAgentSkillGuidance } from '../services/skillPackService';
import { validateSkillPackAgainstContract } from '../services/agentContractService';
import { ECHO_PROFILE } from '../agents/echo/echoProfile';

const ECHO_NEW_PACK_IDS = [
  'pack.echo-decision-capture', 'pack.echo-retention-classification', 'pack.echo-confidence-normalization',
  'pack.echo-knowledge-indexing', 'pack.echo-historical-context', 'pack.echo-audit-trail',
  'pack.echo-memory-synthesis-advanced', 'pack.echo-context-retrieval', 'pack.echo-memory-pruning',
  'pack.echo-session-continuity', 'pack.echo-memory-validation', 'pack.echo-timeline-construction',
  'pack.echo-knowledge-graph', 'pack.echo-memory-reporting', 'pack.echo-preference-learning',
  'pack.echo-decision-diff'
];

beforeEach(() => { localStorage.clear(); });

describe('Echo skill pack contract validation', () => {
  it('all 16 new packs pass contract validation for echo', () => {
    const packs = listSkillPacks();
    ECHO_NEW_PACK_IDS.forEach((id) => {
      const pack = packs.find((p) => p.id === id);
      expect(pack).toBeDefined();
      const result = validateSkillPackAgainstContract('echo', pack.permissions, pack.id);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(`Pack ${id} failed: ${result.reason}`);
    });
  });
});

describe('Echo skill guidance loading', () => {
  it('loadAgentSkillGuidance returns all Echo packs', () => {
    const result = loadAgentSkillGuidance('echo');
    expect(result.agent).toBe('echo');
    expect(result.activeSkills).toHaveLength(17);
  });

  it('includes guidance for all new packs', () => {
    const result = loadAgentSkillGuidance('echo');
    const guidanceIds = result.guidance.map((g) => g.skillId);
    ECHO_NEW_PACK_IDS.forEach((id) => { expect(guidanceIds).toContain(id); });
  });
});

describe('Echo profile integration', () => {
  it('profile skillPackIds matches registry', () => {
    const packs = listSkillPacks();
    const registryIds = packs.map((p) => p.id);
    ECHO_PROFILE.skillPackIds.forEach((id) => { expect(registryIds).toContain(id); });
  });
});
