import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { AgentAvatar } from './AgentAvatar';

const AGENT_MAP: Record<string, { id: string; label: string }> = {
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

interface Props {
  activeTab: string;
  settings: { colorScheme: string; [key: string]: unknown };
  setSettings: (settings: { colorScheme: string; [key: string]: unknown }) => void;
  ollamaStatus: { state: string };
}

export function CommandRib({ activeTab, settings, setSettings, ollamaStatus }: Props) {
  const agent = AGENT_MAP[activeTab] || { id: 'alphonso', label: 'Alphonso' };
  const isLight = settings.colorScheme === 'light';

  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.06] bg-surface-0/80 backdrop-blur-sm">
      {/* Left: Current agent */}
      <div className="flex items-center gap-2">
        <AgentAvatar agentId={agent.id} name={agent.label} sizeClass="h-5 w-5" />
        <span className="text-xs font-semibold text-zinc-300">{agent.label}</span>
        <span className="text-2xs text-zinc-500">/</span>
        <span className="text-2xs text-zinc-500 capitalize">{activeTab?.replace(/_/g, ' ')}</span>
      </div>

      {/* Right: Theme toggle + Ollama status */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setSettings({ ...settings, colorScheme: isLight ? 'dark' : 'light' })}
          className="flex items-center gap-1.5 rounded-lg bg-surface-2 border border-white/[0.06] px-2 py-1 text-2xs text-zinc-400 hover:text-zinc-200 transition-colors"
          title={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
        >
          {isLight ? <Sun className="h-3 w-3" /> : <Moon className="h-3 w-3" />}
          {isLight ? 'Light' : 'Dark'}
        </button>

        <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-surface-2 border border-white/[0.06]">
          <span className={`h-1.5 w-1.5 rounded-full ${ollamaStatus.state === 'connected' ? 'bg-success' : 'bg-danger'}`} />
          <span className="text-2xs text-zinc-400">{ollamaStatus.state === 'connected' ? 'Online' : 'Offline'}</span>
        </div>
      </div>
    </div>
  );
}
