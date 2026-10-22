// ── Jose Scheduler Service ─────────────────────────────────────────────────────
// Runs scheduled work while the app is open: either a command for Jose (run
// through the same pipeline as chat, so Approval Mode still applies) or one of
// the built-in agent jobs (Nova, Sentinel, Echo, Hector, Maria).
//
// QA 2026-10-22: until then no schedule ran anything. A due command only showed
// a notification saying "Executing: …", "Run now" sent an event nothing listened
// for, four of the five built-in jobs called functions that don't exist (the
// error was swallowed), and an "every N" time (`*/5`) produced an invalid date.
// Each run's outcome is now saved on the schedule (`lastResult`).

const STORAGE_KEY = 'alphonso_jose_schedules_v1';
const MAX_SCHEDULES = 100;
const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export interface SchedulePreset {
  id: string;
  label: string;
  intervalMs?: number;
  cron?: string;
  /** Present on a built-in agent job: it runs this job, not a command. */
  handler?: string;
  description?: string;
}

export const SCHEDULE_PRESETS: SchedulePreset[] = [
  { id: '30min', label: 'Every 30 minutes', intervalMs: 30 * 60 * 1000 },
  { id: 'hourly', label: 'Every hour', intervalMs: 60 * 60 * 1000 },
  { id: 'daily', label: 'Every day', intervalMs: 24 * 60 * 60 * 1000 },
  { id: 'weekly', label: 'Every week', intervalMs: 7 * 24 * 60 * 60 * 1000 },
  { id: 'nova_daily_scan', cron: '0 9 * * *', label: 'Nova Daily Opportunity Scan', handler: 'nova_scan', description: "Every day at 9:00, Nova looks over the last week's work for opportunities." },
  { id: 'sentinel_daily_summary', cron: '0 8 * * *', label: 'Sentinel Daily Threat Summary', handler: 'sentinel_summary', description: "Every day at 8:00, Sentinel checks the last week's work for risky actions." },
  { id: 'echo_nightly_consolidation', cron: '0 2 * * *', label: 'Echo Nightly Memory Consolidation', handler: 'echo_consolidate', description: 'Every night at 2:00, Echo summarises memories older than a week.' },
  { id: 'hector_morning_briefing', cron: '0 7 * * *', label: 'Hector Morning Research Briefing', handler: 'hector_brief', description: 'Every day at 7:00, Hector collects the top headlines from his news feeds.' },
  { id: 'maria_weekly_audit', cron: '0 9 * * 1', label: 'Maria Weekly Governance Audit', handler: 'maria_audit', description: "Every Monday at 9:00, Maria reviews the past week's agent actions." },
];

export type ScheduleRunState = 'done' | 'waiting_approval' | 'failed' | 'skipped';

export interface ScheduleRunResult {
  state: ScheduleRunState;
  summary: string;
  /** The work itself: each agent's report for a command (what Chat shows as "Agent Reports"). */
  details?: string;
  atMs: number;
}

export interface Schedule {
  id: string;
  name: string;
  commandText: string;
  presetId: string;
  intervalMs: number;
  agentId: string;
  enabled: boolean;
  lastRunAtMs: number | null;
  nextRunAtMs: number;
  createdAtMs: number;
  cron?: string;
  lastResult?: ScheduleRunResult;
}

export function isBuiltInJob(presetId: string): boolean {
  return Boolean(SCHEDULE_PRESETS.find((p) => p.id === presetId)?.handler);
}

// ── Cron (minute hour day-of-month month weekday; numbers, *, */n) ──────────

const CRON_RANGES: Array<[number, number]> = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 6]];

function cronFieldMatches(field: string, value: number): boolean {
  if (field === '*') return true;
  if (field.startsWith('*/')) {
    const step = parseInt(field.slice(2), 10);
    return step > 0 && value % step === 0;
  }
  return parseInt(field, 10) === value;
}

function validateCronExpression(cron: unknown): boolean {
  if (typeof cron !== 'string') return false;
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  return fields.every((field, i) => {
    const [min, max] = CRON_RANGES[i];
    if (field === '*') return true;
    const step = /^\*\/(\d+)$/.exec(field);
    if (step) return Number(step[1]) >= 1 && Number(step[1]) <= max;
    if (!/^\d+$/.test(field)) return false;
    const n = Number(field);
    return n >= min && n <= max;
  });
}

