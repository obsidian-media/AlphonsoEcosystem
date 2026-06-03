#!/usr/bin/env node

/**
 * Version Bump Script for Alphonso
 * 
 * Updates version in:
 * - package.json
 * - src-tauri/Cargo.toml
 * - src-tauri/tauri.conf.json
 * 
 * Usage:
 *   node scripts/bump-version.mjs patch    # 0.1.0 -> 0.1.1
 *   node scripts/bump-version.mjs minor    # 0.1.0 -> 0.2.0
 *   node scripts/bump-version.mjs major    # 0.1.0 -> 1.0.0
 *   node scripts/bump-version.mjs 1.2.3    # explicit version
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('Usage: node scripts/bump-version.mjs <patch|minor|major|x.y.z>');
  process.exit(1);
}

// Read current versions
const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
const cargoToml = readFileSync(join(ROOT, 'src-tauri', 'Cargo.toml'), 'utf-8');
const tauriConf = JSON.parse(readFileSync(join(ROOT, 'src-tauri', 'tauri.conf.json'), 'utf-8'));

const currentVersion = packageJson.version;
console.log(`Current version: ${currentVersion}`);

// Calculate new version
function calculateNewVersion(current, bump) {
  const [major, minor, patch] = current.split('.').map(Number);
  
  switch (bump) {
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'major':
      return `${major + 1}.0.0`;
    default:
      // Assume explicit version
      if (/^\d+\.\d+\.\d+$/.test(bump)) {
        return bump;
      }
      throw new Error(`Invalid version bump: ${bump}`);
  }
}

const newVersion = calculateNewVersion(currentVersion, args[0]);
console.log(`New version: ${newVersion}`);

// Confirm
console.log('\nFiles to update:');
console.log('  - package.json');
console.log('  - src-tauri/Cargo.toml');
console.log('  - src-tauri/tauri.conf.json');

// Update package.json
packageJson.version = newVersion;
writeFileSync(join(ROOT, 'package.json'), JSON.stringify(packageJson, null, 2) + '\n');
console.log('✓ Updated package.json');

// Update Cargo.toml
const newCargoToml = cargoToml.replace(
  /^(version\s*=\s*)"[^"]*"/m,
  `$1"${newVersion}"`
);
writeFileSync(join(ROOT, 'src-tauri', 'Cargo.toml'), newCargoToml);
console.log('✓ Updated src-tauri/Cargo.toml');

// Update tauri.conf.json
tauriConf.version = newVersion;
writeFileSync(join(ROOT, 'src-tauri', 'tauri.conf.json'), JSON.stringify(tauriConf, null, 2) + '\n');
console.log('✓ Updated src-tauri/tauri.conf.json');

console.log(`\nVersion bumped: ${currentVersion} → ${newVersion}`);
console.log('\nNext steps:');
console.log('  1. Review changes: git diff');
console.log('  2. Commit: git commit -am "chore: bump version to ' + newVersion + '"');
console.log('  3. Tag: git tag v' + newVersion);
console.log('  4. Push: git push && git push --tags');
