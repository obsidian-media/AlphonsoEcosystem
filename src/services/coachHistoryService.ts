import { durableGet, durableSet, durableRemove } from '../lib/durableStore';
import type { CoachSignal } from './coachEngineService';

const HISTORY_KEY = 'alphonso_coach_history_v1';
const MAX_ENTRIES = 50;

export type CoachHistoryEntry = CoachSignal;

/**
 * Persist every fired CoachSignal (not just the currently-displayed one) to a
 * capped local ring buffer, mirroring agentAuditService.ts's exact shape.
 * This is Coach Mode's feedback loop for tuning detector thresholds later —
 * if a trigger fires constantly, that's visible here.
 */
export function recordCoachHistory(signal: CoachSignal): void {
  const log = getCoachHistory();
  log.push(signal);
  if (log.length > MAX_ENTRIES) log.splice(0, log.length - MAX_ENTRIES);
  try { durableSet(HISTORY_KEY, JSON.stringify(log)); } catch { /* ignore */ }
}

export function getCoachHistory(): CoachHistoryEntry[] {
  try { return JSON.parse(durableGet(HISTORY_KEY) ?? '[]'); } catch { return []; }
}

export function clearCoachHistory(): void {
  durableRemove(HISTORY_KEY);
}
