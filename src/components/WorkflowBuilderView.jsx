import React, { useState, useCallback } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2, Save, GitBranch, Play, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import {
  WORKFLOW_NODE_LIBRARY,
  listWorkflows,
  createWorkflow,
  updateWorkflow,
  addWorkflowNode,
} from '../services/workflowBuilderService';
import { runVisualWorkflow } from '../services/workflowExecutionService';

// Node type → color + icon letter
const NODE_STYLE = {
  trigger:      { bg: 'bg-emerald-500/10', border: 'border-emerald-400/20', text: 'text-emerald-300', badge: '▶' },
  ocr:          { bg: 'bg-sky-500/10',     border: 'border-sky-400/20',     text: 'text-sky-300',     badge: '👁' },
  memory:       { bg: 'bg-violet-500/10',  border: 'border-violet-400/20',  text: 'text-violet-300',  badge: '🧠' },
  analysis:     { bg: 'bg-indigo-500/10',  border: 'border-indigo-400/20',  text: 'text-indigo-300',  badge: '🔍' },
  condition:    { bg: 'bg-amber-500/10',   border: 'border-amber-400/20',   text: 'text-amber-300',   badge: '⚡' },
  approval:     { bg: 'bg-orange-500/10',  border: 'border-orange-400/20',  text: 'text-orange-300',  badge: '✅' },
  action:       { bg: 'bg-red-500/10',     border: 'border-red-400/20',     text: 'text-red-300',     badge: '⚙' },
  notification: { bg: 'bg-teal-500/10',    border: 'border-teal-400/20',    text: 'text-teal-300',    badge: '🔔' },
  report:       { bg: 'bg-zinc-500/10',    border: 'border-zinc-400/20',    text: 'text-zinc-300',    badge: '📄' },
};

