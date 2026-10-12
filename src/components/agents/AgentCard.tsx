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
      className={`w-full rounded-xl px-3 py-3 text-left transition ${
        active ? 'bg-(--accent-dim) ring-1 ring-(--accent-border)' : 'bg-(--surface-2) hover:bg-(--surface-3)'
      }`}
    >
      <div className="text-sm font-semibold text-(--text-1)">{agent.name}</div>
      <div className="text-[11px] text-(--text-3)">{agent.title ?? agent.role}</div>
    </button>
  );
}
