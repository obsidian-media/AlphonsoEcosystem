// CodeQL js/insecure-randomness (phase 3d): ids that can reach a session or request
// header must not come from Math.random(). Every id is made with randomId() instead.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { randomId, randomHex } from '../lib/randomId';

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'test' ? [] : files(p);
    return /\.(t|j)sx?$/.test(e.name) ? [p] : [];
  });
}

describe('random ids', () => {
  it('randomHex and randomId use secure random bytes', () => {
    expect(randomHex(8)).toMatch(/^[0-9a-f]{8}$/);
    expect(randomHex(8)).not.toBe(randomHex(8));
    expect(randomId('packet')).toMatch(/^packet-\d+-[0-9a-f]{8}$/);
  });

  it('no id in src is made from Math.random()', () => {
    const offenders = files(path.resolve(__dirname, '..')).filter((f) => {
      const text = fs.readFileSync(f, 'utf8');
      return /Math\.random\(\)\.toString\(|\$\{Math\.random\(\)\}|String\(Math\.random\(\)\)/.test(text);
    }).map((f) => path.relative(path.resolve(__dirname, '..'), f));
    expect(offenders).toEqual([]);
  });
});
