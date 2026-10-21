#!/usr/bin/env node
/**
 * Alphonso — Tauri crate / npm version check
 *
 * The Tauri CLI refuses to build when a Rust crate and its npm counterpart
 * sit on different major.minor versions, and a JS plugin with no Rust plugin
 * behind it fails at runtime instead. The desktop build jobs only run on
 * `main`, so a Dependabot bump of one side used to pass every PR check and
 * break the release build after merging (see DEFERRED_WORK.md, 2026-10-12).
 * This check runs in Test & Build on every PR and compares the resolved
 * versions in both lockfiles:
 *
 *   - `@tauri-apps/api` and `@tauri-apps/cli` must match the `tauri` crate.
 *   - every `@tauri-apps/plugin-<name>` must have a `tauri-plugin-<name>`
 *     crate on the same major.minor. Rust-only plugins are fine.
 *
 * Usage: node scripts/verify-tauri-versions.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const CORE_NPM_PACKAGES = ['@tauri-apps/api', '@tauri-apps/cli'];
const NPM_PLUGIN_PREFIX = '@tauri-apps/plugin-';

/** Resolved `@tauri-apps/*` versions from a parsed package-lock.json. */
export function parseNpmTauriVersions(packageLock) {
  const versions = {};
  for (const [key, entry] of Object.entries(packageLock?.packages || {})) {
    const match = key.match(/^node_modules\/(@tauri-apps\/[a-z0-9-]+)$/);
    if (!match || !entry?.version) continue;
    const name = match[1];
    if (CORE_NPM_PACKAGES.includes(name) || name.startsWith(NPM_PLUGIN_PREFIX)) {
      versions[name] = entry.version;
    }
  }
  return versions;
}

/** Resolved `tauri` and `tauri-plugin-*` versions from Cargo.lock text. */
export function parseCargoTauriVersions(cargoLock) {
  const versions = {};
  for (const block of String(cargoLock).split('[[package]]')) {
    const name = block.match(/^name = "([^"]+)"/m)?.[1];
    const version = block.match(/^version = "([^"]+)"/m)?.[1];
    if (name && version && /^tauri(-plugin-[a-z0-9-]+)?$/.test(name)) {
      versions[name] = version;
    }
  }
  return versions;
}

function majorMinor(version) {
  const [major, minor] = String(version).split('.');
  return `${major}.${minor}`;
}

/** Human-readable problems; an empty array means the versions line up. */
export function findTauriVersionMismatches(npmVersions, crateVersions) {
  const problems = [];
  const tauriCrate = crateVersions.tauri;

  for (const name of CORE_NPM_PACKAGES) {
    const npmVersion = npmVersions[name];
    if (!npmVersion) continue;
    if (!tauriCrate) {
      problems.push(`${name} ${npmVersion} is installed but the tauri crate is missing from Cargo.lock`);
    } else if (majorMinor(npmVersion) !== majorMinor(tauriCrate)) {
      problems.push(`${name} ${npmVersion} does not match the tauri crate ${tauriCrate} (major.minor must be equal)`);
    }
  }

  for (const [name, npmVersion] of Object.entries(npmVersions)) {
    if (!name.startsWith(NPM_PLUGIN_PREFIX)) continue;
    const crateName = `tauri-plugin-${name.slice(NPM_PLUGIN_PREFIX.length)}`;
    const crateVersion = crateVersions[crateName];
    if (!crateVersion) {
      problems.push(`${name} ${npmVersion} has no ${crateName} crate, so its calls fail at runtime`);
    } else if (majorMinor(npmVersion) !== majorMinor(crateVersion)) {
      problems.push(`${name} ${npmVersion} does not match ${crateName} ${crateVersion} (major.minor must be equal)`);
    }
  }

  return problems;
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const npmVersions = parseNpmTauriVersions(JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8')));
  const crateVersions = parseCargoTauriVersions(readFileSync(path.join(root, 'src-tauri', 'Cargo.lock'), 'utf8'));
  const problems = findTauriVersionMismatches(npmVersions, crateVersions);

  if (problems.length > 0) {
    console.error('[verify-tauri-versions] Tauri crate and npm versions do not line up:');
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error('Bump both sides together (package.json and src-tauri/Cargo.toml), then refresh both lockfiles.');
    process.exit(1);
  }
  console.log(`[verify-tauri-versions] ${Object.keys(npmVersions).length} npm packages match their Tauri crates. ✓`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
