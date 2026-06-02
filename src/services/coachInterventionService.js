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
