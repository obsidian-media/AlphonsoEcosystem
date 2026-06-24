import React, { useEffect, useState } from 'react';
import {
  Bot,
  BrainCircuit,
  ChevronDown,
  Cpu,
  FolderOpen,
  Home,
  MessageSquare,
  Moon,
  Plus,
  Settings,
  Sun,
  Shield,
  Sparkles,
  Terminal,
  Trash2
} from 'lucide-react';
import alphonsoIcon from '../assets/alphonso-icon.svg';
import { ConnectorStatusStrip, ConnectorStatusDot } from './ConnectorStatusIndicators';
import { AgentStatusStrip } from './AgentStatusStrip';

interface NavItem {
  id: string;
  icon: React.ElementType;
  label: string;
  showStatusDot?: boolean;
}

interface NavSection {
  label: string | null;
  items: NavItem[];
}

interface Conversation {
  id: string;
  title: string;
}

interface AppSettings {
  zeroCostMode?: boolean;
  [key: string]: unknown;
}

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isOpen: boolean;
  onToggle: () => void;
  conversations: Conversation[];
  activeChatId: string | null;
  setActiveChatId: (id: string) => void;
  onCreateChat: () => void;
  onDeleteChat: (id: string, e: React.MouseEvent) => void;
  settings: AppSettings;
  pendingApprovalCount?: number;
  onOpenCoach?: () => void;
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: null,
    items: [
      { id: 'chat', icon: MessageSquare, label: 'Chat' },
      { id: 'mission', icon: Home, label: 'Dashboard' },
    ]
  },
  {
    label: 'Build',
    items: [
      { id: 'project_execution', icon: Terminal, label: 'Projects' },
      { id: 'miya', icon: Sparkles, label: 'Creative' },
    ]
  },
  {
    label: 'Agents',
    items: [
      { id: 'orchestrator', icon: Shield, label: 'Orchestrator' },
      { id: 'ecosystem', icon: Bot, label: 'All Agents' },
    ]
  },
  {
    label: 'System',
    items: [
      { id: 'runtimes', icon: Cpu, label: 'Runtimes' },
      { id: 'connectors', icon: FolderOpen, label: 'Connectors', showStatusDot: true },
      { id: 'activity', icon: FolderOpen, label: 'Activity' },
      { id: 'workflows', icon: FolderOpen, label: 'Workflows' },
    ]
  }
];

