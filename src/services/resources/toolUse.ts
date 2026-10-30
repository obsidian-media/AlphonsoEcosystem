// Resource manager (2026-10-30): when each tool or model was last used, and
// which steps use it right now. Tools by their Runtime Hub name, models as
// `model:<name>`. Last use is kept (`alphonso_tool_last_used_v1`) so idle
// times survive a restart; what is in use lives only while the app runs.
import { durableGet, durableSet } from '../../lib/durableStore';
import type { UsageRecord } from './resourceState';

const LAST_USED_KEY = 'alphonso_tool_last_used_v1';

let lastUsed: Record<string, number> | null = null;
const users = new Map<string, Set<string>>();

function saved(): Record<string, number> {
  if (lastUsed) return lastUsed;
  try {
    const parsed = JSON.parse(durableGet(LAST_USED_KEY) || '{}');
    lastUsed = parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    lastUsed = {};
  }
  return lastUsed!;
}

export function markUsed(tool: string, nowMs: number = Date.now()): void {
  const all = saved();
  all[tool] = nowMs;
  durableSet(LAST_USED_KEY, JSON.stringify(all));
}

export function beginUse(tool: string, stepId: string, nowMs: number = Date.now()): void {
  const set = users.get(tool) || new Set<string>();
  set.add(stepId);
  users.set(tool, set);
  markUsed(tool, nowMs);
}

/** A step stops using a tool; its use counts until then. Unknown steps change nothing. */
export function endUse(tool: string, stepId: string, nowMs: number = Date.now()): void {
  const set = users.get(tool);
  if (!set || !set.delete(stepId)) return;
  if (!set.size) users.delete(tool);
  markUsed(tool, nowMs);
}

export function isInUse(tool: string): boolean {
  return (users.get(tool)?.size ?? 0) > 0;
}

export function anyInUse(): boolean {
  return users.size > 0;
}

export function lastUsedAt(tool: string): number | null {
  const value = saved()[tool];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function usageRecord(): UsageRecord {
  return { lastUsedAt, isInUse };
}

export function resetToolUseForTests(options: { keepSaved?: boolean } = {}): void {
  lastUsed = null;
  users.clear();
  if (!options.keepSaved) {
    try { localStorage.removeItem(LAST_USED_KEY); } catch { /* unavailable */ }
  }
}
