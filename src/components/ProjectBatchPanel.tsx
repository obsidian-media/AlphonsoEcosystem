import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Brain,
  Target,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  Plus,
  Play,
  Pause,
  ChevronDown,
  ChevronRight,
  BarChart3,
  Layers,
  Cpu,
  FolderOpen,
  Loader2,
  PlayCircle,
  FileText,
  Shield,
  Sparkles
} from 'lucide-react';
import {
  createProjectGoal,
  getActiveGoal,
  listGoals,
  updateGoal,
  completeGoal,
  generateBatch,
  advanceToNextBatch,
  listBatches,
  getActiveBatch,
  getBatchProgress,
  getGoalProgress,
  updateTaskStatus,
  executeBatch,
  getGoalById
} from '../services/batchOrchestratorService';
import { setProjectDirectory, getProjectDirectoryPath } from '../services/projectDirectoryService';

interface PanelProps {
  icon: typeof Brain;
  title: string;
  children: React.ReactNode;
}

function Panel({ icon: Icon, title, children }: PanelProps) {
  return (
    <section className="rounded-2xl bg-[var(--surface-1)] p-3">
      <div className="flex items-center gap-2 section-label mb-2">
        <Icon className="w-4 h-4 text-[var(--accent)]" /> {title}
      </div>
      {children}
    </section>
  );
}

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  icon: typeof Brain;
  color?: string;
}