/** The next minute after `fromMs` that matches `cron` (searches up to a year ahead). */
export function nextCronMs(cron: string, fromMs: number = Date.now()): number {
  const [minute, hour, day, month, weekday] = cron.trim().split(/\s+/);
  const next = new Date(fromMs);
  next.setSeconds(0, 0);
  next.setMinutes(next.getMinutes() + 1);
  for (let i = 0; i < 366 * 24 * 60; i++) {
    if (
      cronFieldMatches(month, next.getMonth() + 1)
      && cronFieldMatches(day, next.getDate())
      && cronFieldMatches(weekday, next.getDay())
      && cronFieldMatches(hour, next.getHours())
      && cronFieldMatches(minute, next.getMinutes())
    ) {
      return next.getTime();
    }
    next.setMinutes(next.getMinutes() + 1);
  }
  return fromMs + 24 * 60 * 60 * 1000;
}

// ── Built-in agent jobs ─────────────────────────────────────────────────────

/** Recent agent work as text, for the jobs that review it. */
async function recentWorkText(): Promise<string> {
  const since = Date.now() - RECENT_WINDOW_MS;
  const lines: string[] = [];
  try {
    const { listOrchestrationReceipts } = await import('./orchestrationReceiptService');
    for (const r of listOrchestrationReceipts().filter((row) => Number(row.timestampMs || 0) > since).slice(0, 60)) {
      const detail = String(r.details?.summary || r.details?.error || '').slice(0, 200);
      lines.push(`${r.agent} ${r.eventType} ${r.status}${detail ? `: ${detail}` : ''}`);
    }
  } catch { /* receipts unavailable */ }
  try {
    const { listAgentActivity } = await import('./agentActivityService');
    for (const a of listAgentActivity().filter((row) => row.ts > since).slice(-60)) {
      lines.push(`${a.agent} ${a.action}${a.detail ? `: ${String(a.detail).slice(0, 200)}` : ''}`);
    }
  } catch { /* activity unavailable */ }
  return lines.join('\n');
}

async function recordActivity(agent: string, action: string, detail: string): Promise<void> {
  try {
    const { appendAgentActivity } = await import('./agentActivityService');
    appendAgentActivity({ agent, action, detail });
  } catch { /* activity log unavailable */ }
}

function toast(type: string, message: string): void {
  try {
    window.dispatchEvent(new CustomEvent('alphonso:toast', { detail: { type, message } }));
  } catch { /* no window */ }
}

const NOTHING_RECENT = 'No agent activity in the last 7 days, so there was nothing to review.';

