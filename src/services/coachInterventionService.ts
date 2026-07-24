import { invoke } from '@tauri-apps/api/core';
import { timestampMs } from './trustModel';

export const COACH_INTERVENTION_LEVELS = {
  QUIET: 'quiet',
  FIRM: 'firm',
  HARD: 'hard'
} as const;

export type CoachInterventionLevel = typeof COACH_INTERVENTION_LEVELS[keyof typeof COACH_INTERVENTION_LEVELS];

export const COACH_ENGINE_EVENT_TYPES = {
  APPROVAL_THEATER: 'approval_theater',
  LATE_NIGHT_APPROVAL: 'late_night_approval',
  REPEATED_PIPELINE_FAILURE: 'repeated_pipeline_failure',
  DEAD_LETTER_GRAVEYARD: 'dead_letter_graveyard',
  CONFIDENCE_DECAY: 'confidence_decay',
  APPROVAL_RUBBER_STAMP: 'approval_rubber_stamp',
  LONG_UNBROKEN_SESSION: 'long_unbroken_session',
  AGENT_WHIPLASH: 'agent_whiplash',
  BOARDROOM_HEDGE_PILEUP: 'boardroom_hedge_pileup',
  UNUSED_SURFACE_AREA: 'unused_surface_area',
  LICENSE_WALL: 'license_wall'
} as const;

export const COACH_ENGINE_STORAGE_KEY = 'alphonso_coach_engine_events_v1';
export const COACH_INTERVENTION_ACTION_LOG_KEY = 'alphonso_coach_intervention_action_log_v1';
export const COACH_ENGINE_EVENT = 'alphonso:coach-engine-event';

interface CoachEngineMetrics {
  count?: number;
  hoursAgo?: number;
  action?: string;
  agent?: string;
  rateDrop?: string;
}

interface CoachEngineEvent {
  id?: string;
  source?: string;
  type?: string;
  severity?: string;
  message?: string;
  metrics?: CoachEngineMetrics;
  timestampMs?: number;
  localOnly?: boolean;
  [key: string]: unknown;
}

interface NormalizedCoachEngineEvent {
  id: string;
  source: string;
  type: string;
  severity: string;
  message: string;
  metrics: {
    count: number;
    hoursAgo: number;
    action: string;
    agent: string;
    rateDrop: string;
  };
  timestampMs: number;
  localOnly: boolean;
  [key: string]: unknown;
}

function readJsonArray(key: string): Record<string, unknown>[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : [];
  } catch {
    return [];
  }
}

function writeJsonArray(key: string, rows: Record<string, unknown>[], limit: number = 50): void {
  if (typeof localStorage === 'undefined') return;
  const sliced = rows.slice(-limit);
  invoke('kv_set', { key, value: JSON.stringify(sliced) }).catch(() => {});
  localStorage.setItem(key, JSON.stringify(sliced));
}

export function normalizeCoachEngineEvent(event: CoachEngineEvent = {}): NormalizedCoachEngineEvent {
  const metrics = event.metrics || {};
  return {
    id: event.id || `coach-engine-${timestampMs()}`,
    source: event.source || 'coach-engine',
    type: event.type || COACH_ENGINE_EVENT_TYPES.APPROVAL_THEATER,
    severity: event.severity || 'info',
    message: event.message || 'Coach engine detected a session pattern.',
    metrics: {
      count: Number(metrics.count || 0),
      hoursAgo: Number(metrics.hoursAgo || 0),
      action: String(metrics.action || ''),
      agent: String(metrics.agent || ''),
      rateDrop: String(metrics.rateDrop || '')
    },
    timestampMs: event.timestampMs || timestampMs(),
    localOnly: event.localOnly !== false
  };
}

interface CoachIntervention {
  id: string;
  source: string;
  type: string;
  level: string;
  title: string;
  message: string;
  rawMessage: string;
  metrics: NormalizedCoachEngineEvent['metrics'];
  timestampMs: number;
  localOnly: boolean;
  actions: string[];
}