export function WorkflowBuilderView() {
  const [workflows, setWorkflows] = useState(() => listWorkflows());
  const [selectedId, setSelectedId] = useState(null);
  const [newName, setNewName] = useState('');
  const [showAddNode, setShowAddNode] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [runState, setRunState] = useState(null); // null | 'running' | 'done' | 'error'
  const [runMessage, setRunMessage] = useState('');

  const selected = workflows.find(w => w.id === selectedId) || null;

  const refresh = useCallback(() => setWorkflows(listWorkflows()), []);

  const handleCreate = () => {
    if (!newName.trim()) return;
    const wf = createWorkflow(newName.trim());
    if (wf) { refresh(); setSelectedId(wf.id); setNewName(''); }
  };

  const handleAddNode = (type) => {
    if (!selectedId) return;
    addWorkflowNode(selectedId, type, { x: 0, y: selected?.nodes?.length || 0 });
    refresh();
    setShowAddNode(false);
  };

  const moveNode = (index, direction) => {
    if (!selected) return;
    const nodes = [...selected.nodes];
    const target = index + direction;
    if (target < 0 || target >= nodes.length) return;
    [nodes[index], nodes[target]] = [nodes[target], nodes[index]];
    updateWorkflow(selectedId, { nodes });
    refresh();
  };

  const removeNode = (nodeId) => {
    if (!selected) return;
    const nodes = selected.nodes.filter(n => n.id !== nodeId);
    const edges = (selected.edges || []).filter(e => e.from !== nodeId && e.to !== nodeId);
    updateWorkflow(selectedId, { nodes, edges });
    refresh();
  };

  const handleSave = () => {
    if (!selectedId) return;
    updateWorkflow(selectedId, { updatedAtMs: Date.now() });
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);
  };

  const handleRun = async () => {
    if (!selectedId || !selected?.nodes?.length) return;
    setRunState('running');
    setRunMessage('');
    try {
      const result = runVisualWorkflow(selectedId, { initiatedBy: 'user' });
      setRunState('done');
      setRunMessage(result?.runId ? `Run started (${result.runId.slice(-6)})` : 'Workflow queued');
    } catch (err) {
      setRunState('error');
      setRunMessage(err?.message || 'Run failed');
    } finally {
      setTimeout(() => { setRunState(null); setRunMessage(''); }, 4000);
    }
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar: workflow list */}
      <div className="w-56 shrink-0 border-r border-white/[0.06] bg-zinc-950/50 flex flex-col">
        <div className="p-3 border-b border-white/[0.06]">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Workflows ({workflows.length})</p>
          <div className="flex gap-1">
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              placeholder="New workflow name"
              className="flex-1 bg-zinc-800 text-xs text-zinc-200 rounded-lg px-2 py-1.5 outline-none border border-white/5 placeholder-zinc-600 focus:border-indigo-500/40"
            />
            <button
              onClick={handleCreate}
              disabled={!newName.trim()}
              className="px-2 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-500 disabled:opacity-40 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {workflows.length === 0 && (
            <p className="text-[10px] text-zinc-600 text-center py-4">No workflows yet. Create one above.</p>
          )}
          {workflows.map(wf => (
            <button
              key={wf.id}
              onClick={() => setSelectedId(wf.id)}
              className={`w-full text-left px-3 py-2 rounded-xl text-xs transition-colors ${
                selectedId === wf.id
                  ? 'bg-indigo-500/15 border border-indigo-400/20 text-indigo-200'
                  : 'text-zinc-400 hover:bg-zinc-800/50 border border-transparent'
              }`}
            >
              <div className="font-medium truncate">{wf.name}</div>
              <div className="text-[10px] text-zinc-600 mt-0.5">{wf.nodes?.length || 0} steps &middot; {wf.agentScope}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Main area: node editor */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-zinc-600">
            <div className="text-center">
              <GitBranch className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="text-sm">Select or create a workflow</p>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
              <div>
                <h2 className="text-sm font-semibold text-zinc-100">{selected.name}</h2>
                <p className="text-[10px] text-zinc-500">{selected.nodes?.length || 0} steps &middot; scope: {selected.agentScope}</p>
              </div>
              <div className="flex items-center gap-2">
                {savedNotice && <span className="text-[10px] text-emerald-400 font-medium">Saved ✓</span>}
                {runMessage && (
                  <span className={`text-[10px] font-medium ${runState === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>
                    {runMessage}
                  </span>
                )}
                <button
                  onClick={() => setShowAddNode(!showAddNode)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600/80 text-white text-xs font-bold hover:bg-indigo-500 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Step
                  <ChevronDown className="w-3 h-3" />
                </button>
                <button
                  onClick={handleSave}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 text-zinc-200 text-xs font-bold hover:bg-zinc-700 transition-colors border border-white/5"
                >
                  <Save className="w-3.5 h-3.5" /> Save
                </button>
                <button
                  onClick={handleRun}
                  disabled={!selected?.nodes?.length || runState === 'running'}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600/90 text-white text-xs font-bold hover:bg-emerald-500 disabled:opacity-40 transition-colors"
                  title={!selected?.nodes?.length ? 'Add at least one step before running' : 'Run workflow'}
                >
                  {runState === 'running' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : runState === 'done' ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : runState === 'error' ? (
                    <XCircle className="w-3.5 h-3.5" />
                  ) : (
                    <Play className="w-3.5 h-3.5" />
                  )}
                  {runState === 'running' ? 'Running…' : 'Run'}
                </button>
              </div>
            </div>

            {/* Add node dropdown */}
            {showAddNode && (
              <div className="px-5 py-3 border-b border-white/[0.06] bg-zinc-900/50">
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Choose step type</p>
                <div className="flex flex-wrap gap-2">
                  {WORKFLOW_NODE_LIBRARY.map(n => {
                    const s = NODE_STYLE[n.type] || NODE_STYLE.action;
                    return (
                      <button
                        key={n.type}
                        onClick={() => handleAddNode(n.type)}
                        className={`px-3 py-1.5 rounded-xl border text-xs font-medium transition-all hover:opacity-80 ${s.bg} ${s.border} ${s.text}`}
                      >
                        {s.badge} {n.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Node list */}
            <div className="flex-1 overflow-y-auto p-5 space-y-2">
              {(!selected.nodes || selected.nodes.length === 0) && (
                <div className="flex flex-col items-center justify-center py-16 text-zinc-600">
                  <Play className="w-8 h-8 mb-2 opacity-20" />
                  <p className="text-xs">No steps yet. Click &ldquo;Add Step&rdquo; to build your workflow.</p>
                </div>
              )}
              {selected.nodes?.map((node, i) => {
                const s = NODE_STYLE[node.type] || NODE_STYLE.action;
                const lib = WORKFLOW_NODE_LIBRARY.find(n => n.type === node.type);
                return (
                  <div
                    key={node.id}
                    className={`flex items-center gap-3 p-4 rounded-2xl border ${s.bg} ${s.border}`}
                  >
                    {/* Step number */}
                    <div className="w-6 h-6 rounded-full bg-zinc-800/60 border border-white/10 flex items-center justify-center text-[10px] font-bold text-zinc-400 shrink-0">
                      {i + 1}
                    </div>
                    {/* Badge */}
                    <span className="text-lg shrink-0">{s.badge}</span>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className={`text-xs font-semibold ${s.text}`}>{lib?.label || node.type}</div>
                      <div className="text-[10px] text-zinc-500">{node.type} &middot; {lib?.category || 'node'}</div>
                    </div>
                    {/* Reorder + delete controls */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => moveNode(i, -1)}
                        disabled={i === 0}
                        className="p-1 rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-zinc-700/50 disabled:opacity-20 transition-colors"
                        title="Move up"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => moveNode(i, 1)}
                        disabled={i === (selected.nodes?.length - 1)}
                        className="p-1 rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-zinc-700/50 disabled:opacity-20 transition-colors"
                        title="Move down"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => removeNode(node.id)}
                        className="p-1 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors ml-1"
                        title="Remove step"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
