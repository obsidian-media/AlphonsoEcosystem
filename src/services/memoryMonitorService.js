// localStorage usage monitor — reads live, no persistence needed.

const WARNING_BYTES = 5 * 1024 * 1024;  // 5 MB
const CRITICAL_BYTES = 8 * 1024 * 1024; // 8 MB
// Browsers typically cap localStorage at 5–10 MB; use 10 MB as the assumed max for percent calcs.
const ASSUMED_MAX_BYTES = 10 * 1024 * 1024;

const subscribers = [];
let lastWarningState = false;

function byteSize(str) {
  // Each JS string char is 2 bytes in localStorage (UTF-16)
  return str.length * 2;
}

// ── Core stats ─────────────────────────────────────────────────────────────────

export function getUsageStats() {
  let usedBytes = 0;
  const keySizes = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key === null) continue;
      const val = localStorage.getItem(key) ?? '';
      const size = byteSize(key) + byteSize(val);
      usedBytes += size;
      keySizes.push({ key, sizeKB: parseFloat((size / 1024).toFixed(2)) });
    }
  } catch { /* localStorage unavailable */ }

  keySizes.sort((a, b) => b.sizeKB - a.sizeKB);
  const largestKeys = keySizes.slice(0, 10);

  return {
    usedBytes,
    usedKB: parseFloat((usedBytes / 1024).toFixed(2)),
    itemCount: localStorage.length,
    largestKeys
  };
}

export function getAlphonsoKeys() {
  const result = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key === null || !key.startsWith('alphonso_')) continue;
      const val = localStorage.getItem(key) ?? '';
      const sizeKB = parseFloat(((byteSize(key) + byteSize(val)) / 1024).toFixed(2));
      result.push({ key, sizeKB });
    }
  } catch { /* localStorage unavailable */ }
  result.sort((a, b) => b.sizeKB - a.sizeKB);
  return result;
}

export function checkThresholds() {
  const { usedBytes } = getUsageStats();
  const usedPercent = parseFloat(((usedBytes / ASSUMED_MAX_BYTES) * 100).toFixed(1));
  const warning = usedBytes >= WARNING_BYTES;
  const critical = usedBytes >= CRITICAL_BYTES;

  // Notify subscribers when crossing warning threshold
  if (warning && !lastWarningState) {
    lastWarningState = true;
    const stats = { usedBytes, usedPercent, warning, critical };
    for (const cb of subscribers) {
      try { cb(stats); } catch { /* subscriber error ignored */ }
    }
  } else if (!warning) {
    lastWarningState = false;
  }

  return { warning, critical, usedPercent };
}

// ── Ring-buffer pruner ─────────────────────────────────────────────────────────

export function pruneOldest(targetKey, keepCount = 50) {
  try {
    const raw = localStorage.getItem(targetKey);
    if (!raw) return;
    const entries = JSON.parse(raw);
    if (!Array.isArray(entries)) return;
    if (entries.length <= keepCount) return;
    // Assume entries are ordered oldest-first (push-appended rings)
    entries.splice(0, entries.length - keepCount);
    localStorage.setItem(targetKey, JSON.stringify(entries));
  } catch { /* localStorage unavailable */ }
}

// ── Subscription ───────────────────────────────────────────────────────────────

export function subscribe(callback) {
  subscribers.push(callback);
  // Return unsubscribe fn
  return () => {
    const idx = subscribers.indexOf(callback);
    if (idx !== -1) subscribers.splice(idx, 1);
  };
}
