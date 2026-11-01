import React from 'react';
import { Play, Trash2 } from 'lucide-react';
import { TeamsPage } from './teams/TeamsPage';
import { DeadLetterQueueView } from './DeadLetterQueueView';
import { Tabs } from './ui/Tabs';
import {
  createSchedule,
  listSchedules,
  saveSchedule,
  deleteSchedule,
  runSchedule,
  isBuiltInJob,
  SCHEDULE_PRESETS,
  type Schedule,
  type ScheduleRunResult,
} from '../services/joseSchedulerService';

const RUN_STATE_TEXT: Record<ScheduleRunResult['state'], string> = {
  done: 'Finished',
  waiting_approval: 'Waiting for your approval',
  failed: 'Failed',
  skipped: 'Nothing to do',
};

const TIMING_PRESETS = SCHEDULE_PRESETS.filter((p) => !p.handler);
const JOB_PRESETS = SCHEDULE_PRESETS.filter((p) => p.handler);
const COMMAND = 'command';

/**
 * Schedules (QA 2026-10-22): a schedule runs either a command for Jose (like a
 * typed one, so Approval Mode still applies) or a built-in agent job, while the
 * app is open. "Run now" really runs it, and each card shows how the last run
 * went. A run that was due while the app was closed runs once when it opens.
 */
