import { invoke } from '@tauri-apps/api/core';
import { TRUST_STATES, timestampMs } from './trustModel';

interface LedgerAvailability {
  checked: boolean;
  available: boolean;
  nextCheckAtMs: number;
}

export interface LedgerRecord {
  id: string;
  data: unknown;
  status: string;
  confidence: string;
  verificationState: string;
  timestampMs: number;
}

export interface HydrationResult {
  scope: string;
  loaded: number;
}

const availability: LedgerAvailability = {
  checked: false,
  available: false,
  nextCheckAtMs: 0
};

const queues = new Map<string, Promise<void>>();

async function isLedgerAvailable(force = false): Promise<boolean> {
  const now = timestampMs();
  if (!force && availability.checked && availability.nextCheckAtMs > now) {
    return availability.available;
  }
  try {
    const status = await invoke<{ available?: boolean }>('get_memory_store_status');
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

function normalizeRecord(scope: string, row: Record<string, unknown> = {}): LedgerRecord {
  const data = (row as { data?: unknown }).data ?? row;
  const dataObj = (data && typeof data === 'object') ? data as Record<string, unknown> : undefined;
  return {
    id: (row.id as string) || `${scope}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    data,
    status: (row.status as string) || (dataObj?.status as string) || 'recorded',
    confidence: (row.confidence as string) || (dataObj?.confidence as string) || TRUST_STATES.TEMPORARY,
    verificationState: (row.verificationState as string) || (row.verification_state as string) || (dataObj?.verificationState as string) || TRUST_STATES.UNVERIFIED,
    timestampMs: Number(row.timestampMs || row.timestamp_ms || dataObj?.timestampMs || Date.now())
  };
}

export async function listScopeRecords(scope: string, limit = 1200): Promise<LedgerRecord[]> {
  const available = await isLedgerAvailable();
  if (!available) return [];
  try {
    const rows = await invoke<Array<Record<string, unknown>>>('list_runtime_ledger_records', { scope, limit });
    return Array.isArray(rows) ? rows.map((row) => normalizeRecord(scope, row)) : [];
  } catch {
    return [];
  }
}

export async function persistScopeRows(
  scope: string,
  rows: unknown[] = [],
  toRecord?: (row: unknown) => Record<string, unknown>
): Promise<void> {
  const queueKey = scope;
  const current = queues.get(queueKey) || Promise.resolve();
  const task = current
    .then(async () => {
      const available = await isLedgerAvailable();
      if (!available) return;
      const records = rows
        .slice(-2500)
        .map((row) => normalizeRecord(scope, toRecord ? toRecord(row) : row as Record<string, unknown>));
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

export async function hydrateScopeToLocalStorage(scope: string, storageKey: string): Promise<HydrationResult> {
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

export async function bootstrapRuntimeLedgerHydration(mappings: Array<{ scope: string; storageKey: string }> = []): Promise<{ available: boolean; loadedScopes: HydrationResult[] }> {
  const available = await isLedgerAvailable(true);
  if (!available) return { available: false, loadedScopes: [] };
  const loadedScopes: HydrationResult[] = [];
  for (const mapping of mappings) {
    if (!mapping?.scope || !mapping?.storageKey) continue;
    const proof = await hydrateScopeToLocalStorage(mapping.scope, mapping.storageKey);
    loadedScopes.push(proof);
  }
  return { available: true, loadedScopes };
}
