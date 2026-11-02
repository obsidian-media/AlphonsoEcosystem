// Phone phase 3 part C (owner, 2026-11-02): the App Store listing, prepared for the owner to submit.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const read = (f) => readFileSync(`docs/store/${f}`, 'utf8');
function field(name) {
  const m = read('app-store.md').replace(/\r/g, '').match(new RegExp(String.raw`## ${name}\n\n([\s\S]*?)\n\n## `));
  if (!m) throw new Error(`no field ${name}`);
  return m[1].trim();
}

describe('the App Store listing', () => {
  it("keeps every field within Apple's limits", () => {
    expect(field('Name').length).toBeLessThanOrEqual(30);
    expect(field('Subtitle').length).toBeLessThanOrEqual(30);
    expect(field('Promotional text').length).toBeLessThanOrEqual(170);
    expect(field('Description').length).toBeLessThanOrEqual(4000);
    expect(field('Keywords').length).toBeLessThanOrEqual(100);
    expect(field('Keywords')).not.toMatch(/, /);
    expect(field("What's New").length).toBeLessThanOrEqual(4000);
  });

  it('points to the published pages and tells the reviewer about the demo', () => {
    expect(field('Support URL')).toBe('https://github.com/obsidian-media/AlphonsoEcosystem/issues');
    expect(field('Privacy Policy URL')).toBe('https://obsidian-media.github.io/AlphonsoEcosystem/privacy.html');
    expect(field('Review notes')).toContain('Try a demo');
    expect(field('Review notes')).toContain('Delete my account');
  });

  it('privacy labels say no tracking, and list only what the relay and sign-in can read', () => {
    const p = read('privacy-labels.md');
    expect(p).toMatch(/Tracking: No/);
    expect(p).toContain('Email Address');
    expect(p).toContain('Device ID');
  });

  it('has the 6.9-inch screenshots and a checklist, and no email address anywhere', () => {
    expect(readdirSync('docs/store/screenshots/iphone-6.9').filter((f) => f.endsWith('.png')).length).toBeGreaterThanOrEqual(3);
    expect(existsSync('docs/store/SUBMIT_CHECKLIST.md')).toBe(true);
    for (const f of ['app-store.md', 'privacy-labels.md', 'SUBMIT_CHECKLIST.md', 'OPEN_QUESTIONS.md']) {
      expect(read(f)).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    }
  });
});
