import { invoke } from '@tauri-apps/api/core';
import { TRUST_STATES, timestampMs } from './trustModel';

const availability = {
  checked: false,
  available: false,
  nextCheckAtMs: 0
};

const queues = new Map();

async function isLedgerAvailable(force = false) {
  const now = timestampMs();
  if (!force && availability.checked && availability.nextCheckAtMs > now) {
    return availability.available;
  }
  try {
    const status = await invoke('get_memory_store_status');
    availability.checked = true;
    availability.available = Boolean(status?.available);
    availability.nextCheckAtMs = now + (availability.available ? 60_000 : 20_000);
    return availability.available;
  } catch {
    availability.checked = true;
    availability.available = false;
    availability.nextCheckAtMs = now + 20_000;
    return false;
  }
}

function normalizeRecord(scope, row = {}) {
  return {
    id: row.id || `${scope}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    data: row.data ?? row,
    status: row.status || row.data?.status || 'recorded',
    confidence: row.confidence || row.data?.confidence || TRUST_STATES.TEMPORARY,
    verificationState: row.verificationState || row.verification_state || row.data?.verificationState || TRUST_STATES.UNVERIFIED,
    timestampMs: Number(row.timestampMs || row.timestamp_ms || row.data?.timestampMs || Date.now())
  };
}

export async function listScopeRecords(scope, limit = 1200) {
  const available = await isLedgerAvailable();
  if (!available) return [];
  try {
    const rows = await invoke('list_runtime_ledger_records', { scope, limit });
    return Array.isArray(rows) ? rows.map((row) => normalizeRecord(scope, row)) : [];
  } catch {
    return [];
  }
}

export async function persistScopeRows(scope, rows = [], toRecord) {
  const queueKey = scope;
  const current = queues.get(queueKey) || Promise.resolve();
  const task = current
    .then(async () => {
      const available = await isLedgerAvailable();
      if (!available) return;
      const records = rows
        .slice(-2500)
        .map((row) => normalizeRecord(scope, toRecord ? toRecord(row) : row));
      if (!records.length) return;
      await invoke('upsert_runtime_ledger_records', { scope, records });
    })
    .catch(() => {
      availability.available = false;
      availability.nextCheckAtMs = timestampMs() + 10_000;
    });
  queues.set(queueKey, task);
  return task;
}

export async function hydrateScopeToLocalStorage(scope, storageKey) {
  const records = await listScopeRecords(scope, 2500);
  if (!records.length) return { scope, loaded: 0 };
  const rows = records.map((record) => record.data).filter(Boolean);
  try {
    invoke('kv_set', { key: storageKey, value: JSON.stringify(rows) }).catch(() => {});
  } catch {
    // SQLite not available in browser
  }
  localStorage.setItem(storageKey, JSON.stringify(rows));
  window.dispatchEvent(new CustomEvent('alphonso:ledger_hydrated', {
    detail: {
      scope,
      storageKey,
      loaded: rows.length,
      hydratedAtMs: timestampMs()
    }
  }));
  return { scope, loaded: rows.length };
}

export async function bootstrapRuntimeLedgerHydration(mappings = []) {
  const available = await isLedgerAvailable(true);
  if (!available) return { available: false, loadedScopes: [] };
  const loadedScopes = [];
  for (const mapping of mappings) {
    if (!mapping?.scope || !mapping?.storageKey) continue;
    const proof = await hydrateScopeToLocalStorage(mapping.scope, mapping.storageKey);
    loadedScopes.push(proof);
  }
  return { available: true, loadedScopes };
}
