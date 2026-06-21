import React from 'react';
import { RefreshCw } from 'lucide-react';
import { createWorkflow, listWorkflows } from '../services/workflowBuilderService';
import { listWorkflowReceipts } from '../services/workflowReceiptService';
import { listWorkflowOperations } from '../services/workflowOperationsRegistryService';

export function AutomationView() {
  const [workflows, setWorkflows] = React.useState(() => listWorkflows());
  const [runs, setRuns] = React.useState(() => listWorkflowReceipts());
  const [ops, setOps] = React.useState(() => listWorkflowOperations());
  const [newName, setNewName] = React.useState('');

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
    <div className="h-full overflow-y-auto p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-zinc-100">Automation</h2>
          <p className="text-xs text-zinc-500 mt-0.5">Build and run multi-agent workflows</p>
        </div>
        <button onClick={refresh} className="p-2 rounded-lg border border-white/10 bg-zinc-900 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="rounded-2xl border border-white/[0.06] bg-zinc-900/50 p-4 space-y-3">
        <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">New Workflow</div>
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="Workflow name..."
            className="flex-1 bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500/50"
          />
          <button
            onClick={handleCreate}
            disabled={!newName.trim()}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold uppercase tracking-widest disabled:opacity-40 transition-colors"
          >
            Create
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-white/[0.06] bg-zinc-900/50 p-4 space-y-3">
        <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Workflows ({workflows.length})</div>
        {workflows.length === 0 && <div className="text-xs text-zinc-600 py-2">No workflows yet. Create one above.</div>}
        {workflows.map((wf) => (
          <div key={wf.id} className="flex items-center justify-between px-3 py-2 rounded-xl border border-white/[0.05] bg-zinc-900/60">
            <div>
              <div className="text-sm font-medium text-zinc-200">{wf.name}</div>
              <div className="text-[10px] text-zinc-600 font-mono">{wf.id}</div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-zinc-500">{wf.nodes?.length || 0} nodes</span>
              <span className="text-[10px] px-2 py-0.5 rounded border border-zinc-700 text-zinc-400">{wf.agentScope || 'shared'}</span>
            </div>
          </div>
        ))}
      </div>

      {ops.length > 0 && (
        <div className="rounded-2xl border border-white/[0.06] bg-zinc-900/50 p-4 space-y-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Registered Operations ({ops.length})</div>
          {ops.slice(0, 20).map((op) => (
            <div key={op.id} className="flex items-center justify-between px-3 py-2 rounded-xl border border-white/[0.05] bg-zinc-900/60">
              <div className="text-sm font-medium text-zinc-300">{op.name || op.id}</div>
              <span className={`text-[10px] px-2 py-0.5 rounded border ${op.status === 'active' || op.enabled ? 'border-emerald-600/30 text-emerald-400' : 'border-zinc-700 text-zinc-500'}`}>
                {op.status === 'active' || op.enabled ? 'active' : op.status || 'inactive'}
              </span>
            </div>
          ))}
        </div>
      )}

      {runs.length > 0 && (
        <div className="rounded-2xl border border-white/[0.06] bg-zinc-900/50 p-4 space-y-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Recent Runs ({runs.length})</div>
          {runs.slice(0, 15).map((run) => (
            <div key={run.id} className="flex items-center justify-between px-3 py-2 rounded-xl border border-white/[0.05] bg-zinc-900/60">
              <div>
                <div className="text-xs font-medium text-zinc-300">{run.workflowId}</div>
                <div className="text-[10px] text-zinc-600">{new Date(run.createdAtMs || 0).toLocaleString()}</div>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded border ${
                run.status === 'completed' ? 'border-emerald-600/30 text-emerald-400' :
                run.status === 'failed' ? 'border-red-600/30 text-red-400' :
                'border-zinc-700 text-zinc-400'
              }`}>{run.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
