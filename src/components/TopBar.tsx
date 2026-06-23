import React from 'react';
import { ArrowUpCircle, Bell, WifiOff } from 'lucide-react';
import alphonsoIcon from '../assets/alphonso-icon.svg';
import { Badge } from './ui/Badge';

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
  notificationCount?: number;
  onToggleNotifications?: () => void;
  selectedModelMissing?: boolean;
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
  notificationCount = 0,
  onToggleNotifications,
}: TopBarProps) {
  return (
    <header className="h-11 flex items-center justify-between px-4 border-b border-[var(--border)] bg-[var(--surface-0)] z-20 sticky top-0">
      <div className="flex items-center gap-3">
        <h1 className="text-sm font-medium text-[var(--text-1)]">
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
        {operatorMode && <Badge variant="default">Operator</Badge>}
        {settings.zeroCostMode && <Badge variant="success">Free</Badge>}

        {onToggleNotifications && (
          <button
            onClick={onToggleNotifications}
            className="relative p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-surface-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
            {notificationCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 rounded-full bg-accent text-[10px] font-bold text-white flex items-center justify-center leading-none">
                {notificationCount > 9 ? '9+' : notificationCount}
              </span>
            )}
          </button>
        )}

        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--surface-2)] border border-[var(--border)]">
          <span className={`h-1.5 w-1.5 rounded-full ${ollamaStatus.state === 'connected' ? 'bg-[var(--success)]' : 'bg-[var(--error)]'}`} />
          <span className="text-2xs text-[var(--text-3)]">{settings.selectedModel || 'No model'}</span>
        </div>

        <img src={alphonsoIcon} alt="" className="w-6 h-6 rounded-full opacity-80" />
      </div>
    </header>
  );
}
