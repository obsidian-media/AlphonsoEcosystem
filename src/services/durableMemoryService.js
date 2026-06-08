// durableMemoryService.js — re-exports from unifiedMemoryService for backward compatibility
export {
  normalizeMemoryRecord,
  listDurableMemoryRecords,
  upsertDurableMemoryRecords,
  getDurableMemoryStatus,
  pushMemory,
  listMemory,
  hydrateFromDurable,
  MEMORY_CATEGORIES,
  MEMORY_NAMESPACES
} from './unifiedMemoryService';

import { normalizeMemoryRecord as normalizeRecord, upsertDurableMemoryRecords as upsertRecords } from './unifiedMemoryService';
import { timestampMs, TRUST_STATES } from './trustModel';

// Migration helpers — still needed for one-time migration
const SHARED_MEMORY_KEY = 'alphonso_memory_items_v1';
const MIYA_MEMORY_KEY = 'alphonso_miya_memory_v1';
const MIGRATION_KEY = 'alphonso_memory_sqlite_migration_v1';

function readLocalRows(key) {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getLocalMemoryMigrationCandidates() {
  const shared = readLocalRows(SHARED_MEMORY_KEY).map((item) => normalizeRecord(item, {
    source: item.source || 'shared-localStorage',
    sourceAgent: item.sourceAgent || item.agent || 'alphonso'
  }));
  const miya = readLocalRows(MIYA_MEMORY_KEY).map((item) => normalizeRecord(item, {
    source: item.source || 'miya-localStorage',
    sourceAgent: 'miya',
    category: item.category || 'creative_memory'
  }));
  const byId = new Map();
  [...shared, ...miya].forEach((item) => byId.set(item.id, item));
  return [...byId.values()];
}

export async function migrateLocalStorageMemoryToSqlite() {
  const records = getLocalMemoryMigrationCandidates();
  if (records.length === 0) {
    const empty = {
      migratedAtMs: timestampMs(), requested: 0, written: 0,
      storage: 'sqlite', trust: TRUST_STATES.VERIFIED,
      note: 'No localStorage memory records found to migrate.'
    };
    localStorage.setItem(MIGRATION_KEY, JSON.stringify(empty));
    return empty;
  }

  const proof = await upsertRecords(records);
  const migration = {
    migratedAtMs: timestampMs(), requested: records.length,
    written: proof?.written || 0, storage: proof?.storage || 'sqlite',
    path: proof?.path || '', trust: proof?.trust || TRUST_STATES.UNVERIFIED
  };
  localStorage.setItem(MIGRATION_KEY, JSON.stringify(migration));
  return migration;
}

export function getLastMemoryMigration() {
  try {
    const raw = localStorage.getItem(MIGRATION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