export function Sidebar({ activeTab, setActiveTab, isOpen, onToggle, conversations, activeChatId, setActiveChatId, onCreateChat, onDeleteChat, settings, pendingApprovalCount = 0, onOpenCoach }: SidebarProps) {
  const zeroCostMode = Boolean(settings?.zeroCostMode);

  const [isLight, setIsLight] = useState<boolean>(() => {
    try { return localStorage.getItem('alphonso_theme_v1') === 'light'; } catch { return false; }
  });

  useEffect(() => {
    document.documentElement.classList.toggle('light', isLight);
    try { localStorage.setItem('alphonso_theme_v1', isLight ? 'light' : 'dark'); } catch { /* ignore */ }
  }, [isLight]);

  return (
    <aside className={`${isOpen ? 'w-52' : 'w-14'} flex flex-col transition-all duration-300 ease-in-out bg-[var(--surface-1)] shrink-0 border-r border-[var(--border)]`}>
      {/* Logo */}
      <div className="h-14 flex items-center px-4 py-3 border-b border-[var(--border)] shrink-0">
        <div className="flex items-center gap-2.5 w-full">
          <img src={alphonsoIcon} alt="Alphonso" className="w-7 h-7 rounded-lg shrink-0 shadow-glow-sm" />
          {isOpen && <span className="font-heading font-bold text-sm tracking-wide text-white">ALPHONSO</span>}
          <button
            onClick={onToggle}
            className="ml-auto p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-surface-3 transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            aria-label={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? '-rotate-90' : 'rotate-90'}`} />
          </button>
        </div>
      </div>

      {/* Agent status strip — shows pulsing badges for agents active in last 30s */}
      {isOpen && (
        <div className="px-3 py-2 border-b border-[var(--border)] min-h-0">
          <AgentStatusStrip compact useAutoFeed />
        </div>
      )}

      {/* Navigation */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="py-3 px-2 flex flex-col gap-0.5 shrink-0">
          {NAV_SECTIONS.map((section, sIdx) => (
            <React.Fragment key={sIdx}>
              {isOpen && section.label && (
                <div className="px-3 pt-4 pb-1.5 section-label">{section.label}</div>
              )}
              {section.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`relative flex items-center gap-2.5 px-3 py-2 text-sm transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
                    activeTab === item.id
                      ? 'bg-[var(--surface-3)] text-[var(--text-1)] border-l-2 border-[var(--accent)] pl-[calc(0.75rem-2px)]'
                      : 'text-[var(--text-3)] hover:bg-[var(--surface-3)] hover:text-[var(--text-2)] border-l-2 border-transparent'
                  }`}
                  aria-current={activeTab === item.id ? 'page' : undefined}
                >
                  <item.icon className={`w-4 h-4 shrink-0 ${activeTab === item.id ? 'text-[var(--accent)]' : ''}`} />
                  {isOpen && <span className="font-medium">{item.label}</span>}
                  {isOpen && item.id === 'chat' && pendingApprovalCount > 0 && (
                    <span className="ml-auto flex items-center justify-center w-4 h-4 rounded-full bg-[var(--warning)] text-[8px] font-bold text-black animate-pulse">
                      {pendingApprovalCount > 9 ? '9+' : pendingApprovalCount}
                    </span>
                  )}
                  {isOpen && item.showStatusDot && (
                    <ConnectorStatusStrip zeroCostMode={zeroCostMode} />
                  )}
                  {!isOpen && item.showStatusDot && (
                    <span className="absolute top-1 right-1">
                      <ConnectorStatusDot connectorId="whatsapp" />
                    </span>
                  )}
                </button>
              ))}
            </React.Fragment>
          ))}
        </div>

        {/* Chat list */}
        {isOpen && (
          <div className="flex flex-col flex-1 px-2 mt-2 overflow-hidden">
            <div className="flex items-center justify-between px-3 mb-2">
              <span className="section-label">Recent Chats</span>
              <button onClick={onCreateChat} className="p-1 hover:bg-surface-3 rounded-lg transition-colors text-zinc-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50" aria-label="Create new chat">
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-0.5 pr-1">
              {conversations.map((chat) => (
                <div
                  key={chat.id}
                  onClick={() => { setActiveChatId(chat.id); setActiveTab('chat'); }}
                  className={`group flex items-center justify-between px-3 py-1.5 rounded-lg text-xs cursor-pointer transition-all ${
                    activeChatId === chat.id && activeTab === 'chat'
                      ? 'bg-[var(--surface-3)] text-[var(--accent)]'
                      : 'text-[var(--text-3)] hover:bg-[var(--surface-3)] hover:text-[var(--text-2)]'
                  }`}
                >
                  <span className="truncate">{chat.title}</span>
                  <button
                    onClick={(e) => onDeleteChat(chat.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-danger/20 hover:text-danger rounded transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:opacity-100"
                    aria-label={`Delete chat: ${chat.title}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-2 border-t border-[var(--border)] space-y-0.5">
        {onOpenCoach && (
          <button
            onClick={onOpenCoach}
            className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-[var(--text-3)] hover:bg-[var(--surface-3)] hover:text-[var(--text-2)] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 border-l-2 border-transparent"
            aria-label="Open Coach mode"
          >
            <BrainCircuit className="w-4 h-4" />
            {isOpen && <span>Coach</span>}
          </button>
        )}
        <button
          onClick={() => setActiveTab('settings')}
          className={`flex items-center gap-2.5 w-full px-3 py-2 text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
            activeTab === 'settings' ? 'bg-[var(--surface-3)] text-[var(--text-1)] border-l-2 border-[var(--accent)] pl-[calc(0.75rem-2px)]' : 'text-[var(--text-3)] hover:bg-[var(--surface-3)] border-l-2 border-transparent'
          }`}
          aria-label="Open settings"
        >
          <Settings className="w-4 h-4" />
          {isOpen && <span>Settings</span>}
        </button>
        <button
          onClick={() => setIsLight((v) => !v)}
          className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-[var(--text-3)] hover:bg-[var(--surface-3)] hover:text-[var(--text-2)] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 border-l-2 border-transparent"
          aria-label={isLight ? 'Switch to dark theme' : 'Switch to light theme'}
        >
          {isLight ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          {isOpen && <span>{isLight ? 'Dark' : 'Light'}</span>}
        </button>
      </div>
    </aside>
  );
}
