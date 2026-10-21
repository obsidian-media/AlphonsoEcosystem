import { describe, expect, it } from 'vitest';
import {
  findTauriVersionMismatches,
  parseCargoTauriVersions,
  parseNpmTauriVersions
} from '../../scripts/verify-tauri-versions.mjs';

const CARGO_LOCK = `
[[package]]
name = "serde"
version = "1.0.0"

[[package]]
name = "tauri"
version = "2.12.3"

[[package]]
name = "tauri-build"
version = "2.6.0"

[[package]]
name = "tauri-plugin-updater"
version = "2.14.0"
`;

describe('verify-tauri-versions', () => {
  it('reads only the tauri crate and its plugins from Cargo.lock', () => {
    expect(parseCargoTauriVersions(CARGO_LOCK)).toEqual({
      tauri: '2.12.3',
      'tauri-plugin-updater': '2.14.0'
    });
  });

  it('reads api, cli and plugin packages from package-lock.json', () => {
    const lock = {
      packages: {
        'node_modules/@tauri-apps/api': { version: '2.12.3' },
        'node_modules/@tauri-apps/cli': { version: '2.12.2' },
        'node_modules/@tauri-apps/cli-win32-x64-msvc': { version: '2.12.2' },
        'node_modules/@tauri-apps/plugin-updater': { version: '2.14.0' },
        'node_modules/react': { version: '19.2.8' }
      }
    };
    expect(parseNpmTauriVersions(lock)).toEqual({
      '@tauri-apps/api': '2.12.3',
      '@tauri-apps/cli': '2.12.2',
      '@tauri-apps/plugin-updater': '2.14.0'
    });
  });

  it('accepts matching major.minor versions with different patch levels', () => {
    expect(findTauriVersionMismatches(
      { '@tauri-apps/api': '2.12.3', '@tauri-apps/cli': '2.12.2', '@tauri-apps/plugin-updater': '2.14.0' },
      { tauri: '2.12.3', 'tauri-plugin-updater': '2.14.5', 'tauri-plugin-dialog': '2.7.2' }
    )).toEqual([]);
  });

  it('flags a minor mismatch between the api package and the tauri crate', () => {
    const problems = findTauriVersionMismatches({ '@tauri-apps/api': '2.13.0' }, { tauri: '2.12.3' });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/@tauri-apps\/api 2\.13\.0 does not match the tauri crate 2\.12\.3/);
  });

  it('flags a plugin bumped on one side only', () => {
    const problems = findTauriVersionMismatches(
      { '@tauri-apps/plugin-notification': '2.3.3' },
      { tauri: '2.12.3', 'tauri-plugin-notification': '2.6.0' }
    );
    expect(problems).toEqual([
      '@tauri-apps/plugin-notification 2.3.3 does not match tauri-plugin-notification 2.6.0 (major.minor must be equal)'
    ]);
  });

  it('flags a JS plugin that has no Rust plugin behind it', () => {
    const problems = findTauriVersionMismatches(
      { '@tauri-apps/plugin-process': '2.3.1' },
      { tauri: '2.12.3' }
    );
    expect(problems).toEqual([
      '@tauri-apps/plugin-process 2.3.1 has no tauri-plugin-process crate, so its calls fail at runtime'
    ]);
  });
});
