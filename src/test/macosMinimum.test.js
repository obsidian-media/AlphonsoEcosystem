// The app's CSS (Tailwind v4) needs Safari 16.4, which ships with macOS 13.3.
// The installer's minimum macOS and Vite's build target must say the same, or a
// Mac the installer accepts would draw the app wrongly or fail to parse it
// (owner, 2026-10-30: require macOS 13.3).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const conf = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
const vite = readFileSync('vite.config.js', 'utf8');

describe('macOS minimum version', () => {
  it('the installer requires macOS 13.3', () => {
    expect(conf.bundle.macOS.minimumSystemVersion).toBe('13.3');
  });

  it("Vite builds for Safari 16.4, the Safari of macOS 13.3", () => {
    expect(vite).toMatch(/target:\s*'safari16\.4'/);
  });
});
