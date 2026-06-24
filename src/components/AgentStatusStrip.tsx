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

const AGENT_COLOR: Record<string, string> = {
  alphonso: 'var(--agent-alphonso)',
  jose:     'var(--agent-jose)',
  hector:   'var(--agent-hector)',
  miya:     'var(--agent-miya)',
  maria:    'var(--agent-maria)',
  marcus:   'var(--agent-marcus)',
  echo:     'var(--agent-echo)',
  sentinel: 'var(--agent-sentinel)',
  nova:     'var(--agent-nova)',
};

const AGENT_GLOW: Record<string, string> = {
  alphonso: 'var(--agent-alphonso-glow)',
  jose:     'var(--agent-jose-glow)',
  hector:   'var(--agent-hector-glow)',
  miya:     'var(--agent-miya-glow)',
  maria:    'var(--agent-maria-glow)',
  marcus:   'var(--agent-marcus-glow)',
  echo:     'var(--agent-echo-glow)',
  sentinel: 'var(--agent-sentinel-glow)',
  nova:     'var(--agent-nova-glow)',
};

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
    <div className={`flex flex-wrap ${compact ? 'gap-1' : 'gap-2'}`}>
      {activeAgents.map((agent) => {
        const key = agent.name.toLowerCase();
        const color = AGENT_COLOR[key] ?? 'var(--accent)';
        const glow = AGENT_GLOW[key] ?? 'var(--accent-glow)';
        return (
          <div
            key={agent.name}
            className={`flex items-center gap-1.5 bg-[var(--surface-3)] border border-[var(--border)] rounded-full ${compact ? 'px-2 py-0.5' : 'px-3 py-1'}`}
          >
            <span className="relative flex h-2 w-2">
              {agent.status === 'running' && (
                <span
                  className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                  style={{ backgroundColor: color, boxShadow: `0 0 6px ${glow}` }}
                />
              )}
              <span
                className="relative inline-flex rounded-full h-2 w-2"
                style={{ backgroundColor: color }}
              />
            </span>
            {!compact && (
              <span className="text-[var(--text-2)] font-medium text-sm">{agent.name}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
