// ── Jose Scheduler Service ─────────────────────────────────────────────────────
// Interval-based task scheduler for Jose orchestrator agent.
// No cron library — uses simple intervalMs presets.
/* eslint-disable @typescript-eslint/no-unsafe-function-type */

const STORAGE_KEY = 'alphonso_jose_schedules_v1';
const MAX_SCHEDULES = 100;

export interface SchedulePreset {
  id: string;
  label: string;
  intervalMs?: number;
  cron?: string;
  handler?: string;
}

export const SCHEDULE_PRESETS: SchedulePreset[] = [
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
}

function nextCronMs(cron: string): number {
  const fields = cron.trim().split(/\s+/);
  const minute  = fields[0] === '*' ? null : parseInt(fields[0], 10);
  const hour    = fields[1] === '*' ? null : parseInt(fields[1], 10);
  const weekday = fields[4] === '*' ? null : parseInt(fields[4], 10);
  const now = new Date();
  const next = new Date(now);
  next.setSeconds(0, 0);
  if (minute !== null) next.setMinutes(minute);
  if (hour !== null) next.setHours(hour);
  if (next <= now) next.setDate(next.getDate() + 1);
  if (weekday !== null) {
    let safety = 0;
    while (next.getDay() !== weekday && safety < 7) {
      next.setDate(next.getDate() + 1);
      safety++;
    }
  }
  return next.getTime();
}

function validateCronExpression(cron: unknown): boolean {
  if (typeof cron !== 'string') return false;
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  const fieldPattern = /^(\d+|\*|\*\/\d+)$/;
  return fields.every(f => fieldPattern.test(f));
}

const _runningHandlers = new Set<string>();

const _handlerAgentMap: Record<string, string> = {
  nova_scan: 'nova',
  sentinel_summary: 'sentinel',
  echo_consolidate: 'echo',
  hector_brief: 'hector',
  maria_audit: 'maria',
};

