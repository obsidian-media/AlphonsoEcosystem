import { describe, expect, it } from 'vitest';
import { findUnaccepted, installedPackages } from '../../scripts/verify-npm-audit.mjs';

// The npm audit gate checks package-lock.json against npm's bulk advisory
// endpoint since npm retired the endpoint `npm audit` fell back to
// (2026-10-22). These pin down the matching rules.

describe('verify-npm-audit', () => {
  it('reads every installed package and version from package-lock.json', () => {
    const lock = {
      packages: {
        '': { name: 'app', version: '1.0.0' },
        'node_modules/a': { version: '1.0.0' },
        'node_modules/b/node_modules/a': { version: '2.0.0' },
        'node_modules/@scope/c': { version: '3.0.0' },
        'node_modules/linked': { link: true, resolved: 'packages/linked' },
      },
    };
    const installed = installedPackages(lock);
    expect([...installed.get('a')].sort()).toEqual(['1.0.0', '2.0.0']);
    expect([...installed.get('@scope/c')]).toEqual(['3.0.0']);
    expect(installed.has('linked')).toBe(false);
    expect(installed.has('')).toBe(false);
  });

  it('fails only on high/critical advisories that affect an installed version', () => {
    const installed = new Map([['lodash', new Set(['4.17.20'])], ['fixed', new Set(['2.0.0'])]]);
    const advisories = {
      lodash: [
        { id: 1, severity: 'high', vulnerable_versions: '<4.17.21', url: 'u1', title: 'prototype pollution' },
        { id: 2, severity: 'moderate', vulnerable_versions: '<9.0.0' },
      ],
      fixed: [{ id: 3, severity: 'critical', vulnerable_versions: '<1.0.0' }],
    };
    expect(findUnaccepted(advisories, installed)).toEqual([
      { name: 'lodash', versions: ['4.17.20'], severity: 'high', id: 1, url: 'u1', title: 'prototype pollution' },
    ]);
  });
});
