import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Bot,
  BrainCircuit,
  Briefcase,
  ChevronDown,
  Cpu,
  Database,
  FileText,
  Gauge,
  GitBranch,
  History,
  Home,
  LayoutDashboard,
  Library,
  MessageSquare,
  Mic,
  Moon,
  Palette,
  Plug,
  Plus,
  Search,
  Settings,
  Sun,
  Shield,
  Sparkles,
  Terminal,
  Trash2,
  Users,
  Activity
} from 'lucide-react';
import alphonsoIcon from '../assets/alphonso-app-icon.png';
import { ConnectorStatusStrip, ConnectorStatusDot } from './ConnectorStatusIndicators';
import { AgentStatusStrip } from './AgentStatusStrip';
import { useTheme } from '../hooks/useTheme';

const SIDEBAR_WIDTH_KEY = 'alphonso_sidebar_width_v1';
const RECENT_CHATS_HEIGHT_KEY = 'alphonso_recent_chats_height_v1';
const DEFAULT_SIDEBAR_WIDTH = 208; // matches the old fixed w-52
const MIN_SIDEBAR_WIDTH = 180;
const MAX_SIDEBAR_WIDTH = 340;
const DEFAULT_RECENT_CHATS_HEIGHT = 220;
const MIN_RECENT_CHATS_HEIGHT = 100;
const MAX_RECENT_CHATS_HEIGHT = 480;

