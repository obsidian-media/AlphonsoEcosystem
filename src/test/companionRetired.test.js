// Phone phase 3 part C (owner, 2026-11-02): the older iPhone app's local-network server (port 8765,
// a PIN, network discovery) retired; phones pair only through the relay. Archived, not deleted.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : /\.(t|j)sx?$/.test(name) ? [p] : [];
  });
}

describe('the local-network companion server is retired', () => {
  it('the backend starts no companion server and has none of its commands', () => {
    const lib = readFileSync('src-tauri/src/lib.rs', 'utf8');
    expect(lib).not.toMatch(/companion_/);
    for (const f of ['auth', 'discovery', 'router', 'server', 'types']) expect(existsSync(`src-tauri/src/companion_${f}.rs`)).toBe(false);
  });

  it('nothing in the app calls it or listens for it', () => {
    const found = [];
    for (const f of files('src')) {
      if (f.includes(`${join('src', 'test')}`)) continue;
      const text = readFileSync(f, 'utf8');
      if (/companion:\/\/|companion_(get|set|start|broadcast)|CompanionPairingPanel|companionCommandService/.test(text)) found.push(f);
    }
    expect(found).toEqual([]);
  });

  it('it is kept in the archive', () => {
    expect(existsSync('archive/MIGHTBEUSEDLATER/companion-lan/src-tauri/companion_server.rs')).toBe(true);
    expect(existsSync('archive/MIGHTBEUSEDLATER/companion-lan/src/CompanionPairingPanel.tsx')).toBe(true);
  });
});
