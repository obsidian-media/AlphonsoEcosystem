// Phone phase 3 part C (owner, 2026-11-02): the older Swift iPhone app retired with its build workflow
// and Atlas's docs. Atlas's routes inside Cloud Voice stay (owner: changing that code redeploys a live service).
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

describe('the Swift companion is retired', () => {
  it('no workflow or script builds it', () => {
    const workflows = readdirSync('.github/workflows').map((f) => readFileSync(`.github/workflows/${f}`, 'utf8'));
    expect(workflows.some((w) => w.includes('ios/AlphonsoCompanion'))).toBe(false);
    expect(existsSync('.github/workflows/ios-build.yml')).toBe(false);
    expect(existsSync('scripts/install-ios.sh')).toBe(false);
  });

  it('it and the Atlas docs are kept in the archive', () => {
    expect(existsSync('ios/AlphonsoCompanion')).toBe(false);
    expect(existsSync('archive/MIGHTBEUSEDLATER/swift-companion/ios/AlphonsoCompanion')).toBe(true);
    expect(readdirSync('docs/platform').some((f) => f.startsWith('atlas-'))).toBe(false);
    expect(existsSync('archive/MIGHTBEUSEDLATER/swift-companion/docs/platform')).toBe(true);
  });

  it('the new phone app keeps its app ID', () => {
    expect(JSON.parse(readFileSync('mobile/capacitor.config.json', 'utf8')).appId).toBe('com.alphonso.companion');
  });
});
