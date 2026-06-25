// ── Jose Scheduler Service ─────────────────────────────────────────────────────
// Interval-based task scheduler for Jose orchestrator agent.
// No cron library — uses simple intervalMs presets.

const STORAGE_KEY = 'alphonso_jose_schedules_v1';
const MAX_SCHEDULES = 100;

export const SCHEDULE_PRESETS = [
  { id: '30min', label: 'Every 30 minutes', intervalMs: 30 * 60 * 1000 },
  { id: 'hourly', label: 'Every hour', intervalMs: 60 * 60 * 1000 },
  { id: 'daily', label: 'Every day', intervalMs: 24 * 60 * 60 * 1000 },
  { id: 'weekly', label: 'Every week', intervalMs: 7 * 24 * 60 * 60 * 1000 },
];

/**
 * @typedef {{ id: string, name: string, commandText: string, presetId: string, intervalMs: number, agentId: string, enabled: boolean, lastRunAtMs: number|null, nextRunAtMs: number, createdAtMs: number }} Schedule
 */

function _load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function _save(schedules) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(schedules.slice(-MAX_SCHEDULES)));
  } catch { /* ignore */ }
}

/**
 * Create a new schedule.
 * @param {{ name: string, commandText: string, presetId?: string, intervalMs?: number, agentId?: string }} params
 * @returns {Schedule}
 */
export function createSchedule({ name, commandText, presetId = 'hourly', intervalMs, agentId = 'jose' }) {
  const preset = SCHEDULE_PRESETS.find((p) => p.id === presetId) || SCHEDULE_PRESETS[1];
  const resolvedInterval = intervalMs || preset.intervalMs;
  const now = Date.now();

  const schedule = {
    id: `sched_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: String(name || 'Untitled Schedule').slice(0, 100),
    commandText: String(commandText || '').slice(0, 2000),
    presetId: preset.id,
    intervalMs: resolvedInterval,
    agentId: String(agentId || 'jose'),
    enabled: true,
    lastRunAtMs: null,
    nextRunAtMs: now + resolvedInterval,
    createdAtMs: now,
  };

  const schedules = _load();
  schedules.push(schedule);
  _save(schedules);
  return schedule;
}

/**
 * List all schedules.
 * @returns {Schedule[]}
 */
export function listSchedules() {
  return _load();
}

/**
 * Save/update an existing schedule.
 * @param {Schedule} schedule
 */
export function saveSchedule(schedule) {
  const schedules = _load();
  const idx = schedules.findIndex((s) => s.id === schedule.id);
  if (idx === -1) return;
  schedules[idx] = { ...schedules[idx], ...schedule };
  _save(schedules);
}

/**
 * Delete a schedule by id.
 * @param {string} id
 * @returns {boolean}
 */
export function deleteSchedule(id) {
  const schedules = _load();
  const filtered = schedules.filter((s) => s.id !== id);
  if (filtered.length === schedules.length) return false;
  _save(filtered);
  return true;
}

let _schedulerInterval = null;

/**
 * Start the scheduler. Checks every 60s for due schedules and fires callback.
 * @param {(schedule: Schedule) => void} callback
 * @returns {() => void} stop function
 */
export function startScheduler(callback) {
  stopScheduler();

  _schedulerInterval = setInterval(() => {
    const now = Date.now();
    const schedules = _load();
    let changed = false;

    for (let i = 0; i < schedules.length; i++) {
      const s = schedules[i];
      if (!s.enabled) continue;
      if (s.nextRunAtMs > now) continue;

      schedules[i] = {
        ...s,
        lastRunAtMs: now,
        nextRunAtMs: now + s.intervalMs,
      };
      changed = true;

      try {
        callback(schedules[i]);
      } catch { /* non-critical */ }
    }

    if (changed) _save(schedules);
  }, 60_000);

  return stopScheduler;
}

/**
 * Stop the scheduler interval.
 */
export function stopScheduler() {
  if (_schedulerInterval !== null) {
    clearInterval(_schedulerInterval);
    _schedulerInterval = null;
  }
}
