import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// e2e-desktop/specs/smoke.e2e.mjs opens every sidebar page in the real app.
// Its page list is written by hand, and two pages added to the sidebar on
// 2026-10-06 (Agent Pairing, Maturity) went untested until 2026-10-21
// (QA Bug 15). This fails as soon as the sidebar has a page the smoke spec
// does not visit.

const root = path.resolve(__dirname, '../..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');

function sidebarItemIds() {
  const source = read('src/components/Sidebar.tsx');
  const start = source.indexOf("id: 'home'");
  const end = source.indexOf("id: 'operator'", start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const block = source.slice(start, end + 20);
  return [...block.matchAll(/\{ id: '([a-z_]+)', icon:/g)].map((m) => m[1]);
}

function smokeItemIds() {
  const source = read('e2e-desktop/specs/smoke.e2e.mjs');
  const block = source.slice(source.indexOf('const SPACES = ['), source.indexOf('];', source.indexOf('const SPACES = [')));
  return [...block.matchAll(/items: \[([^\]]*)\]/g)].flatMap((m) => [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]));
}

describe('desktop smoke spec covers every sidebar page', () => {
  it('visits each page the sidebar shows', () => {
    const sidebar = sidebarItemIds();
    expect(sidebar.length).toBeGreaterThan(15);
    const smoke = new Set(smokeItemIds());
    const missing = sidebar.filter((id) => !smoke.has(id));
    expect(missing).toEqual([]);
  });
});
