import React from 'react';
import { RefreshCw, Play, Trash2 } from 'lucide-react';
import { createWorkflow, listWorkflows } from '../services/workflowBuilderService';
import { listWorkflowReceipts } from '../services/workflowReceiptService';
import { listWorkflowOperations, updateWorkflowOperationStatus } from '../services/workflowOperationsRegistryService';
import { WorkflowBuilderView } from './WorkflowBuilderView';
import { DeadLetterQueueView } from './DeadLetterQueueView';
import {
  createSchedule,
  listSchedules,
  saveSchedule,
  deleteSchedule,
  SCHEDULE_PRESETS,
} from '../services/joseSchedulerService';

interface Schedule {
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
}

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

function JoseSchedulerPanel() {
  const [schedules, setSchedules] = React.useState<Schedule[]>(() => listSchedules());
  const [newName, setNewName] = React.useState('');
  const [newCommand, setNewCommand] = React.useState('');
  const [newPreset, setNewPreset] = React.useState('hourly');
  const [createError, setCreateError] = React.useState<string | null>(null);

  const refresh = () => setSchedules(listSchedules());

  const handleCreate = () => {
    if (!newName.trim() || !newCommand.trim()) return;
    const result = createSchedule({ name: newName, commandText: newCommand, presetId: newPreset });
    if (result && 'success' in result && !result.success) {
      setCreateError((result as any).error ?? 'Failed to create schedule');
      return;
    }
    setCreateError(null);
    setNewName('');
    setNewCommand('');
    setNewPreset('hourly');
    refresh();
  };

  const handleToggle = (sched: Schedule) => {
    saveSchedule({ ...sched, enabled: !sched.enabled });
    refresh();
  };

  const handleRunNow = (sched: Schedule) => {
    window.dispatchEvent(new CustomEvent('alphonso-schedule-run', { detail: sched }));
  };

  const handleDelete = (id: string) => {
    deleteSchedule(id);
    refresh();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 space-y-3">
        <div className="section-label">New Schedule</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input
            value={newName}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewName(e.target.value)}
            placeholder="Schedule name..."
            className="bg-[var(--surface-3)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text-1)] placeholder:text-[var(--text-4)] focus:outline-none focus:border-[var(--accent-border)]"
          />
          <select
            value={newPreset}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setNewPreset(e.target.value)}
            className="bg-[var(--surface-3)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text-1)] focus:outline-none focus:border-[var(--accent-border)]"
          >
            {SCHEDULE_PRESETS.map((p: { id: string; label: string }) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </div>
        <textarea
          value={newCommand}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNewCommand(e.target.value)}
          placeholder="Command text to execute on schedule..."
          rows={2}
          className="w-full bg-[var(--surface-3)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text-1)] placeholder:text-[var(--text-4)] focus:outline-none focus:border-[var(--accent-border)]"
        />
        <button
          onClick={handleCreate}
          disabled={!newName.trim() || !newCommand.trim()}
          className="px-4 py-2 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--surface-0)] text-xs font-bold uppercase tracking-widest disabled:opacity-40 transition-colors"
        >
          Create Schedule
        </button>
      </div>
      {createError && (
        <div className="text-xs text-red-400 px-1">{createError}</div>
      )}

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 space-y-3">
        <div className="section-label">Schedules ({schedules.length})</div>
        {schedules.length === 0 && (
          <div className="text-xs text-[var(--text-4)] py-2">No schedules yet. Create one above.</div>
        )}
        {schedules.map((sched) => (
          <div key={sched.id} className="flex items-center justify-between px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface-3)]">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-[var(--text-1)]">{sched.name}</span>
                <span className="text-[10px] px-2 py-0.5 rounded border border-[var(--border)] text-[var(--text-3)]">
                  {SCHEDULE_PRESETS.find((p: { id: string; label: string }) => p.id === sched.presetId)?.label || sched.presetId}
                </span>
              </div>
              <div className="text-[10px] text-[var(--text-4)] mt-0.5 truncate">{sched.commandText}</div>
              {sched.lastRunAtMs && (
                <div className="text-[10px] text-[var(--text-4)] mt-0.5">
                  Last run: {new Date(sched.lastRunAtMs).toLocaleString()}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-3">
              <button
                onClick={() => handleRunNow(sched)}
                className="p-1.5 rounded-lg border border-[var(--border)] text-[var(--text-3)] hover:text-[var(--success)] hover:border-[var(--success)]/30 transition-colors"
                title="Run now"
              >
                <Play className="w-3 h-3" />
              </button>
              <button
                onClick={() => handleToggle(sched)}
                className={`text-[10px] px-2 py-1 rounded-lg border font-semibold transition-colors ${
                  sched.enabled
                    ? 'border-[var(--success)]/30 text-[var(--success)] hover:bg-[var(--success)]/10'
                    : 'border-[var(--border)] text-[var(--text-3)] hover:border-[var(--accent-border)]'
                }`}
              >
                {sched.enabled ? 'On' : 'Off'}
              </button>
              <button
                onClick={() => handleDelete(sched.id)}
                className="p-1.5 rounded-lg border border-[var(--border)] text-[var(--text-3)] hover:text-[var(--error)] hover:border-[var(--error)]/30 transition-colors"
                title="Delete"
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
      <div className="flex items-center gap-1 px-6 pt-4 pb-0 border-b border-[var(--border)] shrink-0">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors ${
            activeTab === 'overview'
              ? 'bg-[var(--surface-1)] border border-b-0 border-[var(--border)] text-[var(--text-1)]'
              : 'text-[var(--text-3)] hover:text-[var(--text-2)]'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab('builder')}
          className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors ${
            activeTab === 'builder'
              ? 'bg-[var(--surface-1)] border border-b-0 border-[var(--border)] text-[var(--text-1)]'
              : 'text-[var(--text-3)] hover:text-[var(--text-2)]'
          }`}
        >
          Builder
        </button>
        <button
          onClick={() => setActiveTab('schedules')}
          className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors ${
            activeTab === 'schedules'
              ? 'bg-[var(--surface-1)] border border-b-0 border-[var(--border)] text-[var(--text-1)]'
              : 'text-[var(--text-3)] hover:text-[var(--text-2)]'
          }`}
        >
          Schedules
        </button>
        <button
          onClick={() => setActiveTab('deadletter')}
          className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors ${
            activeTab === 'deadletter'
              ? 'bg-[var(--surface-1)] border border-b-0 border-[var(--border)] text-[var(--text-1)]'
              : 'text-[var(--text-3)] hover:text-[var(--text-2)]'
          }`}
        >
          Dead Letter
        </button>
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
              <h2 className="text-base font-bold text-[var(--text-1)]">Jose Scheduler</h2>
              <p className="text-xs text-[var(--text-3)] mt-0.5">Automated task execution on intervals</p>
            </div>
          </div>
          <JoseSchedulerPanel />
        </div>
      ) : (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-4xl mx-auto w-full">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-[var(--text-1)]">Automation</h2>
          <p className="text-xs text-[var(--text-3)] mt-0.5">Build and run multi-agent workflows</p>
        </div>
        <button onClick={refresh} className="p-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--surface-3)] transition-colors">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 space-y-3">
        <div className="section-label">New Workflow</div>
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewName(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && handleCreate()}
            placeholder="Workflow name..."
            className="flex-1 bg-[var(--surface-3)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text-1)] placeholder:text-[var(--text-4)] focus:outline-none focus:border-[var(--accent-border)]"
          />
          <button
            onClick={handleCreate}
            disabled={!newName.trim()}
            className="px-4 py-2 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--surface-0)] text-xs font-bold uppercase tracking-widest disabled:opacity-40 transition-colors"
          >
            Create
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 space-y-3">
        <div className="section-label">Workflows ({workflows.length})</div>
        {workflows.length === 0 && <div className="text-xs text-[var(--text-4)] py-2">No workflows yet. Create one above.</div>}
        {workflows.map((wf) => (
          <div key={wf.id} className="flex items-center justify-between px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface-3)]">
            <div>
              <div className="text-sm font-medium text-[var(--text-1)]">{wf.name}</div>
              <div className="text-[10px] text-[var(--text-4)] font-mono">{wf.id}</div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[var(--text-3)]">{wf.nodes?.length || 0} nodes</span>
              <span className="text-[10px] px-2 py-0.5 rounded border border-[var(--border)] text-[var(--text-3)]">{wf.agentScope || 'shared'}</span>
            </div>
          </div>
        ))}
      </div>

      {ops.length > 0 && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 space-y-3">
          <div className="section-label">Registered Operations ({ops.length})</div>
          {ops.slice(0, 20).map((op) => {
            const isActive = op.status === 'active' || op.enabled;
            return (
              <div key={op.id} className="flex items-center justify-between px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface-3)]">
                <div>
                  <div className="text-sm font-medium text-[var(--text-2)]">{op.name || op.id}</div>
                  {op.description && <div className="text-[10px] text-[var(--text-4)] mt-0.5">{op.description}</div>}
                </div>
                <button
                  onClick={() => {
                    const nextStatus = isActive ? 'inactive' : 'active';
                    updateWorkflowOperationStatus(op.id, nextStatus, { enabled: !isActive });
                    setOps(listWorkflowOperations());
                  }}
                  className={`text-[10px] px-3 py-1 rounded-lg border font-semibold transition-colors ${
                    isActive
                      ? 'border-[var(--success)]/30 text-[var(--success)] hover:bg-[var(--success)]/10'
                      : 'border-[var(--border)] text-[var(--text-3)] hover:border-[var(--accent-border)] hover:text-[var(--text-1)]'
                  }`}
                >
                  {isActive ? 'Active' : 'Enable'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {runs.length > 0 && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 space-y-3">
          <div className="section-label">Recent Runs ({runs.length})</div>
          {runs.slice(0, 15).map((run) => (
            <div key={run.id} className="flex items-center justify-between px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface-3)]">
              <div>
                <div className="text-xs font-medium text-[var(--text-2)]">{run.workflowId}</div>
                <div className="text-[10px] text-[var(--text-4)]">{new Date(run.createdAtMs || 0).toLocaleString()}</div>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded border ${
                run.status === 'completed' ? 'border-[var(--success)]/30 text-[var(--success)]' :
                run.status === 'failed' ? 'border-[var(--error)]/30 text-[var(--error)]' :
                'border-[var(--border)] text-[var(--text-3)]'
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
