import { invoke } from '@tauri-apps/api/core';
import { TRUST_STATES, timestampMs } from './trustModel';

const SNAPSHOT_KEY = 'alphonso_recovery_snapshots_v1';

function readSnapshots() {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeSnapshots(snapshots) {
  localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshots.slice(-40)));
}

export function listSnapshots() {
  return readSnapshots();
}

export function restoreSnapshotById(snapshotId) {
  const snapshot = readSnapshots().find((item) => item.id === snapshotId);
  if (!snapshot) return null;
  return snapshot.payload || null;
}

export function backupMemoryLedger(memoryItems) {
  const backup = {
    id: `mem-backup-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    timestampMs: timestampMs(),
    trust: TRUST_STATES.TEMPORARY,
    items: Array.isArray(memoryItems) ? memoryItems : []
  };
  localStorage.setItem(`alphonso_memory_backup_${backup.id}`, JSON.stringify(backup));
  return backup;
}

export async function createSnapshot(payload) {
  const snapshot = {
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