export function buildCoachIntervention(event: CoachEngineEvent = {}): CoachIntervention {
  const normalized = normalizeCoachEngineEvent(event);
  const { metrics, severity, type } = normalized;

  let level: CoachInterventionLevel = COACH_INTERVENTION_LEVELS.QUIET;
  if (severity === 'critical' || type === COACH_ENGINE_EVENT_TYPES.APPROVAL_THEATER) {
    level = COACH_INTERVENTION_LEVELS.HARD;
  } else if (severity === 'warning') {
    level = COACH_INTERVENTION_LEVELS.FIRM;
  }

  const action = level === COACH_INTERVENTION_LEVELS.HARD
    ? 'Pause now. Take 60 seconds before continuing.'
    : level === COACH_INTERVENTION_LEVELS.FIRM
      ? 'Pause for 60 seconds before continuing?'
      : 'Heads up — keep this session deliberate.';

  return {
    id: normalized.id,
    source: normalized.source,
    type: normalized.type,
    level,
    title: level === COACH_INTERVENTION_LEVELS.HARD
      ? 'Hard pause recommended'
      : level === COACH_INTERVENTION_LEVELS.FIRM
        ? 'Coach check-in'
        : 'Quiet nudge',
    message: `${normalized.message} ${action}`,
    rawMessage: normalized.message,
    metrics,
    timestampMs: normalized.timestampMs,
    localOnly: normalized.localOnly,
    actions: level === COACH_INTERVENTION_LEVELS.HARD
      ? ['pause_60_seconds', 'end_session', 'continue_anyway']
      : ['pause_60_seconds', 'continue']
  };
}

export function buildDemoIntervention(): CoachIntervention {
  return buildCoachIntervention({
    source: 'coach-engine',
    type: COACH_ENGINE_EVENT_TYPES.APPROVAL_THEATER,
    severity: 'critical',
    message: 'Demo intervention: approval theater detected.',
    metrics: { count: 5, action: 'publish_post', agent: 'miya', hoursAgo: 2, rateDrop: '' },
    localOnly: true
  });
}

interface EngineEvent extends NormalizedCoachEngineEvent {
  intervention: CoachIntervention;
  receivedAtMs: number;
}

export function listCoachEngineEvents(): EngineEvent[] {
  return readJsonArray(COACH_ENGINE_STORAGE_KEY) as unknown as EngineEvent[];
}

export function pushCoachEngineEvent(event: CoachEngineEvent = {}): EngineEvent {
  const intervention = buildCoachIntervention(event);
  const engineEvent: EngineEvent = {
    ...normalizeCoachEngineEvent(event),
    intervention,
    receivedAtMs: timestampMs()
  };

  const events = [...listCoachEngineEvents(), engineEvent];
  writeJsonArray(COACH_ENGINE_STORAGE_KEY, events as unknown as Record<string, unknown>[], 20);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(COACH_ENGINE_EVENT, { detail: engineEvent }));
  }

  return engineEvent;
}

export function getLatestCoachEngineIntervention(): CoachIntervention | null {
  return listCoachEngineEvents().at(-1)?.intervention || null;
}

export function subscribeCoachEngine(onEngineEvent: (event: EngineEvent) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleCustomEvent = (event: Event) => {
    const ce = event as CustomEvent<EngineEvent>;
    if (ce?.detail?.intervention) onEngineEvent(ce.detail);
  };

  const handleStorageEvent = (event: StorageEvent) => {
    if (event.key !== COACH_ENGINE_STORAGE_KEY) return;
    const latest = listCoachEngineEvents().at(-1);
    if (latest?.intervention) onEngineEvent(latest);
  };

  window.addEventListener(COACH_ENGINE_EVENT, handleCustomEvent);
  window.addEventListener('storage', handleStorageEvent);

  return () => {
    window.removeEventListener(COACH_ENGINE_EVENT, handleCustomEvent);
    window.removeEventListener('storage', handleStorageEvent);
  };
}

interface ActionLogEntry {
  id: string;
  interventionId: string | null;
  source: string;
  action: string;
  details: Record<string, unknown>;
  timestampMs: number;
  localOnly: boolean;
}

export function listCoachInterventionActionLog(): ActionLogEntry[] {
  return readJsonArray(COACH_INTERVENTION_ACTION_LOG_KEY) as unknown as ActionLogEntry[];
}

export function recordCoachInterventionAction(
  intervention: CoachIntervention | null,
  action: string,
  details: Record<string, unknown> = {}
): ActionLogEntry {
  const entry: ActionLogEntry = {
    id: `coach-action-${timestampMs()}`,
    interventionId: intervention?.id || null,
    source: intervention?.source || 'coach',
    action,
    details,
    timestampMs: timestampMs(),
    localOnly: true
  };
  writeJsonArray(COACH_INTERVENTION_ACTION_LOG_KEY, [...listCoachInterventionActionLog(), entry] as unknown as Record<string, unknown>[], 100);
  return entry;
}