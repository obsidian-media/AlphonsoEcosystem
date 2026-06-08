import React, { useState, useEffect, useMemo } from 'react';
import {
  Brain,
  Target,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  Plus,
  Play,
  ChevronDown,
  ChevronRight,
  BarChart3,
  Layers,
  Cpu
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
  updateTaskStatus
} from '../services/batchOrchestratorService';

function Panel({ icon: Icon, title, children }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-zinc-950/70 p-3">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-zinc-400 font-bold mb-2">
        <Icon className="w-4 h-4 text-indigo-400" /> {title}
      </div>
      {children}
    </section>
  );
}

function StatCard({ label, value, icon: Icon, color = 'indigo' }) {
  const colorMap = {
    indigo: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    red: 'bg-red-500/10 text-red-400 border-red-500/20'
  };
  return (
    <div className={`rounded-xl border ${colorMap[color]} p-3`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[9px] text-zinc-500 uppercase tracking-widest font-mono">{label}</p>
          <p className="text-xl font-bold text-zinc-100 mt-0.5">{value}</p>
        </div>
        <Icon className="w-4 h-4 opacity-60" />
      </div>
    </div>
  );
}

function TaskRow({ task, onStatusChange }) {
  const statusColors = {
    pending: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
    in_progress: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    completed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    failed: 'bg-red-500/10 text-red-400 border-red-500/20'
  };
  const priorityColors = {
    urgent: 'text-red-400',
    high: 'text-amber-400',
    medium: 'text-indigo-400',
    low: 'text-zinc-500'
  };
  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-lg bg-white/[0.02] border border-white/5 hover:border-white/10 transition-colors group">
      <span className={`text-[9px] font-bold uppercase w-12 ${priorityColors[task.priority] || 'text-zinc-500'}`}>
        {task.priority}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-zinc-200 truncate">{task.title}</p>
        <p className="text-[9px] text-zinc-500 font-mono">{task.agent}</p>
      </div>
      <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded border ${statusColors[task.status] || statusColors.pending}`}>
        {task.status.replace('_', ' ')}
      </span>
      {task.status === 'pending' && (
        <button
          onClick={() => onStatusChange(task.id, 'in_progress')}
          className="opacity-0 group-hover:opacity-100 text-[9px] text-amber-400 hover:text-amber-300 transition-all"
        >
          START
        </button>
      )}
      {task.status === 'in_progress' && (
        <button
          onClick={() => onStatusChange(task.id, 'completed')}
          className="opacity-0 group-hover:opacity-100 text-[9px] text-emerald-400 hover:text-emerald-300 transition-all"
        >
          DONE
        </button>
      )}
    </div>
  );
}

export default function BoardroomPanel() {
  const [goal, setGoal] = useState(() => getActiveGoal());
  const [batches, setBatches] = useState(() => goal ? listBatches(goal.id) : []);
  const [activeBatch, setActiveBatch] = useState(() => goal ? getActiveBatch(goal.id) : null);
  const [goalProgress, setGoalProgress] = useState(() => goal ? getGoalProgress(goal.id) : null);
  const [expandedBatchId, setExpandedBatchId] = useState(null);
  const [goalInput, setGoalInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const refresh = () => {
    const g = getActiveGoal();
    setGoal(g);
    if (g) {
      setBatches(listBatches(g.id));
      setActiveBatch(getActiveBatch(g.id));
      setGoalProgress(getGoalProgress(g.id));
    } else {
      setBatches([]);
      setActiveBatch(null);
      setGoalProgress(null);
    }
  };

  useEffect(() => {
    const handler = () => refresh();
    window.addEventListener('alphonso:boardroom_updated', handler);
    return () => window.removeEventListener('alphonso:boardroom_updated', handler);
  }, []);

  const batchProgress = useMemo(() => {
    if (!goal || !activeBatch) return null;
    return getBatchProgress(goal.id, activeBatch.batchNumber);
  }, [goal, activeBatch]);

  const handleCreateGoal = async () => {
    if (!goalInput.trim()) return;
    setIsGenerating(true);
    try {
      createProjectGoal(goalInput.trim());
      refresh();
      const g = getActiveGoal();
      if (g) {
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

  const handleTaskStatus = (taskId, status) => {
    updateTaskStatus(taskId, status);
    refresh();
  };

  if (!goal) {
    return (
      <Panel icon={Brain} title="Boardroom Orchestrator">
        <div className="space-y-4 py-4">
          <p className="text-xs text-zinc-400 text-center">
            Set a project goal to begin autonomous batch planning and execution.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateGoal()}
              placeholder="e.g. Build a SaaS analytics dashboard"
              className="flex-1 bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50"
            />
            <button
              onClick={handleCreateGoal}
              disabled={isGenerating || !goalInput.trim()}
              className="rounded-lg border border-indigo-400/30 bg-indigo-500/10 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-indigo-200 hover:bg-indigo-500/20 disabled:opacity-40 transition-colors"
            >
              {isGenerating ? 'GENERATING...' : 'SET GOAL'}
            </button>
          </div>
        </div>
      </Panel>
    );
  }

  return (
    <Panel icon={Brain} title="Boardroom Orchestrator">
      <div className="space-y-4">
        <div className="rounded-xl bg-white/[0.02] border border-white/5 p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[9px] text-zinc-500 uppercase tracking-widest font-mono">Project Objective</p>
              <p className="text-sm font-bold text-zinc-200 mt-0.5">{goal.goal}</p>
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => completeGoal(goal.id)}
                className="text-[9px] text-zinc-500 hover:text-emerald-400 transition-colors px-2 py-1"
              >
                COMPLETE
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <StatCard label="Batch" value={`#${goal.currentBatchNumber}`} icon={Layers} />
          <StatCard label="Total Tasks" value={goalProgress?.total || 0} icon={Target} />
          <StatCard label="Completed" value={goalProgress?.completed || 0} icon={CheckCircle2} color="emerald" />
          <StatCard label="Progress" value={`${goalProgress?.percent || 0}%`} icon={BarChart3} color="indigo" />
        </div>

        {batchProgress && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[9px] text-zinc-500 uppercase tracking-widest font-mono">
                Batch #{activeBatch?.batchNumber} — {batchProgress.completed}/{batchProgress.total} tasks
              </p>
              <span className="text-[9px] font-bold text-indigo-400">{batchProgress.percent}%</span>
            </div>
            <div className="h-1.5 w-full bg-white/[0.05] rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500/60 to-indigo-500 rounded-full transition-all duration-500"
                style={{ width: `${batchProgress.percent}%` }}
              />
            </div>
            <div className="flex justify-end">
              <button
                onClick={handleGenerateNext}
                disabled={isGenerating || (activeBatch && batchProgress.percent < 100)}
                className="rounded-lg border border-indigo-400/30 bg-indigo-500/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-indigo-200 hover:bg-indigo-500/20 disabled:opacity-40 transition-colors flex items-center gap-1.5"
              >
                {isGenerating ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                {activeBatch && batchProgress.percent < 100 ? 'COMPLETE CURRENT BATCH FIRST' : 'GENERATE NEXT BATCH'}
              </button>
            </div>
          </div>
        )}

        {activeBatch && (
          <div className="space-y-1.5">
            <p className="text-[9px] text-zinc-500 uppercase tracking-widest font-mono">Current Tasks</p>
            <div className="max-h-64 overflow-y-auto pr-1 space-y-1">
              {activeBatch.tasks.map((task) => (
                <TaskRow key={task.id} task={task} onStatusChange={handleTaskStatus} />
              ))}
            </div>
          </div>
        )}

        {batches.length > 1 && (
          <div className="space-y-1.5">
            <p className="text-[9px] text-zinc-500 uppercase tracking-widest font-mono">Batch History</p>
            <div className="max-h-36 overflow-y-auto pr-1 space-y-1">
              {batches.slice(1).map((b) => {
                const isExpanded = expandedBatchId === b.id;
                const done = b.tasks.filter((t) => t.status === 'completed').length;
                return (
                  <div key={b.id}>
                    <button
                      onClick={() => setExpandedBatchId(isExpanded ? null : b.id)}
                      className="flex items-center gap-2 w-full py-1.5 px-2 rounded-lg hover:bg-white/[0.03] transition-colors text-left"
                    >
                      {isExpanded ? <ChevronDown className="w-3 h-3 text-zinc-500" /> : <ChevronRight className="w-3 h-3 text-zinc-500" />}
                      <span className="text-[10px] text-zinc-400 font-mono">
                        Batch #{b.batchNumber} — {done}/{b.tasks.length} completed ({b.generationMode})
                      </span>
                    </button>
                    {isExpanded && (
                      <div className="ml-5 space-y-0.5 pb-1">
                        {b.tasks.map((t) => (
                          <TaskRow key={t.id} task={t} onStatusChange={handleTaskStatus} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="text-[9px] text-zinc-600 font-mono flex items-center gap-2">
          <Cpu className="w-3 h-3" />
          Generation: {activeBatch?.generationMode || 'N/A'} | Goal ID: {goal.id.slice(0, 16)}...
        </div>
      </div>
    </Panel>
  );
}
