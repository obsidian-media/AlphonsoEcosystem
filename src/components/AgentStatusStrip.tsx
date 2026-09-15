import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { listAgentActivity } from '../services/agentActivityService.js';
import { listAgentProfiles } from '../agents/agentRegistry.js';
import { getAgentMascotPath, getAgentInitials } from '../services/agentVisualService';

interface Agent {
  name: string;
  status: string;
}

interface AgentStatusStripProps {
  activeAgents?: Agent[];
  compact?: boolean;
  useAutoFeed?: boolean;
  onAgentsChange?: (agents: Agent[]) => void;
  variant?: 'dots' | 'portraits';
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
  onAgentsChange,
  variant = 'dots'
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

  if (variant === 'portraits') {
    const activeIds = new Set(activeAgents.map((a) => a.name.toLowerCase()));
    return (
      <div className="flex gap-4 overflow-x-auto">
        {listAgentProfiles().map((profile: { id: string; name: string }) => {
          const isActive = activeIds.has(profile.id);
          const mascot = getAgentMascotPath(profile.id);
          const color = AGENT_COLOR[profile.id] ?? 'var(--accent)';
          const glow = AGENT_GLOW[profile.id] ?? 'var(--accent-glow)';
          return (
            <div key={profile.id} className="relative flex flex-col items-center gap-1 flex-shrink-0" data-testid={`agent-portrait-${profile.id}`} data-active={isActive}>
              {isActive && (
                <motion.div
                  className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full pointer-events-none"
                  style={{ width: 62, height: 62, background: `radial-gradient(circle, ${glow}, transparent 65%)` }}
                  animate={{ opacity: [0.6, 1, 0.6], scale: [0.95, 1.2, 0.95] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                />
              )}
              {mascot ? (
                <img
                  src={mascot}
                  alt={profile.name}
                  className={`relative z-10 h-11 w-11 rounded-full object-cover border-2 border-[var(--surface-0)] ${isActive ? '' : 'opacity-40 grayscale'}`}
                />
              ) : (
                <div
                  className={`relative z-10 h-11 w-11 rounded-full flex items-center justify-center text-xs font-bold border-2 border-[var(--surface-0)] ${isActive ? '' : 'opacity-40 grayscale'}`}
                  style={{ backgroundColor: color, color: 'var(--surface-0)' }}
                >
                  {getAgentInitials(profile.name)}
                </div>
              )}
              <span className="text-[9px] text-[var(--text-4)]">{profile.name}</span>
            </div>
          );
        })}
      </div>
    );
  }

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
