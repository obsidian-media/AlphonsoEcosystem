import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../services/trustModel', () => ({
  timestampMs: vi.fn(() => 1700000000000),
  TRUST_STATES: { VERIFIED: 'verified', TEMPORARY: 'temporary', FAILED: 'failed', UNVERIFIED: 'unverified' }
}));

vi.mock('../services/skillPackPermissions', () => ({
  validateSkillPackAgainstContract: vi.fn(() => ({ ok: true }))
}));

vi.mock('../services/skillPackContent', () => ({
  DEFAULT_PACKS: [
    { id: 'pack.default-1', name: 'Default Pack', version: '1.0.0', enabled: true, permissions: ['test'], category: 'default' }
  ]
}));

describe('skillPackRegistry', () => {
  let registry;

  beforeEach(async () => {
    localStorage.clear();
    vi.clearAllMocks();
    registry = await import('../services/skillPackRegistry');
  });

  describe('listSkillPacks', () => {
    it('returns DEFAULT_PACKS when localStorage is empty', () => {
      const packs = registry.listSkillPacks();
      expect(packs.length).toBeGreaterThan(0);
      expect(packs[0].id).toBe('pack.default-1');
    });

    it('returns stored packs from localStorage', () => {
      const stored = [{ id: 'pack.stored', name: 'Stored', version: '1.0.0', enabled: true, permissions: [] }];
      localStorage.setItem('alphonso_skill_packs_v1', JSON.stringify(stored));
      const packs = registry.listSkillPacks();
      expect(packs[0].id).toBe('pack.stored');
    });

    it('returns defaults if localStorage has non-array', () => {
      localStorage.setItem('alphonso_skill_packs_v1', JSON.stringify('not an array'));
      const packs = registry.listSkillPacks();
      expect(packs[0].id).toBe('pack.default-1');
    });
  });

  describe('validateSkillPackManifest', () => {
    it('rejects null manifest', () => {
      const result = registry.validateSkillPackManifest(null);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('rejects missing id', () => {
      const result = registry.validateSkillPackManifest({ name: 'x', version: '1', permissions: [] });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing manifest id.');
    });

    it('rejects missing name', () => {
      const result = registry.validateSkillPackManifest({ id: 'x', version: '1', permissions: [] });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing manifest name.');
    });

    it('rejects missing version', () => {
      const result = registry.validateSkillPackManifest({ id: 'x', name: 'x', permissions: [] });
      expect(result.valid).toBe(false);
    });

    it('rejects non-array permissions', () => {
      const result = registry.validateSkillPackManifest({ id: 'x', name: 'x', version: '1', permissions: 'bad' });
      expect(result.valid).toBe(false);
    });

    it('accepts valid manifest', () => {
      const result = registry.validateSkillPackManifest({
        id: 'pack.test', name: 'Test', version: '1.0.0', permissions: ['read']
      });
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });
  });

  describe('installSkillPack', () => {
    it('installs a valid manifest', () => {
      const result = registry.installSkillPack({
        id: 'pack.new', name: 'New', version: '1.0.0', ownerAgent: 'alphonso', permissions: ['test']
      });
      expect(result.installed).toBe(true);
      expect(result.pack.id).toBe('pack.new');
      expect(result.pack.trust).toBe('temporary');
    });

    it('rejects invalid manifest', () => {
      const result = registry.installSkillPack({ id: null });
      expect(result.installed).toBe(false);
    });

    it('blocks install if contract check fails', async () => {
      const { validateSkillPackAgainstContract } = await import('../services/skillPackPermissions');
      validateSkillPackAgainstContract.mockReturnValueOnce({ ok: false, reason: 'blocked by contract' });
      const result = registry.installSkillPack({
        id: 'pack.bad', name: 'Bad', version: '1.0.0', ownerAgent: 'alphonso', permissions: ['test']
      });
      expect(result.installed).toBe(false);
    });

    it('overwrites existing pack with same id', () => {
      registry.installSkillPack({
        id: 'pack.dup', name: 'Dup v1', version: '1.0.0', ownerAgent: 'alphonso', permissions: ['test']
      });
      registry.installSkillPack({
        id: 'pack.dup', name: 'Dup v2', version: '2.0.0', ownerAgent: 'alphonso', permissions: ['test']
      });
      const packs = registry.listSkillPacks().filter(p => p.id === 'pack.dup');
      expect(packs.length).toBe(1);
      expect(packs[0].version).toBe('2.0.0');
    });
  });

  describe('setSkillPackEnabled', () => {
    it('disables a pack', () => {
      registry.installSkillPack({
        id: 'pack.toggle', name: 'Toggle', version: '1.0.0', ownerAgent: 'alphonso', permissions: ['test']
      });
      const packs = registry.setSkillPackEnabled('pack.toggle', false);
      const pack = packs.find(p => p.id === 'pack.toggle');
      expect(pack.enabled).toBe(false);
    });

    it('re-enables a pack', () => {
      registry.installSkillPack({
        id: 'pack.toggle2', name: 'Toggle2', version: '1.0.0', ownerAgent: 'alphonso', permissions: ['test']
      });
      registry.setSkillPackEnabled('pack.toggle2', false);
      const packs = registry.setSkillPackEnabled('pack.toggle2', true);
      const pack = packs.find(p => p.id === 'pack.toggle2');
      expect(pack.enabled).toBe(true);
    });

    it('returns unchanged list for nonexistent pack', () => {
      const before = registry.listSkillPacks();
      const after = registry.setSkillPackEnabled('nonexistent', true);
      expect(after.length).toBe(before.length);
    });
  });

  describe('uninstallSkillPack', () => {
    it('removes a pack', () => {
      registry.installSkillPack({
        id: 'pack.rm', name: 'Remove', version: '1.0.0', ownerAgent: 'alphonso', permissions: ['test']
      });
      const packs = registry.uninstallSkillPack('pack.rm');
      expect(packs.find(p => p.id === 'pack.rm')).toBeUndefined();
    });
  });

  describe('loadAgentSkillGuidance', () => {
    it('returns guidance for an agent', () => {
      registry.installSkillPack({
        id: 'pack.codex-professional-coding', name: 'Codex', version: '1.0.0',
        ownerAgent: 'alphonso', permissions: ['code.review']
      });
      const result = registry.loadAgentSkillGuidance('alphonso');
      expect(result.agent).toBe('alphonso');
      expect(result.activeSkills).toContain('pack.codex-professional-coding');
      expect(result.guidance.length).toBeGreaterThan(0);
      expect(result.recommendedSteps.length).toBeGreaterThan(0);
    });

    it('includes shared packs for jose', () => {
      registry.installSkillPack({
        id: 'pack.workflow.executing-plans', name: 'Exec Plans', version: '1.0.0',
        permissions: ['execution.steps']
      });
      const result = registry.loadAgentSkillGuidance('jose');
      expect(result.activeSkills).toContain('pack.workflow.executing-plans');
    });

    it('returns empty for agent with no packs', () => {
      const result = registry.loadAgentSkillGuidance('nova');
      expect(result.activeSkills.length).toBe(0);
    });
  });

  describe('recordSkillPackInvocation', () => {
    it('records invocation timestamp', () => {
      registry.recordSkillPackInvocation('pack.test-invocation');
      const last = registry.getSkillPackLastInvoked('pack.test-invocation');
      expect(last).toBeTypeOf('number');
      expect(last).toBeGreaterThan(0);
    });
  });

  describe('getSkillPackLastInvoked', () => {
    it('returns null for never-invoked pack', () => {
      expect(registry.getSkillPackLastInvoked('pack.never')).toBeNull();
    });
  });

  describe('listSkillPackAudit', () => {
    it('returns audit trail', () => {
      registry.installSkillPack({
        id: 'pack.audit-test', name: 'Audit', version: '1.0.0', ownerAgent: 'alphonso', permissions: ['test']
      });
      const audit = registry.listSkillPackAudit();
      expect(audit.length).toBeGreaterThan(0);
      expect(audit[0].action).toBe('install');
    });
  });
});
