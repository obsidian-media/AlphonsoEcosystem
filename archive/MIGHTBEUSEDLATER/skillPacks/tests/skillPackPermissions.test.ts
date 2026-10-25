import { describe, it, expect } from 'vitest';

import { validateSkillPackAgainstContract } from '../../services/skillPackPermissions';

describe('skillPackPermissions', () => {
  it('re-exports validateSkillPackAgainstContract', () => {
    expect(typeof validateSkillPackAgainstContract).toBe('function');
  });
});
