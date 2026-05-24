import React from 'react';
import { AgentAvatar } from './AgentAvatar';

export function AgentDock({ companions }) {
  const summary = companions.map((item) => item.name).join(' + ');
  return (
    <div className="pointer-events-auto w-[20rem] rounded-xl border border-white/10 bg-zinc-950/95 shadow-xl backdrop-blur-xl overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-100">Agents</div>
        <div className="text-[9px] text-zinc-500">one merged dock</div>
      </div>
      <div className="space-y-2 p-2.5">
        <div className="flex items-center gap-2 overflow-hidden rounded-lg border border-white/8 bg-zinc-900/60 px-2.5 py-2">
          <div className="flex -space-x-2 shrink-0">
            {companions.map((item) => (
              <div key={item.agentId} className="rounded-full border border-zinc-950 bg-zinc-950 p-0.5 shadow-md">
                <AgentAvatar agentId={item.agentId} name={item.name} sizeClass="h-7 w-7" />
              </div>
            ))}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-200 truncate">{summary}</div>
            <div className="text-[9px] text-zinc-400 truncate">Alphonso, Hector, Jose, and Miya share one compact dock.</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {companions.map((item) => (
            <div key={item.agentId} className="rounded-lg border border-white/8 bg-zinc-900/45 px-2 py-1.5">
              <div className="flex items-center gap-2">
                <div className="shrink-0">
                  <AgentAvatar agentId={item.agentId} name={item.name} sizeClass="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-200 truncate">{item.name}</div>
                  <div className="text-[8px] text-zinc-500 truncate">{item.state}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
