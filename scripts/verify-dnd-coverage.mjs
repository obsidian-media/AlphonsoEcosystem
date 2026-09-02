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

// Extract all backticked paths referencing src/ components or services
const pathRegex = /`((?:src)\/[^`\s]+?\.(?:js|jsx|ts|tsx))`/g;
const docPaths = new Set();
let match;
while ((match = pathRegex.exec(claudeText)) !== null) {
  docPaths.add(match[1].trim().replaceAll('\\', '/'));
}

// Walk through physical source files in src/services and src/components
const activeFiles = walk(join(PROJECT_ROOT, 'src'), (f) => {
  const ext = f.split('.').pop();
  const isCode = ['js', 'jsx', 'ts', 'tsx'].includes(ext);
  const isTest = f.includes('.test.') || f.includes('.spec.') || f.includes('/test/');
  const isStyle = f.includes('/styles/') || f.includes('index.css') || f.includes('tokens.css');
  const inUnderlyingDirs = f.includes('/services/') || f.includes('/components/') || f.includes('/hooks/') || f.includes('/lib/');
  return isCode && !isTest && !isStyle && inUnderlyingDirs;
});

const relativeSrcFiles = activeFiles.map(f => {
  return f
    .replace(PROJECT_ROOT + '/', '')
    .replace(PROJECT_ROOT + '\\', '')
    .replaceAll('\\', '/');
});

const missingFromDoc = relativeSrcFiles.filter(f => !docPaths.has(f));

if (missingFromDoc.length > 0) {
  console.error(`\n[verify-dnd-coverage] Found ${missingFromDoc.length} files missing from CLAUDE.md "Do Not Duplicate" list:`);
  missingFromDoc.forEach(f => console.error(`  - ${f}`));
  console.error('\nAdd them to CLAUDE.md\'s "Do Not Duplicate" table with their respective purpose and descriptions.');
  process.exit(1);
} else {
  console.log('[verify-dnd-coverage] All components and services are fully documented in CLAUDE.md. ✓');
  process.exit(0);
}
