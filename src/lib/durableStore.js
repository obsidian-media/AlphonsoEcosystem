// Dual-write durable store: localStorage (sync primary) + Tauri kv_store (async durable backup).
//
// - localStorage is the synchronous source of truth for reads.
// - Tauri kv_store is a durable backup that CAN now be read back to recover
//   localStorage after a wipe (see hydrateKeyFromDurable / reconcileKey).
//   Previously the kv write was fire-and-forget and NEVER read back, so the
//   "durable backup" could not actually recover anything — a latent gap.
// - A schema version + migration runner give future storage-shape changes a
//   single home instead of ad-hoc per-service migration code.
//
// The stored value format is unchanged (raw strings), so existing consumers
// (crashLogService, agentAuditService, novaAnalysisService, …) are unaffected.

const SCHEMA_VERSION_KEY = 'alphonso_durable_schema_version';
export const DURABLE_SCHEMA_VERSION = 1;

// Resolve the Tauri invoke fn exactly once. Using a promise (rather than a bare
// mutable `let`) closes a real race: writes issued before the dynamic import
// resolved were previously dropped because `tauriInvoke` was still null.
let invokeResolver;
const invokePromise = new Promise((resolve) => { invokeResolver = resolve; });
import('@tauri-apps/api/core')
  .then((m) => invokeResolver(typeof m.invoke === 'function' ? m.invoke : null))
  .catch(() => invokeResolver(null));

function getInvoke() {
  return invokePromise;
}

function safeLocalGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeLocalSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* quota / unavailable */ }
}
function safeLocalRemove(key) {
  try { localStorage.removeItem(key); } catch { /* unavailable */ }
}

export function durableGet(key) {
  return safeLocalGet(key);
}

export function durableSet(key, value) {
  safeLocalSet(key, value);
  // Fire-and-forget to kv, but wait for the invoke import so early writes aren't lost.
  getInvoke().then((invoke) => { if (invoke) invoke('kv_set', { key, value }).catch(() => {}); });
}

export function durableRemove(key) {
  safeLocalRemove(key);
  getInvoke().then((invoke) => { if (invoke) invoke('kv_delete', { key }).catch(() => {}); });
}

/**
 * Restore a key into localStorage from the durable kv backup when localStorage
 * is missing it (e.g. browser storage cleared but SQLite persisted). This is
 * what makes the kv store an actual recovery path rather than a write-only sink.
 * Returns the resolved value (localStorage value if present, else the restored
 * kv value, else null).
 */
export async function hydrateKeyFromDurable(key) {
  const local = safeLocalGet(key);
  if (local !== null) return local;
  const invoke = await getInvoke();
  if (!invoke) return null;
  try {
    const backup = await invoke('kv_get', { key });
    if (backup != null) {
      safeLocalSet(key, backup);
      return backup;
    }
  } catch { /* kv unavailable */ }
  return null;
}

/**
 * Reconcile a single key between the two stores. localStorage is the sync
 * primary and wins on divergence; if kv is stale or missing it is re-pushed,
 * and if only kv has the value it is restored to localStorage.
 */
export async function reconcileKey(key) {
  const invoke = await getInvoke();
  if (!invoke) return;
  const local = safeLocalGet(key);
  try {
    const backup = await invoke('kv_get', { key });
    if (local === null && backup != null) {
      safeLocalSet(key, backup);
    } else if (local !== null && local !== backup) {
      await invoke('kv_set', { key, value: local }).catch(() => {});
    }
  } catch { /* kv unavailable */ }
}

/**
 * Ordered schema migrations. Each `run` executes at most once, gated by a
 * persisted version. Add a new migration with an incrementing `to` version and
 * a `run` that transforms whatever keys it needs. Keep them idempotent.
 */
export const DEFAULT_MIGRATIONS = [
  // { to: 2, run: () => { /* future storage-shape change */ } },
];

function readVersion() {
  const raw = safeLocalGet(SCHEMA_VERSION_KEY);
  if (raw == null) return 0;
  // Number() (not parseInt) so a corrupted value like "2broken" is rejected
  // whole rather than silently parsed to 2, which would skip migrations.
  const n = Number(raw);
  return Number.isSafeInteger(n) && n >= 0 ? n : 0;
}

/**
 * Run any pending migrations once, in order. On a migration error it stops and
 * leaves the version at the last successfully-applied migration (so the failed
 * step is retried next boot rather than silently skipped). With no migrations
 * defined it simply stamps the baseline DURABLE_SCHEMA_VERSION.
 * Returns { version, applied: number[] }.
 */
export function runDurableMigrations(migrations = DEFAULT_MIGRATIONS) {
  let current = readVersion();
  const applied = [];
  const ordered = [...migrations].sort((a, b) => a.to - b.to);
  for (const m of ordered) {
    if (m.to > current) {
      try {
        if (typeof m.run === 'function') m.run();
        applied.push(m.to);
        current = m.to;
      } catch {
        break; // stop at first failure; version stays at last good
      }
    }
  }
  if (ordered.length === 0 && current < DURABLE_SCHEMA_VERSION) {
    current = DURABLE_SCHEMA_VERSION; // baseline init
  }
  safeLocalSet(SCHEMA_VERSION_KEY, String(current));
  getInvoke().then((invoke) => {
    if (invoke) invoke('kv_set', { key: SCHEMA_VERSION_KEY, value: String(current) }).catch(() => {});
  });
  return { version: current, applied };
}
