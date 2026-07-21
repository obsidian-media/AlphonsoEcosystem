import { beforeEach, describe, expect, it } from 'vitest';
import { listSkillPacks } from '../services/skillPackService';
import { ALPHONSO_PROFILE } from '../agents/alphonso/alphonsoProfile';

const ALPHONSO_PACK_IDS = [
  'pack.codex-professional-coding',
  'pack.alphonso-runtime-operations',
  'pack.coding.full-stack',
  'pack.coding.tdd',
  'pack.alphonso-typescript-mastery',
  'pack.alphonso-rust-operations',
  'pack.alphonso-react-patterns',
  'pack.alphonso-python-voice',
  'pack.alphonso-code-review',
  'pack.alphonso-build-verification',
  'pack.alphonso-refactoring',
  'pack.debugging.root-cause',
  'pack.alphonso-runtime-diagnostics',
  'pack.alphonso-security-audit',
  'pack.github.integration',
  'pack.alphonso-performance-optimization',
  'pack.alphonso-api-integration',
  'pack.alphonso-error-handling'
];

beforeEach(() => {
  localStorage.clear();
});

describe('Alphonso skill packs', () => {
  it('has all 16 Alphonso skill packs in the registry', () => {
    const packs = listSkillPacks();
    const ids = packs.map((pack) => pack.id);

    ALPHONSO_PACK_IDS.forEach((id) => {
      expect(ids).toContain(id);
    });
  });

  it('seeds exactly 16 Alphonso-owned packs', () => {
    const packs = listSkillPacks();
    const alphonsoPacks = packs.filter((pack) => pack.ownerAgent === 'alphonso');
    expect(alphonsoPacks).toHaveLength(16);
  });

  it('has valid manifest structure for all Alphonso packs', () => {
    const packs = listSkillPacks();

    ALPHONSO_PACK_IDS.forEach((id) => {
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
      expect(pack.ownerAgent).toBe('alphonso');
      expect(pack.trust).toBeDefined();
    });
  });

  it('has exampleTasks for all new Alphonso packs', () => {
    const packs = listSkillPacks();

    const newPacks = ALPHONSO_PACK_IDS.filter(
      (id) => id !== 'pack.codex-professional-coding' && id !== 'pack.alphonso-runtime-operations'
    );

    newPacks.forEach((id) => {
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

  it('all Alphonso pack IDs are in the profile skillPackIds', () => {
    ALPHONSO_PACK_IDS.forEach((id) => {
      expect(ALPHONSO_PROFILE.skillPackIds).toContain(id);
    });
  });

  it('profile skillPackIds has exactly 18 entries (2 existing + 16 new)', () => {
    expect(ALPHONSO_PROFILE.skillPackIds).toHaveLength(18);
  });

  it('has no duplicate pack IDs', () => {
    const packs = listSkillPacks();
    const alphonsoPacks = packs.filter((pack) => pack.ownerAgent === 'alphonso');
    const ids = alphonsoPacks.map((p) => p.id);
    const uniqueIds = [...new Set(ids)];
    expect(ids.length).toBe(uniqueIds.length);
  });
});

describe('Alphonso skill pack permissions', () => {
  it('all permissions use allowed prefixes (code., runtime., verification_)', () => {
    const packs = listSkillPacks();
    const allowedPrefixes = ['code.', 'runtime.', 'verification_'];

    ALPHONSO_PACK_IDS.forEach((id) => {
      const pack = packs.find((p) => p.id === id);
      pack.permissions.forEach((permission) => {
        const matches = allowedPrefixes.some((prefix) => permission.startsWith(prefix));
        expect(matches).toBe(true);
      });
    });
  });

  it('core coding packs have correct permissions', () => {
    const packs = listSkillPacks();

    const fullStack = packs.find((p) => p.id === 'pack.coding.full-stack');
    expect(fullStack.permissions).toContain('code.write');
    expect(fullStack.permissions).toContain('code.edit');
    expect(fullStack.permissions).toContain('code.refactor');
    expect(fullStack.permissions).toContain('runtime.test');

    const tdd = packs.find((p) => p.id === 'pack.coding.tdd');
    expect(tdd.permissions).toContain('code.test.first');
    expect(tdd.permissions).toContain('code.test.verify');
    expect(tdd.permissions).toContain('code.refactor.minimal');
  });

  it('language-specific packs have correct permissions', () => {
    const packs = listSkillPacks();

    const ts = packs.find((p) => p.id === 'pack.alphonso-typescript-mastery');
    expect(ts.permissions).toContain('code.typescript.strict');
    expect(ts.permissions).toContain('code.typescript.types');
    expect(ts.permissions).toContain('code.typescript.refactor');

    const rust = packs.find((p) => p.id === 'pack.alphonso-rust-operations');
    expect(rust.permissions).toContain('code.rust.tauri');
    expect(rust.permissions).toContain('code.rust.async');
    expect(rust.permissions).toContain('code.rust.error_handling');

    const react = packs.find((p) => p.id === 'pack.alphonso-react-patterns');
    expect(react.permissions).toContain('code.react.hooks');
    expect(react.permissions).toContain('code.react.components');
    expect(react.permissions).toContain('code.react.performance');

    const python = packs.find((p) => p.id === 'pack.alphonso-python-voice');
    expect(python.permissions).toContain('code.python.fastapi');
    expect(python.permissions).toContain('code.python.testing');
    expect(python.permissions).toContain('code.python.async');
  });

  it('verification packs have correct permissions', () => {
    const packs = listSkillPacks();

    const build = packs.find((p) => p.id === 'pack.alphonso-build-verification');
    expect(build.permissions).toContain('verification.build');
    expect(build.permissions).toContain('verification.test');
    expect(build.permissions).toContain('verification.lint');
    expect(build.permissions).toContain('verification.typecheck');

    const security = packs.find((p) => p.id === 'pack.alphonso-security-audit');
    expect(security.permissions).toContain('verification.security.scan');
    expect(security.permissions).toContain('verification.security.review');
    expect(security.permissions).toContain('verification.security.harden');
    expect(security.permissions).toContain('verification.secrets.check');
  });
});
