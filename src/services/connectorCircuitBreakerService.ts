import { durableGet, durableSet } from '../lib/durableStore';

const STORAGE_KEY = 'alphonso_circuit_breaker_v1';
const FAILURE_THRESHOLD = 5;
const COOLDOWN_MS = 60_000;

interface CircuitEntry {
  state: string;
  failures: number;
  lastFailure: number | null;
}

interface CircuitState {
  state: string;
  failures: number;
  lastFailure: number | null;
}

// ── Persistence helpers ────────────────────────────────────────────────────────

function loadAll(): Record<string, CircuitEntry> {
  try { return JSON.parse(durableGet(STORAGE_KEY) ?? '{}'); } catch { return {}; }
}

function saveAll(data: Record<string, CircuitEntry>) {
  durableSet(STORAGE_KEY, JSON.stringify(data));
}

function defaultState(): CircuitEntry {
  return { state: 'closed', failures: 0, lastFailure: null };
}

function getEntry(connectorId: string): CircuitEntry {
  const all = loadAll();
  return all[connectorId] ?? defaultState();
}

function setEntry(connectorId: string, entry: CircuitEntry) {
  const all = loadAll();
  all[connectorId] = entry;
  saveAll(all);
}

// ── Derive effective state (handles half-open transition) ──────────────────────

function resolveState(entry: CircuitEntry): CircuitEntry {
  if (entry.state === 'open' && entry.lastFailure !== null) {
    const elapsed = Date.now() - entry.lastFailure;
    if (elapsed >= COOLDOWN_MS) {
      return { ...entry, state: 'half-open' };
    }
  }
  return entry;
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function recordSuccess(connectorId: string) {
  resolveState(getEntry(connectorId));
  // Any success from half-open or closed resets to closed
  setEntry(connectorId, { state: 'closed', failures: 0, lastFailure: null });
}

export function recordFailure(connectorId: string) {
  const entry = resolveState(getEntry(connectorId));
  const failures = (entry.failures ?? 0) + 1;
  const newState = failures >= FAILURE_THRESHOLD ? 'open' : entry.state === 'half-open' ? 'open' : 'closed';
  setEntry(connectorId, { state: newState, failures, lastFailure: Date.now() });
}

export function isOpen(connectorId: string): boolean {
  const entry = resolveState(getEntry(connectorId));
  // Persist the resolved state so next reads see half-open too
  if (entry.state !== getEntry(connectorId).state) {
    setEntry(connectorId, entry);
  }
  return entry.state === 'open';
}

export function getCircuitState(connectorId: string): CircuitState {
  const entry = resolveState(getEntry(connectorId));
  // Persist any state transition
  const stored = getEntry(connectorId);
  if (entry.state !== stored.state) setEntry(connectorId, entry);
  return { state: entry.state, failures: entry.failures, lastFailure: entry.lastFailure };
}

export function resetCircuit(connectorId: string) {
  setEntry(connectorId, defaultState());
}

export function getAll(): Record<string, CircuitState> {
  const all = loadAll();
  const result: Record<string, CircuitState> = {};
  for (const [id, raw] of Object.entries(all)) {
    const resolved = resolveState(raw);
    result[id] = { state: resolved.state, failures: resolved.failures, lastFailure: resolved.lastFailure };
  }
  return result;
}
