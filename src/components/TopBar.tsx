import React from 'react';
import { Bell, WifiOff, Sun, Moon, Keyboard, ArrowUpCircle } from 'lucide-react';
import { Badge, SectionHeader, StatusDot, statusColors } from './ui/Badge';
import { useTheme } from '../hooks/useTheme';

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
  onOpenShortcuts?: () => void;
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
  selectedModelMissing,
  onOpenShortcuts,
}: TopBarProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="h-11 flex items-center justify-between px-4 border-b border-[var(--border)] bg-[var(--surface-glass)] backdrop-blur-xl z-20 sticky top-0 relative">
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--accent-border)] to-transparent opacity-60" />
      <div className="flex items-center gap-3">
<h1 className="text-sm font-semibold text-[var(--text-1)]">
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
        <button
          onClick={toggleTheme}
          className="p-1.5 rounded-lg text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--surface-3)] transition-colors"
          aria-label="Toggle theme"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {onOpenShortcuts && (
          <button
            onClick={onOpenShortcuts}
            className="p-1.5 rounded-lg text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--surface-3)] transition-colors"
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts (Ctrl+?)"
          >
            <Keyboard className="w-4 h-4" />
          </button>
        )}

        {operatorMode && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-widest bg-[var(--accent-dim)] border border-[var(--accent-border)] text-[var(--accent)]">
            Operator
          </span>
        )}
        {settings.zeroCostMode && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-widest bg-[var(--success-dim)] border border-[var(--success)]/20 text-[var(--success)]">
            Free
          </span>
        )}

        {onToggleNotifications && (
          <button
            onClick={onToggleNotifications}
            className="relative p-1.5 rounded-lg text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--surface-3)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50"
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
            {notificationCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 rounded-full bg-[var(--accent)] text-[10px] font-bold text-[var(--surface-0)] flex items-center justify-center leading-none">
                {notificationCount > 9 ? '9+' : notificationCount}
              </span>
            )}
          </button>
        )}

        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--surface-2)] border ${selectedModelMissing ? 'border-[var(--warning)]/30' : 'border-[var(--border)]'}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${ollamaStatus.state === 'connected' ? 'bg-[var(--success)]' : 'bg-[var(--error)]'}`} />
          <span className={`text-xs ${selectedModelMissing ? 'text-[var(--warning)]' : 'text-[var(--text-3)]'}`}>
            {selectedModelMissing ? 'No model' : settings.selectedModel || 'No model'}
          </span>
        </div>
      </div>
    </header>
  );
}
