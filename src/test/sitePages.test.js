// Phone phase 3 part C (owner, 2026-11-02): the App Store needs a public privacy policy and a support
// page. Published from site/ only, by GitHub Pages; publisher Obsidian Media, support through GitHub Issues.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

const ISSUES = 'https://github.com/obsidian-media/AlphonsoEcosystem/issues';
const page = (name) => readFileSync(`site/${name}`, 'utf8');

describe('the store pages', () => {
  it('privacy and support pages exist with an index linking both', () => {
    for (const f of ['index.html', 'privacy.html', 'support.html', 'style.css']) expect(existsSync(`site/${f}`)).toBe(true);
    expect(page('index.html')).toContain('privacy.html');
    expect(page('index.html')).toContain('support.html');
  });

  it('name the publisher and send support to GitHub Issues, with no email address', () => {
    for (const f of ['index.html', 'privacy.html', 'support.html']) {
      expect(page(f)).toContain('Obsidian Media');
      expect(page(f)).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    }
    expect(page('support.html')).toContain(ISSUES);
    expect(page('privacy.html')).toContain(ISSUES);
  });

  it('the privacy policy covers deleting the account and says nothing is sold or tracked', () => {
    const p = page('privacy.html');
    expect(p).toContain('Delete my account');
    expect(p).toMatch(/do not sell/i);
    expect(p).toMatch(/no advertising|no ads/i);
  });

  it('every page has a viewport and a title', () => {
    for (const f of ['index.html', 'privacy.html', 'support.html']) {
      expect(page(f)).toMatch(/<meta name="viewport"/);
      expect(page(f)).toMatch(/<title>[^<]+<\/title>/);
    }
  });

  it('the workflow publishes only site/', () => {
    const w = readFileSync('.github/workflows/pages.yml', 'utf8');
    expect(w).toMatch(/upload-pages-artifact@[0-9a-f]{40}/);
    expect(w).toMatch(/path: site\s*$/m);
    expect(w).toMatch(/deploy-pages@[0-9a-f]{40}/);
    expect(w).not.toMatch(/path: \.\s*$/m);
  });
});
