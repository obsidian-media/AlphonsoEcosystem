import { describe, it, expect } from 'vitest';

import { DEFAULT_PACKS } from '../../services/skillPackContent';

describe('skillPackContent', () => {
  it('exports DEFAULT_PACKS as an array', () => {
    expect(Array.isArray(DEFAULT_PACKS)).toBe(true);
  });
  it('DEFAULT_PACKS has entries from all agent base packs', () => {
    expect(DEFAULT_PACKS.length).toBeGreaterThan(50);
  });
  it('each pack has required fields', () => {
    for (const pack of DEFAULT_PACKS) {
      expect(typeof pack.id).toBe('string');
      expect(typeof pack.name).toBe('string');
      expect(typeof pack.version).toBe('string');
      expect(typeof pack.enabled).toBe('boolean');
      expect(Array.isArray(pack.permissions)).toBe(true);
    }
  });
});
