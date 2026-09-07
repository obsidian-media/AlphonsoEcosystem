import React from 'react';

interface Agent {
  id: string;
  name: string;
  title?: string;
  role?: string;
}

interface Props {
  agent: Agent;
  active?: boolean;
  onClick?: (id: string) => void;
}

export function AgentCard({ agent, active, onClick }: Props): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={() => onClick?.(agent.id)}
      className={`w-full rounded-xl border px-3 py-3 text-left transition ${
        active ? 'border-[var(--accent-border)] bg-[var(--accent-dim)]' : 'border-[var(--border)] bg-[var(--surface-2)] hover:bg-[var(--surface-2)]'
      }`}
    >
      <div className="text-sm font-semibold text-[var(--text-1)]">{agent.name}</div>
      <div className="text-[11px] text-[var(--text-3)]">{agent.title ?? agent.role}</div>
    </button>
  );
}
