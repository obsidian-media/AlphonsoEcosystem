import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createSchedule,
  listSchedules,
  saveSchedule,
  deleteSchedule,
  startScheduler,
  stopScheduler,
  runSchedule,
  tickScheduler,
  nextCronMs,
  SCHEDULE_PRESETS,
} from '../services/joseSchedulerService';

// Agent phase 2: the daily Nova job asks her through Jose what to do next.
vi.mock('../services/nova/novaDaily', () => ({
  askNovaWhatNext: vi.fn(async () => ({ state: 'done', summary: 'Nova: What to do first: approve the launch video.' })),
}));
// Agent phase 4: the daily Sentinel job asks him through Jose to review the week.
vi.mock('../services/sentinel/sentinelWeekly', () => ({
  askSentinelWeekReview: vi.fn(async () => ({ state: 'done', summary: 'Safe. Nothing else found.' })),
}));
// Agent phase 3: the weekly Maria job asks her through Jose about the week's risks.
vi.mock('../services/maria/mariaWeekly', () => ({
  askMariaWeeklyRisks: vi.fn(async () => ({ state: 'done', summary: 'Maria: low risk.' })),
}));
// Agent phase 7: the weekly Echo job asks him to tidy memory.
vi.mock('../services/echo/cleanup', () => ({
  askEchoCleanup: vi.fn(async () => ({ state: 'done', summary: 'Echo proposes 2 changes to memory.' })),
}));
vi.mock('../services/agentActivityService', () => ({
  appendAgentActivity: vi.fn(),
  listAgentActivity: vi.fn(() => []),
}));
vi.mock('../services/orchestrationReceiptService', () => ({
  listOrchestrationReceipts: vi.fn(() => []),
}));

// ── Mocks ─────────────────────────────────────────────────────────────────────

