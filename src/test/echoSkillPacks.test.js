import { beforeEach, describe, expect, it } from 'vitest';
import { listSkillPacks } from '../services/skillPackService';
import { ECHO_PROFILE } from '../agents/echo/echoProfile';

const ECHO_PACK_IDS = [
  'pack.memory.archival', 'pack.memory.historian', 'pack.echo-memory-synthesis',
  'pack.echo-decision-capture', 'pack.echo-retention-classification', 'pack.echo-confidence-normalization',
  'pack.echo-knowledge-indexing', 'pack.echo-historical-context', 'pack.echo-audit-trail',
  'pack.echo-memory-synthesis-advanced', 'pack.echo-context-retrieval', 'pack.echo-memory-pruning',
  'pack.echo-session-continuity', 'pack.echo-memory-validation', 'pack.echo-timeline-construction',
  'pack.echo-knowledge-graph', 'pack.echo-memory-reporting', 'pack.echo-preference-learning',
  'pack.echo-decision-diff'
];

beforeEach(() => { localStorage.clear(); });

describe('Echo skill packs', () => {
  it('has all 19 Echo skill packs in the registry', () => {
    const packs = listSkillPacks();
    const ids = packs.map((p) => p.id);
    ECHO_PACK_IDS.forEach((id) => { expect(ids).toContain(id); });
  });

  it('seeds exactly 19 Echo-owned packs', () => {
    const packs = listSkillPacks();
    const echoPacks = packs.filter((p) => p.ownerAgent === 'echo');
    expect(echoPacks).toHaveLength(19);
  });

  it('has valid manifest structure for all new Echo packs', () => {
    const packs = listSkillPacks();
    const existingIds = ['pack.memory.archival', 'pack.memory.historian', 'pack.echo-memory-synthesis'];
    ECHO_PACK_IDS.filter((id) => !existingIds.includes(id)).forEach((id) => {
      const pack = packs.find((p) => p.id === id);
      expect(pack).toBeDefined();
      expect(pack.version).toBe('1.0.0');
      expect(pack.enabled).toBe(true);
      expect(pack.category).toBe('agent_skill');
      expect(pack.ownerAgent).toBe('echo');
    });
  });

  it('all Echo pack IDs are in the profile skillPackIds', () => {
    ECHO_PACK_IDS.forEach((id) => { expect(ECHO_PROFILE.skillPackIds).toContain(id); });
  });

  it('profile skillPackIds has exactly 19 entries', () => {
    expect(ECHO_PROFILE.skillPackIds).toHaveLength(19);
  });

  it('has no duplicate pack IDs', () => {
    const packs = listSkillPacks();
    const echoPacks = packs.filter((p) => p.ownerAgent === 'echo');
    const ids = echoPacks.map((p) => p.id);
    expect(ids.length).toBe([...new Set(ids)].length);
  });
});

describe('Echo skill pack permissions', () => {
  it('all permissions use allowed prefixes (memory., retention., knowledge., timeline.)', () => {
    const packs = listSkillPacks();
    const allowedPrefixes = ['memory.', 'retention.', 'knowledge.', 'timeline.'];
    const existingIds = ['pack.memory.archival', 'pack.memory.historian', 'pack.echo-memory-synthesis'];
    ECHO_PACK_IDS.filter((id) => !existingIds.includes(id)).forEach((id) => {
      const pack = packs.find((p) => p.id === id);
      pack.permissions.forEach((permission) => {
        expect(allowedPrefixes.some((prefix) => permission.startsWith(prefix))).toBe(true);
      });
    });
  });
});
