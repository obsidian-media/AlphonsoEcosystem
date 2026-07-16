import { describe, it, expect, beforeEach, vi } from 'vitest';

// In-memory kv backing the mocked Tauri invoke.
const kv = new Map();
const mockInvoke = vi.fn(async (cmd, args) => {
  if (cmd === 'kv_set') { kv.set(args.key, args.value); return null; }
  if (cmd === 'kv_get') { return kv.has(args.key) ? kv.get(args.key) : null; }
  if (cmd === 'kv_delete') { kv.delete(args.key); return null; }
  return null;
});

vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a) => mockInvoke(...a) }));

import {
  durableGet, durableSet, durableRemove,
  hydrateKeyFromDurable, reconcileKey,
  runDurableMigrations, DURABLE_SCHEMA_VERSION
} from '../lib/durableStore';

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('durableStore', () => {
  beforeEach(() => {
    localStorage.clear();
    kv.clear();
    mockInvoke.mockClear();
  });

  it('durableSet writes localStorage and mirrors to kv', async () => {
    durableSet('k1', 'v1');
    expect(durableGet('k1')).toBe('v1');
    await flush();
    expect(kv.get('k1')).toBe('v1');
  });

  it('durableRemove clears both stores', async () => {
    durableSet('k2', 'v2');
    await flush();
    durableRemove('k2');
    expect(durableGet('k2')).toBeNull();
    await flush();
    expect(kv.has('k2')).toBe(false);
  });

  it('hydrateKeyFromDurable restores localStorage from the kv backup when missing', async () => {
    kv.set('lost', 'recovered'); // simulate SQLite survived, localStorage was wiped
    expect(durableGet('lost')).toBeNull();
    const value = await hydrateKeyFromDurable('lost');
    expect(value).toBe('recovered');
    expect(durableGet('lost')).toBe('recovered');
  });

  it('hydrateKeyFromDurable keeps the local value when present', async () => {
    localStorage.setItem('present', 'local');
    kv.set('present', 'backup');
    const value = await hydrateKeyFromDurable('present');
    expect(value).toBe('local');
  });

  it('reconcileKey re-pushes localStorage to a stale kv (localStorage wins)', async () => {
    localStorage.setItem('drift', 'fresh');
    kv.set('drift', 'stale');
    await reconcileKey('drift');
    expect(kv.get('drift')).toBe('fresh');
  });

  it('reconcileKey restores localStorage when only kv has the value', async () => {
    kv.set('only-kv', 'value');
    await reconcileKey('only-kv');
    expect(durableGet('only-kv')).toBe('value');
  });

  it('runDurableMigrations stamps the baseline version with no migrations', () => {
    const res = runDurableMigrations([]);
    expect(res.version).toBe(DURABLE_SCHEMA_VERSION);
    expect(res.applied).toEqual([]);
  });

  it('runDurableMigrations applies pending migrations once and is idempotent', () => {
    const run = vi.fn();
    const migrations = [{ to: 2, run }];
    const first = runDurableMigrations(migrations);
    expect(first.applied).toEqual([2]);
    expect(run).toHaveBeenCalledTimes(1);

    const second = runDurableMigrations(migrations);
    expect(second.applied).toEqual([]);
    expect(run).toHaveBeenCalledTimes(1); // not re-run
    expect(second.version).toBe(2);
  });

  it('runDurableMigrations stops at a failing migration and does not over-bump', () => {
    const good = vi.fn();
    const bad = vi.fn(() => { throw new Error('boom'); });
    const never = vi.fn();
    const res = runDurableMigrations([
      { to: 2, run: good },
      { to: 3, run: bad },
      { to: 4, run: never }
    ]);
    expect(res.applied).toEqual([2]);
    expect(res.version).toBe(2);
    expect(never).not.toHaveBeenCalled();
  });
});
