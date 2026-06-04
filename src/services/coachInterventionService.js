import { invoke } from '@tauri-apps/api/core';
import { timestampMs } from './trustModel';

export const COACH_INTERVENTION_LEVELS = {
  QUIET: 'quiet',
  FIRM: 'firm',
  HARD: 'hard'
};

export const SESSION_GUARD_EVENT_TYPES = {
  LOSS_STRETCH: 'loss_stretch',
  BANKROLL_DROP: 'bankroll_drop',
  TIME_LIMIT: 'time_limit',
  CHASE_PATTERN: 'chase_pattern',
  HIGH_VOLATILITY: 'high_volatility'
};

export const SESSION_GUARD_BRIDGE_STORAGE_KEY = 'alphonso_sessionguard_bridge_events_v1';
export const COACH_INTERVENTION_ACTION_LOG_KEY = 'alphonso_coach_intervention_action_log_v1';
export const SESSION_GUARD_BRIDGE_EVENT = 'alphonso:sessionguard-event';

function readJsonArray(key) {
  if (typeof localStorage === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeJsonArray(key, rows, limit = 50) {
  if (typeof localStorage === 'undefined') return;
  const sliced = rows.slice(-limit);
  try {
    invoke('kv_set', { key, value: JSON.stringify(sliced) }).catch(() => {});
  } catch {
    // SQLite not available in browser
  }
  localStorage.setItem(key, JSON.stringify(sliced));
}

export function normalizeSessionGuardEvent(event = {}) {
  const metrics = event.metrics || {};
  return {
    id: event.id || `sessionguard-${timestampMs()}`,
    source: event.source || 'sessionguard',
    sessionType: event.sessionType || 'unknown_session',
    type: event.type || SESSION_GUARD_EVENT_TYPES.HIGH_VOLATILITY,
    severity: event.severity || event.riskLevel || 'info',
    message: event.message || event.summary || 'SessionGuard detected a session pattern.',
    metrics: {
      spinCount: Number(metrics.spinCount || metrics.spins || 0),
      netResult: Number(metrics.netResult || metrics.net || 0),
      longestLosingStretch: Number(metrics.longestLosingStretch || metrics.losingStretch || 0),
      elapsedMinutes: Number(metrics.elapsedMinutes || 0)
    },
    timestampMs: event.timestampMs || timestampMs(),
    localOnly: event.localOnly !== false
  };
}

function money(value) {
  const number = Number(value || 0);
  const sign = number < 0 ? '-' : '';
  return `${sign}$${Math.abs(number).toFixed(2)}`;
}

export function chooseCoachInterventionLevel(event = {}) {
  const normalized = normalizeSessionGuardEvent(event);
  const { metrics, severity, type } = normalized;

  if (
    severity === 'critical' ||
    type === SESSION_GUARD_EVENT_TYPES.CHASE_PATTERN ||
    metrics.longestLosingStretch >= 25 ||
    metrics.netResult <= -100
  ) {
    return COACH_INTERVENTION_LEVELS.HARD;
  }

  if (
    severity === 'warning' ||
    metrics.longestLosingStretch >= 10 ||
    metrics.netResult <= -25 ||
    metrics.elapsedMinutes >= 45
  ) {
    return COACH_INTERVENTION_LEVELS.FIRM;
  }

  return COACH_INTERVENTION_LEVELS.QUIET;
}

export function buildCoachIntervention(event = {}) {
  const normalized = normalizeSessionGuardEvent(event);
  const level = chooseCoachInterventionLevel(normalized);
  const { metrics } = normalized;

  const parts = [];
  if (metrics.spinCount) parts.push(`${metrics.spinCount} spins in`);
  if (metrics.netResult) parts.push(`net ${money(metrics.netResult)}`);
  if (metrics.longestLosingStretch) parts.push(`${metrics.longestLosingStretch}-spin losing stretch`);
  if (metrics.elapsedMinutes) parts.push(`${metrics.elapsedMinutes} minutes elapsed`);

  const context = parts.length ? `You're ${parts.join(', ')}.` : normalized.message;
  const action = level === COACH_INTERVENTION_LEVELS.HARD
    ? 'Pause now. Take 60 seconds before continuing.'
    : level === COACH_INTERVENTION_LEVELS.FIRM
      ? 'Pause for 60 seconds before continuing?'
      : 'Heads up — keep this session deliberate.';

  return {
    id: normalized.id,
    source: normalized.source,
    sessionType: normalized.sessionType,
    type: normalized.type,
    level,
    title: level === COACH_INTERVENTION_LEVELS.HARD
      ? 'Hard pause recommended'
      : level === COACH_INTERVENTION_LEVELS.FIRM
        ? 'Coach check-in'
        : 'Quiet nudge',
    message: `${context} ${action}`,
    rawMessage: normalized.message,
    metrics,
    timestampMs: normalized.timestampMs,
    localOnly: normalized.localOnly,
    actions: level === COACH_INTERVENTION_LEVELS.HARD
      ? ['pause_60_seconds', 'end_session', 'continue_anyway']
      : ['pause_60_seconds', 'continue']
  };
}

export function buildDemoSlotIntervention() {
  return buildCoachIntervention({
    source: 'sessionguard',
    sessionType: 'slot_machine',
    type: SESSION_GUARD_EVENT_TYPES.LOSS_STRETCH,
    severity: 'warning',
    message: 'Noticeable losing stretch detected.',
    metrics: {
      spinCount: 82,
      netResult: -43.25,
      longestLosingStretch: 14,
      elapsedMinutes: 28
    },
    localOnly: true
  });
}

export function listSessionGuardBridgeEvents() {
  return readJsonArray(SESSION_GUARD_BRIDGE_STORAGE_KEY);
}

export function pushSessionGuardBridgeEvent(event = {}) {
  const intervention = buildCoachIntervention(event);
  const bridgeEvent = {
    ...normalizeSessionGuardEvent(event),
    intervention,
    receivedAtMs: timestampMs()
  };

  const events = [...listSessionGuardBridgeEvents(), bridgeEvent];
  writeJsonArray(SESSION_GUARD_BRIDGE_STORAGE_KEY, events, 20);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SESSION_GUARD_BRIDGE_EVENT, { detail: bridgeEvent }));
  }

  return bridgeEvent;
}

