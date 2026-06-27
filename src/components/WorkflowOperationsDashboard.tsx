import React, { useMemo, useState } from 'react';
import { Activity, CheckCircle2, Clock3, GitBranch, Play, ShieldCheck } from 'lucide-react';
import { listWorkflowOperations } from '../services/workflowOperationsRegistryService';
import { approveWorkflowRun, executeWorkflowRun, listWorkflowRuns, listWorkflowRunTimeline, startWorkflowRun } from '../services/workflowExecutionService';
import { listWorkflowReceipts } from '../services/workflowReceiptService';
import { listWorkflowTelemetry, summarizeWorkflowTelemetry } from '../services/workflowTelemetryService';
import { listWorkflowMemory } from '../services/workflowMemoryService';
import { getAgentWorkflowParticipation } from '../services/workflowGovernanceService';
import { AGENT_EXECUTION_CONTRACTS } from '../services/agentContractService';
import { AgentAvatar } from './AgentAvatar';

interface Settings {
  zeroCostMode?: boolean;
}

interface Props {
  settings?: Settings;
}

interface WorkflowOperation {
  id: string;
  name: string;
  purpose: string;
  riskLevel: string;
  triggerTypes?: string[];
}

interface WorkflowRun {
  id: string;
  workflowName: string;
  status: string;
  createdAtMs: number;
  progress?: {
    completedStages?: number;
    totalStages?: number;
    blockedStages?: number;
  };
}

interface TimelineRow {
  id: string;
  label: string;
  timestampMs: number;
  type: string;
}

interface ReceiptRow {
  id: string;
  actionType: string;
  agent: string;
  status: string;
  timestampMs: number;
}

interface TelemetryRow {
  id: string;
  eventType: string;
  status: string;
  timestampMs: number;
}

interface TelemetrySummary {
  totalEvents: number;
  totalRuns: number;
  lastEventAtMs?: number;
  statusCounts?: Record<string, number>;
}

interface MemoryRow {
  id: string;
  title: string;
  timestampMs: number;
}

interface ParticipationItem {
  agent: string;
  order: number;
  canExecute: boolean;
}

interface ContractInfo {
  allowedActionPrefixes?: string[];
  blockedActionPrefixes?: string[];
}

function displayWorkflowTruthState(status: string, run: WorkflowRun | null = null) {
  const clean = String(status || 'unknown').trim().toLowerCase();
  const blockedStages = Number(run?.progress?.blockedStages || 0);
  if (clean === 'completed' && blockedStages > 0) {
    return 'partial';
  }
  if (clean === 'completed') {
    return 'confirmed';
  }
  if (clean === 'executed' && run?.status === 'partial') {
    return 'partial';
  }
  if (clean === 'executed' || clean === 'approved') {
    return 'partial';
  }
  if (clean === 'approval_required') {
    return 'setup_required';
  }
  if (['partial', 'setup_required', 'queued', 'in_progress'].includes(clean)) {
    return clean === 'queued' || clean === 'in_progress' ? 'partial' : clean;
  }
  if (['failed', 'blocked', 'denied'].includes(clean)) {
    return clean === 'denied' ? 'blocked' : clean;
  }
  return 'unknown';
}

function mapRunTone(status: string, run: WorkflowRun | null = null) {
  const truth = displayWorkflowTruthState(status, run);
  if (truth === 'confirmed') return 'green';
  if (truth === 'setup_required') return 'indigo';
  if (truth === 'partial') return 'amber';
  if (truth === 'blocked' || truth === 'failed') return 'red';
  return 'zinc';
}

function runRowShellClass(run: WorkflowRun, isSelected: boolean) {
  const truth = displayWorkflowTruthState(run.status, run);
  if (!isSelected) {
    return 'border-white/10 bg-black/20';
  }
  if (truth === 'confirmed') return 'border-emerald-300/30 bg-emerald-500/10';
  if (truth === 'setup_required') return 'border-indigo-300/30 bg-indigo-500/10';
  if (truth === 'partial') return 'border-amber-300/30 bg-amber-500/10';
  if (truth === 'blocked' || truth === 'failed') return 'border-red-300/30 bg-red-500/10';
  return 'border-white/10 bg-black/20';
}

