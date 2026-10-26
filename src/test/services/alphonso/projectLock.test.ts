// Agent phase 6: one request changes a project at a time.
import { describe, it, expect, beforeEach } from 'vitest';
import { claimProject, releaseProject, projectHolder, busyLine } from '../../../services/alphonso/projectLock';
import { JOSE_LIMITS } from '../../../services/jose/stepGraph';

beforeEach(() => localStorage.clear());

describe('projectLock', () => {
  it('one request at a time; the same request may claim again', () => {
    expect(claimProject('D:/shop', 'r1', 1000)).toEqual({ ok: true });
    expect(claimProject('D:/shop', 'r2', 2000)).toEqual({ ok: false, heldBy: 'r1' });
    expect(claimProject('D:/shop', 'r1', 3000)).toEqual({ ok: true });
    expect(projectHolder('D:/shop')).toBe('r1');
  });

  it('released by its holder only', () => {
    claimProject('D:/shop', 'r1', 1000);
    releaseProject('D:/shop', 'r2');
    expect(projectHolder('D:/shop')).toBe('r1');
    releaseProject('D:/shop', 'r1');
    expect(projectHolder('D:/shop')).toBeNull();
    expect(claimProject('D:/shop', 'r2', 2000)).toEqual({ ok: true });
  });

  it('a lock older than a project request may run is stale', () => {
    claimProject('D:/shop', 'r1', 1000);
    expect(claimProject('D:/shop', 'r2', 1000 + JOSE_LIMITS.projectMs + 1)).toEqual({ ok: true });
  });

  it('the same folder written differently is the same project', () => {
    claimProject('D:\\Shop\\', 'r1', 1000);
    expect(claimProject('d:/shop', 'r2', 2000)).toEqual({ ok: false, heldBy: 'r1' });
    expect(busyLine('shop')).toBe('Waiting: shop is busy with another request.');
  });
});