async function runBuiltInJob(handler: string): Promise<Omit<ScheduleRunResult, 'atMs'>> {
  if (handler === 'nova_scan') {
    const work = await recentWorkText();
    if (!work) return { state: 'skipped', summary: NOTHING_RECENT };
    const { runNovaAnalysis, saveOpportunityScore } = await import('./novaAnalysisService');
    const result = await runNovaAnalysis(`Daily opportunity scan of the last week's work:\n${work}`, null, null);
    const score = Number(result.schema?.valueScore);
    // saveOpportunityScore also notifies when the score passes the user's threshold.
    try { if (Number.isFinite(score)) saveOpportunityScore(score, result.summary); } catch { /* history optional */ }
    await recordActivity('nova', 'daily_scan', result.summary);
    return { state: 'done', summary: result.summary };
  }
  if (handler === 'sentinel_summary') {
    const work = await recentWorkText();
    if (!work) return { state: 'skipped', summary: NOTHING_RECENT };
    const { runSentinelSecurityScan } = await import('./sentinelSecurityService');
    const result = await runSentinelSecurityScan(`Daily threat summary of the last week's work:\n${work}`, {} as never);
    await recordActivity('sentinel', 'daily_summary', result.summary);
    return { state: 'done', summary: result.summary };
  }
  if (handler === 'echo_consolidate') {
    const { listMemory } = await import('./unifiedMemoryService.js') as unknown as { listMemory: (f: object) => Array<{ title?: string; content?: string; timestampMs?: number }> };
    const old = listMemory({ namespace: 'shared' })
      .filter((m) => Number(m.timestampMs || 0) < Date.now() - RECENT_WINDOW_MS)
      .slice(-30);
    if (old.length === 0) return { state: 'skipped', summary: 'No memories older than 7 days to consolidate.' };
    const { synthesizeSession } = await import('./echoMemoryService');
    const result = await synthesizeSession(old.map((m) => ({ role: 'note', content: `${m.title || ''}: ${String(m.content || '').slice(0, 400)}` })));
    const summary = result?.summary || `Echo consolidated ${old.length} older memories.`;
    await recordActivity('echo', 'nightly_consolidation', summary);
    return { state: 'done', summary };
  }
  if (handler === 'hector_brief') {
    const { fetchRssSources } = await import('./hectorResearchService.js') as unknown as { fetchRssSources: (q: string, n: number) => Promise<Array<{ title?: string; url?: string }>> };
    const items = await fetchRssSources('morning briefing', 8);
    const top = items.slice(0, 5).map((i) => i.title || i.url).filter(Boolean).join('; ');
    if (!top) return { state: 'failed', summary: "Hector's news feeds returned nothing (offline, or the feeds didn't answer)." };
    await recordActivity('hector', 'morning_briefing', top);
    return { state: 'done', summary: `Top headlines: ${top}` };
  }
  if (handler === 'maria_audit') {
    const work = await recentWorkText();
    if (!work) return { state: 'skipped', summary: NOTHING_RECENT };
    const { runMariaGovernanceAudit } = await import('./mariaAuditService');
    const { getConfiguredOllamaEndpoint } = await import('../lib/ollama');
    const result = await runMariaGovernanceAudit(`Weekly governance audit of the last week's agent actions:\n${work}`, {} as never, { endpoint: getConfiguredOllamaEndpoint() });
    const risk = String(result.schema?.riskLevel || '').toLowerCase();
    if (risk === 'high' || risk === 'critical') toast('warning', `Maria's weekly audit found ${risk} risk. Review recommended.`);
    await recordActivity('maria', 'weekly_audit', result.summary);
    return { state: 'done', summary: result.summary };
  }
  return { state: 'failed', summary: `Unknown built-in job "${handler}".` };
}

// ── Storage ─────────────────────────────────────────────────────────────────

function _load(): Schedule[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function _save(schedules: Schedule[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(schedules.slice(-MAX_SCHEDULES)));
  } catch { /* ignore */ }
}

