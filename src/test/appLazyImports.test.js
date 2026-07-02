import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Regression guard for the exact bug found in the Sprint 3 discoverability
// audit (2026-07-02): App.tsx did `lazy(() => import('./components/BoardroomView'))`
// with no `.then((mod) => ({ default: mod.X }))` mapping, but BoardroomView.tsx
// only has a named export — React.lazy resolved `undefined` as the component
// type and crashed the whole app the moment a user opened the Boardroom
// Sessions tab. This test parses every `lazy(() => import(...))` call in
// App.tsx and verifies each target module's actual export shape matches what
// the lazy() call expects, so this class of bug can't silently reappear.
describe('App.tsx lazy() imports resolve a real default export', () => {
  const appTsxPath = path.resolve(__dirname, '../App.tsx');
  const appSrc = fs.readFileSync(appTsxPath, 'utf-8');

  // Matches: lazy(() => import('./path')) optionally followed by
  // .then((mod) => ({ default: mod.Y }))
  const importPattern = /lazy\(\(\)\s*=>\s*import\((['"])([^'"]+)\1\)/g;
  const calls = [...appSrc.matchAll(importPattern)].map((m) => {
    const importPath = m[2];
    const tailStart = m.index + m[0].length;
    const tail = appSrc.slice(tailStart, tailStart + 120);
    const namedMatch = tail.match(/^\.then\(\(mod\)\s*=>\s*\(\{\s*default:\s*mod\.(\w+)\s*\}\)\)/);
    return { importPath, namedExport: namedMatch ? namedMatch[1] : null };
  });

  it('finds at least the known lazy-loaded components (sanity check the regex itself matches)', () => {
    expect(calls.length).toBeGreaterThan(10);
    expect(calls.some((c) => c.importPath.includes('BoardroomView'))).toBe(true);
  });

  it.each(calls)('$importPath resolves the export shape lazy() expects (named: $namedExport)', async ({ importPath, namedExport }) => {
    const resolved = path.resolve(path.dirname(appTsxPath), importPath);
    const mod = await import(/* @vite-ignore */ resolved);
    if (namedExport) {
      expect(typeof mod[namedExport]).toBe('function');
    } else {
      expect(typeof mod.default).toBe('function');
    }
  });
});