export function getLatestSessionGuardBridgeIntervention() {
  return listSessionGuardBridgeEvents().at(-1)?.intervention || null;
}

export function subscribeSessionGuardBridge(onBridgeEvent) {
  if (typeof window === 'undefined') return () => {};

  const handleCustomEvent = (event) => {
    if (event?.detail?.intervention) onBridgeEvent(event.detail);
  };

  const handleStorageEvent = (event) => {
    if (event.key !== SESSION_GUARD_BRIDGE_STORAGE_KEY) return;
    const latest = listSessionGuardBridgeEvents().at(-1);
    if (latest?.intervention) onBridgeEvent(latest);
  };

  window.addEventListener(SESSION_GUARD_BRIDGE_EVENT, handleCustomEvent);
  window.addEventListener('storage', handleStorageEvent);

  return () => {
    window.removeEventListener(SESSION_GUARD_BRIDGE_EVENT, handleCustomEvent);
    window.removeEventListener('storage', handleStorageEvent);
  };
}

export function listCoachInterventionActionLog() {
  return readJsonArray(COACH_INTERVENTION_ACTION_LOG_KEY);
}

export function recordCoachInterventionAction(intervention, action, details = {}) {
  const entry = {
    id: `coach-action-${timestampMs()}`,
    interventionId: intervention?.id || null,
    source: intervention?.source || 'coach',
    action,
    details,
    timestampMs: timestampMs(),
    localOnly: true
  };
  writeJsonArray(COACH_INTERVENTION_ACTION_LOG_KEY, [...listCoachInterventionActionLog(), entry], 100);
  return entry;
}
