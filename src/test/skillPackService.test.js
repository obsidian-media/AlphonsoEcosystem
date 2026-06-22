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
