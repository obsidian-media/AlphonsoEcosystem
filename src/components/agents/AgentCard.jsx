import React from 'react';

export function AgentCard({ agent, active, onClick }) {
  return (
    <button
      type="button"
      onClick={() => onClick?.(agent.id)}
      className={`w-full rounded-xl border px-3 py-3 text-left transition ${
        active ? 'border-indigo-400/40 bg-indigo-500/10' : 'border-white/10 bg-zinc-900/40 hover:bg-zinc-900/70'
      }`}
    >
      <div className="text-sm font-semibold text-white">{agent.name}</div>
      <div className="text-[11px] text-zinc-400">{agent.title || agent.role}</div>
    </button>
  );
}