function receiptRowShellClass(status: string, run: WorkflowRun | null = null) {
  const truth = displayWorkflowTruthState(status, run);
  if (truth === 'setup_required') return 'border-indigo-300/25 bg-indigo-500/5';
  if (truth === 'partial') return 'border-amber-300/25 bg-amber-500/5';
  if (truth === 'blocked' || truth === 'failed') return 'border-red-300/25 bg-red-500/5';
  if (truth === 'confirmed') return 'border-emerald-300/20 bg-emerald-500/5';
  return 'border-white/10 bg-black/20';
}

interface CardProps {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}

function Card({ title, icon: Icon, children }: CardProps) {
  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/55 p-3">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-zinc-500">
        <Icon className="h-3.5 w-3.5 text-indigo-300" />
        {title}
      </div>
      {children}
    </div>
  );
}

interface BadgeProps {
  children: React.ReactNode;
  tone?: 'zinc' | 'green' | 'amber' | 'indigo' | 'red' | 'blue';
}

function Badge({ children, tone = 'zinc' }: BadgeProps) {
  const cls = tone === 'green'
    ? 'border-emerald-300/20 bg-emerald-500/10 text-emerald-200'
    : tone === 'amber'
      ? 'border-amber-300/20 bg-amber-500/10 text-amber-200'
      : tone === 'indigo'
        ? 'border-indigo-300/20 bg-indigo-500/10 text-indigo-200'
      : tone === 'red'
        ? 'border-red-300/20 bg-red-500/10 text-red-200'
        : 'border-white/10 bg-zinc-800 text-zinc-200';
  return <span className={`rounded border px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${cls}`}>{children}</span>;
}

interface MetricProps {
  label: string;
  value: string | number;
}

function Metric({ label, value }: MetricProps) {
  return (
    <div className="rounded border border-white/10 bg-black/20 px-2 py-1">
      <div className="text-[10px] uppercase tracking-widest text-zinc-500">{label}</div>
      <div className="text-[11px] font-semibold text-zinc-200">{String(value)}</div>
    </div>
  );
}

