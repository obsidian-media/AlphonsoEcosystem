import React, { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import { listAgentActivity } from '../services/agentActivityService';
import { EmptyState } from './ui/EmptyState';

const AGENT_COLORS: Record<string, string> = {
  alphonso: 'text-[var(--agent-alphonso)]',
  jose: 'text-[var(--agent-jose)]',
  miya: 'text-[var(--agent-miya)]',
  hector: 'text-[var(--agent-hector)]',
  echo: 'text-[var(--agent-echo)]',
  sentinel: 'text-[var(--agent-sentinel)]',
  nova: 'text-[var(--agent-nova)]',
  maria: 'text-[var(--agent-maria)]',
  marcus: 'text-[var(--agent-marcus)]',
};

interface ActivityEntry {
  agent: string;
  action: string;
  detail: string;
  ts: number;
}

function friendlyAction(action: string) {
  if (!action) return 'Action';
  return action
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .slice(0, 60);
}

function friendlyDetail(detail: string) {
  if (!detail) return null;
  const s = String(detail).trim();
  if (s.length < 4) return null;
  return s.slice(0, 80);
}

export function AgentActivityLog() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);

  useEffect(() => {
    setEntries(listAgentActivity().reverse());
    const interval = setInterval(() => setEntries(listAgentActivity().reverse()), 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border)] shrink-0">
        <Activity className="w-3.5 h-3.5 text-[var(--text-3)]" />
        <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-3)]">Agent Activity</span>
        <span className="ml-auto text-[10px] text-[var(--text-4)]">{entries.length} events</span>
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
          const agentColor = AGENT_COLORS[agentLabel] || 'text-[var(--text-3)]';
          const detail = friendlyDetail(e.detail);
          return (
            <div key={i} className="group flex items-start gap-3 px-2 py-2 rounded-lg hover:bg-[var(--surface-2)] transition-colors">
              <div className="shrink-0 mt-0.5 flex flex-col items-end gap-0.5">
                <span className={`text-[9px] font-bold uppercase tracking-widest ${agentColor}`}>{agentLabel}</span>
                <span className="text-[9px] text-[var(--text-4)]">{new Date(e.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] text-[var(--text-2)] leading-snug">{friendlyAction(e.action)}</div>
                {detail && <div className="mt-0.5 text-[11px] text-[var(--text-3)] leading-snug">{detail}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
