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
  { id: 'nova_daily_scan',              cron: '0 9 * * *', label: 'Nova Daily Opportunity Scan',        handler: 'nova_scan' },
  { id: 'sentinel_daily_summary',       cron: '0 8 * * *', label: 'Sentinel Daily Threat Summary',      handler: 'sentinel_summary' },
  { id: 'echo_nightly_consolidation',   cron: '0 2 * * *', label: 'Echo Nightly Memory Consolidation',  handler: 'echo_consolidate' },
  { id: 'hector_morning_briefing',      cron: '0 7 * * *', label: 'Hector Morning Research Briefing',   handler: 'hector_brief' },
  { id: 'maria_weekly_audit',           cron: '0 9 * * 1', label: 'Maria Weekly Governance Audit',      handler: 'maria_audit' },
];

function nextCronMs(cron) {
  const fields = cron.trim().split(/\s+/);
  const minute  = fields[0] === '*' ? null : parseInt(fields[0], 10);
  const hour    = fields[1] === '*' ? null : parseInt(fields[1], 10);
  const weekday = fields[4] === '*' ? null : parseInt(fields[4], 10); // 0=Sun,1=Mon…6=Sat
  const now = new Date();
  const next = new Date(now);
  next.setSeconds(0, 0);
  if (minute !== null) next.setMinutes(minute);
  if (hour !== null) next.setHours(hour);
  // Advance past the current moment first
  if (next <= now) next.setDate(next.getDate() + 1);
  // If weekday is constrained, advance until we land on the right day
  if (weekday !== null) {
    let safety = 0;
    while (next.getDay() !== weekday && safety < 7) {
      next.setDate(next.getDate() + 1);
      safety++;
    }
  }
  return next.getTime();
}

function validateCronExpression(cron) {
  if (typeof cron !== 'string') return false;
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  const fieldPattern = /^(\d+|\*|\*\/\d+)$/;
  return fields.every(f => fieldPattern.test(f));
}

const _runningHandlers = new Set();

async function _dispatchPresetHandler(handler, label) {
  if (_runningHandlers.has(handler)) return; // prevent concurrent stacking
  _runningHandlers.add(handler);
  try {
    window.dispatchEvent(new CustomEvent('alphonso:agent_activity', {
      detail: { agent: _handlerAgentMap[handler] || 'jose', message: `${label} triggered`, timestamp: new Date().toISOString() }
    }));

    if (handler === 'nova_scan') {
      const { analyzeOpportunity, saveOpportunityScore } = await import('./novaAnalysisService.js');
      const { listMemory } = await import('./unifiedMemoryService.js');
      const recentMemories = listMemory({ namespace: 'shared' }).slice(-20);
      const context = { recentMemories: JSON.stringify(recentMemories).slice(0, 2000) };
      const result = await analyzeOpportunity(context);
      if (result && typeof result.score === 'number') {
        saveOpportunityScore(result);
        if (result.score > 75) {
          window.dispatchEvent(new CustomEvent('alphonso:toast', {
            detail: { type: 'info', message: 'Nova found a high-value opportunity — check the Nova panel' }
          }));
        }
      }
    } else if (handler === 'sentinel_summary') {
      const { runQuickScan } = await import('./sentinelSecurityService.js');
      const { appendAgentActivity } = await import('./agentActivityService.js');
      const scan = await runQuickScan();
      const summary = scan ? `Sentinel scan: ${scan.findings?.length ?? 0} findings` : 'Sentinel scan complete';
      appendAgentActivity({ agent: 'sentinel', action: 'daily_summary', detail: summary });
    } else if (handler === 'echo_consolidate') {
      const { synthesizeMemory } = await import('./echoMemoryService.js');
      const { listMemory, pushMemory } = await import('./unifiedMemoryService.js');
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const old = listMemory({ namespace: 'shared' }).filter(m => Number(m.timestampMs || 0) < sevenDaysAgo);
      if (old.length > 0) {
        await synthesizeMemory(old);
      }
      const lowConf = listMemory({}).filter(m => typeof m.confidence === 'number' && m.confidence < 0.3);
      for (const item of lowConf) {
        pushMemory({ ...item, namespace: item.namespace || 'shared', archived: true });
      }
    } else if (handler === 'hector_brief') {
      const { fetchRssSources } = await import('./hectorResearchService.js');
      const { appendAgentActivity } = await import('./agentActivityService.js');
      const items = await fetchRssSources('morning briefing', 8);
      const top5 = items.slice(0, 5).map(i => i.title || i.url).join('; ');
      appendAgentActivity({ agent: 'hector', action: 'morning_briefing', detail: top5 || 'No sources found' });
    } else if (handler === 'maria_audit') {
      const { appendAgentActivity } = await import('./agentActivityService.js');
      const { listOrchestrationReceipts } = await import('./orchestrationReceiptService.js');
      const { runGovernanceAudit } = await import('./mariaAuditService.js');
      const receipts = listOrchestrationReceipts ? listOrchestrationReceipts() : [];
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const weekReceipts = receipts.filter(r => Number(r.timestampMs || 0) > weekAgo);
      const result = await runGovernanceAudit({ receipts: weekReceipts });
      const riskScore = result?.riskScore ?? result?.score ?? 0;
      appendAgentActivity({ agent: 'maria', action: 'weekly_audit', detail: `Risk score: ${riskScore}` });
      if (riskScore > 60) {
        window.dispatchEvent(new CustomEvent('alphonso:toast', {
          detail: { type: 'warning', message: `Maria weekly audit: risk score ${riskScore} — review recommended` }
        }));
      }
    }
  } catch { /* non-critical */ }
  finally { _runningHandlers.delete(handler); }
}

const _handlerAgentMap = {
  nova_scan: 'nova',
  sentinel_summary: 'sentinel',
  echo_consolidate: 'echo',
  hector_brief: 'hector',
  maria_audit: 'maria',
};

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
export function createSchedule({ name, commandText, presetId = 'hourly', intervalMs, agentId = 'jose', cron }) {
  if (cron !== undefined && !validateCronExpression(cron)) {
    return { success: false, error: 'Invalid cron expression: must have 5 fields (minute hour day month weekday)' };
  }
  const preset = SCHEDULE_PRESETS.find((p) => p.id === presetId) || SCHEDULE_PRESETS[1];
  const resolvedCron = cron || preset.cron || null;
  const resolvedInterval = intervalMs || preset.intervalMs || (resolvedCron ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000);
  const now = Date.now();

  const schedule = {
    id: `sched_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: String(name || 'Untitled Schedule').slice(0, 100),
    commandText: String(commandText || '').slice(0, 2000),
    presetId: preset.id,
    intervalMs: resolvedInterval,
    ...(resolvedCron ? { cron: resolvedCron } : {}),
    agentId: String(agentId || 'jose'),
    enabled: true,
    lastRunAtMs: null,
    nextRunAtMs: resolvedCron ? nextCronMs(resolvedCron) : now + resolvedInterval,
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
        nextRunAtMs: s.cron ? nextCronMs(s.cron) : now + s.intervalMs,
      };
      changed = true;

      try {
        callback(schedules[i]);
      } catch { /* non-critical */ }

      // Fire preset handler if this schedule has one
      const matchingPreset = SCHEDULE_PRESETS.find(p => p.id === schedules[i].presetId);
      if (matchingPreset && matchingPreset.handler) {
        _dispatchPresetHandler(matchingPreset.handler, matchingPreset.label);
      }
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
