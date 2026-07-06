// localStorage usage monitor — reads live, no persistence needed.

const WARNING_BYTES = 5 * 1024 * 1024;  // 5 MB
const CRITICAL_BYTES = 8 * 1024 * 1024; // 8 MB
const ASSUMED_MAX_BYTES = 10 * 1024 * 1024;

export interface KeySize {
  key: string;
  sizeKB: number;
}

export interface UsageStats {
  usedBytes: number;
  usedKB: number;
  itemCount: number;
  largestKeys: KeySize[];
}

export interface ThresholdResult {
  warning: boolean;
  critical: boolean;
  usedPercent: number;
}

export interface WarningEvent {
  usedBytes: number;
  usedPercent: number;
  warning: boolean;
  critical: boolean;
}

type Subscriber = (event: WarningEvent) => void;

const subscribers: Subscriber[] = [];
let lastWarningState = false;

function byteSize(str: string): number {
  return str.length * 2;
}

export function getUsageStats(): UsageStats {
  let usedBytes = 0;
  const keySizes: KeySize[] = [];
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

export function getAlphonsoKeys(): KeySize[] {
  const result: KeySize[] = [];
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

export function checkThresholds(): ThresholdResult {
  const { usedBytes } = getUsageStats();
  const usedPercent = parseFloat(((usedBytes / ASSUMED_MAX_BYTES) * 100).toFixed(1));
  const warning = usedBytes >= WARNING_BYTES;
  const critical = usedBytes >= CRITICAL_BYTES;

  if (warning && !lastWarningState) {
    lastWarningState = true;
    const stats: WarningEvent = { usedBytes, usedPercent, warning, critical };
    for (const cb of subscribers) {
      try { cb(stats); } catch { /* subscriber error ignored */ }
    }
  } else if (!warning) {
    lastWarningState = false;
  }

  return { warning, critical, usedPercent };
}

export function pruneOldest(targetKey: string, keepCount = 50): void {
  try {
    const raw = localStorage.getItem(targetKey);
    if (!raw) return;
    const entries = JSON.parse(raw);
    if (!Array.isArray(entries)) return;
    if (entries.length <= keepCount) return;
    entries.splice(0, entries.length - keepCount);
    localStorage.setItem(targetKey, JSON.stringify(entries));
  } catch { /* localStorage unavailable */ }
}

export function subscribe(callback: Subscriber): () => void {
  subscribers.push(callback);
  return () => {
    const idx = subscribers.indexOf(callback);
    if (idx !== -1) subscribers.splice(idx, 1);
  };
}
