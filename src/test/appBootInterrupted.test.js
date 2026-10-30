import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Phase 5: at start, a request left running is marked Interrupted (nothing runs by itself).
describe('App start', () => {
  it('marks requests left running as interrupted', () => {
    const source = readFileSync(resolve(__dirname, '../App.tsx'), 'utf8');
    expect(source).toMatch(/markRunningRequestsInterrupted\(\)/);
  });

  it('expires waiting requests at start and every hour', () => {
    const source = readFileSync(resolve(__dirname, '../App.tsx'), 'utf8');
    expect((source.match(/expireWaitingRequests\(\)/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  // Phase 3a: scheduled posts go out while the app is open, never from the Coach window.
  it('starts the post runner outside the Coach window', () => {
    const source = readFileSync(resolve(__dirname, '../App.tsx'), 'utf8');
    expect(source).toMatch(/if \(IS_COACH_WINDOW\) return undefined;\s*try \{ startPostScheduler\(\); \}/);
  });

  // Resource manager (2026-10-30): memory is watched and idle tools stopped, never from the Coach window.
  it('starts the resource watcher outside the Coach window', () => {
    const source = readFileSync(resolve(__dirname, '../App.tsx'), 'utf8');
    expect(source).toMatch(/if \(IS_COACH_WINDOW\) return undefined;\s*return startResourceWatcher\(\);/);
  });
});
