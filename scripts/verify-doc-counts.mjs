#!/usr/bin/env node
/**
 * Alphonso — Doc Count Freshness Verifier
 *
 * CI-runnable script that computes actual repo counts and compares
 * them against numeric claims embedded in key documentation files.
 * Exits 1 on any mismatch — fails CI so stale docs never merge.
 *
 * Usage:
 *   node scripts/verify-doc-counts.mjs
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAllCounts } from './shared/counters.mjs';

const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = resolve(dirname(__filename), '..');

// Read the real current version from package.json rather than a hardcoded
// string — a hardcoded version constant here goes stale on every release and
// silently starts flagging correct docs as wrong (see CLAUDE.md's "Last
// verified" entry for the 2.4.4/2.5.9 version-drift incident this is meant
// to prevent from recurring).
const PACKAGE_JSON = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf8'));
const CURRENT_VERSION = PACKAGE_JSON.version;
const CURRENT_VITE_MAJOR = String(PACKAGE_JSON.devDependencies.vite).match(/\d+/)?.[0];

const TRUTH_PATTERNS = [
  { file: 'docs/ALPHONSO_GROUND_TRUTH.md', label: 'current version', pattern: new RegExp(`\\| Version \\| ${CURRENT_VERSION.replaceAll('.', '\\.')} \\|`) },
  { file: 'docs/ALPHONSO_GROUND_TRUTH.md', label: 'Vite major', pattern: new RegExp(`Vite ${CURRENT_VITE_MAJOR}`) },
  { file: 'ARCHITECTURE.md', label: 'Vite major', pattern: new RegExp(`Vite ${CURRENT_VITE_MAJOR}`) },
  { file: 'AGENTS.md', label: 'Vite major', pattern: new RegExp(`Vite ${CURRENT_VITE_MAJOR}`) },
];

// Total test count (files + individual tests) is not reliably derivable via
// static analysis (dynamic test generation, describe.each, etc. make grep-based
// counting inaccurate) — same reasoning getAllCounts() already applies to test
// file counts. This must be updated by hand when the suite's test count changes
// materially; verified against the actual `npm test` output as of 2026-07-05.
const CURRENT_TOTAL_TESTS = '3,255';

// Each entry defines a claim to verify:
//   file        — relative path from project root
//   label       — human-readable description
//   pattern     — regex with capture group wrapping the numeric claim
//   actualFn    — returns the true current value
//   multiLine   — if true, search across the whole file (not line by line)
const CLAIMS = [
  // ── README.md ────────────────────────────────────────────────
  {
    file: 'README.md',
    label: 'version badge',
    pattern: /version-([\d.]+)-blue/,
    actualFn: () => CURRENT_VERSION
  },
  // NOTE: the "tests-N%20passing" shields.io badge was removed from README.md's
  // badge row in the Sprint 5 batch 3 commit (v2.5.11) — this claim intentionally
  // has no entry anymore since checking for a doc element that was deliberately
  // removed is validation for a scenario that can no longer occur.
  {
    file: 'README.md',
    label: 'subtitle version',
    pattern: /> \*\*v([\d.]+)\*\*/,
    actualFn: () => CURRENT_VERSION
  },
  {
    file: 'README.md',
    label: 'architecture lib.rs lines',
    pattern: /lib\.rs ~([\d,]+) lines/,
    actualFn: () => getAllCounts().libRs.nonEmptyLines
  },
  {
    file: 'README.md',
    label: 'architecture Tauri commands',
    pattern: /(\d+) Tauri commands/,
    actualFn: () => getAllCounts().tauriCommands
  },
  {
    file: 'README.md',
    label: 'architecture modules',
    pattern: /(\d+) modules\s+│/,
    actualFn: () => getAllCounts().rustSource.modules.length
  },
  {
    file: 'README.md',
    label: 'dev test command count',
    pattern: /# ([\d,]+) tests across/,
    actualFn: () => CURRENT_TOTAL_TESTS
  },
  {
    file: 'README.md',
    label: 'dev test command files',
    pattern: /([\d,]+) tests across (\d+) files/,
    actualFn: () => getAllCounts().tests.files,
    group: 2
  },
  {
    file: 'README.md',
    label: 'contributing services count',
    pattern: /(\d+) services already exist/,
    actualFn: () => getAllCounts().services.files
  },

  {
    file: 'README.md',
    label: 'What\'s New Rust unit tests',
    pattern: /(\d+) Rust unit tests across (\d+) modules/,
    actualFn: () => getAllCounts().rustTests
  },
  {
    file: 'README.md',
    label: "What's New modules count",
    pattern: /(\d+) Rust unit tests across (\d+) modules/,
    actualFn: () => getAllCounts().rustSource.modules.length,
    group: 2
  },

  // ── ARCHITECTURE.md ─────────────────────────────────────────
  {
    file: 'ARCHITECTURE.md',
    label: 'lib.rs lines',
    pattern: /lib\.rs.*~([\d,]+) lines/,
    actualFn: () => getAllCounts().libRs.nonEmptyLines
  },
  {
    file: 'ARCHITECTURE.md',
    label: 'extracted modules',
    pattern: /(\d+) modules in src/,
    actualFn: () => getAllCounts().rustSource.modules.length
  },

  // ── AGENTS.md ──────────────────────────────────────────────
  {
    file: 'AGENTS.md',
    label: 'version',
    pattern: /Version\*\*: ([\d.]+)/,
    actualFn: () => CURRENT_VERSION
  },
  {
    file: 'AGENTS.md',
    label: 'directory structure services',
    pattern: /services\/\s+(\d+) services/,
    actualFn: () => getAllCounts().services.files
  },
  {
    file: 'AGENTS.md',
    label: 'directory structure test files',
    pattern: /test\/\s+(\d+) test files/,
    actualFn: () => getAllCounts().tests.files
  },
  {
    file: 'AGENTS.md',
    label: 'directory structure tests count',
    pattern: /test files, ([\d,]+) tests/,
    actualFn: () => CURRENT_TOTAL_TESTS
  },
  {
    file: 'AGENTS.md',
    label: 'directory structure lib.rs lines',
    pattern: /lib\.rs\s+~([\d,]+) lines/,
    actualFn: () => getAllCounts().libRs.nonEmptyLines
  },
  {
    file: 'AGENTS.md',
    label: 'directory structure Tauri commands',
    pattern: /([\d,]+) Tauri commands/,
    actualFn: () => getAllCounts().tauriCommands
  },
  {
    file: 'AGENTS.md',
    label: 'directory structure modules',
    pattern: /across (\d+) modules/,
    actualFn: () => getAllCounts().rustSource.modules.length
  },
  {
    file: 'AGENTS.md',
    label: 'build commands test count',
    pattern: /# ([\d,]+) tests \(/,
    actualFn: () => CURRENT_TOTAL_TESTS
  },
  {
    file: 'AGENTS.md',
    label: 'build commands test files',
    pattern: /# ([\d,]+) tests \((\d+) files/,
    actualFn: () => getAllCounts().tests.files,
    group: 2
  },
];

