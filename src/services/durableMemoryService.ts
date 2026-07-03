// durableMemoryService — re-exports from unifiedMemoryService for backward compatibility
export {
  normalizeMemoryRecord,
  listDurableMemoryRecords,
  upsertDurableMemoryRecords,
  getDurableMemoryStatus,
  pushMemory,
  listMemory,
  hydrateFromDurable,
  tickExpiry,
  getMemorySize,
  getAllMemorySizes,
  checkQuota,
  deduplicateMemory,
  deduplicateAllNamespaces,
  autoTagMemoryItem,
  exportMemoryItems,
  importMemoryItems,
  clearContentHashCache,
  MEMORY_CATEGORIES,
  MEMORY_NAMESPACES
} from './unifiedMemoryService';

import { normalizeMemoryRecord as normalizeRecord, upsertDurableMemoryRecords as upsertRecords } from './unifiedMemoryService';
import { timestampMs, TRUST_STATES } from './trustModel';

// Migration helpers — still needed for one-time migration
const SHARED_MEMORY_KEY = 'alphonso_memory_items_v1';
const MIYA_MEMORY_KEY = 'alphonso_miya_memory_v1';
const MIGRATION_KEY = 'alphonso_memory_sqlite_migration_v1';

interface MigrationCandidate {
  id: string;
  [key: string]: unknown;
}

interface MigrationResult {
  migratedAtMs: number;
  requested: number;
  written: number;
  storage: string;
  path?: string;
  trust: string;
  note?: string;
}

function readLocalRows(key: string): unknown[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getLocalMemoryMigrationCandidates(): MigrationCandidate[] {
  const shared = readLocalRows(SHARED_MEMORY_KEY).map((item) => normalizeRecord(item, {
    source: (item as Record<string, unknown>).source || 'shared-localStorage',
    sourceAgent: (item as Record<string, unknown>).sourceAgent || (item as Record<string, unknown>).agent || 'alphonso'
  }));
  const miya = readLocalRows(MIYA_MEMORY_KEY).map((item) => normalizeRecord(item, {
    source: (item as Record<string, unknown>).source || 'miya-localStorage',
    sourceAgent: 'miya',
    category: (item as Record<string, unknown>).category || 'creative_memory'
  }));
  const byId = new Map<string, MigrationCandidate>();
  [...shared, ...miya].forEach((item: MigrationCandidate) => byId.set(item.id, item));
  return [...byId.values()];
}

export async function migrateLocalStorageMemoryToSqlite(): Promise<MigrationResult> {
  const records = getLocalMemoryMigrationCandidates();
  if (records.length === 0) {
    const empty: MigrationResult = {
      migratedAtMs: timestampMs(), requested: 0, written: 0,
      storage: 'sqlite', trust: TRUST_STATES.VERIFIED,
      note: 'No localStorage memory records found to migrate.'
    };
    localStorage.setItem(MIGRATION_KEY, JSON.stringify(empty));
    return empty;
  }

  const proof = await upsertRecords(records);
  const migration: MigrationResult = {
    migratedAtMs: timestampMs(), requested: records.length,
    written: (proof as { written?: number })?.written || 0,
    storage: (proof as { storage?: string })?.storage || 'sqlite',
    path: (proof as { path?: string })?.path || '',
    trust: (proof as { trust?: string })?.trust || TRUST_STATES.UNVERIFIED
  };
  localStorage.setItem(MIGRATION_KEY, JSON.stringify(migration));
  return migration;
}

export function getLastMemoryMigration(): MigrationResult | null {
  try {
    const raw = localStorage.getItem(MIGRATION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
