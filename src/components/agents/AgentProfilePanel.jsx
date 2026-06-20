import React from 'react';

export function AgentProfilePanel({ agent }) {
  if (!agent) {
    return <div className="rounded-xl border border-white/10 bg-zinc-900/40 p-3 text-sm text-zinc-500">Select an agent to inspect profile details.</div>;
  }

  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/40 p-4 space-y-3">
      <div>
        <div className="text-sm font-semibold text-white">{agent.name}</div>
        <div className="text-xs text-zinc-400">{agent.title || agent.role}</div>
      </div>
      <p className="text-xs text-zinc-300">{agent.purpose}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-lg border border-white/10 p-2">
          <div className="text-zinc-500 uppercase tracking-wider font-bold text-[10px] mb-1">Strengths</div>
          {(agent.strengths || []).slice(0, 4).map((item) => <div key={item} className="text-zinc-300">{item}</div>)}
        </div>
        <div className="rounded-lg border border-white/10 p-2">
          <div className="text-zinc-500 uppercase tracking-wider font-bold text-[10px] mb-1">Limitations</div>
          {(agent.limitations || []).slice(0, 4).map((item) => <div key={item} className="text-zinc-300">{item}</div>)}
        </div>
      </div>
      {(agent.skillFocus || (Array.isArray(agent.skillPackIds) && agent.skillPackIds.length > 0)) && (
        <div className="rounded-lg border border-white/10 p-2 text-[11px]">
          <div className="text-zinc-500 uppercase tracking-wider font-bold text-[10px] mb-1">Professional Skill</div>
          {agent.skillFocus && <div className="text-zinc-200">{agent.skillFocus}</div>}
          {Array.isArray(agent.skillPackIds) && agent.skillPackIds.length > 0 && (
            <div className="mt-1 text-zinc-400">
              Packs: {agent.skillPackIds.join(', ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
