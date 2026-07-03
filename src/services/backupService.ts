import { invoke } from '@tauri-apps/api/core';
import { timestampMs } from './trustModel';

const BACKUP_VERSION = 'v1';
const BACKUP_KEYS = [
  'alphonso_memory_items_v1',
  'alphonso_miya_memory_v1',
  'alphonso_ecosystem_memory_v1',
  'alphonso_brain_patterns_v1',
  'alphonso_composio_config_v1',
  'alphonso_composio_tools_v1',
  'alphonso_settings_v1',
  'alphonso_chats_v1',
  'alphonso_chat_messages_',
  'alphonso_stream_state_v1',
  'alphonso_memory_sqlite_migration_v1',
  'alphonso_project_goals_v1',
  'alphonso_project_batches_v1',
  'alphonso_orchestration_receipts_v1',
  'alphonso_jose_dlq_v1',
  'alphonso_agent_activity_v1',
  'alphonso_runtime_ledger_v1',
  'alphonso_chat_compact_v1',
  'alphonso_agent_avatars_v1'
];

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

  for (const key of BACKUP_KEYS) {
    if (key.endsWith('_')) {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(key)) {
          try {
            data.localStorage[k] = JSON.parse(localStorage.getItem(k) || 'null');
          } catch {
            data.localStorage[k] = localStorage.getItem(k);
          }
        }
      }
    } else {
      try {
        const raw = localStorage.getItem(key);
        if (raw) data.localStorage[key] = JSON.parse(raw);
      } catch {
        const raw = localStorage.getItem(key);
        if (raw) data.localStorage[key] = raw;
      }
    }
  }

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
      try {
        kvData[k] = await invoke('kv_get', { key: k });
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

interface BackupSizeEstimate {
  bytes: number;
  kb: number;
  mb: string;
}

export function getBackupSizeEstimate(): BackupSizeEstimate {
  let totalBytes = 0;
  for (const key of BACKUP_KEYS) {
    if (key.endsWith('_')) {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(key)) {
          totalBytes += (localStorage.getItem(k) || '').length * 2;
        }
      }
    } else {
      totalBytes += (localStorage.getItem(key) || '').length * 2;
    }
  }
  return {
    bytes: totalBytes,
    kb: Math.round(totalBytes / 1024),
    mb: (totalBytes / (1024 * 1024)).toFixed(2)
  };
}