function StatCard({ label, value, icon: Icon, color = 'indigo' }: StatCardProps) {
  const colorMap: Record<string, string> = {
    indigo: 'bg-[var(--accent-dim)] text-[var(--accent)] border-[var(--accent-border)]',
    emerald: 'bg-[var(--success-dim)] text-[var(--success)] border-[var(--success-border)]',
    amber: 'bg-[var(--warning-dim)] text-[var(--warning)] border-[var(--warning-border)]',
    red: 'bg-[var(--error-dim)] text-[var(--error)] border-[var(--error-border)]'
  };
  return (
    <div className={`rounded-xl ${colorMap[color]} p-3`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-2xs text-[var(--text-3)] uppercase tracking-widest font-mono">{label}</p>
          <p className="text-xl font-bold text-[var(--text-1)] mt-0.5">{value}</p>
        </div>
        <Icon className="w-4 h-4 opacity-60" />
      </div>
    </div>
  );
}

interface Task {
  id: string;
  status: string;
  priority: string;
  title: string;
  agent: string;
  summary?: string;
  artifacts?: Array<{
    type: string;
    riskScore?: number;
    combinedScore?: number;
    success?: boolean;
    exitCode?: number;
    findings?: Array<{ severity: string; detail: string }>;
    hints?: string[];
    opportunitySignals?: string[];
    riskSignals?: string[];
    url?: string;
    plan?: string;
    files?: string[];
    questions?: string[];
    message?: string;
    filesGenerated?: string[];
    step?: number;
  }>;
}

interface TaskRowProps {
  task: Task;
}

function TaskRow({ task }: TaskRowProps) {
  const [expanded, setExpanded] = useState(false);
  const statusColors: Record<string, string> = {
    pending: 'bg-[var(--surface-2)] text-[var(--text-3)] border-[var(--border)]',
    in_progress: 'bg-[var(--warning-dim)] text-[var(--warning)] border-[var(--warning-border)]',
    completed: 'bg-[var(--success-dim)] text-[var(--success)] border-[var(--success-border)]',
    failed: 'bg-[var(--error-dim)] text-[var(--error)] border-[var(--error-border)]',
    running: 'bg-[var(--warning-dim)] text-[var(--warning)] border-[var(--warning-border)]'
  };
  const priorityColors: Record<string, string> = {
    urgent: 'text-[var(--error)]',
    high: 'text-[var(--warning)]',
    medium: 'text-[var(--accent)]',
    low: 'text-[var(--text-3)]'
  };
  const statusIcon = task.status === 'in_progress' || task.status === 'running'
    ? <Loader2 className="w-3 h-3 animate-spin" />
    : task.status === 'completed'
      ? <CheckCircle2 className="w-3 h-3" />
      : task.status === 'failed'
        ? <AlertCircle className="w-3 h-3" />
        : null;

  const hasArtifacts = Boolean(task.artifacts?.length || task.summary);
  const artifactIcons: Record<string, typeof Shield> = {
    security_assessment: Shield,
    opportunity_score: Sparkles,
    command_execution: Cpu,
    content_catalyst_job: FileText,
    creative_package: FileText,
    research_report: FileText,
    brain_generation: Brain,
    project_scaffold: Layers,
    git_commit: CheckCircle2,
    auto_run: Play,
    plan_preview: FileText,
    clarifying_questions: AlertCircle,
    default: FileText
  };

  return (
    <div className="rounded-lg bg-[var(--surface-2)] hover:border-[var(--border-strong)] transition-colors">
      <div
        className="flex items-center gap-3 py-2 px-3 cursor-pointer"
        onClick={() => hasArtifacts && setExpanded(!expanded)}
      >
        {hasArtifacts && (
          <span className="shrink-0">
            {expanded ? <ChevronDown className="w-3 h-3 text-[var(--text-3)]" /> : <ChevronRight className="w-3 h-3 text-[var(--text-3)]" />}
          </span>
        )}
        <span className={`text-2xs font-bold uppercase w-12 ${priorityColors[task.priority] || 'text-[var(--text-3)]'}`}>
          {task.priority}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-[var(--text-2)] truncate">{task.title}</p>
          <p className="text-2xs text-[var(--text-3)] font-mono">{task.agent}</p>
        </div>
        <div className="flex items-center gap-1.5">
          {statusIcon}
          <span className={`text-2xs font-bold uppercase px-2 py-0.5 rounded border ${statusColors[task.status] || statusColors.pending}`}>
            {task.status.replace('_', ' ')}
          </span>
        </div>
      </div>
      {expanded && hasArtifacts && (
        <div className="px-3 pb-2 space-y-1.5 border-t border-[var(--border)] pt-2">
          {task.summary && (
            <p className="text-2xs text-[var(--text-3)] leading-relaxed">{task.summary}</p>
          )}
          {task.artifacts?.map((artifact, i) => {
            const IconComponent = artifactIcons[artifact.type] || artifactIcons.default;
            return (
              <div key={i} className="rounded-md bg-[var(--surface-2)] px-2.5 py-1.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <IconComponent className="w-3 h-3 text-[var(--accent)]" />
                  <span className="text-2xs font-bold text-[var(--text-2)] uppercase tracking-wider">
                    {artifact.type?.replace(/_/g, ' ')}
                  </span>
                  {artifact.riskScore != null && (
                    <span className={`text-2xs font-mono ml-auto ${
                      artifact.riskScore >= 70 ? 'text-[var(--error)]' : artifact.riskScore >= 40 ? 'text-[var(--warning)]' : 'text-[var(--success)]'
                    }`}>
                      Risk: {artifact.riskScore}/100
                    </span>
                  )}
                  {artifact.combinedScore != null && (
                    <span className="text-2xs font-mono ml-auto text-[var(--accent)]">
                      Score: {artifact.combinedScore}/100
                    </span>
                  )}
                  {artifact.success != null && (
                    <span className={`text-2xs font-mono ml-auto ${artifact.success ? 'text-[var(--success)]' : 'text-[var(--error)]'}`}>
                      {artifact.success ? 'OK' : 'FAIL'} (exit {artifact.exitCode ?? '?'})
                    </span>
                  )}
                </div>
                {artifact.findings && artifact.findings.length > 0 && (
                  <div className="space-y-0.5 mt-1">
                    {artifact.findings.map((f, j) => (
                      <p key={j} className={`text-2xs ${
                        f.severity === 'critical' ? 'text-[var(--error)]' : f.severity === 'high' ? 'text-[var(--warning)]' : 'text-[var(--text-3)]'
                      }`}>
                        [{f.severity}] {f.detail}
                      </p>
                    ))}
                  </div>
                )}
                {artifact.hints && artifact.hints.length > 0 && (
                  <div className="space-y-0.5 mt-1">
                    {artifact.hints.map((h, j) => (
                      <p key={j} className="text-2xs text-[var(--text-3)]">{h}</p>
                    ))}
                  </div>
                )}
                {artifact.opportunitySignals && artifact.opportunitySignals.length > 0 && (
                  <p className="text-2xs text-[var(--text-3)] mt-1 font-mono">
                    Opportunity: {artifact.opportunitySignals.join(', ')}
                  </p>
                )}
                {artifact.riskSignals && artifact.riskSignals.length > 0 && (
                  <p className="text-2xs text-[var(--text-3)] mt-1 font-mono">
                    Risk: {artifact.riskSignals.join(', ')}
                  </p>
                )}
                {artifact.type === 'auto_run' && artifact.url && (
                  <p className="text-2xs text-[var(--success)] mt-1 font-mono">
                    Dev server: {artifact.url}
                  </p>
                )}
                {artifact.type === 'plan_preview' && artifact.plan && (
                  <p className="text-2xs text-[var(--text-3)] mt-1">
                    Plan: {artifact.plan}
                  </p>
                )}
                {artifact.type === 'plan_preview' && artifact.files && artifact.files.length > 0 && (
                  <p className="text-2xs text-[var(--text-3)] mt-0.5 font-mono">
                    Files: {artifact.files.join(', ')}
                  </p>
                )}
                {artifact.type === 'clarifying_questions' && artifact.questions && artifact.questions.length > 0 && (
                  <div className="space-y-0.5 mt-1">
                    {artifact.questions.map((q, j) => (
                      <p key={j} className="text-2xs text-[var(--warning)]">? {q}</p>
                    ))}
                  </div>
                )}
                {artifact.type === 'git_commit' && (
                  <p className="text-2xs text-[var(--text-3)] mt-1 font-mono">
                    Committed: {artifact.message}
                  </p>
                )}
                {artifact.type === 'brain_generation' && artifact.filesGenerated && artifact.filesGenerated.length > 0 && (
                  <p className="text-2xs text-[var(--text-3)] mt-1 font-mono">
                    Step {artifact.step}: {artifact.filesGenerated.join(', ')}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ProjectBatchPanel() {
  const [goal, setGoal] = useState(() => getActiveGoal());
  const [batches, setBatches] = useState(() => goal ? listBatches(goal.id) : []);
  const [activeBatch, setActiveBatch] = useState(() => goal ? getActiveBatch(goal.id) : null);
  const [goalProgress, setGoalProgress] = useState(() => goal ? getGoalProgress(goal.id) : null);
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);
  const [goalInput, setGoalInput] = useState('');
  const [directoryInput, setDirectoryInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionProgress, setExecutionProgress] = useState<{
    stage: string;
    taskCount?: number;
    task?: { title?: string };
    wave?: number;
    agents?: string[];
    executedCount?: number;
    failedCount?: number;
    error?: string;
  } | null>(null);

  const refresh = useCallback(() => {
    const g = getActiveGoal();
    setGoal(g);
    if (g) {
      setBatches(listBatches(g.id));
      setActiveBatch(getActiveBatch(g.id));
      setGoalProgress(getGoalProgress(g.id));
      setDirectoryInput(g.directory || '');
    } else {
      setBatches([]);
      setActiveBatch(null);
      setGoalProgress(null);
      setDirectoryInput('');
    }
  }, []);

  useEffect(() => {
    const handler = () => refresh();
    window.addEventListener('alphonso:boardroom_updated', handler);
    return () => window.removeEventListener('alphonso:boardroom_updated', handler);
  }, [refresh]);

  const batchProgress = useMemo(() => {
    if (!goal || !activeBatch) return null;
    return getBatchProgress(goal.id, activeBatch.batchNumber);
  }, [goal, activeBatch]);

  const handleCreateGoal = async () => {
    if (!goalInput.trim()) return;
    setIsGenerating(true);
    try {
      createProjectGoal(goalInput.trim(), '', directoryInput.trim());
      refresh();
      const g = getActiveGoal();
      if (g) {
        if (directoryInput.trim()) {
          setProjectDirectory(g.id, directoryInput.trim());
        }
        await generateBatch(g.id);
        refresh();
      }
      setGoalInput('');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateNext = async () => {
    if (!goal) return;
    setIsGenerating(true);
    try {
      await advanceToNextBatch(goal.id);
      refresh();
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExecuteBatch = async () => {
    if (!activeBatch || isExecuting) return;
    setIsExecuting(true);
    setExecutionProgress({ stage: 'starting', taskCount: activeBatch.tasks.length });
    try {
      await executeBatch(activeBatch.id, {
        onProgress: (event: { stage: string; task?: { title?: string }; wave?: number; agents?: string[]; executedCount?: number; failedCount?: number }) => {
          setExecutionProgress(event);
          refresh();
        }
      });
      setExecutionProgress({ stage: 'complete' });
      refresh();
    } catch (error) {
      setExecutionProgress({ stage: 'error', error: String((error as Error)?.message || error) });
    } finally {
      setIsExecuting(false);
    }
  };

  const handleSetDirectory = () => {
    if (!goal || !directoryInput.trim()) return;
    setProjectDirectory(goal.id, directoryInput.trim());
    refresh();
  };

  if (!goal) {
    return (
      <Panel icon={Brain} title="Boardroom Orchestrator">
        <div className="space-y-4 py-4">
          <p className="text-xs text-[var(--text-3)] text-center">
            Set a project goal to begin autonomous batch planning and execution.
          </p>
          <div className="space-y-2">
            <input
              type="text"
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateGoal()}
              placeholder="e.g. Build a SaaS analytics dashboard"
              className="w-full bg-[var(--surface-2)] rounded-lg px-3 py-2 text-xs text-[var(--text-2)] placeholder:text-[var(--text-4)] focus:outline-none focus:border-[var(--accent-border)]"
            />
            <input
              type="text"
              value={directoryInput}
              onChange={(e) => setDirectoryInput(e.target.value)}
              placeholder="Project folder (optional) e.g. /path/to/project"
              className="w-full bg-[var(--surface-2)] rounded-lg px-3 py-2 text-xs text-[var(--text-2)] placeholder:text-[var(--text-4)] focus:outline-none focus:border-[var(--accent-border)]"
            />
            <button
              onClick={handleCreateGoal}
              disabled={isGenerating || !goalInput.trim()}
              className="w-full rounded-lg bg-[var(--accent-dim)] px-4 py-2 text-2xs font-bold uppercase tracking-widest text-[var(--accent)] hover:bg-[var(--accent-dim)] disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
            >
              {isGenerating ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
              {isGenerating ? 'GENERATING...' : 'SET GOAL & GENERATE BATCH'}
            </button>
          </div>
        </div>
      </Panel>
    );
  }

  return (
    <Panel icon={Brain} title="Boardroom Orchestrator">
      <div className="space-y-4">
        <div className="rounded-xl bg-[var(--surface-2)] p-3">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-2xs text-[var(--text-3)] uppercase tracking-widest font-mono">Project Objective</p>
              <p className="text-sm font-bold text-[var(--text-2)] mt-0.5 truncate">{goal.goal}</p>
            </div>
            <div className="flex gap-1 shrink-0">
              <button
                onClick={() => completeGoal(goal.id)}
                className="text-2xs text-[var(--text-3)] hover:text-[var(--success)] transition-colors px-2 py-1"
              >
                COMPLETE
              </button>
            </div>
          </div>
          {goal.directory && (
            <div className="flex items-center gap-1.5 mt-2 text-2xs text-[var(--text-3)] font-mono">
              <FolderOpen className="w-3 h-3" />
              {goal.directory}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <StatCard label="Batch" value={`#${goal.currentBatchNumber}`} icon={Layers} />
          <StatCard label="Total Tasks" value={goalProgress?.total || 0} icon={Target} />
          <StatCard label="Completed" value={goalProgress?.completed || 0} icon={CheckCircle2} color="emerald" />
          <StatCard label="Progress" value={`${goalProgress?.percent || 0}%`} icon={BarChart3} color="indigo" />
        </div>

        {!goal.directory && (
          <div className="flex gap-2">
            <input
              type="text"
              value={directoryInput}
              onChange={(e) => setDirectoryInput(e.target.value)}
              placeholder="Set project folder path"
              className="flex-1 bg-[var(--surface-2)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-2)] placeholder:text-[var(--text-4)] focus:outline-none focus:border-[var(--accent-border)]"
            />
            <button
              onClick={handleSetDirectory}
              disabled={!directoryInput.trim()}
              className="rounded-lg bg-[var(--surface-2)] px-3 py-1.5 text-2xs font-bold uppercase tracking-widest text-[var(--text-3)] hover:bg-[var(--surface-2)] disabled:opacity-40 transition-colors"
            >
              SET
            </button>
          </div>
        )}

        {batchProgress && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-2xs text-[var(--text-3)] uppercase tracking-widest font-mono">
                Batch #{activeBatch?.batchNumber} — {batchProgress.completed}/{batchProgress.total} tasks
              </p>
              <span className="text-2xs font-bold text-[var(--accent)]">{batchProgress.percent}%</span>
            </div>
            <div className="h-1.5 w-full bg-[var(--surface-3)] rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--accent)] rounded-full transition-all duration-500"
                style={{ width: `${batchProgress.percent}%` }}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleExecuteBatch}
                disabled={isExecuting || !activeBatch || activeBatch.status === 'completed'}
                className="flex-1 rounded-lg bg-[var(--success-dim)] px-3 py-2 text-2xs font-bold uppercase tracking-widest text-[var(--success)] hover:bg-[var(--success-dim)] disabled:opacity-40 transition-colors flex items-center justify-center gap-1.5"
              >
                {isExecuting ? <Loader2 className="w-3 h-3 animate-spin" /> : <PlayCircle className="w-3 h-3" />}
                {isExecuting ? 'EXECUTING...' : 'EXECUTE BATCH'}
              </button>
              <button
                onClick={handleGenerateNext}
                disabled={isGenerating || (activeBatch && batchProgress.percent < 100)}
                className="rounded-lg bg-[var(--accent-dim)] px-3 py-2 text-2xs font-bold uppercase tracking-widest text-[var(--accent)] hover:bg-[var(--accent-dim)] disabled:opacity-40 transition-colors flex items-center justify-center gap-1.5"
              >
                {isGenerating ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                NEXT
              </button>
            </div>
          </div>
        )}

        {executionProgress && executionProgress.stage !== 'complete' && executionProgress.stage !== 'error' && (
          <div className="rounded-xl bg-[var(--warning-dim)] p-3 space-y-1">
            <div className="flex items-center gap-2 text-2xs text-[var(--warning)] font-bold uppercase tracking-widest">
              <Loader2 className="w-3 h-3 animate-spin" />
              {executionProgress.stage === 'task_start' && `Running: ${executionProgress.task?.title || '...'}`}
              {executionProgress.stage === 'task_complete' && `Completed: ${executionProgress.task?.title || '...'}`}
              {executionProgress.stage === 'wave_start' && `Wave ${executionProgress.wave} — ${executionProgress.agents?.join(', ')}`}
              {executionProgress.stage === 'starting' && `Starting batch execution (${executionProgress.taskCount} tasks)...`}
              {executionProgress.stage === 'batch_complete' && `Batch done: ${executionProgress.executedCount} ok, ${executionProgress.failedCount} failed`}
              {!['task_start', 'task_complete', 'wave_start', 'starting', 'batch_complete'].includes(executionProgress.stage) && `Stage: ${executionProgress.stage}`}
            </div>
          </div>
        )}

        {executionProgress?.stage === 'error' && (
          <div className="rounded-xl bg-[var(--error-dim)] p-3 text-xs text-[var(--error)]">
            Execution error: {executionProgress.error}
          </div>
        )}

        {activeBatch && (
          <div className="space-y-1.5">
            <p className="text-2xs text-[var(--text-3)] uppercase tracking-widest font-mono">Current Tasks</p>
            <div className="max-h-64 overflow-y-auto pr-1 space-y-1">
              {activeBatch.tasks.map((task: Task) => (
                <TaskRow key={task.id} task={task} />
              ))}
            </div>
          </div>
        )}

        {batches.length > 1 && (
          <div className="space-y-1.5">
            <p className="text-2xs text-[var(--text-3)] uppercase tracking-widest font-mono">Batch History</p>
            <div className="max-h-36 overflow-y-auto pr-1 space-y-1">
              {batches.slice(1).map((b: { id: string; batchNumber: number; tasks: Task[]; generationMode: string }) => {
                const isExpanded = expandedBatchId === b.id;
                const done = b.tasks.filter((t) => t.status === 'completed').length;
                return (
                  <div key={b.id}>
                    <button
                      onClick={() => setExpandedBatchId(isExpanded ? null : b.id)}
                      className="flex items-center gap-2 w-full py-1.5 px-2 rounded-lg hover:bg-[var(--surface-2)] transition-colors text-left"
                    >
                      {isExpanded ? <ChevronDown className="w-3 h-3 text-[var(--text-3)]" /> : <ChevronRight className="w-3 h-3 text-[var(--text-3)]" />}
                      <span className="text-xs text-[var(--text-3)] font-mono">
                        Batch #{b.batchNumber} — {done}/{b.tasks.length} completed ({b.generationMode})
                      </span>
                    </button>
                    {isExpanded && (
                      <div className="ml-5 space-y-0.5 pb-1">
                        {b.tasks.map((t) => (
                          <TaskRow key={t.id} task={t} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="text-2xs text-[var(--text-4)] font-mono flex items-center gap-2">
          <Cpu className="w-3 h-3" />
          Generation: {activeBatch?.generationMode || 'N/A'} | Goal ID: {goal.id.slice(0, 16)}...
        </div>
      </div>
    </Panel>
  );
}
