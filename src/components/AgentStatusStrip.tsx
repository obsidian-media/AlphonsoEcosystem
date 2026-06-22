import React, { useState, useEffect } from 'react';
import { listAgentActivity } from '../services/agentActivityService.js';

interface Agent {
  name: string;
  status: string;
}

interface AgentStatusStripProps {
  activeAgents?: Agent[];
  compact?: boolean;
  useAutoFeed?: boolean;
  onAgentsChange?: (agents: Agent[]) => void;
}

export function AgentStatusStrip({
  activeAgents: activeAgentsProp,
  compact = false,
  useAutoFeed = true,
  onAgentsChange
}: AgentStatusStripProps) {
  const [derivedAgents, setDerivedAgents] = useState<Agent[]>([]);

  useEffect(() => {
    if (!useAutoFeed) return;

    function deriveActiveAgents(): Agent[] {
      const WINDOW_MS = 30_000;
      const now = Date.now();
      const activity = listAgentActivity();
      const recentMap = new Map<string, number>();
      for (const entry of activity) {
        if (now - entry.ts <= WINDOW_MS) {
          recentMap.set(entry.agent, entry.ts);
        }
      }
      return Array.from(recentMap.keys()).map((name) => ({ name, status: 'running' }));
    }

    const update = () => {
      const agents = deriveActiveAgents();
      setDerivedAgents(agents);
      onAgentsChange?.(agents);
    };

    update();
    const id = setInterval(update, 3000);
    return () => clearInterval(id);
  }, [useAutoFeed, onAgentsChange]);

  const activeAgents = useAutoFeed ? derivedAgents : (activeAgentsProp ?? []);

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
