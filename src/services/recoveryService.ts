import { invoke } from '@tauri-apps/api/core';
import { TRUST_STATES, timestampMs } from './trustModel';

const SNAPSHOT_KEY = 'alphonso_recovery_snapshots_v1';

interface RecoverySnapshot {
  id: string;
  timestampMs: number;
  trust: string;
  payload?: Record<string, unknown>;
  [key: string]: unknown;
}

interface MemoryBackup {
  id: string;
  timestampMs: number;
  trust: string;
  items: unknown[];
}

function readSnapshots(): RecoverySnapshot[] {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeSnapshots(snapshots: RecoverySnapshot[]) {
  localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshots.slice(-40)));
}

export function listSnapshots(): RecoverySnapshot[] {
  return readSnapshots();
}

export function restoreSnapshotById(snapshotId: string): unknown | null {
  const snapshot = readSnapshots().find((item) => item.id === snapshotId);
  if (!snapshot) return null;
  return snapshot.payload || null;
}

export function backupMemoryLedger(memoryItems: unknown[]): MemoryBackup {
  const backup: MemoryBackup = {
    id: `mem-backup-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    timestampMs: timestampMs(),
    trust: TRUST_STATES.TEMPORARY,
    items: Array.isArray(memoryItems) ? memoryItems : []
  };
  localStorage.setItem(`alphonso_memory_backup_${backup.id}`, JSON.stringify(backup));
  return backup;
}

export async function createSnapshot(payload: Record<string, unknown>): Promise<RecoverySnapshot> {
  const snapshot: RecoverySnapshot = {
    id: `snap-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    timestampMs: timestampMs(),
    trust: TRUST_STATES.TEMPORARY,
    payload
  };

  const snapshots = readSnapshots();
  snapshots.push(snapshot);
  writeSnapshots(snapshots);

  try {
    await invoke('record_restore_point', {
      snapshotId: snapshot.id,
      payload: JSON.stringify(payload)
    });
    snapshot.trust = TRUST_STATES.VERIFIED;
    writeSnapshots([...readSnapshots().slice(0, -1), snapshot]);
  } catch {
    // Local storage snapshot remains available even if backend proof fails.
  }

  return snapshot;
}
