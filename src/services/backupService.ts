import { invoke } from '@tauri-apps/api/core';
import { collectExportableStorage, isSecretStorageKey, stripSecretFields } from './workspaceExportService';
import { timestampMs } from './trustModel';

const BACKUP_VERSION = 'v1';
// A backup holds every alphonso_* entry except secrets (see
// collectExportableStorage). It used to copy a hand-picked list of 19 keys,
// one of which ('alphonso_settings_v1') the app never writes, so a backup had
// no app settings, Boardroom threads, Coach settings, agent model choices,
// Hector reports or schedules (QA, 2026-10-21).

interface BackupData {
  version: string;
  createdAtMs: number;
  localStorage: Record<string, unknown>;
  sqlite: {
    memoryRecords: unknown[];
    kvStore?: Record<string, unknown>;
    error?: string;
  } | null;
}

interface RestoreResult {
  localStorageRestored: number;
  sqliteRestored: number;
  errors: string[];
}

export async function createBackup(): Promise<BackupData> {
  const data: BackupData = {
    version: BACKUP_VERSION,
    createdAtMs: timestampMs(),
    localStorage: {},
    sqlite: null
  };

  data.localStorage = collectExportableStorage();

  try {
    const memoryRecords = await invoke('list_memory_records', { filters: {} });
    data.sqlite = { memoryRecords: Array.isArray(memoryRecords) ? memoryRecords : [] };
  } catch {
    data.sqlite = { memoryRecords: [], error: 'SQLite not available' };
  }

  try {
    const kvKeys = await invoke('kv_list_keys', { prefix: 'alphonso_' }) as string[];
    const kvData: Record<string, unknown> = {};
    for (const k of (kvKeys || [])) {
      if (isSecretStorageKey(k)) continue;
      try {
        const raw = await invoke('kv_get', { key: k }) as string | null;
        if (raw === null || raw === undefined) continue;
        try { kvData[k] = JSON.stringify(stripSecretFields(JSON.parse(raw))); } catch { kvData[k] = raw; }
      } catch { /* skip unreadable keys */ }
    }
    data.sqlite = data.sqlite || { memoryRecords: [] };
    data.sqlite.kvStore = kvData;
  } catch {
    // KV store not available
  }

  return data;
}

export async function restoreBackup(backupData: BackupData): Promise<RestoreResult> {
  if (!backupData || backupData.version !== BACKUP_VERSION) {
    throw new Error('Invalid backup format or version mismatch');
  }

  const results: RestoreResult = {
    localStorageRestored: 0,
    sqliteRestored: 0,
    errors: []
  };

  if (backupData.localStorage) {
    for (const [key, value] of Object.entries(backupData.localStorage)) {
      if (isSecretStorageKey(key)) { results.errors.push(`localStorage ${key}: skipped (secret)`); continue; }
      try {
        localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
        results.localStorageRestored++;
      } catch (err) {
        results.errors.push(`localStorage ${key}: ${(err as Error).message || err}`);
      }
    }
  }

  if (backupData.sqlite?.memoryRecords?.length && backupData.sqlite.memoryRecords.length > 0) {
    try {
      const proof = await invoke('upsert_memory_records', { records: backupData.sqlite.memoryRecords }) as { written?: number } | null;
      results.sqliteRestored += proof?.written || backupData.sqlite.memoryRecords.length;
    } catch (err) {
      results.errors.push(`SQLite memory: ${(err as Error).message || err}`);
    }
  }

  if (backupData.sqlite?.kvStore) {
    for (const [key, value] of Object.entries(backupData.sqlite.kvStore)) {
      if (isSecretStorageKey(key)) { results.errors.push(`KV ${key}: skipped (secret)`); continue; }
      try {
        await invoke('kv_set', { key, value: typeof value === 'string' ? value : JSON.stringify(value) });
        results.sqliteRestored++;
      } catch (err) {
        results.errors.push(`KV ${key}: ${(err as Error).message || err}`);
      }
    }
  }

  return results;
}

export function exportBackupToFile(backupData: BackupData): void {
  const json = JSON.stringify(backupData, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `alphonso-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function importBackupFromFile(file: File): Promise<BackupData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        resolve(data);
      } catch (err) {
        reject(new Error(`Invalid backup file: ${(err as Error).message || err}`));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read backup file'));
    reader.readAsText(file);
  });
}

export interface BackupSizeEstimate {
  bytes: number;
  kb: number;
  mb: string;
}

export function getBackupSizeEstimate(): BackupSizeEstimate {
  // Size of what the export writes for browser storage (the backend
  // records are added when the backup is made).
  const stored = collectExportableStorage();
  const totalBytes = Object.keys(stored).length === 0 ? 0 : new TextEncoder().encode(JSON.stringify(stored)).length;
  return {
    bytes: totalBytes,
    kb: Math.round(totalBytes / 1024),
    mb: (totalBytes / (1024 * 1024)).toFixed(2)
  };
}
