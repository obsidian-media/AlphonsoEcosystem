import React from 'react';
import { RefreshCw } from 'lucide-react';
import { createWorkflow, listWorkflows } from '../services/workflowBuilderService';
import { listWorkflowReceipts } from '../services/workflowReceiptService';
import { listWorkflowOperations, updateWorkflowOperationStatus } from '../services/workflowOperationsRegistryService';
import { WorkflowBuilderView } from './WorkflowBuilderView';

export function AutomationView() {
  const [workflows, setWorkflows] = React.useState(() => listWorkflows());
  const [runs, setRuns] = React.useState(() => listWorkflowReceipts());
  const [ops, setOps] = React.useState(() => listWorkflowOperations());
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
      {/* Tab bar */}
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
      </div>

      {activeTab === 'builder' ? (
        <div className="flex-1 overflow-hidden">
          <WorkflowBuilderView />
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
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
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