function loadStoredNumber(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function saveStoredNumber(key: string, value: number) {
  try {
    localStorage.setItem(key, String(Math.round(value)));
  } catch {
    // best-effort only
  }
}

interface NavItem {
  id: string;
  icon: React.ElementType;
  label: string;
  showStatusDot?: boolean;
  showApprovalBadge?: boolean;
}

type SpaceId = 'home' | 'work' | 'research' | 'boardroom' | 'system';

interface Space {
  id: SpaceId;
  icon: React.ElementType;
  label: string;
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
  mode?: 'simple' | 'advanced';
  onToggleSearch: () => void;
  ollamaConnected?: boolean;
}

// Regrouping per docs/ui-redesign/draft-a-power-user-direction.md's locked
// "Rooms" design — deliberately NOT a 1:1 mirror of the old 4 groups. Research
// and Boardroom are pulled out of their old real groups into their own
// Spaces, each with exactly one real item today — left honest, not padded
// with invented items, since neither subsystem has separate real activeTab
// branches to link to yet.
const SPACES: Space[] = [
  {
    id: 'home',
    icon: Home,
    label: 'Home',
    items: [
      { id: 'mission', icon: LayoutDashboard, label: 'Dashboard' },
      { id: 'session_history', icon: History, label: 'Session History' },
    ]
  },
  {
    id: 'work',
    icon: Briefcase,
    label: 'Work',
    items: [
      { id: 'project_execution', icon: Terminal, label: 'Projects' },
      { id: 'content', icon: FileText, label: 'Content' },
      { id: 'automation', icon: GitBranch, label: 'Automation' },
      { id: 'miya', icon: Palette, label: 'Creative' },
    ]
  },
  {
    id: 'research',
    icon: Library,
    label: 'Research',
    items: [
      { id: 'hector', icon: Database, label: 'Research Desk' },
    ]
  },
  {
    id: 'boardroom',
    icon: Users,
    label: 'Boardroom',
    items: [
      { id: 'mission_room', icon: Sparkles, label: 'Boardroom' },
    ]
  },
  {
    id: 'system',
    icon: Settings,
    label: 'System',
    items: [
      { id: 'orchestrator', icon: Shield, label: 'Orchestrator', showApprovalBadge: true },
      { id: 'ecosystem', icon: Bot, label: 'All Agents' },
      { id: 'agent_performance', icon: Activity, label: 'Agent Performance' },
      { id: 'runtimes', icon: Cpu, label: 'Runtimes' },
      { id: 'voice', icon: Mic, label: 'Voice' },
      { id: 'connectors', icon: Plug, label: 'Connectors', showStatusDot: true },
      { id: 'operator', icon: Gauge, label: 'Operator' },
    ]
  }
];

const SIMPLE_MODE_ITEMS = new Set([
  'chat',
  'mission',
  'project_execution',
  'hector',
  'miya',
  'content',
  'settings',
]);

export function Sidebar({ activeTab, setActiveTab, isOpen, onToggle, conversations, activeChatId, setActiveChatId, onCreateChat, onDeleteChat, settings, pendingApprovalCount = 0, onOpenCoach, mode = 'advanced', onToggleSearch, ollamaConnected = false }: SidebarProps) {
  const zeroCostMode = Boolean(settings?.zeroCostMode);
  const { theme, toggleTheme } = useTheme();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const pendingDeleteTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeSpace, setActiveSpace] = useState<SpaceId>('home');
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => loadStoredNumber(SIDEBAR_WIDTH_KEY, DEFAULT_SIDEBAR_WIDTH));
  const [recentChatsHeight, setRecentChatsHeight] = useState<number>(() => loadStoredNumber(RECENT_CHATS_HEIGHT_KEY, DEFAULT_RECENT_CHATS_HEIGHT));
  const [resizingWidth, setResizingWidth] = useState(false);
  const [resizingHeight, setResizingHeight] = useState(false);

  // Drag-to-resize for the sidebar's own width. Pointer-based (not a library)
  // to match the existing drag convention used elsewhere in the app
  // (AgentDock.tsx's position dragging) rather than introducing a new one.
  React.useEffect(() => {
    if (!resizingWidth) return;
    const onMove = (e: PointerEvent) => {
      const next = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, e.clientX));
      setSidebarWidth(next);
    };
    const onUp = () => {
      setResizingWidth(false);
      setSidebarWidth((w) => { saveStoredNumber(SIDEBAR_WIDTH_KEY, w); return w; });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [resizingWidth]);

  // Drag-to-resize for the Recent Chats list's height, independent of the
  // sidebar's own width drag above.
  const recentChatsStartRef = React.useRef<{ startY: number; startHeight: number } | null>(null);
  React.useEffect(() => {
    if (!resizingHeight) return;
    const onMove = (e: PointerEvent) => {
      const start = recentChatsStartRef.current;
      if (!start) return;
      const delta = e.clientY - start.startY;
      const next = Math.min(MAX_RECENT_CHATS_HEIGHT, Math.max(MIN_RECENT_CHATS_HEIGHT, start.startHeight + delta));
      setRecentChatsHeight(next);
    };
    const onUp = () => {
      setResizingHeight(false);
      recentChatsStartRef.current = null;
      setRecentChatsHeight((h) => { saveStoredNumber(RECENT_CHATS_HEIGHT_KEY, h); return h; });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [resizingHeight]);

  const currentSpace = SPACES.find((s) => s.id === activeSpace) ?? SPACES[0];
  const visibleItems = mode === 'simple'
    ? currentSpace.items.filter((item) => SIMPLE_MODE_ITEMS.has(item.id))
    : currentSpace.items;

  function handleDeleteClick(chatId: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (pendingDeleteId === chatId) {
      if (pendingDeleteTimerRef.current) clearTimeout(pendingDeleteTimerRef.current);
      setPendingDeleteId(null);
      onDeleteChat(chatId, e);
      return;
    }
    setPendingDeleteId(chatId);
    if (pendingDeleteTimerRef.current) clearTimeout(pendingDeleteTimerRef.current);
    pendingDeleteTimerRef.current = setTimeout(() => setPendingDeleteId(null), 3000);
  }

  return (
    <aside
      className={`relative ${isOpen ? '' : 'w-14'} flex flex-col ${resizingWidth ? '' : 'transition-all duration-300 ease-in-out'} bg-[var(--surface-1)] shrink-0 border-r border-[var(--border)]`}
      style={isOpen ? { width: sidebarWidth } : undefined}
    >
      {isOpen && (
        <div
          onPointerDown={(e) => { e.preventDefault(); setResizingWidth(true); }}
          className="absolute top-0 right-0 h-full w-1.5 -mr-0.5 cursor-col-resize z-10 hover:bg-[var(--accent-border)]"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          data-testid="sidebar-resize-handle"
        />
      )}
      {/* Logo */}
      <div className="h-14 flex items-center px-4 py-3 border-b border-[var(--border)] shrink-0">
        <div className="flex items-center gap-2.5 w-full">
          <button
            type="button"
            onClick={() => { setActiveSpace('home'); setActiveTab('mission'); }}
            className="flex items-center gap-2.5 min-w-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-border)]"
            aria-label="Go to Dashboard"
            title="Go to Dashboard"
          >
            <img src={alphonsoIcon} alt="Alphonso" className="w-7 h-7 rounded-lg shrink-0 shadow-glow-sm" />
            {isOpen && <span className="font-heading font-bold text-sm tracking-wide text-[var(--text-1)]">ALPHONSO</span>}
          </button>
          <button
            onClick={onToggle}
            className="ml-auto p-1.5 rounded-lg text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--surface-3)] transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-border)]"
            aria-label={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? '-rotate-90' : 'rotate-90'}`} />
          </button>
        </div>
      </div>

      {/* Search — real, global (Ctrl+P), lifted to App.tsx */}
      {isOpen && (
        <button
          onClick={onToggleSearch}
          data-testid="sidebar-search-trigger"
          className="flex items-center gap-2 mx-3 mt-3 px-3 py-2 rounded-lg bg-[var(--surface-2)] text-[var(--text-3)] text-xs hover:bg-[var(--surface-3)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-border)]"
          aria-label="Search"
        >
          <Search className="w-3.5 h-3.5" />
          <span>Search</span>
          <span className="ml-auto text-[10px] font-mono text-[var(--text-4)]">Ctrl+P</span>
          <span
            data-testid="sidebar-ollama-dot"
            title={ollamaConnected ? 'Local AI online' : 'Local AI offline'}
            className={`h-1.5 w-1.5 rounded-full shrink-0 ${ollamaConnected ? 'bg-[var(--success)]' : 'bg-[var(--text-4)]'}`}
          />
        </button>
      )}

      {/* Persistent Chat shortcut — always reachable in one click regardless
          of which Space is active, since Chat is the single most common
          action and previously required switching to the Home space first. */}
      {isOpen && (
        <button
          onClick={() => { setActiveSpace('home'); setActiveTab('chat'); }}
          data-testid="sidebar-chat-shortcut"
          className={`flex items-center gap-2 mx-3 mt-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-border)] ${
            activeTab === 'chat' ? 'bg-[var(--accent-muted)] text-[var(--text-1)]' : 'bg-[var(--surface-2)] text-[var(--text-2)] hover:bg-[var(--surface-3)]'
          }`}
          aria-current={activeTab === 'chat' ? 'page' : undefined}
        >
          <MessageSquare className={`w-4 h-4 shrink-0 ${activeTab === 'chat' ? 'text-[var(--accent)]' : ''}`} />
          <span>Chat</span>
        </button>
      )}
      {!isOpen && (
        <button
          onClick={() => { setActiveSpace('home'); setActiveTab('chat'); }}
          data-testid="sidebar-chat-shortcut"
          title="Chat"
          className={`flex items-center justify-center mx-auto mt-2 p-2 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-border)] ${
            activeTab === 'chat' ? 'bg-[var(--accent-muted)] text-[var(--accent)]' : 'text-[var(--text-3)] hover:bg-[var(--surface-3)] hover:text-[var(--text-1)]'
          }`}
          aria-label="Open Chat"
        >
          <MessageSquare className="w-4 h-4" />
        </button>
      )}

      {/* Space pills */}
      {isOpen && (
        <div className="grid grid-cols-5 gap-1 mx-3 mt-3">
          {SPACES.map((space) => (
            <button
              key={space.id}
              data-testid={`space-pill-${space.id}`}
              onClick={() => setActiveSpace(space.id)}
              title={space.label}
              className={`flex items-center justify-center py-1.5 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-border)] ${
                activeSpace === space.id ? 'bg-[var(--accent-muted)] text-[var(--accent)]' : 'text-[var(--text-3)] hover:bg-[var(--surface-3)] hover:text-[var(--text-1)]'
              }`}
              aria-label={space.label}
              aria-current={activeSpace === space.id ? 'true' : undefined}
            >
              <space.icon className="h-4 w-4" />
            </button>
          ))}
        </div>
      )}

      {/* Agent status strip — dots variant, unchanged */}
      <div className={`border-b border-[var(--border)] min-h-0 mt-3 ${isOpen ? 'px-3 py-2' : 'px-1.5 py-2 flex justify-center'}`}>
        <AgentStatusStrip compact={!isOpen} useAutoFeed />
      </div>

      {/* Navigation — current Space's items only */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className={`py-3 px-2 flex flex-col gap-0.5 overflow-y-auto min-h-0 ${isOpen ? 'max-h-[45%]' : 'flex-1'}`}>
          {isOpen && (
            <div className="px-3 pt-1 pb-1.5 section-label">{currentSpace.label}</div>
          )}
          {visibleItems.map((item) => (
            <motion.button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              whileHover={{ x: 2 }}
              whileTap={{ scale: 0.97 }}
              title={!isOpen ? item.label : undefined}
              className={`relative flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-border)] ${
                activeTab === item.id
                  ? 'bg-[var(--accent-muted)] text-[var(--text-1)] shadow-[inset_0_0_12px_var(--accent-glow)]'
                  : 'text-[var(--text-3)] hover:bg-[var(--surface-3)] hover:text-[var(--text-2)]'
              }`}
              aria-current={activeTab === item.id ? 'page' : undefined}
              aria-label={!isOpen ? item.label : undefined}
              data-testid={`sidebar-nav-${item.id}`}
            >
              <item.icon className={`w-4 h-4 shrink-0 ${activeTab === item.id ? 'text-[var(--accent)]' : ''}`} />
              {isOpen && <span className="font-medium">{item.label}</span>}
              {isOpen && item.showApprovalBadge && pendingApprovalCount > 0 && (
                <span className="ml-auto flex items-center justify-center w-4 h-4 rounded-full bg-[var(--warning)] text-[8px] font-bold text-[var(--surface-0)] animate-pulse">
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
            </motion.button>
          ))}
        </div>

        {/* Recent Chats — user-resizable height (drag the handle above the
            list), independent of the sidebar's own width drag. Persisted
            separately so a user who prefers to see more/fewer chats at a
            glance doesn't have to keep re-dragging it every session. */}
        {isOpen && (
          <div className="flex flex-col px-2 mt-2 shrink-0" style={{ height: recentChatsHeight }}>
            <div
              onPointerDown={(e) => {
                e.preventDefault();
                recentChatsStartRef.current = { startY: e.clientY, startHeight: recentChatsHeight };
                setResizingHeight(true);
              }}
              className="mx-auto mb-1 h-1 w-8 shrink-0 cursor-row-resize rounded-full bg-[var(--border)] hover:bg-[var(--accent-border)]"
              role="separator"
              aria-orientation="horizontal"
              aria-label="Resize recent chats"
              data-testid="recent-chats-resize-handle"
            />
            <div className="flex items-center justify-between px-3 mb-2">
              <span className="section-label">Recent Chats</span>
              <button onClick={onCreateChat} className="p-1 hover:bg-[var(--surface-3)] rounded-lg transition-colors text-[var(--text-3)] hover:text-[var(--text-1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-border)]" aria-label="Create new chat">
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
                    onClick={(e) => handleDeleteClick(chat.id, e)}
                    className={`p-0.5 rounded transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-border)] focus-visible:opacity-100 ${
                      pendingDeleteId === chat.id
                        ? 'opacity-100 bg-[var(--error-dim)] text-[var(--error)]'
                        : 'opacity-0 group-hover:opacity-100 hover:bg-[var(--error-dim)] hover:text-[var(--error)]'
                    }`}
                    aria-label={pendingDeleteId === chat.id ? `Confirm delete chat: ${chat.title}` : `Delete chat: ${chat.title}`}
                    title={pendingDeleteId === chat.id ? 'Click again to confirm delete' : 'Delete chat'}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer — unchanged */}
      <div className="p-2 border-t border-[var(--border)] space-y-0.5">
        {onOpenCoach && (
          <button
            onClick={onOpenCoach}
            className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-[var(--text-3)] hover:bg-[var(--surface-3)] hover:text-[var(--text-2)] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-border)] rounded-lg"
            aria-label="Open Coach mode"
          >
            <BrainCircuit className="w-4 h-4" />
            {isOpen && <span>Coach</span>}
          </button>
        )}
        <button
          onClick={() => setActiveTab('settings')}
          className={`flex items-center gap-2.5 w-full px-3 py-2 text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-border)] ${
            activeTab === 'settings' ? 'bg-[var(--accent-muted)] text-[var(--text-1)] shadow-[inset_0_0_12px_var(--accent-glow)] rounded-lg' : 'text-[var(--text-3)] hover:bg-[var(--surface-3)] rounded-lg'
          }`}
          aria-label="Open settings"
          data-testid="sidebar-settings-button"
        >
          <Settings className="w-4 h-4" />
          {isOpen && <span>Settings</span>}
        </button>
        <button
          onClick={toggleTheme}
          className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-[var(--text-3)] hover:bg-[var(--surface-3)] hover:text-[var(--text-2)] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-border)] rounded-lg"
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          {isOpen && <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>}
        </button>
      </div>
    </aside>
  );
}