const localStorageMock = (() => {
  let store = {};
  return {
    getItem: vi.fn((key) => store[key] || null),
    setItem: vi.fn((key, value) => { store[key] = value; }),
    removeItem: vi.fn((key) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();

Object.defineProperty(global, 'localStorage', { value: localStorageMock });

// ── SCHEDULE_PRESETS ──────────────────────────────────────────────────────────

describe('SCHEDULE_PRESETS', () => {
  it('has at least 4 interval presets', () => {
    expect(SCHEDULE_PRESETS.length).toBeGreaterThanOrEqual(4);
    expect(SCHEDULE_PRESETS.some((p) => p.id === '30min')).toBe(true);
    expect(SCHEDULE_PRESETS.some((p) => p.id === 'hourly')).toBe(true);
    expect(SCHEDULE_PRESETS.some((p) => p.id === 'daily')).toBe(true);
    expect(SCHEDULE_PRESETS.some((p) => p.id === 'weekly')).toBe(true);
  });

  it('has correct intervals', () => {
    expect(SCHEDULE_PRESETS.find((p) => p.id === '30min').intervalMs).toBe(30 * 60 * 1000);
    expect(SCHEDULE_PRESETS.find((p) => p.id === 'hourly').intervalMs).toBe(60 * 60 * 1000);
    expect(SCHEDULE_PRESETS.find((p) => p.id === 'daily').intervalMs).toBe(24 * 60 * 60 * 1000);
    expect(SCHEDULE_PRESETS.find((p) => p.id === 'weekly').intervalMs).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

// ── createSchedule ────────────────────────────────────────────────────────────

describe('createSchedule', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('creates a schedule with correct fields', () => {
    const sched = createSchedule({ name: 'Test', commandText: 'do something', presetId: 'hourly' });
    expect(sched.id).toMatch(/^sched_/);
    expect(sched.name).toBe('Test');
    expect(sched.commandText).toBe('do something');
    expect(sched.presetId).toBe('hourly');
    expect(sched.enabled).toBe(true);
    expect(sched.intervalMs).toBe(60 * 60 * 1000);
    expect(sched.agentId).toBe('jose');
    expect(sched.lastRunAtMs).toBeNull();
    expect(sched.nextRunAtMs).toBeGreaterThan(Date.now());
    expect(sched.createdAtMs).toBeGreaterThan(0);
  });

  it('persists to localStorage', () => {
    createSchedule({ name: 'Persisted', commandText: 'test' });
    expect(localStorageMock.setItem).toHaveBeenCalled();
  });

  it('defaults to hourly preset', () => {
    const sched = createSchedule({ name: 'Default', commandText: 'test' });
    expect(sched.presetId).toBe('hourly');
  });
});

// ── listSchedules ─────────────────────────────────────────────────────────────

describe('listSchedules', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('returns empty array when no schedules', () => {
    expect(listSchedules()).toEqual([]);
  });

  it('returns all created schedules', () => {
    createSchedule({ name: 'S1', commandText: 'cmd1' });
    createSchedule({ name: 'S2', commandText: 'cmd2' });
    const all = listSchedules();
    expect(all.length).toBe(2);
    expect(all[0].name).toBe('S1');
    expect(all[1].name).toBe('S2');
  });
});

// ── saveSchedule ──────────────────────────────────────────────────────────────

describe('saveSchedule', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('updates an existing schedule', () => {
    const sched = createSchedule({ name: 'Original', commandText: 'cmd' });
    saveSchedule({ ...sched, name: 'Updated', enabled: false });
    const all = listSchedules();
    expect(all[0].name).toBe('Updated');
    expect(all[0].enabled).toBe(false);
  });
});

// ── deleteSchedule ────────────────────────────────────────────────────────────

describe('deleteSchedule', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('deletes a schedule by id', () => {
    const sched = createSchedule({ name: 'ToDelete', commandText: 'cmd' });
    const result = deleteSchedule(sched.id);
    expect(result).toBe(true);
    expect(listSchedules().length).toBe(0);
  });

  it('returns false for non-existent id', () => {
    const result = deleteSchedule('nonexistent');
    expect(result).toBe(false);
  });
});

// ── Running (QA 2026-10-22: until then no schedule ran anything) ──────────────

function makeDue() {
  const all = listSchedules();
  all.forEach((s) => { s.nextRunAtMs = Date.now() - 1000; });
  localStorageMock.setItem('alphonso_jose_schedules_v1', JSON.stringify(all));
}

describe('running schedules', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorageMock.clear();
    stopScheduler();
  });

  afterEach(() => {
    vi.useRealTimers();
    stopScheduler();
  });

  it('returns a stop function', () => {
    const stop = startScheduler({ runCommand: vi.fn() });
    expect(typeof stop).toBe('function');
    stop();
  });

  it('runs a due command through Jose and saves the result', async () => {
    const runCommand = vi.fn(async () => ({ ok: true, summary: 'Summary written.', pendingApprovalCount: 0 }));
    const onResult = vi.fn();
    startScheduler({ runCommand, onResult });
    createSchedule({ name: 'Due', commandText: 'summarise today', presetId: 'hourly' });
    makeDue();

    await vi.advanceTimersByTimeAsync(61_000);

    expect(runCommand).toHaveBeenCalledWith('summarise today', expect.objectContaining({ name: 'Due' }));
    const saved = listSchedules()[0];
    expect(saved.lastResult).toMatchObject({ state: 'done', summary: 'Summary written.' });
    expect(saved.nextRunAtMs).toBeGreaterThan(Date.now());
    expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ name: 'Due' }), expect.objectContaining({ state: 'done' }));
  });

  it('reports work that waits for approval, and failures', async () => {
    const runCommand = vi.fn()
      .mockResolvedValueOnce({ ok: true, summary: 'Prepared a post.', pendingApprovalCount: 1 })
      .mockResolvedValueOnce({ ok: false, error: 'Command could not be parsed.' });
    startScheduler({ runCommand });
    const sched = createSchedule({ name: 'Post', commandText: 'post the update', presetId: 'hourly' });
    expect((await runSchedule(sched.id)).state).toBe('waiting_approval');
    const failed = await runSchedule(sched.id);
    expect(failed).toMatchObject({ state: 'failed', summary: 'Command could not be parsed.' });
    expect(listSchedules()[0].lastResult.state).toBe('failed');
  });

  it('does not run future or switched-off schedules', async () => {
    const runCommand = vi.fn(async () => ({ ok: true }));
    startScheduler({ runCommand });
    createSchedule({ name: 'Future', commandText: 'cmd', presetId: 'weekly' });
    const off = createSchedule({ name: 'Off', commandText: 'cmd', presetId: 'hourly' });
    saveSchedule({ ...off, enabled: false, nextRunAtMs: Date.now() - 1000 });
    await vi.advanceTimersByTimeAsync(61_000);
    expect(runCommand).not.toHaveBeenCalled();
  });

  it('stops running after stopScheduler', async () => {
    const runCommand = vi.fn(async () => ({ ok: true }));
    startScheduler({ runCommand });
    createSchedule({ name: 'Due', commandText: 'cmd' });
    makeDue();
    stopScheduler();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(runCommand).not.toHaveBeenCalled();
  });

  it('runs the built-in jobs with the real agent functions', async () => {
    const { listAgentActivity, appendAgentActivity } = await import('../services/agentActivityService');
    listAgentActivity.mockReturnValue([{ agent: 'jose', action: 'executed', detail: 'wrote a report', ts: Date.now() }]);
    appendAgentActivity.mockClear();
    startScheduler({ runCommand: vi.fn() });
    const cases = [
      ['nova_daily_scan', 'What to do first: approve the launch video.'],
      ['sentinel_daily_summary', 'Safe. Nothing else found.'],
      ['maria_weekly_audit', 'Maria: low risk.'],
      ['echo_weekly_cleanup', 'Echo proposes 2 changes to memory.'],
    ];
    for (const [presetId, text] of cases) {
      const job = createSchedule({ name: presetId, presetId });
      const result = await runSchedule(job.id);
      expect(result.state).toBe('done');
      expect(result.summary).toContain(text);
    }
    expect(appendAgentActivity).toHaveBeenCalledTimes(4);
    expect(SCHEDULE_PRESETS.find((p) => p.id === 'echo_weekly_cleanup')).toMatchObject({ cron: '0 20 * * 0', label: 'Echo: tidy memory', handler: 'echo_cleanup' });
    expect(SCHEDULE_PRESETS.some((p) => p.id === 'echo_nightly_consolidation')).toBe(false);
  });

  it('the weekly Maria job is a request to her', async () => {
    const { listAgentActivity } = await import('../services/agentActivityService');
    listAgentActivity.mockReturnValue([{ agent: 'marcus', action: 'executed', detail: 'sent a post', ts: Date.now() }]);
    const { askMariaWeeklyRisks } = await import('../services/maria/mariaWeekly');
    startScheduler({ runCommand: vi.fn() });
    const job = createSchedule({ name: 'Maria', presetId: 'maria_weekly_audit' });
    await runSchedule(job.id);
    expect(askMariaWeeklyRisks).toHaveBeenCalledWith(expect.stringContaining('sent a post'));
    expect(SCHEDULE_PRESETS.find((p) => p.id === 'maria_weekly_audit').label).toBe("Maria: the week's risks");
  });

  it("the daily Sentinel job is a review of the week", async () => {
    const { listAgentActivity } = await import('../services/agentActivityService');
    listAgentActivity.mockReturnValue([{ agent: 'marcus', action: 'executed', detail: 'sent a post', ts: Date.now() }]);
    const { askSentinelWeekReview } = await import('../services/sentinel/sentinelWeekly');
    startScheduler({ runCommand: vi.fn() });
    const job = createSchedule({ name: 'Sentinel', presetId: 'sentinel_daily_summary' });
    await runSchedule(job.id);
    expect(askSentinelWeekReview).toHaveBeenCalledWith(expect.stringContaining('sent a post'), { source: 'schedule' });
    expect(SCHEDULE_PRESETS.find((p) => p.id === 'sentinel_daily_summary').label).toBe("Sentinel: the week's security");
  });

  it('App starts no background scan', async () => {
    const { readFileSync } = await import('node:fs');
    expect(readFileSync('src/App.tsx', 'utf8')).not.toContain('startScheduledScans');
  });

  it('App starts no weekly report of its own', async () => {
    const { readFileSync } = await import('node:fs');
    const app = readFileSync('src/App.tsx', 'utf8');
    expect(app).not.toContain('scheduleWeeklyGeneration');
    expect(app).not.toContain('Maria weekly report ready');
  });

  it('says so when a built-in job has nothing to review', async () => {
    const { listAgentActivity } = await import('../services/agentActivityService');
    listAgentActivity.mockReturnValue([]);
    startScheduler({ runCommand: vi.fn() });
    const job = createSchedule({ name: 'Nova', presetId: 'nova_daily_scan' });
    expect((await runSchedule(job.id)).state).toBe('skipped');
  });

  it('needs a command unless it is a built-in job', () => {
    expect(createSchedule({ name: 'Empty', commandText: '  ', presetId: 'hourly' })).toMatchObject({ success: false });
    expect(createSchedule({ name: 'Job', presetId: 'hector_morning_briefing' }).id).toMatch(/^sched_/);
  });

  it('only runs due schedules when ticked', () => {
    startScheduler({ runCommand: vi.fn(async () => ({ ok: true })) });
    createSchedule({ name: 'Due', commandText: 'cmd' });
    expect(tickScheduler()).toEqual([]);
    makeDue();
    expect(tickScheduler()).toHaveLength(1);
  });
});

