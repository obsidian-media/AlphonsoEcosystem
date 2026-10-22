import React from 'react';
import { RefreshCw, Play, Trash2 } from 'lucide-react';
import { createWorkflow, listWorkflows } from '../services/workflowBuilderService';
import { listWorkflowReceipts } from '../services/workflowReceiptService';
import { listWorkflowOperations, updateWorkflowOperationStatus } from '../services/workflowOperationsRegistryService';
import { WorkflowBuilderView } from './WorkflowBuilderView';
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

interface Workflow {
  id: string;
  name: string;
  nodes?: unknown[];
  agentScope?: string;
}

interface WorkflowReceipt {
  id: string;
  workflowId: string;
  status: string;
  createdAtMs?: number;
}

interface WorkflowOperation {
  id: string;
  name: string;
  description?: string;
  status?: string;
  enabled?: boolean;
}

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

export function AutomationView() {
  const [workflows, setWorkflows] = React.useState<Workflow[]>(() => listWorkflows());
  const [runs, setRuns] = React.useState<WorkflowReceipt[]>(() => listWorkflowReceipts());
  const [ops, setOps] = React.useState<WorkflowOperation[]>(() => listWorkflowOperations());
  const [newName, setNewName] = React.useState('');
  const [activeTab, setActiveTab] = React.useState('overview');

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    createWorkflow(name);
    setWorkflows(listWorkflows());
    setNewName('');
  };

  const refresh = () => {
    setWorkflows(listWorkflows());
    setRuns(listWorkflowReceipts());
    setOps(listWorkflowOperations());
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-6 pt-4 pb-0 shrink-0">
        <Tabs
          tabs={[
            { id: 'overview', label: 'Overview' },
            { id: 'builder', label: 'Builder' },
            { id: 'schedules', label: 'Schedules' },
            { id: 'deadletter', label: 'Dead Letter' }
          ]}
          activeId={activeTab}
          onChange={setActiveTab}
        />
      </div>

      {activeTab === 'builder' ? (
        <div className="flex-1 overflow-hidden">
          <WorkflowBuilderView />
        </div>
      ) : activeTab === 'deadletter' ? (
        <div className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full">
          <DeadLetterQueueView />
        </div>
      ) : activeTab === 'schedules' ? (
        <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-4xl mx-auto w-full">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-(--text-1)">Jose Scheduler</h2>
              <p className="text-xs text-(--text-3) mt-0.5">Automated task execution on intervals</p>
            </div>
          </div>
          <JoseSchedulerPanel />
        </div>
      ) : (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-4xl mx-auto w-full">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-serif text-base font-bold text-(--text-1)">Automation</h2>
          <p className="text-xs text-(--text-3) mt-0.5">Build and run multi-agent workflows</p>
        </div>
        <button onClick={refresh} aria-label="Refresh schedules" className="p-2 rounded-lg bg-(--surface-2) text-(--text-3) hover:text-(--text-1) hover:bg-(--surface-3) transition-colors">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="rounded-2xl bg-(--surface-2) p-4 space-y-3">
        <div className="section-label">New Workflow</div>
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewName(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && handleCreate()}
            placeholder="Workflow name..."
            className="flex-1 bg-(--surface-3) rounded-xl px-3 py-2 text-sm text-(--text-1) placeholder:text-(--text-4) focus:outline-hidden focus:border-(--accent-border)"
          />
          <button
            onClick={handleCreate}
            disabled={!newName.trim()}
            className="px-4 py-2 rounded-xl bg-(--accent) hover:bg-(--accent-hover) text-(--accent-contrast) text-xs font-bold uppercase tracking-widest disabled:opacity-40 transition-colors"
          >
            Create
          </button>
        </div>
      </div>

      <div className="rounded-2xl bg-(--surface-2) p-4 space-y-3">
        <div className="section-label">Workflows ({workflows.length})</div>
        {workflows.length === 0 && <div className="text-xs text-(--text-4) py-2">No workflows yet. Create one above.</div>}
        {workflows.map((wf) => (
          <div key={wf.id} className="flex items-center justify-between px-3 py-2 rounded-xl bg-(--surface-3)">
            <div>
              <div className="text-sm font-medium text-(--text-1)">{wf.name}</div>
              <div className="text-[10px] text-(--text-4) font-mono">{wf.id}</div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-(--text-3)">{wf.nodes?.length || 0} nodes</span>
              <span className="text-[10px] px-2 py-0.5 rounded-sm text-(--text-3)">{wf.agentScope || 'shared'}</span>
            </div>
          </div>
        ))}
      </div>

      {ops.length > 0 && (
        <div className="rounded-2xl bg-(--surface-2) p-4 space-y-3">
          <div className="section-label">Registered Operations ({ops.length})</div>
          {ops.slice(0, 20).map((op) => {
            const isActive = op.status === 'active' || op.enabled;
            return (
              <div key={op.id} className="flex items-center justify-between px-3 py-2 rounded-xl bg-(--surface-3)">
                <div>
                  <div className="text-sm font-medium text-(--text-2)">{op.name || op.id}</div>
                  {op.description && <div className="text-[10px] text-(--text-4) mt-0.5">{op.description}</div>}
                </div>
                <button
                  onClick={() => {
                    const nextStatus = isActive ? 'inactive' : 'active';
                    updateWorkflowOperationStatus(op.id, nextStatus, { enabled: !isActive });
                    setOps(listWorkflowOperations());
                  }}
                  className={`text-[10px] px-3 py-1 rounded-lg border font-semibold transition-colors ${
                    isActive
                      ? 'border-(--success-border) text-(--success) hover:bg-(--success-dim)'
                      : 'border-(--border) text-(--text-3) hover:border-(--accent-border) hover:text-(--text-1)'
                  }`}
                >
                  {isActive ? 'Enabled' : 'Enable'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {runs.length > 0 && (
        <div className="rounded-2xl bg-(--surface-2) p-4 space-y-3">
          <div className="section-label">Recent Runs ({runs.length})</div>
          {runs.slice(0, 15).map((run) => (
            <div key={run.id} className="flex items-center justify-between px-3 py-2 rounded-xl bg-(--surface-3)">
              <div>
                <div className="text-xs font-medium text-(--text-2)">{run.workflowId}</div>
                <div className="text-[10px] text-(--text-4)">{new Date(run.createdAtMs || 0).toLocaleString()}</div>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded border ${
                run.status === 'completed' ? 'border-(--success-border) text-(--success)' :
                run.status === 'failed' ? 'border-(--error-border) text-(--error)' :
                'border-(--border) text-(--text-3)'
              }`}>{run.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
      )}
    </div>
  );
}
