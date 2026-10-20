#!/usr/bin/env node
/**
 * Generate the source-backed half of the Do Not Duplicate map.
 *
 * The hand-maintained CLAUDE.md table remains the place for human purpose
 * descriptions. This inventory is deliberately mechanical: it records every
 * non-test service/component source file and the exports visible in that file,
 * so a new implementation cannot disappear from the map unnoticed.
 *
 * Usage:
 *   node scripts/generate-dnd-map.mjs          # write the generated doc
 *   node scripts/generate-dnd-map.mjs --check  # fail if the doc is stale
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { walk, PROJECT_ROOT } from './shared/counters.mjs';

const OUTPUT_PATH = join(PROJECT_ROOT, 'docs/DO_NOT_DUPLICATE.generated.md');
const SOURCE_ROOTS = [
  { directory: 'src/services', kind: 'service' },
  { directory: 'src/components', kind: 'component' }
];

function isSourceFile(filePath) {
  const normalized = filePath.replaceAll('\\', '/');
  const extension = normalized.split('.').pop();
  return ['js', 'jsx', 'ts', 'tsx'].includes(extension)
    && !normalized.includes('.test.')
    && !normalized.includes('.spec.')
    && !normalized.includes('/test/');
}

function parseExports(source) {
  const names = new Set();
  const patterns = [
    /export\s+(?:async\s+)?(?:function|class|const|let|var|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g,
    /export\s+default\s+(?:async\s+)?(?:function|class)\s*([A-Za-z_$][\w$]*)?/g,
    /export\s*\{([^}]+)\}/g
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source)) !== null) {
      if (pattern === patterns[2]) {
        match[1].split(',').forEach((entry) => {
          const name = entry.trim().split(/\s+as\s+/i).pop();
          if (name && /^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
        });
      } else if (match[1]) {
        names.add(match[1]);
      } else {
        names.add('default');
      }
    }
  }

  return [...names].sort((a, b) => a.localeCompare(b));
}

function collectEntries() {
  return SOURCE_ROOTS.flatMap(({ directory, kind }) => {
    const absoluteRoot = join(PROJECT_ROOT, directory);
    if (!existsSync(absoluteRoot)) throw new Error(`Missing source root: ${directory}`);
    return walk(absoluteRoot, isSourceFile).map((filePath) => {
      const relativePath = relative(PROJECT_ROOT, filePath).replaceAll('\\', '/');
      return {
        kind,
        path: relativePath,
        exports: parseExports(readFileSync(filePath, 'utf8'))
      };
    });
  }).sort((a, b) => a.path.localeCompare(b.path));
}

function render(entries) {
  const services = entries.filter((entry) => entry.kind === 'service').length;
  const components = entries.filter((entry) => entry.kind === 'component').length;
  const rows = entries.map((entry) => `| ${entry.kind} | \`${entry.path}\` | ${entry.exports.length ? entry.exports.map((name) => `\`${name}\``).join(', ') : '*(no static export detected)*'} |`);
  return [
    '<!-- GENERATED FILE — DO NOT EDIT. Run `npm run generate:dnd-map`. -->',
    '# Do Not Duplicate — Generated Source Inventory',
    '',
    `Source-backed inventory: ${services} services and ${components} components. Human purpose descriptions remain in [CLAUDE.md](../CLAUDE.md).`,
    '',
    '| Kind | Source file | Static exports |',
    '|---|---|---|',
    ...rows,
    ''
  ].join('\n');
}

const generated = render(collectEntries());
const check = process.argv.includes('--check');

if (check) {
  if (!existsSync(OUTPUT_PATH) || readFileSync(OUTPUT_PATH, 'utf8') !== generated) {
    console.error('[generate-dnd-map] Generated inventory is stale. Run npm run generate:dnd-map and commit the result.');
    process.exit(1);
  }
  console.log('[generate-dnd-map] Generated Do Not Duplicate inventory is fresh. ✓');
} else {
  writeFileSync(OUTPUT_PATH, generated, 'utf8');
  console.log(`[generate-dnd-map] Wrote ${relative(PROJECT_ROOT, OUTPUT_PATH)}.`);
}
