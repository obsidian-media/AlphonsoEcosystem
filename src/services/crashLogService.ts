import { durableGet, durableSet, durableRemove } from '../lib/durableStore';

const MAX_ENTRIES = 100;
const LOG_KEY = 'alphonso_crash_log_v1';
const REDACTED = '[REDACTED]';

// Truth-First plan B4 (secret-logging regression gate): logError() persists
// its `context` argument verbatim to durable storage (localStorage + SQLite
// backup), with no prior redaction anywhere in this path. A caller passing a
// connector credential, API key, or auth header value straight through
// (e.g. inside a caught HTTP-client error's parsed context) would have
// written it to disk in plaintext. Deterministic key-name matching only —
// NOT a message/stack content scanner. A pattern-based scanner for
// secret-shaped substrings in free-text error messages was considered and
// deliberately not built: it would either miss creative secret formats
// (false negatives, false confidence) or mangle legitimate error text with
// overly broad matching (false positives) without a much larger, separately
// justified effort. This is a real, bounded improvement, not a claim of
// complete secret-redaction coverage.
const SENSITIVE_KEY_PATTERN = /token|secret|password|credential|api[_-]?key|auth(orization)?|passphrase|private[_-]?key/i;

function redactSensitiveKeys(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value as object)) return '[CIRCULAR]';
  seen.add(value as object);

  try {
    if (Array.isArray(value)) {
      return value.map((item) => redactSensitiveKeys(item, seen));
    }

    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        result[key] = REDACTED;
      } else if (val !== null && typeof val === 'object') {
        result[key] = redactSensitiveKeys(val, seen);
      } else {
        result[key] = val;
      }
    }
    return result;
  } finally {
    // Remove from `seen` once this node's children are done, so `seen` only
    // reflects the active recursion path (true cycle detection) — otherwise
    // a shared (non-circular) object referenced from two different
    // properties would be wrongly flagged [CIRCULAR] on its second visit.
    seen.delete(value as object);
  }
}

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
    context: redactSensitiveKeys(context) as Record<string, unknown>
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