async function _dispatchPresetHandler(handler: string, label: string): Promise<void> {
  if (_runningHandlers.has(handler)) return;
  _runningHandlers.add(handler);
  try {
    window.dispatchEvent(new CustomEvent('alphonso:agent_activity', {
      detail: { agent: _handlerAgentMap[handler] || 'jose', message: `${label} triggered`, timestamp: new Date().toISOString() }
    }));

    if (handler === 'nova_scan') {
      const novaAnalysis = await import('./novaAnalysisService.js') as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
      const unifiedMemory = await import('./unifiedMemoryService.js') as unknown as Record<string, (...args: unknown[]) => unknown>;
      const recentMemories = (unifiedMemory.listMemory as Function)({ namespace: 'shared' }).slice(-20);
      const context = { recentMemories: JSON.stringify(recentMemories).slice(0, 2000) };
      const result = await (novaAnalysis.analyzeOpportunity as Function)(context) as { score?: number } | null;
      if (result && typeof result.score === 'number') {
        await (novaAnalysis.saveOpportunityScore as Function)(result);
        if (result.score > 75) {
          window.dispatchEvent(new CustomEvent('alphonso:toast', {
            detail: { type: 'info', message: 'Nova found a high-value opportunity — check the Nova panel' }
          }));
        }
      }
    } else if (handler === 'sentinel_summary') {
      const sentinelService = await import('./sentinelSecurityService.js') as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
      const agentActivityService = await import('./agentActivityService.js') as unknown as Record<string, (...args: unknown[]) => void>;
      const scan = await (sentinelService.runQuickScan as Function)() as { findings?: unknown[] } | null;
      const summary = scan ? `Sentinel scan: ${scan.findings?.length ?? 0} findings` : 'Sentinel scan complete';
      (agentActivityService.appendAgentActivity as Function)({ agent: 'sentinel', action: 'daily_summary', detail: summary });
    } else if (handler === 'echo_consolidate') {
      const echoService = await import('./echoMemoryService.js') as unknown as Record<string, (...args: unknown[]) => Promise<void>>;
      const unifiedMemory = await import('./unifiedMemoryService.js') as unknown as Record<string, (...args: unknown[]) => unknown>;
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const old = (unifiedMemory.listMemory as Function)({ namespace: 'shared' }).filter((m: { timestampMs?: number }) => Number(m.timestampMs || 0) < sevenDaysAgo);
      if (old.length > 0) {
        await (echoService.synthesizeMemory as Function)(old);
      }
      const lowConf = (unifiedMemory.listMemory as Function)({}).filter((m: { confidence?: number }) => typeof m.confidence === 'number' && m.confidence < 0.3);
      for (const item of lowConf) {
        (unifiedMemory.pushMemory as Function)({ ...item, namespace: item.namespace || 'shared', archived: true });
      }
    } else if (handler === 'hector_brief') {
      const hectorService = await import('./hectorResearchService.js') as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
      const agentActivityService = await import('./agentActivityService.js') as unknown as Record<string, (...args: unknown[]) => void>;
      const items = await (hectorService.fetchRssSources as Function)('morning briefing', 8) as Array<{ title?: string; url?: string }>;
      const top5 = items.slice(0, 5).map(i => i.title || i.url).join('; ');
      (agentActivityService.appendAgentActivity as Function)({ agent: 'hector', action: 'morning_briefing', detail: top5 || 'No sources found' });
    } else if (handler === 'maria_audit') {
      const agentActivityService = await import('./agentActivityService.js') as unknown as Record<string, (...args: unknown[]) => void>;
      const orchestrationService = await import('./orchestrationReceiptService.js') as unknown as Record<string, (...args: unknown[]) => unknown>;
      const mariaService = await import('./mariaAuditService.js') as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
      const receipts = orchestrationService.listOrchestrationReceipts ? (orchestrationService.listOrchestrationReceipts as Function)() : [];
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const weekReceipts = receipts.filter((r: { timestampMs?: number }) => Number(r.timestampMs || 0) > weekAgo);
      const result = await (mariaService.runGovernanceAudit as Function)({ receipts: weekReceipts }) as { riskScore?: number; score?: number };
      const riskScore = result?.riskScore ?? result?.score ?? 0;
      (agentActivityService.appendAgentActivity as Function)({ agent: 'maria', action: 'weekly_audit', detail: `Risk score: ${riskScore}` });
      if (riskScore > 60) {
        window.dispatchEvent(new CustomEvent('alphonso:toast', {
          detail: { type: 'warning', message: `Maria weekly audit: risk score ${riskScore} — review recommended` }
        }));
      }
    }
  } catch { /* non-critical */ }
  finally { _runningHandlers.delete(handler); }
}

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

export function createSchedule({ name, commandText, presetId = 'hourly', intervalMs, agentId = 'jose', cron }: { name: string; commandText: string; presetId?: string; intervalMs?: number; agentId?: string; cron?: string }): Schedule | { success: boolean; error: string } {
  if (cron !== undefined && !validateCronExpression(cron)) {
    return { success: false, error: 'Invalid cron expression: must have 5 fields (minute hour day month weekday)' };
  }
  const preset = SCHEDULE_PRESETS.find((p) => p.id === presetId) || SCHEDULE_PRESETS[1];
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
    nextRunAtMs: resolvedCron ? nextCronMs(resolvedCron) : now + resolvedInterval,
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

let _schedulerInterval: ReturnType<typeof setInterval> | null = null;

export function startScheduler(callback: (schedule: Schedule) => void): () => void {
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

      const matchingPreset = SCHEDULE_PRESETS.find(p => p.id === schedules[i].presetId);
      if (matchingPreset && matchingPreset.handler) {
        _dispatchPresetHandler(matchingPreset.handler, matchingPreset.label);
      }
    }

    if (changed) _save(schedules);
  }, 60_000);

  return stopScheduler;
}

export function stopScheduler(): void {
  if (_schedulerInterval !== null) {
    clearInterval(_schedulerInterval);
    _schedulerInterval = null;
  }
}
