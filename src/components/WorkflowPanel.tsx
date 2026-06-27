import React from 'react';
import { listWorkflows, runWorkflow, executeWorkflowTasks } from '../services/workflowRegistryService';
import { Play, ListChecks, X } from 'lucide-react';

interface WorkflowItem {
  id: string;
  name: string;
  purpose: string;
  chain: string[];
}

interface Props {
  onClose: () => void;
  onRunWorkflow?: (workflowId: string) => void;
}

export function WorkflowPanel({ onClose, onRunWorkflow }: Props) {
  const [workflows, setWorkflows] = React.useState<WorkflowItem[]>([]);
  const [active, setActive] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState('');

  React.useEffect(() => {
    setWorkflows(listWorkflows());
  }, []);

  const handleRun = async (workflow: WorkflowItem) => {
    setActive(workflow.id);
    setStatus('Running workflow...');
    try {
      const result = await executeWorkflowTasks(workflow.id);
      setStatus(result.ok ? 'Completed. Check Mission Room for outputs.' : 'Failed. See logs.');
      onRunWorkflow?.(workflow.id);
    } catch (error) {
      setStatus(`Failed: ${String(error)}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-zinc-950/95 p-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <div className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-zinc-300" />
            <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-200">Workflows</h2>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-zinc-400 hover:bg-white/5">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 grid max-h-[65vh] gap-2 overflow-y-auto md:grid-cols-2">
          {workflows.map((workflow) => {
            const isActive = active === workflow.id;
            return (
              <div
                key={workflow.id}
                className={`rounded-xl border p-3 ${
                  isActive ? 'border-white/20 bg-white/5' : 'border-white/10 bg-zinc-900/55'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold text-zinc-100">{workflow.name}</div>
                    <div className="text-[10px] text-zinc-500">{workflow.id}</div>
                  </div>
                  <button
                    onClick={() => handleRun(workflow)}
                    className="flex items-center gap-1 rounded-md border border-white/10 bg-zinc-900/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-200 hover:border-white/20 hover:bg-zinc-800"
                  >
                    <Play className="h-3 w-3" />
                    Run
                  </button>
                </div>
                <div className="mt-2 text-[10px] text-zinc-500">{workflow.purpose}</div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {(workflow.chain || []).map((agent) => (
                    <span
                      key={agent}
                      className="rounded-full border border-white/10 bg-zinc-900/60 px-1.5 py-[2px] text-[9px] font-semibold uppercase tracking-widest text-zinc-300"
                    >
                      {agent}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {status && <div className="mt-3 text-[11px] text-zinc-400">{status}</div>}
      </div>
    </div>
  );
}
