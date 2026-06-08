import React from 'react';
import { Moon, Palette, Sparkles, Sun } from 'lucide-react';
import { AgentAvatar } from './AgentAvatar';

const themes = [
  { id: 'deep_space', label: 'Space' },
  { id: 'neon_studio', label: 'Studio' },
  { id: 'orchestrator_gold', label: 'Gold' },
  { id: 'minimal_runtime', label: 'Clean' }
];

const AGENT_MAP = {
  chat: { id: 'alphonso', label: 'Alphonso' },
  mission: { id: 'alphonso', label: 'Alphonso' },
  orchestrator: { id: 'jose', label: 'Jose' },
  hector: { id: 'hector', label: 'Hector' },
  miya: { id: 'miya', label: 'Miya' },
  ecosystem: { id: 'maria', label: 'Maria' },
  project_execution: { id: 'alphonso', label: 'Alphonso' },
  connectors: { id: 'alphonso', label: 'System' },
  activity: { id: 'alphonso', label: 'System' },
  settings: { id: 'alphonso', label: 'System' },
  operator: { id: 'alphonso', label: 'Alphonso' },
  files: { id: 'echo', label: 'Echo' },
  automation: { id: 'sentinel', label: 'Sentinel' },
};

export function CommandRib({ activeTab, settings, setSettings, ollamaStatus }) {
  const agent = AGENT_MAP[activeTab] || { id: 'alphonso', label: 'Alphonso' };
  const currentTheme = settings.environmentTheme || 'deep_space';

  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.06] bg-surface-0/80 backdrop-blur-sm">
      {/* Left: Current agent */}
      <div className="flex items-center gap-2">
        <AgentAvatar agentId={agent.id} name={agent.label} sizeClass="h-5 w-5" />
        <span className="text-xs font-semibold text-zinc-300">{agent.label}</span>
        <span className="text-2xs text-zinc-500">/</span>
        <span className="text-2xs text-zinc-500 capitalize">{activeTab?.replace(/_/g, ' ')}</span>
      </div>

      {/* Right: Theme + status */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg bg-surface-2 border border-white/[0.06] px-2 py-1">
          {themes.map((theme) => (
            <button
              key={theme.id}
              onClick={() => setSettings({ ...settings, environmentTheme: theme.id })}
              className={`px-2 py-0.5 rounded-md text-2xs font-medium transition-all ${
                currentTheme === theme.id
                  ? 'bg-accent text-white'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {theme.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-surface-2 border border-white/[0.06]">
          <span className={`h-1.5 w-1.5 rounded-full ${ollamaStatus.state === 'connected' ? 'bg-success' : 'bg-danger'}`} />
          <span className="text-2xs text-zinc-400">{ollamaStatus.state === 'connected' ? 'Online' : 'Offline'}</span>
        </div>
      </div>
    </div>
  );
}
