const STORAGE_KEY = 'alphonso_circuit_breaker_v1';
const FAILURE_THRESHOLD = 5;
const COOLDOWN_MS = 60_000;

// ── Persistence helpers ────────────────────────────────────────────────────────

function loadAll() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}'); } catch { return {}; }
}

function saveAll(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
}

function defaultState() {
  return { state: 'closed', failures: 0, lastFailure: null };
}

function getEntry(connectorId) {
  const all = loadAll();
  return all[connectorId] ?? defaultState();
}

function setEntry(connectorId, entry) {
  const all = loadAll();
  all[connectorId] = entry;
  saveAll(all);
}

// ── Derive effective state (handles half-open transition) ──────────────────────

function resolveState(entry) {
  if (entry.state === 'open' && entry.lastFailure !== null) {
    const elapsed = Date.now() - entry.lastFailure;
    if (elapsed >= COOLDOWN_MS) {
      return { ...entry, state: 'half-open' };
    }
  }
  return entry;
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function recordSuccess(connectorId) {
  const entry = resolveState(getEntry(connectorId));
  // Any success from half-open or closed resets to closed
  setEntry(connectorId, { state: 'closed', failures: 0, lastFailure: null });
}

export function recordFailure(connectorId) {
  const entry = resolveState(getEntry(connectorId));
  const failures = (entry.failures ?? 0) + 1;
  const newState = failures >= FAILURE_THRESHOLD ? 'open' : entry.state === 'half-open' ? 'open' : 'closed';
  setEntry(connectorId, { state: newState, failures, lastFailure: Date.now() });
}

export function isOpen(connectorId) {
  const entry = resolveState(getEntry(connectorId));
  // Persist the resolved state so next reads see half-open too
  if (entry.state !== getEntry(connectorId).state) {
    setEntry(connectorId, entry);
  }
  return entry.state === 'open';
}

export function getCircuitState(connectorId) {
  const entry = resolveState(getEntry(connectorId));
  // Persist any state transition
  const stored = getEntry(connectorId);
  if (entry.state !== stored.state) setEntry(connectorId, entry);
  return { state: entry.state, failures: entry.failures, lastFailure: entry.lastFailure };
}

export function resetCircuit(connectorId) {
  setEntry(connectorId, defaultState());
}

export function getAll() {
  const all = loadAll();
  const result = {};
  for (const [id, raw] of Object.entries(all)) {
    const resolved = resolveState(raw);
    result[id] = { state: resolved.state, failures: resolved.failures, lastFailure: resolved.lastFailure };
  }
  return result;
}
