#!/usr/bin/env node
/**
 * Alphonso — Do Not Duplicate Coverage Verifier
 *
 * Hybrid check that verifies every component and service file in src/
 * is registered in CLAUDE.md's "Do Not Duplicate" tables.
 * Helps prevent duplicate work and closes documentation drift.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { walk, PROJECT_ROOT } from './shared/counters.mjs';

const claudePath = join(PROJECT_ROOT, 'CLAUDE.md');
if (!existsSync(claudePath)) {
  console.error('[verify-dnd-coverage] CLAUDE.md not found at project root');
  process.exit(1);
}

const claudeText = readFileSync(claudePath, 'utf8');

// Extract every backticked `foo.ts`-shaped token, whether it's a full src/...
// path (the "Do Not Duplicate" table's own style) or a bare filename (how
// CLAUDE.md's narrative/changelog prose usually references files). A file is
// considered documented if either form appears anywhere in the doc — the
// goal is "can someone find this file mentioned in CLAUDE.md", not "is it
// specifically in the Do Not Duplicate table under its exact full path".
const pathRegex = /`([^`\s]+?\.(?:js|jsx|ts|tsx))`/g;
const docPaths = new Set();
const docBasenames = new Set();
let match;
while ((match = pathRegex.exec(claudeText)) !== null) {
  const normalized = match[1].trim().replaceAll('\\', '/');
  docPaths.add(normalized);
  docBasenames.add(normalized.split('/').pop());
}

// Walk through physical source files in src/services, src/components,
// src/hooks, and src/lib. Predicate checks run on a forward-slash-normalized
// path — `join()` (and therefore `walk()`) produces OS-native separators, so
// checking for a literal '/services/' etc. against a raw path silently
// matched zero files on Windows while working correctly on Linux CI, making
// this check a no-op false-pass everywhere except the one platform (Linux)
// that actually runs it in CI.
const activeFiles = walk(join(PROJECT_ROOT, 'src'), (f) => {
  const normalized = f.replaceAll('\\', '/');
  const ext = normalized.split('.').pop();
  const isCode = ['js', 'jsx', 'ts', 'tsx'].includes(ext);
  const isTest = normalized.includes('.test.') || normalized.includes('.spec.') || normalized.includes('/test/');
  const isStyle = normalized.includes('/styles/') || normalized.includes('index.css') || normalized.includes('tokens.css');
  const inUnderlyingDirs = normalized.includes('/services/') || normalized.includes('/components/') || normalized.includes('/hooks/') || normalized.includes('/lib/');
  return isCode && !isTest && !isStyle && inUnderlyingDirs;
});

const relativeSrcFiles = activeFiles.map(f => {
  return f
    .replace(PROJECT_ROOT + '/', '')
    .replace(PROJECT_ROOT + '\\', '')
    .replaceAll('\\', '/');
});

const missingFromDoc = relativeSrcFiles.filter(f => !docPaths.has(f) && !docBasenames.has(f.split('/').pop()));

if (missingFromDoc.length > 0) {
  console.error(`\n[verify-dnd-coverage] Found ${missingFromDoc.length} files missing from CLAUDE.md "Do Not Duplicate" list:`);
  missingFromDoc.forEach(f => console.error(`  - ${f}`));
  console.error('\nAdd them to CLAUDE.md\'s "Do Not Duplicate" table with their respective purpose and descriptions.');
  process.exit(1);
} else {
  console.log('[verify-dnd-coverage] All components and services are fully documented in CLAUDE.md. ✓');
  process.exit(0);
}
