// Messages on screen must name a Settings tab that exists. "Settings → Approvals"
// never did: the approval switches and Allow paid models are under Settings → General
// (found in the docs pass, 2026-10-30).
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : /\.(t|j)sx?$/.test(name) ? [p] : [];
  });
}

describe('Settings paths in messages', () => {
  it('no screen text sends you to "Settings → Approvals"', () => {
    const found = [];
    for (const f of [...files('src/components'), ...files('src/services'), ...files('src/lib')]) {
      readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        const code = line.trim();
        if (code.startsWith('//') || code.startsWith('*') || code.startsWith('/*')) return;
        if (/['"`][^'"`]*Settings → Approvals/.test(line)) found.push(`${f}:${i + 1}`);
      });
    }
    expect(found).toEqual([]);
  });
});
