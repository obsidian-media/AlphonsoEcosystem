#!/usr/bin/env node
/**
 * Alphonso — Shared Repo Counters
 *
 * Single import for all repo-scanning utilities.
 * Used by export-ground-truth.mjs and verify-doc-counts.mjs
 * to ensure consistent counting across scripts.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export const PROJECT_ROOT = resolve(__dirname, '..', '..');

export const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.opencode', '.vscode', '.idea', 'target', 'release-artifacts', 'coverage']);
export const RUST_EXT = new Set(['.rs']);
export const JS_EXT = new Set(['.js', '.jsx', '.mjs', '.cjs']);
export const TS_EXT = new Set(['.ts', '.tsx']);
export const ALL_JS_TS = new Set([...JS_EXT, ...TS_EXT]);
export const MD_EXT = new Set(['.md']);
export const COMPONENT_EXT = new Set(['.jsx', '.tsx']);
export const TEST_EXT = new Set(['.js', '.jsx', '.ts']);

export function walk(dir, predicate, results = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.opencode') continue;
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, predicate, results);
    } else if (entry.isFile()) {
      if (predicate(full)) results.push(full);
    }
  }
  return results;
}

export function countLines(path) {
  try {
    const text = readFileSync(path, 'utf8');
    if (text.length === 0) return 0;
    return text.split(/\r?\n/).filter((line) => line.length > 0).length;
  } catch {
    return 0;
  }
}

export function totalLines(path) {
  try {
    const text = readFileSync(path, 'utf8');
    return text.split(/\r?\n/).length;
  } catch {
    return 0;
  }
}

export function byExt(extensions) {
  return (path) => extensions.has(extname(path).toLowerCase());
}

export function countInDir(relDir, predicate) {
  const full = join(PROJECT_ROOT, relDir);
  if (!existsSync(full)) return { files: 0, lines: 0, paths: [] };
  const files = walk(full, predicate);
  const lines = files.reduce((acc, f) => acc + countLines(f), 0);
  return { files: files.length, lines, paths: files.map((f) => relative(PROJECT_ROOT, f)) };
}

export function countAllInDir(relDir, exts) {
  return countInDir(relDir, byExt(exts));
}

export function countPattern(files, pattern) {
  let total = 0;
  for (const f of files) {
    try {
      const text = readFileSync(f, 'utf8');
      const re = new RegExp(pattern, 'g');
      total += (text.match(re) || []).length;
    } catch {
      // skip unreadable files
    }
  }
  return total;
}

export function countTauriCommands(rustDir) {
  const full = join(PROJECT_ROOT, rustDir);
  if (!existsSync(full)) return 0;
  const files = walk(full, byExt(RUST_EXT));
  return countPattern(files, '#\\[tauri::command\\]');
}

export function countRustTests(rustDir) {
  const full = join(PROJECT_ROOT, rustDir);
  if (!existsSync(full)) return 0;
  const files = walk(full, byExt(RUST_EXT));
  return countPattern(files, '#\\[test\\]');
}

export function isTestFile(path) {
  const base = path.split(/[/\\]/).pop() || '';
  return /\.(test|spec)\.(js|jsx|ts|tsx)$/i.test(base);
}

export function getAllCounts() {
  const libRsPath = join(PROJECT_ROOT, 'src-tauri', 'src', 'lib.rs');
  const libRsNonEmpty = countLines(libRsPath);
  const libRsTotal = totalLines(libRsPath);
  const rustFiles = countAllInDir('src-tauri/src', RUST_EXT);
  const services = countAllInDir('src/services', ALL_JS_TS);
  const servicesJs = countAllInDir('src/services', JS_EXT);
  const servicesTs = countAllInDir('src/services', TS_EXT);
  const components = countAllInDir('src/components', COMPONENT_EXT);
  const agents = countAllInDir('src/agents', JS_EXT);
  const hooks = countAllInDir('src/hooks', ALL_JS_TS);
  const docs = countAllInDir('docs', MD_EXT);
  const scripts = countAllInDir('scripts', JS_EXT);

  // Count test files matching vitest's *.test.* / *.spec.* pattern
  const allTestFiles = walk(join(PROJECT_ROOT, 'src/test'), (p) => isTestFile(p) && byExt(TEST_EXT)(p));
  const testJsFiles = allTestFiles.filter((f) => f.toLowerCase().endsWith('.js'));
  const testJsxFiles = allTestFiles.filter((f) => f.toLowerCase().endsWith('.jsx'));
  const testTsFiles = allTestFiles.filter((f) => /\.tsx?$/i.test(f));
  const testJs = { files: testJsFiles.length, lines: testJsFiles.reduce((acc, f) => acc + countLines(f), 0) };
  const testJsx = { files: testJsxFiles.length, lines: testJsxFiles.reduce((acc, f) => acc + countLines(f), 0) };
  const testTs = { files: testTsFiles.length, lines: testTsFiles.reduce((acc, f) => acc + countLines(f), 0) };
  const testAll = { files: allTestFiles.length, lines: allTestFiles.reduce((acc, f) => acc + countLines(f), 0) };
  const tauriCommands = countTauriCommands('src-tauri/src');
  const rustTests = countRustTests('src-tauri/src');
  const rustFilesPaths = walk(join(PROJECT_ROOT, 'src-tauri/src'), byExt(RUST_EXT));
  const rustModules = rustFilesPaths.map((f) => relative(join(PROJECT_ROOT, 'src-tauri/src'), f));

  return {
    libRs: { nonEmptyLines: libRsNonEmpty, totalLines: libRsTotal },
    rustSource: { files: rustFiles.files, lines: rustFiles.lines, modules: rustModules },
    services: { files: services.files, lines: services.lines, js: servicesJs.files, ts: servicesTs.files },
    components: { files: components.files, lines: components.lines },
    agents: { files: agents.files, lines: agents.lines },
    hooks: { files: hooks.files, lines: hooks.lines },
    tests: { files: testAll.files, lines: testAll.lines, js: testJs.files, jsx: testJsx.files, ts: testTs.files },
    docs: { files: docs.files, lines: docs.lines },
    scripts: { files: scripts.files, lines: scripts.lines },
    tauriCommands,
    rustTests
  };
}
