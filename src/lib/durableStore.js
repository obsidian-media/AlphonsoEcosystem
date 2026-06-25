// Dual-write: localStorage (sync, always) + Tauri kv_store (async, desktop only)
// Reads prefer localStorage for sync access; Tauri is the durable backup.

let tauriInvoke = null;
try {
  // Dynamic import so web builds don't break
  import('@tauri-apps/api/core').then(m => { tauriInvoke = m.invoke; });
} catch { /* tauri not available */ }

export function durableGet(key) {
  return localStorage.getItem(key);
}

export function durableSet(key, value) {
  localStorage.setItem(key, value);
  // Fire-and-forget to Tauri kv_store when available
  if (tauriInvoke) {
    tauriInvoke('kv_set', { key, value }).catch(() => {});
  }
}

export function durableRemove(key) {
  localStorage.removeItem(key);
  if (tauriInvoke) {
    tauriInvoke('kv_delete', { key }).catch(() => {});
  }
}
