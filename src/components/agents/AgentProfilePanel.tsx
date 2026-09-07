import React from 'react';

interface Agent {
  name: string;
  title?: string;
  role?: string;
  purpose?: string;
  strengths?: string[];
  limitations?: string[];
  skillFocus?: string;
  skillPackIds?: string[];
}

interface Props {
  agent?: Agent | null;
}

export function AgentProfilePanel({ agent }: Props): React.JSX.Element {
  if (!agent) {
    return <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm text-[var(--text-3)]">Select an agent to inspect profile details.</div>;
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4 space-y-3">
      <div>
        <div className="text-sm font-semibold text-[var(--text-1)]">{agent.name}</div>
        <div className="text-xs text-[var(--text-3)]">{agent.title ?? agent.role}</div>
      </div>
      <p className="text-xs text-[var(--text-2)]">{agent.purpose}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-lg border border-[var(--border)] p-2">
          <div className="text-[var(--text-3)] uppercase tracking-wider font-bold text-[10px] mb-1">Strengths</div>
          {(agent.strengths ?? []).slice(0, 4).map((item) => <div key={item} className="text-[var(--text-2)]">{item}</div>)}
        </div>
        <div className="rounded-lg border border-[var(--border)] p-2">
          <div className="text-[var(--text-3)] uppercase tracking-wider font-bold text-[10px] mb-1">Limitations</div>
          {(agent.limitations ?? []).slice(0, 4).map((item) => <div key={item} className="text-[var(--text-2)]">{item}</div>)}
        </div>
      </div>
      {(agent.skillFocus ?? (Array.isArray(agent.skillPackIds) && agent.skillPackIds.length > 0)) && (
        <div className="rounded-lg border border-[var(--border)] p-2 text-[11px]">
          <div className="text-[var(--text-3)] uppercase tracking-wider font-bold text-[10px] mb-1">Professional Skill</div>
          {agent.skillFocus && <div className="text-[var(--text-1)]">{agent.skillFocus}</div>}
          {Array.isArray(agent.skillPackIds) && agent.skillPackIds.length > 0 && (
            <div className="mt-1 text-[var(--text-3)]">Packs: {agent.skillPackIds.join(', ')}</div>
          )}
        </div>
      )}
    </div>
  );
}
