import React from 'react';
import { AgentCard } from './AgentCard';

export function AgentDock({ agents, activeAgents, onToggleAgent }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4 space-y-3">
      <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 font-bold">Agent Dock</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {agents.map((agent) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            active={activeAgents.includes(agent.id)}
            onClick={onToggleAgent}
          />
        ))}
      </div>
    </div>
  );
}