export function createSchedule({ name, commandText, presetId = 'hourly', intervalMs, agentId = 'jose', cron }: { name: string; commandText?: string; presetId?: string; intervalMs?: number; agentId?: string; cron?: string }): Schedule | { success: false; error: string } {
  if (cron !== undefined && !validateCronExpression(cron)) {
    return { success: false, error: 'Invalid time: use 5 fields (minute hour day month weekday) with numbers, * or */n.' };
  }
  const preset = SCHEDULE_PRESETS.find((p) => p.id === presetId) || SCHEDULE_PRESETS[1];
  if (!preset.handler && !String(commandText || '').trim()) {
    return { success: false, error: 'Write the command Jose should run.' };
  }
  const resolvedCron = cron || preset.cron || null;
  const resolvedInterval = intervalMs || preset.intervalMs || (resolvedCron ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000);
  const now = Date.now();

  const schedule: Schedule = {
    id: `sched_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: String(name || 'Untitled Schedule').slice(0, 100),
    commandText: String(commandText || '').slice(0, 2000),
    presetId: preset.id,
    intervalMs: resolvedInterval,
    ...(resolvedCron ? { cron: resolvedCron } : {}),
    agentId: String(agentId || 'jose'),
    enabled: true,
    lastRunAtMs: null,
    nextRunAtMs: resolvedCron ? nextCronMs(resolvedCron, now) : now + resolvedInterval,
    createdAtMs: now,
  };

  const schedules = _load();
  schedules.push(schedule);
  _save(schedules);
  return schedule;
}

export function listSchedules(): Schedule[] {
  return _load();
}

export function saveSchedule(schedule: Schedule): void {
  const schedules = _load();
  const idx = schedules.findIndex((s) => s.id === schedule.id);
  if (idx === -1) return;
  schedules[idx] = { ...schedules[idx], ...schedule };
  _save(schedules);
}

export function deleteSchedule(id: string): boolean {
  const schedules = _load();
  const filtered = schedules.filter((s) => s.id !== id);
  if (filtered.length === schedules.length) return false;
  _save(filtered);
  return true;
}

// ── Running ─────────────────────────────────────────────────────────────────

export interface CommandRunOutcome {
  ok: boolean;
  summary?: string;
  details?: string;
  pendingApprovalCount?: number;
  error?: string;
}

export interface SchedulerOptions {
  /** Runs a command through Jose (registered by the app shell). */
  runCommand: (commandText: string, schedule: Schedule) => Promise<CommandRunOutcome>;
  /** Told about every finished run (the app shows a notification). */
  onResult?: (schedule: Schedule, result: ScheduleRunResult) => void;
}

let _schedulerInterval: ReturnType<typeof setInterval> | null = null;
let _options: SchedulerOptions | null = null;
const _running = new Set<string>();

async function executeSchedule(schedule: Schedule): Promise<ScheduleRunResult> {
  const preset = SCHEDULE_PRESETS.find((p) => p.id === schedule.presetId);
  try {
    if (preset?.handler) {
      return { ...(await runBuiltInJob(preset.handler)), atMs: Date.now() };
    }
    if (!_options) return { state: 'failed', summary: 'The scheduler is not running.', atMs: Date.now() };
    const outcome = await _options.runCommand(schedule.commandText, schedule);
    if (!outcome.ok) return { state: 'failed', summary: outcome.error || outcome.summary || 'Jose could not run the command.', atMs: Date.now() };
    const details = outcome.details ? String(outcome.details).slice(0, 4000) : undefined;
    if (Number(outcome.pendingApprovalCount || 0) > 0) {
      return { state: 'waiting_approval', summary: `${outcome.summary || 'Jose prepared the work.'} Waiting for your approval (${outcome.pendingApprovalCount}).`, details, atMs: Date.now() };
    }
    return { state: 'done', summary: outcome.summary || 'Finished.', details, atMs: Date.now() };
  } catch (error) {
    return { state: 'failed', summary: error instanceof Error ? error.message : String(error), atMs: Date.now() };
  }
}

/** Run one schedule now and save its result. A schedule never runs twice at once. */
export async function runSchedule(scheduleId: string): Promise<ScheduleRunResult | null> {
  const schedule = _load().find((s) => s.id === scheduleId);
  if (!schedule) return null;
  if (_running.has(scheduleId)) return { state: 'skipped', summary: 'Already running.', atMs: Date.now() };
  _running.add(scheduleId);
  try {
    const result = await executeSchedule(schedule);
    const latest = _load().find((s) => s.id === scheduleId);
    if (latest) saveSchedule({ ...latest, lastResult: result });
    try { _options?.onResult?.({ ...schedule, lastResult: result }, result); } catch { /* listener errors don't stop the scheduler */ }
    return result;
  } finally {
    _running.delete(scheduleId);
  }
}

/** Checks for due schedules now (the interval calls this every minute). */
export function tickScheduler(now: number = Date.now()): string[] {
  const schedules = _load();
  const due: string[] = [];
  for (let i = 0; i < schedules.length; i++) {
    const s = schedules[i];
    if (!s.enabled || s.nextRunAtMs > now) continue;
    schedules[i] = { ...s, lastRunAtMs: now, nextRunAtMs: s.cron ? nextCronMs(s.cron, now) : now + s.intervalMs };
    due.push(s.id);
  }
  if (due.length) _save(schedules);
  for (const id of due) void runSchedule(id);
  return due;
}

export function startScheduler(options: SchedulerOptions): () => void {
  stopScheduler();
  _options = options;
  _schedulerInterval = setInterval(() => tickScheduler(), 60_000);
  return stopScheduler;
}

export function stopScheduler(): void {
  if (_schedulerInterval !== null) {
    clearInterval(_schedulerInterval);
    _schedulerInterval = null;
  }
  _options = null;
}