export function WorkflowOperationsDashboard({ settings }: Props) {
  const [workflows, setWorkflows] = useState<WorkflowOperation[]>(() => listWorkflowOperations());
  const [runs, setRuns] = useState<WorkflowRun[]>(() => listWorkflowRuns());
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(() => workflows[0]?.id || null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(() => runs[0]?.id || null);
  const [input, setInput] = useState('Build a supervised startup launch workflow from idea to distribution.');
  const [triggerType, setTriggerType] = useState('manual_command');

  const selectedWorkflow = useMemo(() => workflows.find((item) => item.id === selectedWorkflowId) || null, [workflows, selectedWorkflowId]);
  const selectedRun = useMemo(() => runs.find((item) => item.id === selectedRunId) || null, [runs, selectedRunId]);
  const receiptRows = useMemo<ReceiptRow[]>(() => selectedRun ? listWorkflowReceipts({ workflowRunId: selectedRun.id }).slice(0, 30) : [], [selectedRun, runs]);
  const timelineRows = useMemo<TimelineRow[]>(() => selectedRun ? listWorkflowRunTimeline(selectedRun.id).slice(0, 40) : [], [selectedRun, runs]);
  const telemetryRows = useMemo<TelemetryRow[]>(() => selectedWorkflow ? listWorkflowTelemetry({ workflowId: selectedWorkflow.id }).slice(0, 25) : [], [selectedWorkflow, runs]);
  const telemetrySummary = useMemo<TelemetrySummary>(() => summarizeWorkflowTelemetry(selectedWorkflow?.id || null), [selectedWorkflow, runs]);
  const workflowMemory = useMemo<MemoryRow[]>(
    () => selectedWorkflow ? listWorkflowMemory(selectedWorkflow.id, selectedRun?.id || null).slice(0, 20) : [],
    [selectedWorkflow, selectedRun, runs]
  );
  const durabilitySummary = useMemo(() => {
    const allRuns = listWorkflowRuns();
    const partialRuns = allRuns.filter((run) => displayWorkflowTruthState(run.status, run) === 'partial').length;
    const blockedRuns = allRuns.filter((run) => ['blocked', 'failed'].includes(displayWorkflowTruthState(run.status, run))).length;
    return {
      runs: allRuns.length,
      partialRuns,
      blockedRuns,
      receipts: listWorkflowReceipts().length
    };
  }, [runs]);
  const selectedRunTruth = selectedRun ? displayWorkflowTruthState(selectedRun.status, selectedRun) : 'unknown';
  const canApproveRun = selectedRun?.status === 'approval_required';
  const canExecuteRun = selectedRun?.status === 'queued';

  const refresh = () => {
    const nextWorkflows = listWorkflowOperations();
    const nextRuns = listWorkflowRuns();
    setWorkflows(nextWorkflows);
    setRuns(nextRuns);
    if (!nextWorkflows.some((item) => item.id === selectedWorkflowId)) {
      setSelectedWorkflowId(nextWorkflows[0]?.id || null);
    }
    if (!nextRuns.some((item) => item.id === selectedRunId)) {
      setSelectedRunId(nextRuns[0]?.id || null);
    }
  };

  const startRun = () => {
    if (!selectedWorkflow) return;
    const started = startWorkflowRun(selectedWorkflow.id, {
      triggerType,
      input,
      zeroCostMode: Boolean(settings?.zeroCostMode)
    });
    if (started?.ok) {
      setSelectedRunId(started.run.id);
      refresh();
    }
  };

  const approveRun = () => {
    if (!selectedRun) return;
    approveWorkflowRun(selectedRun.id, 'shayan');
    refresh();
  };

  const executeRun = () => {
    if (!selectedRun) return;
    executeWorkflowRun(selectedRun.id);
    refresh();
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4">
      <div className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
        <GitBranch className="h-4 w-4 text-indigo-300" />
        Workflow Operations Dashboard
      </div>
      <p className="mb-3 text-[11px] leading-relaxed text-zinc-500">
        Select a workflow to start a governed run. Completed runs are confirmed; partial or blocked runs need connector setup or approval.
      </p>
      <div className="mb-4 grid grid-cols-2 gap-2 text-[11px] md:grid-cols-4">
        <Metric label="Persisted Runs" value={durabilitySummary.runs} />
        <Metric label="Persisted Receipts" value={durabilitySummary.receipts} />
        <Metric label="Partial Runs" value={durabilitySummary.partialRuns} />
        <Metric label="Blocked Runs" value={durabilitySummary.blockedRuns} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_1fr]">
        <div className="space-y-3">
          <div className="rounded-xl border border-white/10 bg-zinc-900/55 p-3">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-widest text-zinc-500">Workflow Registry</div>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {workflows.map((workflow) => (
                <button
                  key={workflow.id}
                  onClick={() => setSelectedWorkflowId(workflow.id)}
                  className={`w-full rounded-lg border px-3 py-2 text-left ${
                    selectedWorkflowId === workflow.id
                      ? 'border-indigo-300/30 bg-indigo-500/15'
                      : 'border-white/10 bg-black/20'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-zinc-100">{workflow.name}</span>
                    <Badge tone={workflow.riskLevel === 'critical' ? 'red' : workflow.riskLevel === 'high' ? 'amber' : 'blue'}>
                      {workflow.riskLevel}
                    </Badge>
                  </div>
                  <div className="mt-1 text-[11px] text-zinc-500">{workflow.id}</div>
                  <div className="mt-2 text-[11px] text-zinc-400">{workflow.purpose}</div>
                </button>
              ))}
            </div>
          </div>

          {selectedWorkflow && (
            <div className="rounded-xl border border-white/10 bg-zinc-900/55 p-3">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-widest text-zinc-500">Start Workflow Run</div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto]">
                <input
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  className="rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                  placeholder="Workflow input"
                />
                <select
                  value={triggerType}
                  onChange={(event) => setTriggerType(event.target.value)}
                  className="rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                >
                  {(selectedWorkflow.triggerTypes || ['manual_command']).map((value) => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </select>
              </div>
              <div className="mt-2 flex gap-2">
                <button onClick={startRun} className="rounded-lg bg-indigo-500/25 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-indigo-100">
                  <Play className="mr-1 inline h-3.5 w-3.5" />
                  Start Run
                </button>
                <button onClick={refresh} className="rounded-lg bg-zinc-800 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-200">
                  Refresh
                </button>
              </div>
              <div className="mt-2 text-[11px] text-zinc-500">
                Needs-setup paths are labeled during run execution; no external action is faked.
              </div>
            </div>
          )}

          <div className="rounded-xl border border-white/10 bg-zinc-900/55 p-3">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-widest text-zinc-500">Workflow Runs</div>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {runs.length === 0 && <div className="text-[11px] text-zinc-500">No workflow runs yet.</div>}
              {runs.map((run) => (
                <button
                  key={run.id}
                  onClick={() => setSelectedRunId(run.id)}
                  className={`w-full rounded-lg border px-3 py-2 text-left ${runRowShellClass(run, selectedRunId === run.id)}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-zinc-100">{run.workflowName}</div>
                    <Badge tone={mapRunTone(run.status, run)}>{displayWorkflowTruthState(run.status, run)}</Badge>
                  </div>
                  <div className="mt-1 text-[11px] text-zinc-500">{run.id}</div>
                  <div className="mt-1 text-[11px] text-zinc-400">
                    {new Date(run.createdAtMs).toLocaleString()}
                    {Number(run.progress?.blockedStages || 0) > 0 ? ` | ${run.progress?.blockedStages} blocked stage(s)` : ''}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {selectedWorkflow && (
            <div className="rounded-xl border border-white/10 bg-zinc-900/55 p-3">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-widest text-zinc-500">Agent Participation</div>
              <div className="space-y-2">
                {getAgentWorkflowParticipation(selectedWorkflow).map((item: ParticipationItem) => (
                  <div key={`${selectedWorkflow.id}-${item.agent}-${item.order}`} className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-[11px]">
                    <div className="flex items-center gap-2">
                      <span className="text-zinc-500">#{item.order}</span>
                      <AgentAvatar agentId={item.agent} name={item.agent} sizeClass="h-5 w-5" />
                      <span className="capitalize text-zinc-200">{String(item.agent).replace(/_/g, ' ')}</span>
                    </div>
                    <Badge tone={item.canExecute ? 'green' : 'amber'}>{item.canExecute ? 'execute' : 'approval stage'}</Badge>
                  </div>
                ))}
              </div>
              <div className="mt-2 max-h-24 space-y-1 overflow-y-auto pr-1">
                {getAgentWorkflowParticipation(selectedWorkflow).map((item: ParticipationItem) => {
                  const contract = AGENT_EXECUTION_CONTRACTS[item.agent] as ContractInfo | undefined;
                  if (!contract) return null;
                  return (
                    <div key={`contract-${selectedWorkflow.id}-${item.agent}`} className="rounded border border-white/10 bg-black/20 px-2 py-1 text-[10px] text-zinc-400">
                      <span className="font-semibold capitalize text-zinc-200">{item.agent}</span>
                      <span> allow: {(contract.allowedActionPrefixes || []).slice(0, 2).join(', ')}</span>
                      <span> | block: {(contract.blockedActionPrefixes || []).slice(0, 2).join(', ')}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-white/10 bg-zinc-900/55 p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">Run Controls</div>
              {selectedRun && <Badge tone={mapRunTone(selectedRun.status, selectedRun)}>{selectedRunTruth}</Badge>}
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={approveRun} disabled={!canApproveRun} className="rounded-lg bg-amber-500/20 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-amber-100 disabled:opacity-40" title={canApproveRun ? 'Approve this run before execution.' : 'Only approval_required runs can be approved.'}>
                <ShieldCheck className="mr-1 inline h-3.5 w-3.5" />
                Approve Run
              </button>
              <button onClick={executeRun} disabled={!canExecuteRun} className="rounded-lg bg-emerald-500/20 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-emerald-100 disabled:opacity-40" title={canExecuteRun ? 'Execute an approved queued run.' : 'Execute stays disabled until the run is approved and queued.'}>
                <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />
                Execute Run
              </button>
            </div>
            {selectedRun && (
              <div className="mt-2 text-[11px] text-zinc-500">
                Stages: {selectedRun.progress?.completedStages || 0} / {selectedRun.progress?.totalStages || 0} completed
                | Blocked/setup: {selectedRun.progress?.blockedStages || 0}
                {selectedRunTruth === 'partial' ? ' | Run finished partial — not production-confirmed.' : ''}
                {selectedRunTruth === 'setup_required' ? ' | Run is setup-required before execution.' : ''}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-white/10 bg-zinc-900/55 p-3">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-widest text-zinc-500">Workflow Telemetry</div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <Metric label="Events" value={telemetrySummary.totalEvents} />
              <Metric label="Runs" value={telemetrySummary.totalRuns} />
              <Metric label="Last Event" value={telemetrySummary.lastEventAtMs ? new Date(telemetrySummary.lastEventAtMs).toLocaleTimeString() : 'n/a'} />
              <Metric label="Statuses" value={Object.keys(telemetrySummary.statusCounts || {}).length} />
            </div>
            <div className="mt-2 max-h-28 space-y-1 overflow-y-auto pr-1">
              {telemetryRows.map((row) => (
                <div key={row.id} className="rounded border border-white/10 bg-black/20 px-2 py-1 text-[10px] text-zinc-400">
                  {row.eventType} | {row.status} | {new Date(row.timestampMs).toLocaleTimeString()}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {selectedRun && (
        <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-3">
          <Card title="Workflow Timeline" icon={Clock3}>
            <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
              {timelineRows.map((row) => (
                <div key={row.id} className="rounded border border-white/10 bg-black/20 px-2 py-1 text-[10px] text-zinc-300">
                  {row.label}
                  <div className="text-zinc-500">{new Date(row.timestampMs).toLocaleTimeString()} | {row.type}</div>
                </div>
              ))}
            </div>
          </Card>
          <Card title="Workflow Receipts" icon={Activity}>
            <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
              {receiptRows.length === 0 && (
                <div className="text-[11px] text-zinc-500">No receipts for this run yet. Receipts persist in local storage after execution.</div>
              )}
              {receiptRows.map((row) => (
                <div key={row.id} className={`rounded border px-2 py-1 text-[10px] text-zinc-300 ${receiptRowShellClass(row.status, selectedRun)}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span>{row.actionType}</span>
                    <Badge tone={mapRunTone(row.status, selectedRun)}>{displayWorkflowTruthState(row.status, selectedRun)}</Badge>
                  </div>
                  <div className="text-zinc-500">{row.agent} | {new Date(row.timestampMs).toLocaleTimeString()}</div>
                </div>
              ))}
            </div>
          </Card>
          <Card title="Workflow Memory Linkage" icon={GitBranch}>
            <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
              {workflowMemory.length === 0 && <div className="text-[11px] text-zinc-500">No workflow-linked memory yet.</div>}
              {workflowMemory.map((row) => (
                <div key={row.id} className="rounded border border-white/10 bg-black/20 px-2 py-1 text-[10px] text-zinc-300">
                  <div>{row.title}</div>
                  <div className="text-zinc-500">{new Date(row.timestampMs).toLocaleTimeString()}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </section>
  );
}
