import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { READING_TOOLSETS } from '../../../services/hermes/hermesConstants';

// The reading toolsets are kept in one place per language; this keeps the two the same.
describe('Hermes reading toolsets', () => {
  it('match the backend list', () => {
    const rust = readFileSync(resolve(__dirname, '../../../../src-tauri/src/hermes_profiles.rs'), 'utf8');
    const block = rust.match(/READING_TOOLSETS: &\[&str\] = &\[([^\]]*)\]/);
    expect(block).toBeTruthy();
    const names = [...(block?.[1] || '').matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(names).toEqual([...READING_TOOLSETS]);
  });
});
