import { invoke } from '@tauri-apps/api/core';
import { TRUST_STATES, timestampMs } from './trustModel';

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

function asContent(value) {
  if (value === null || value === undefined) return '';
  return value;
}

export function normalizeMemoryRecord(item, defaults = {}) {
  const now = timestampMs();
  const governance = {
    workflowOwner: item.workflowOwner || defaults.workflowOwner || null,
    sensitivity: item.sensitivity || defaults.sensitivity || 'internal',
    retentionPolicy: item.retentionPolicy || defaults.retentionPolicy || 'standard',
    privacyStatus: item.privacyStatus || defaults.privacyStatus || 'local_governed',
    updatedAtMs: Number(item.updatedAtMs || item.timestampMs || item.createdAtMs || now)
  };
  const rawContent = asContent(item.content ?? item.details ?? '');
  const content = rawContent && typeof rawContent === 'object' && !Array.isArray(rawContent)
    ? { ...rawContent, __governance: governance }
    : { value: rawContent, __governance: governance };
  return {
    id: item.id || `mem-${now}-${Math.random().toString(16).slice(2, 8)}`,
    title: item.title || defaults.title || 'Untitled memory',
    content,
    category: item.category || defaults.category || 'timeline_memory',
    sourceAgent: item.sourceAgent || item.agent || defaults.sourceAgent || 'alphonso',
    source: item.source || defaults.source || 'localStorage-migration',
    timestampMs: Number(item.timestampMs || item.createdAtMs || item.updatedAtMs || now),
    confidence: item.confidence || defaults.confidence || TRUST_STATES.UNVERIFIED,
    verificationState: item.verificationState || defaults.verificationState || TRUST_STATES.UNVERIFIED,
    projectReference: item.projectReference || defaults.projectReference || null,
    expiresAt: item.expiresAt || defaults.expiresAt || null,
    expiryRule: item.expiryRule || defaults.expiryRule || null
  };
}

export function getLocalMemoryMigrationCandidates() {
  const shared = readLocalRows(SHARED_MEMORY_KEY).map((item) => normalizeMemoryRecord(item, {
    source: item.source || 'shared-localStorage',
    sourceAgent: item.sourceAgent || item.agent || 'alphonso'
  }));
  const miya = readLocalRows(MIYA_MEMORY_KEY).map((item) => normalizeMemoryRecord(item, {
    source: item.source || 'miya-localStorage',
    sourceAgent: 'miya',
    category: item.category || 'creative_memory'
  }));
  const byId = new Map();
  [...shared, ...miya].forEach((item) => byId.set(item.id, item));
  return [...byId.values()];
}

export async function getDurableMemoryStatus() {
  try {
    return await invoke('get_memory_store_status');
  } catch (error) {
    return {
      available: false,
      storage: 'sqlite',
      path: '',
      schemaVersion: 0,
      recordCount: 0,
      expiredCount: 0,
      checkedAtMs: timestampMs(),
      trust: TRUST_STATES.FAILED,
      error: String(error)
    };
  }
}

export async function listDurableMemoryRecords(filters = {}) {
  try {
    return await invoke('list_memory_records', { filters });
  } catch {
    return [];
  }
}

export async function upsertDurableMemoryRecords(records) {
  return invoke('upsert_memory_records', { records });
}

export async function migrateLocalStorageMemoryToSqlite() {
  const records = getLocalMemoryMigrationCandidates();
  if (records.length === 0) {
    const empty = {
      migratedAtMs: timestampMs(),
      requested: 0,
      written: 0,
      storage: 'sqlite',
      trust: TRUST_STATES.VERIFIED,
      note: 'No localStorage memory records found to migrate.'
    };
    localStorage.setItem(MIGRATION_KEY, JSON.stringify(empty));
    return empty;
  }

  const proof = await upsertDurableMemoryRecords(records);
  const migration = {
    migratedAtMs: timestampMs(),
    requested: records.length,
    written: proof?.written || 0,
    storage: proof?.storage || 'sqlite',
    path: proof?.path || '',
    trust: proof?.trust || TRUST_STATES.UNVERIFIED
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
