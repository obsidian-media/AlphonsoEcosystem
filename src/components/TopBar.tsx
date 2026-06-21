import React from 'react';
import { ArrowUpCircle, WifiOff } from 'lucide-react';
import alphonsoIcon from '../assets/alphonso-icon.svg';

interface Settings {
  selectedModel?: string;
  zeroCostMode?: boolean;
}

interface OllamaStatus {
  state: string;
  label?: string;
}

interface TopBarProps {
  settings: Settings;
  ollamaStatus: OllamaStatus;
  operatorMode?: boolean;
  activeTab: string;
  updateAvailable?: boolean;
  updateVersion?: string;
  isOnline?: boolean;
  onOpenSettings: () => void;
}

const PAGE_TITLES: Record<string, string> = {
  chat: 'Chat',
  mission: 'Dashboard',
  orchestrator: 'Orchestrator',
  hector: 'Research',
  miya: 'Creative Studio',
  ecosystem: 'Ecosystem',
  project_execution: 'Projects',
  connectors: 'Connectors',
  activity: 'Activity',
  settings: 'Settings',
  operator: 'Operator',
  files: 'Knowledge',
  automation: 'Automation',
  content: 'Content',
  mission_room: 'Mission Room',
  workflows: 'Workflows',
};

export function TopBar({
  settings,
  ollamaStatus,
  operatorMode,
  activeTab,
  updateAvailable,
  updateVersion,
  isOnline = true,
  onOpenSettings,
}: TopBarProps) {
  return (
    <header className="h-12 flex items-center justify-between px-5 border-b border-white/[0.06] bg-surface-0/80 backdrop-blur-sm z-20 sticky top-0">
      <div className="flex items-center gap-3">
        <h1 className="font-heading font-bold text-base text-white">
          {PAGE_TITLES[activeTab] || 'Alphonso'}
        </h1>

        {!isOnline && (
          <div className="badge-neutral">
            <WifiOff className="w-3 h-3" />
            Offline
          </div>
        )}

        {updateAvailable && (
          <button onClick={onOpenSettings} className="badge-success cursor-pointer">
            <ArrowUpCircle className="w-3 h-3" />
            {updateVersion}
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        {operatorMode && <span className="badge-neutral">Operator</span>}
        {settings.zeroCostMode && <span className="badge-success">Free</span>}

        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-2 border border-white/[0.06]">
          <span className={`h-1.5 w-1.5 rounded-full ${ollamaStatus.state === 'connected' ? 'bg-success' : 'bg-danger'}`} />
          <span className="text-2xs text-zinc-400">{settings.selectedModel || 'No model'}</span>
        </div>

        <img src={alphonsoIcon} alt="" className="w-6 h-6 rounded-full opacity-80" />
      </div>
    </header>
  );
}
