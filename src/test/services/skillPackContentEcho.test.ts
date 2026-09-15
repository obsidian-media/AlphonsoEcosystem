import { describe, it, expect } from 'vitest';

import { ECHO_BASE_PACKS } from '../../services/skillPackContentEcho';

describe('skillPackContentEcho', () => {
  it('exports ECHO_BASE_PACKS as array', () => {
    expect(Array.isArray(ECHO_BASE_PACKS)).toBe(true);
  });
  it('has at least 5 packs', () => {
    expect(ECHO_BASE_PACKS.length).toBeGreaterThanOrEqual(5);
  });
  it('each pack has required fields', () => {
    for (const pack of ECHO_BASE_PACKS) {
      expect(typeof pack.id).toBe('string');
      expect(typeof pack.name).toBe('string');
      expect(typeof pack.version).toBe('string');
      expect(typeof pack.enabled).toBe('boolean');
      expect(Array.isArray(pack.permissions)).toBe(true);
      expect(typeof pack.ownerAgent).toBe('string');
    }
  });
  it('pack ids start with pack.', () => {
    for (const pack of ECHO_BASE_PACKS) {
      expect(pack.id).toMatch(/^pack\./);
    }
  });
});