describe('nextCronMs', () => {
  const at = (y, mo, d, h, mi) => new Date(y, mo - 1, d, h, mi, 0, 0).getTime();

  it('finds the next daily time', () => {
    expect(nextCronMs('0 9 * * *', at(2026, 10, 22, 8, 30))).toBe(at(2026, 10, 22, 9, 0));
    expect(nextCronMs('0 9 * * *', at(2026, 10, 22, 9, 0))).toBe(at(2026, 10, 23, 9, 0));
  });

  it('handles "every N minutes", which used to give an invalid date', () => {
    expect(nextCronMs('*/15 * * * *', at(2026, 10, 22, 10, 7))).toBe(at(2026, 10, 22, 10, 15));
  });

  it('honours the weekday (Monday at 9:00)', () => {
    // 2026-10-22 is a Thursday; the next Monday is 2026-10-26.
    expect(nextCronMs('0 9 * * 1', at(2026, 10, 22, 12, 0))).toBe(at(2026, 10, 26, 9, 0));
  });

  it('rejects an invalid time when creating', () => {
    expect(createSchedule({ name: 'Bad', commandText: 'x', cron: '61 * * * *' })).toMatchObject({ success: false });
    expect(createSchedule({ name: 'Ok', commandText: 'x', cron: '*/5 * * * *' }).cron).toBe('*/5 * * * *');
  });
});
