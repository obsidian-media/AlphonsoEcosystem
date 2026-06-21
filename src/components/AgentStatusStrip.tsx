import React from 'react';

interface Agent {
  name: string;
  status: string;
}

interface AgentStatusStripProps {
  activeAgents: Agent[];
  compact?: boolean;
}

export function AgentStatusStrip({ activeAgents, compact = false }: AgentStatusStripProps) {
  if (!activeAgents || activeAgents.length === 0) return null;

  return (
    <div className={`flex flex-wrap gap-2 ${compact ? 'gap-1' : 'gap-2'}`}>
      {activeAgents.map((agent) => (
        <div
          key={agent.name}
          className={`flex items-center gap-1.5 bg-zinc-800 rounded-full ${compact ? 'px-2 py-0.5' : 'px-3 py-1'}`}
        >
          <span className="relative flex h-2 w-2">
            {agent.status === 'running' ? (
              <>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
              </>
            ) : (
              <span className="relative inline-flex rounded-full h-2 w-2 bg-zinc-500" />
            )}
          </span>
          <span className={`text-zinc-300 font-medium ${compact ? 'text-xs' : 'text-sm'}`}>
            {agent.name}
          </span>
        </div>
      ))}
    </div>
  );
}