function formatCount(n) {
  if (typeof n === 'number') return n.toLocaleString('en-US');
  return String(n);
}

function main() {
  let exitCode = 0;
  const issues = [];

  // Pre-compute once
  const counts = getAllCounts();

  for (const claim of TRUTH_PATTERNS) {
    const content = readFileSync(join(PROJECT_ROOT, claim.file), 'utf8');
    if (!claim.pattern.test(content)) {
      issues.push({ file: claim.file, label: claim.label, error: `expected ${claim.pattern}` });
      if (exitCode === 0) exitCode = 1;
    }
  }

  for (const claim of CLAIMS) {
    const filePath = join(PROJECT_ROOT, claim.file);
    let content;
    try {
      content = readFileSync(filePath, 'utf8');
    } catch {
      issues.push({ file: claim.file, label: claim.label, error: 'file not found' });
      if (exitCode === 0) exitCode = 1;
      continue;
    }

    const match = content.match(claim.pattern);
    if (!match) {
      issues.push({ file: claim.file, label: claim.label, error: 'pattern no match', actual: String(claim.actualFn()) });
      if (exitCode === 0) exitCode = 1;
      continue;
    }

    const group = claim.group || 1;
    const claimedRaw = match[group];
    const actualRaw = claim.actualFn();
    const actualStr = formatCount(actualRaw);

    // Normalize for comparison
    const claimedNorm = claimedRaw.replace(/,/g, '');
    const actualNorm = actualStr.replace(/,/g, '');

    if (claimedNorm !== actualNorm) {
      issues.push({
        file: claim.file,
        label: claim.label,
        line: match.index !== undefined ? `~${content.substring(0, match.index).split('\n').length}` : '?',
        claimed: claimedRaw,
        actual: actualStr
      });
      if (exitCode === 0) exitCode = 1;
    }
  }

  if (issues.length === 0) {
    process.stdout.write('[verify-doc-counts] All doc counts verified fresh. ✓\n');
    process.exit(0);
  }

  process.stdout.write(`[verify-doc-counts] ${issues.length} stale doc count(s):\n\n`);
  for (const issue of issues) {
    if (issue.error) {
      process.stdout.write(`  ✗ ${issue.file} — ${issue.label}: ${issue.error}`);
      if (issue.actual) process.stdout.write(` (actual: ${issue.actual})`);
      process.stdout.write('\n');
    } else {
      process.stdout.write(`  ✗ ${issue.file}:${issue.line} — ${issue.label}: "${issue.claimed}" → should be "${issue.actual}"\n`);
    }
  }
  process.stdout.write('\n');
  process.exit(exitCode);
}

main();
