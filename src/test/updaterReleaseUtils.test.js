import { describe, expect, it } from 'vitest';
import { buildUpdaterManifest, parseGithubRepository, resolveUpdaterBaseUrl, resolveUpdaterReleaseTag } from '../../scripts/updaterReleaseUtils.mjs';

describe('updater release utils', () => {
  it('parses github repository shorthand and derives a release base url', () => {
    expect(parseGithubRepository('https://github.com/shaya/alphonso.git')).toEqual({
      owner: 'shaya',
      repo: 'alphonso'
    });

    expect(resolveUpdaterReleaseTag('0.1.0', '')).toBe('v0.1.0');
    expect(resolveUpdaterBaseUrl({
      githubRepository: 'shaya/alphonso',
      version: '0.1.0'
    })).toBe('https://github.com/shaya/alphonso/releases/download/v0.1.0');
  });

  it('builds a static updater manifest with the expected release asset url', () => {
    const manifest = buildUpdaterManifest({
      version: '0.1.0',
      baseUrl: 'https://github.com/shaya/alphonso/releases/download/v0.1.0',
      fileName: 'Alphonso_0.1.0_x64-setup.exe',
      signature: 'sig'
    });

    expect(manifest.platforms['windows-x86_64'].url).toContain('Alphonso_0.1.0_x64-setup.exe');
    expect(manifest.platforms['windows-x86_64'].signature).toBe('sig');
  });
});
