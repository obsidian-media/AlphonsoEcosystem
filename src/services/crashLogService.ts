import { durableGet, durableSet, durableRemove } from '../lib/durableStore';

const MAX_ENTRIES = 100;
const LOG_KEY = 'alphonso_crash_log_v1';

export interface CrashLogEntry {
  timestamp: number;
  message: string;
  stack: string | null;
  context: Record<string, unknown>;
}

export function logError(error: any, context: Record<string, unknown> = {}): void {
  const entries = getCrashLog();
  entries.push({
    timestamp: Date.now(),
    message: error?.message ?? String(error),
    stack: error?.stack ?? null,
    context
  });
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
  try { durableSet(LOG_KEY, JSON.stringify(entries)); } catch { /* ignore */ }
}

export function getCrashLog(): CrashLogEntry[] {
  try { return JSON.parse(durableGet(LOG_KEY) ?? '[]'); } catch { return []; }
}

export function clearCrashLog(): void {
  durableRemove(LOG_KEY);
}
