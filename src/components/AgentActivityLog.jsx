import React, { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import { listAgentActivity } from '../services/agentActivityService';
import { EmptyState } from './ui/EmptyState';

const AGENT_COLORS = {
  alphonso: 'text-indigo-400',
  jose: 'text-amber-400',
  miya: 'text-fuchsia-400',
  hector: 'text-cyan-400',
  echo: 'text-violet-400',
  sentinel: 'text-red-400',
  nova: 'text-emerald-400',
  maria: 'text-sky-400',
  marcus: 'text-orange-400',
};

function friendlyAction(action) {
  if (!action) return 'Action';
  return action
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .slice(0, 60);
}

function friendlyDetail(detail) {
  if (!detail) return null;
  const s = String(detail).trim();
  if (s.length < 4) return null;
  return s.slice(0, 80);
}

export function AgentActivityLog() {
  const [entries, setEntries] = useState([]);

  useEffect(() => {
    setEntries(listAgentActivity().reverse());
    const interval = setInterval(() => setEntries(listAgentActivity().reverse()), 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.05] shrink-0">
        <Activity className="w-3.5 h-3.5 text-zinc-500" />
        <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">Agent Activity</span>
        <span className="ml-auto text-[10px] text-zinc-600">{entries.length} events</span>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {entries.length === 0 && (
          <EmptyState
            icon={<Activity className="w-full h-full" />}
            title="No activity yet"
            description="Agent actions will appear here as you use Alphonso — send a message, run a workflow, or trigger a connector."
          />
        )}
        {entries.map((e, i) => {
          const agentLabel = String(e.agent || 'system').toLowerCase();
          const agentColor = AGENT_COLORS[agentLabel] || 'text-zinc-400';
          const detail = friendlyDetail(e.detail);
          return (
            <div key={i} className="group flex items-start gap-3 px-2 py-2 rounded-lg hover:bg-zinc-900/40 transition-colors">
              <div className="shrink-0 mt-0.5 flex flex-col items-end gap-0.5">
                <span className={`text-[9px] font-bold uppercase tracking-widest ${agentColor}`}>{agentLabel}</span>
                <span className="text-[9px] text-zinc-700">{new Date(e.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] text-zinc-200 leading-snug">{friendlyAction(e.action)}</div>
                {detail && <div className="mt-0.5 text-[11px] text-zinc-500 leading-snug">{detail}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
