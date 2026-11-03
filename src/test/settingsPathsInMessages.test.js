// Messages on screen must name a Settings page that exists. "Settings → Approvals" didn't exist
// until phone phase 3 part B (2026-11-02) gave approvals their own page; this checks every
// "Settings → <page>" in screen text against the pages SettingsView really has.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : /\.(t|j)sx?$/.test(name) ? [p] : [];
  });
}

function settingsPages() {
  const src = readFileSync('src/components/SettingsView.tsx', 'utf8');
  const block = src.slice(src.indexOf('const SETTINGS_SECTIONS'), src.indexOf('];', src.indexOf('const SETTINGS_SECTIONS')));
  return [...block.matchAll(/label: '([^']+)'/g)].map((m) => m[1]);
}

describe('Settings paths in messages', () => {
  it('Approvals is a Settings page', () => {
    expect(settingsPages()).toContain('Approvals');
  });

  it('every "Settings → <page>" in screen text names a page that exists', () => {
    const pages = settingsPages();
    const found = [];
    for (const f of [...files('src/components'), ...files('src/services'), ...files('src/lib')]) {
      readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        const code = line.trim();
        if (code.startsWith('//') || code.startsWith('*') || code.startsWith('/*')) return;
        for (const m of line.matchAll(/['"`][^'"`]*?(?<!(?:ClickUp|Windows) )Settings → ([A-Z][A-Za-z&]*(?: [A-Z&][A-Za-z&]*)*)/g)) {
          if (!pages.some((p) => m[1] === p || m[1].startsWith(`${p} `))) found.push(`${f}:${i + 1} (${m[1]})`);
        }
      });
    }
    expect(found).toEqual([]);
  });
});
