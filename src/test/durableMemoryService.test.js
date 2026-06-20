import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn().mockResolvedValue(null);

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args) => invoke(...args),
  isTauri: vi.fn().mockReturnValue(false)
}));

const {
  normalizeMemoryRecord,
  getLocalMemoryMigrationCandidates,
  getDurableMemoryStatus,
  listDurableMemoryRecords,
  upsertDurableMemoryRecords,
  migrateLocalStorageMemoryToSqlite,
  getLastMemoryMigration
} = await import('../services/durableMemoryService.js');

describe('durableMemoryService', () => {
  beforeEach(() => {
    localStorage.clear();
    invoke.mockReset();
    invoke.mockResolvedValue(null);
  });

  describe('normalizeMemoryRecord', () => {
    it('generates an id when none is provided', () => {
      const record = normalizeMemoryRecord({ title: 'Test', content: 'data' });
      expect(record.id).toMatch(/^mem-\d+-[a-f0-9]+$/);
    });

    it('preserves provided id', () => {
      const record = normalizeMemoryRecord({ id: 'custom-id', title: 'T', content: '' });
      expect(record.id).toBe('custom-id');
    });

    it('defaults title to Untitled memory', () => {
      const record = normalizeMemoryRecord({ content: '' });
      expect(record.title).toBe('Untitled memory');
    });

    it('uses provided title', () => {
      const record = normalizeMemoryRecord({ title: 'My Title', content: '' });
      expect(record.title).toBe('My Title');
    });

    it('defaults sourceAgent to alphonso', () => {
      const record = normalizeMemoryRecord({ content: '' });
      expect(record.sourceAgent).toBe('alphonso');
    });

    it('uses agent field as sourceAgent fallback', () => {
      const record = normalizeMemoryRecord({ agent: 'hector', content: '' });
      expect(record.sourceAgent).toBe('hector');
    });

    it('defaults category to timeline_memory', () => {
      const record = normalizeMemoryRecord({ content: '' });
      expect(record.category).toBe('timeline_memory');
    });

    it('uses provided category', () => {
      const record = normalizeMemoryRecord({ content: '', category: 'research_memory' });
      expect(record.category).toBe('research_memory');
    });

    it('wraps string content in value object with governance', () => {
      const record = normalizeMemoryRecord({ content: 'hello' });
      expect(record.content).toHaveProperty('value', 'hello');
      expect(record.content).toHaveProperty('__governance');
    });

    it('wraps object content with governance', () => {
      const record = normalizeMemoryRecord({ content: { key: 'val' } });
      expect(record.content.key).toBe('val');
      expect(record.content).toHaveProperty('__governance');
    });

    it('uses defaults parameter for missing fields', () => {
      const record = normalizeMemoryRecord({}, { title: 'Default', sourceAgent: 'miya', category: 'creative' });
      expect(record.title).toBe('Default');
      expect(record.sourceAgent).toBe('miya');
      expect(record.category).toBe('creative');
    });

    it('sets timestampMs to a positive number', () => {
      const record = normalizeMemoryRecord({ content: '' });
      expect(record.timestampMs).toBeGreaterThan(0);
    });

    it('defaults expiresAt to null', () => {
      const record = normalizeMemoryRecord({ content: '' });
      expect(record.expiresAt).toBeNull();
    });
  });

  describe('getLocalMemoryMigrationCandidates', () => {
    it('returns empty array when no localStorage data exists', () => {
      const candidates = getLocalMemoryMigrationCandidates();
      expect(candidates).toEqual([]);
    });

    it('reads from shared memory key', () => {
      localStorage.setItem('alphonso_memory_items_v1', JSON.stringify([
        { id: 'shared-1', title: 'Shared memory', content: 'data' }
      ]));
      const candidates = getLocalMemoryMigrationCandidates();
      expect(candidates).toHaveLength(1);
      expect(candidates[0].title).toBe('Shared memory');
    });

    it('reads from miya memory key', () => {
      localStorage.setItem('alphonso_miya_memory_v1', JSON.stringify([
        { id: 'miya-1', title: 'Miya memory', content: 'art' }
      ]));
      const candidates = getLocalMemoryMigrationCandidates();
      expect(candidates).toHaveLength(1);
      expect(candidates[0].sourceAgent).toBe('miya');
    });

    it('deduplicates by id across both keys', () => {
      localStorage.setItem('alphonso_memory_items_v1', JSON.stringify([
        { id: 'dup-1', title: 'From shared', content: 'a' }
      ]));
      localStorage.setItem('alphonso_miya_memory_v1', JSON.stringify([
        { id: 'dup-1', title: 'From miya', content: 'b' }
      ]));
      const candidates = getLocalMemoryMigrationCandidates();
      expect(candidates).toHaveLength(1);
    });
  });

  describe('getDurableMemoryStatus', () => {
    it('returns invoke result on success', async () => {
      invoke.mockResolvedValueOnce({ available: true, recordCount: 42 });
      const status = await getDurableMemoryStatus();
      expect(status.available).toBe(true);
      expect(status.recordCount).toBe(42);
    });

    it('returns fallback on invoke failure', async () => {
      invoke.mockRejectedValueOnce(new Error('IPC error'));
      const status = await getDurableMemoryStatus();
      expect(status.available).toBe(false);
      expect(status.trust).toBe('failed');
    });
  });

  describe('listDurableMemoryRecords', () => {
    it('returns records on success', async () => {
      invoke.mockResolvedValueOnce([{ id: 'r1', title: 'Record 1' }]);
      const records = await listDurableMemoryRecords({ category: 'chat_message' });
      expect(records).toHaveLength(1);
    });

    it('returns empty array on failure', async () => {
      invoke.mockRejectedValueOnce(new Error('fail'));
      const records = await listDurableMemoryRecords({});
      expect(records).toEqual([]);
    });
  });

  describe('upsertDurableMemoryRecords', () => {
    it('calls invoke with records', async () => {
      invoke.mockResolvedValueOnce({ written: 2 });
      const result = await upsertDurableMemoryRecords([{ id: 'r1' }, { id: 'r2' }]);
      expect(result.written).toBe(2);
      expect(invoke).toHaveBeenCalledWith('upsert_memory_records', { records: [{ id: 'r1' }, { id: 'r2' }] });
    });
  });

  describe('migrateLocalStorageMemoryToSqlite', () => {
    it('returns empty result when no candidates exist', async () => {
      const result = await migrateLocalStorageMemoryToSqlite();
      expect(result.written).toBe(0);
      expect(result.requested).toBe(0);
    });

    it('persists migration record to localStorage', async () => {
      await migrateLocalStorageMemoryToSqlite();
      const raw = localStorage.getItem('alphonso_memory_sqlite_migration_v1');
      expect(raw).toBeTruthy();
    });

    it('migrates records when candidates exist', async () => {
      localStorage.setItem('alphonso_memory_items_v1', JSON.stringify([
        { id: 'm1', title: 'Migrate me', content: 'data' }
      ]));
      invoke.mockResolvedValueOnce({ written: 1, storage: 'sqlite', trust: 'verified' });
      const result = await migrateLocalStorageMemoryToSqlite();
      expect(result.requested).toBe(1);
      expect(result.written).toBe(1);
    });
  });

  describe('getLastMemoryMigration', () => {
    it('returns null when no migration has occurred', () => {
      expect(getLastMemoryMigration()).toBeNull();
    });

    it('returns stored migration record', () => {
      localStorage.setItem('alphonso_memory_sqlite_migration_v1', JSON.stringify({ requested: 5, written: 4 }));
      const migration = getLastMemoryMigration();
      expect(migration.requested).toBe(5);
      expect(migration.written).toBe(4);
    });

    it('returns null on invalid JSON', () => {
      localStorage.setItem('alphonso_memory_sqlite_migration_v1', 'not-json');
      expect(getLastMemoryMigration()).toBeNull();
    });
  });
});
