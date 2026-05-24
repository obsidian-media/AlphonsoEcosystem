import { TRUST_STATES, timestampMs } from './trustModel';
import { persistScopeRows } from './runtimeLedgerService';

const EVENT_KEY = 'alphonso_session_events_v1';
export const SESSION_EVENT_SCOPE = 'session_events_v1';

function readEvents() {
  try {
    const raw = localStorage.getItem(EVENT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeEvents(events) {
  const rows = events.slice(-1500);
  localStorage.setItem(EVENT_KEY, JSON.stringify(rows));
  persistScopeRows(SESSION_EVENT_SCOPE, rows, (row) => ({
    id: row.id,
    data: row,
    status: row.category || 'session_event',
    confidence: row.confidence || TRUST_STATES.TEMPORARY,
    verificationState: row.verificationState || TRUST_STATES.UNVERIFIED,
    timestampMs: Number(row.timestampMs || timestampMs())
  }));
}

export function appendSessionEvent({
  category,
  title,
  details,
  agent = 'alphonso',
  confidence = TRUST_STATES.TEMPORARY,
  verificationState = TRUST_STATES.UNVERIFIED
}) {
  const events = readEvents();
  const event = {
    id: `evt-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    timestampMs: timestampMs(),
    category,
    title,
    details,
    agent,
    confidence,
    verificationState
  };
  events.push(event);
  writeEvents(events);
  return event;
}

export function listSessionEvents() {
  return readEvents();
}

export function summarizeSession(hours = 24) {
  const now = timestampMs();
  const windowStart = now - (hours * 60 * 60 * 1000);
  const rows = readEvents().filter((event) => event.timestampMs >= windowStart);

  const counts = rows.reduce((acc, row) => {
    acc[row.category] = (acc[row.category] || 0) + 1;
    return acc;
  }, {});

  const warnings = rows.filter((row) => row.verificationState === TRUST_STATES.FAILED);
  const unresolved = rows.filter((row) => row.category === 'task' && row.details?.status !== 'resolved');

  return {
    generatedAtMs: now,
    hours,
    totalEvents: rows.length,
    byCategory: counts,
    warnings: warnings.slice(-20),
    unresolved: unresolved.slice(-20),
    recommendations: [
      warnings.length > 0 ? 'Review failed verification events before executing new high-risk actions.' : 'Verification failures are low in this period.',
      unresolved.length > 0 ? 'Resolve pending tasks in the handoff queue for smoother multi-agent flow.' : 'Task queue is mostly stable.'
    ]
  };
}
