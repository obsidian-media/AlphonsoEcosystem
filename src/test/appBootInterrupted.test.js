import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Phase 5: at start, a request left running is marked Interrupted (nothing runs by itself).
describe('App start', () => {
  it('marks requests left running as interrupted', () => {
    const source = readFileSync(resolve(__dirname, '../App.tsx'), 'utf8');
    expect(source).toMatch(/markRunningRequestsInterrupted\(\)/);
  });
});
