import { vi, describe, it, expect, beforeEach } from 'vitest';
import {
  listSkillPacks,
  listSkillPackAudit,
  validateSkillPackManifest,
  installSkillPack,
  setSkillPackEnabled,
  uninstallSkillPack,
  loadAgentSkillGuidance
} from '../services/skillPackService';

beforeEach(() => {
  localStorage.clear();
});

describe('validateSkillPackManifest', () => {
  it('returns valid for a complete manifest', () => {
    const result = validateSkillPackManifest({
      id: 'pack.test',
      name: 'Test Pack',
      version: '1.0.0',
      permissions: ['memory.read']
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('returns errors for missing required fields', () => {
    const result = validateSkillPackManifest({});
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('returns error when permissions is not an array', () => {
    const result = validateSkillPackManifest({ id: 'pack.x', name: 'X', version: '1.0.0', permissions: 'bad' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /permissions/i.test(e))).toBe(true);
  });

  it('returns error for null manifest', () => {
    const result = validateSkillPackManifest(null);
    expect(result.valid).toBe(false);
  });
});

describe('listSkillPacks', () => {
  it('returns default packs on first call when storage is empty', () => {
    const packs = listSkillPacks();
    expect(Array.isArray(packs)).toBe(true);
    expect(packs.length).toBeGreaterThan(0);
  });

  it('returns packs from storage when already written', () => {
    listSkillPacks(); // seeds storage
    const packs = listSkillPacks();
    expect(packs.length).toBeGreaterThan(0);
  });
});

describe('installSkillPack', () => {
  it('installs a valid pack and returns installed: true', () => {
    const result = installSkillPack({
      id: 'pack.custom-test',
      name: 'Custom Test',
      version: '2.0.0',
      permissions: ['runtime.read']
    });
    expect(result.installed).toBe(true);
    expect(result.pack.id).toBe('pack.custom-test');
  });

  it('does not install an invalid manifest', () => {
    const result = installSkillPack({ name: 'No ID' });
    expect(result.installed).toBe(false);
    expect(result.validation.valid).toBe(false);
  });

  it('replaces an existing pack with the same id', () => {
    const manifest = { id: 'pack.dup', name: 'Dup', version: '1.0.0', permissions: [] };
    installSkillPack(manifest);
    installSkillPack({ ...manifest, version: '2.0.0' });
    const packs = listSkillPacks().filter((p) => p.id === 'pack.dup');
    expect(packs).toHaveLength(1);
    expect(packs[0].version).toBe('2.0.0');
  });

  describe('regression: per-pack least-privilege enforcement (Truth-First plan C2)', () => {
    // These exercise the exact free-form "paste a manifest" path
    // (EcosystemHub.tsx's runInstallSkillPack) a user could use to reuse an
    // existing taxonomy pack's id with broader permissions than that pack
    // actually declares. Before C2's fix, a usesAgentWideTaxonomyScope bypass
    // meant this would have silently succeeded as long as the pasted
    // permissions stayed within the OWNING AGENT's full agent-wide list —
    // this proves that gap is now closed for real, not just reasoned about.

    it('re-installing a real Hector taxonomy pack with its own default permissions still succeeds', () => {
      const result = installSkillPack({
        id: 'pack.hector-api-documentation-research',
        name: 'Hector API Documentation Research',
        version: '1.0.0',
        permissions: ['research', 'source_verification', 'citation_gathering'],
        ownerAgent: 'hector',
        category: 'agent_skill'
      });
      expect(result.installed).toBe(true);
    });

    it('rejects a pasted manifest that reuses an existing Hector taxonomy pack id but widens its permissions to another Hector pack\'s scope', () => {
      const result = installSkillPack({
        id: 'pack.hector-api-documentation-research',
        name: 'Hector API Documentation Research (tampered)',
        version: '1.0.0',
        // 'campaign_planning' is valid for Hector generally (agent-wide list)
        // but not for this specific pack's own declared scope.
        permissions: ['campaign_planning'],
        ownerAgent: 'hector',
        category: 'agent_skill'
      });
      expect(result.installed).toBe(false);
      expect(result.validation.valid).toBe(false);
    });

    it('re-enabling an already-installed default Echo taxonomy pack still succeeds (setSkillPackEnabled re-validates on enable)', () => {
      installSkillPack({
        id: 'pack.echo-decision-capture',
        name: 'Echo Decision Capture',
        version: '1.0.0',
        permissions: ['memory.decisions', 'knowledge.context', 'timeline.decisions'],
        ownerAgent: 'echo',
        category: 'agent_skill',
        enabled: false
      });
      const packs = setSkillPackEnabled('pack.echo-decision-capture', true);
      const target = packs.find((p) => p.id === 'pack.echo-decision-capture');
      expect(target.enabled).toBe(true);
    });

    it('blocks re-enabling a pack whose stored permissions were widened beyond its own scope by an older app version', () => {
      // installSkillPack() already gates on validateSkillPackAgainstContract
      // at install time (pre-existing, not part of this session's change),
      // so a tampered manifest can't reach storage through that path anymore
      // (proved by the two tests above). The scenario this test actually
      // covers is different and realistic: a pack that was persisted to
      // localStorage BEFORE this session's C2 fix, back when the
      // usesAgentWideTaxonomyScope bypass let install-time validation pass
      // permissions outside the pack's real scope. Simulating that by
      // writing directly to the storage key (bypassing installSkillPack's
      // own gate, the same way an old on-disk record would) proves
      // setSkillPackEnabled's own re-validation-on-enable is a real second
      // gate, not a no-op — it must independently reject stale/tampered
      // records this fix's install-time check never had a chance to see.
      localStorage.setItem('alphonso_skill_packs_v1', JSON.stringify([{
        id: 'pack.echo-decision-capture',
        name: 'Echo Decision Capture (pre-fix, over-broad)',
        version: '1.0.0',
        permissions: ['retention.prune'], // belongs to a different Echo pack's scope
        ownerAgent: 'echo',
        category: 'agent_skill',
        enabled: false
      }]));
      const packs = setSkillPackEnabled('pack.echo-decision-capture', true);
      const target = packs.find((p) => p.id === 'pack.echo-decision-capture');
      expect(target.enabled).toBe(false);
    });
  });
});

describe('setSkillPackEnabled', () => {
  it('disables a pack', () => {
    installSkillPack({ id: 'pack.tog', name: 'Toggle', version: '1.0.0', permissions: [] });
    setSkillPackEnabled('pack.tog', false);
    const pack = listSkillPacks().find((p) => p.id === 'pack.tog');
    expect(pack.enabled).toBe(false);
  });

  it('re-enables a disabled pack', () => {
    installSkillPack({ id: 'pack.tog2', name: 'Toggle2', version: '1.0.0', permissions: [] });
    setSkillPackEnabled('pack.tog2', false);
    setSkillPackEnabled('pack.tog2', true);
    const pack = listSkillPacks().find((p) => p.id === 'pack.tog2');
    expect(pack.enabled).toBe(true);
  });
});

describe('uninstallSkillPack', () => {
  it('removes the pack from storage', () => {
    installSkillPack({ id: 'pack.remove', name: 'Remove', version: '1.0.0', permissions: [] });
    uninstallSkillPack('pack.remove');
    const pack = listSkillPacks().find((p) => p.id === 'pack.remove');
    expect(pack).toBeUndefined();
  });
});

describe('listSkillPackAudit', () => {
  it('records an audit entry after install', () => {
    installSkillPack({ id: 'pack.audit-test', name: 'Audit Test', version: '1.0.0', permissions: [] });
    const audit = listSkillPackAudit();
    expect(audit.some((e) => e.packId === 'pack.audit-test' && e.action === 'install')).toBe(true);
  });

  it('returns [] when no audit exists', () => {
    expect(listSkillPackAudit()).toEqual([]);
  });
});

describe('loadAgentSkillGuidance', () => {
  it('returns an object with agent and activeSkills', () => {
    const result = loadAgentSkillGuidance('jose');
    expect(result.agent).toBe('jose');
    expect(Array.isArray(result.activeSkills)).toBe(true);
    expect(Array.isArray(result.guidance)).toBe(true);
  });

  it('includes jose-owned skills in activeSkills', () => {
    const result = loadAgentSkillGuidance('jose');
    expect(result.activeSkills.some((id) => id.includes('jose'))).toBe(true);
  });
});