function JoseSchedulerPanel() {
  const [schedules, setSchedules] = React.useState<Schedule[]>(() => listSchedules());
  const [newName, setNewName] = React.useState('');
  const [newCommand, setNewCommand] = React.useState('');
  const [what, setWhat] = React.useState(COMMAND);
  const [timing, setTiming] = React.useState('hourly');
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [runningId, setRunningId] = React.useState<string | null>(null);

  const refresh = () => setSchedules(listSchedules());
  const isJob = what !== COMMAND;
  const job = JOB_PRESETS.find((p) => p.id === what);
  const canCreate = Boolean(newName.trim()) && (isJob || Boolean(newCommand.trim()));

  // Scheduled runs finish in the background; keep the cards current.
  React.useEffect(() => {
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, []);

  const handleCreate = () => {
    if (!canCreate) return;
    const result = createSchedule({ name: newName, commandText: isJob ? '' : newCommand, presetId: isJob ? what : timing });
    if (result && 'success' in result && !result.success) {
      setCreateError(result.error ?? 'Failed to create schedule');
      return;
    }
    setCreateError(null);
    setNewName('');
    setNewCommand('');
    setWhat(COMMAND);
    setTiming('hourly');
    refresh();
  };

  const handleToggle = (sched: Schedule) => {
    saveSchedule({ ...sched, enabled: !sched.enabled });
    refresh();
  };

  const handleRunNow = async (sched: Schedule) => {
    setRunningId(sched.id);
    try {
      await runSchedule(sched.id);
    } finally {
      setRunningId(null);
      refresh();
    }
  };

  const handleDelete = (id: string) => {
    deleteSchedule(id);
    refresh();
  };

  const field = 'bg-(--surface-3) rounded-xl px-3 py-2 text-sm text-(--text-1) placeholder:text-(--text-4) focus:outline-hidden focus:border-(--accent-border)';

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-(--surface-2) p-4 space-y-3">
        <div className="section-label">New Schedule</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input
            value={newName}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewName(e.target.value)}
            placeholder="Schedule name..."
            aria-label="Schedule name"
            className={field}
          />
          <select aria-label="What to run" value={what} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setWhat(e.target.value)} className={field}>
            <option value={COMMAND}>A command for Jose</option>
            {JOB_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
        {isJob ? (
          <div className="text-xs text-(--text-3)">{job?.description}</div>
        ) : (
          <>
            <select aria-label="How often" value={timing} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setTiming(e.target.value)} className={`${field} w-full`}>
              {TIMING_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            <textarea
              value={newCommand}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNewCommand(e.target.value)}
              placeholder="What Jose should do each time, e.g. Summarise today's research into a short note"
              aria-label="Command for Jose"
              rows={2}
              className={`${field} w-full`}
            />
            <div className="text-[11px] text-(--text-4)">Runs like a command you type in Chat; anything that needs approval waits for you.</div>
          </>
        )}
        <div className="text-[11px] text-(--text-4)">Schedules run while Alphonso is open. One that was due while it was closed runs once when it opens.</div>
        <button
          onClick={handleCreate}
          disabled={!canCreate}
          className="px-4 py-2 rounded-xl bg-(--accent) hover:bg-(--accent-hover) text-(--accent-contrast) text-xs font-bold uppercase tracking-widest disabled:opacity-40 transition-colors"
        >
          Create Schedule
        </button>
      </div>
      {createError && (
        <div className="text-xs text-(--error) px-1">{createError}</div>
      )}

      <div className="rounded-2xl bg-(--surface-2) p-4 space-y-3">
        <div className="section-label">Schedules ({schedules.length})</div>
        {schedules.length === 0 && (
          <div className="text-xs text-(--text-4) py-2">No schedules yet. Create one above.</div>
        )}
        {schedules.map((sched) => (
          <div key={sched.id} className="flex items-center justify-between px-3 py-2 rounded-xl bg-(--surface-3)" data-testid="schedule-card">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-(--text-1)">{sched.name}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-sm text-(--text-3)">
                  {SCHEDULE_PRESETS.find((p) => p.id === sched.presetId)?.label || sched.presetId}
                </span>
              </div>
              {!isBuiltInJob(sched.presetId) && <div className="text-[10px] text-(--text-4) mt-0.5 truncate">{sched.commandText}</div>}
              <div className="text-[10px] text-(--text-4) mt-0.5">
                {sched.enabled ? `Next run: ${new Date(sched.nextRunAtMs).toLocaleString()}` : 'Off'}
              </div>
              {runningId === sched.id && <div className="text-[10px] text-(--text-3) mt-0.5" role="status">Running…</div>}
              {runningId !== sched.id && sched.lastResult && (
                <div className={`text-[10px] mt-0.5 ${sched.lastResult.state === 'failed' ? 'text-(--error)' : 'text-(--text-3)'}`} role="status">
                  Last run {new Date(sched.lastResult.atMs).toLocaleString()}: {RUN_STATE_TEXT[sched.lastResult.state]}. {sched.lastResult.summary.slice(0, 200)}
                </div>
              )}
              {runningId !== sched.id && sched.lastResult?.details && (
                <details className="mt-1">
                  <summary className="text-[10px] text-(--accent) cursor-pointer">Show result</summary>
                  <div className="mt-1 text-[11px] leading-relaxed whitespace-pre-wrap text-(--text-2)" data-testid="schedule-result">{sched.lastResult.details}</div>
                </details>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-3">
              <button
                onClick={() => void handleRunNow(sched)}
                disabled={runningId === sched.id}
                className="p-1.5 rounded-lg text-(--text-3) hover:text-(--success) hover:border-(--success-border) transition-colors disabled:opacity-40"
                title="Run now"
                aria-label={`Run ${sched.name} now`}
              >
                <Play className="w-3 h-3" />
              </button>
              <button
                onClick={() => handleToggle(sched)}
                className={`text-[10px] px-2 py-1 rounded-lg border font-semibold transition-colors ${
                  sched.enabled
                    ? 'border-(--success-border) text-(--success) hover:bg-(--success-dim)'
                    : 'border-(--border) text-(--text-3) hover:border-(--accent-border)'
                }`}
              >
                {sched.enabled ? 'On' : 'Off'}
              </button>
              <button
                onClick={() => handleDelete(sched.id)}
                className="p-1.5 rounded-lg text-(--text-3) hover:text-(--error) hover:border-(--error-border) transition-colors"
                title="Delete"
                aria-label={`Delete ${sched.name}`}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Automation (2.11.0 QA, owner 2026-11-01): Teams (saved agents and their jobs, each run a real Jose
 * request) and Schedules (a request or a team on a timer), plus the dead letter queue. The visual
 * Builder (its steps had no code behind them) and the 16 canned operations (made-up text) were
 * archived to archive/MIGHTBEUSEDLATER/automation/.
 */
export function AutomationView({ onOpenJoseBoard }: { onOpenJoseBoard?: (requestId: string) => void }) {
  const [activeTab, setActiveTab] = React.useState('teams');

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-6 pt-4 pb-0 shrink-0">
        <Tabs
          tabs={[
            { id: 'teams', label: 'Teams' },
            { id: 'schedules', label: 'Schedules' },
            { id: 'deadletter', label: 'Dead Letter' }
          ]}
          activeId={activeTab}
          onChange={setActiveTab}
        />
      </div>

      {activeTab === 'deadletter' ? (
        <div className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full">
          <DeadLetterQueueView />
        </div>
      ) : activeTab === 'schedules' ? (
        <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-4xl mx-auto w-full">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-(--text-1)">Jose Scheduler</h2>
              <p className="text-xs text-(--text-3) mt-0.5">Runs a request, or a team (/team &lt;name&gt; …), on a timer.</p>
            </div>
          </div>
          <JoseSchedulerPanel />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-6 max-w-5xl mx-auto w-full">
          <TeamsPage onOpenJoseBoard={onOpenJoseBoard} />
        </div>
      )}
    </div>
  );
}
