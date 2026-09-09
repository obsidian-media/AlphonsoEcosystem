# Sidebar Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, per this session's standing "no subagents" instruction). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the real, global `Sidebar.tsx` into Draft A's locked "Rooms" skeleton — a search field (wired to a real, globally-lifted memory search, not just Chat-scoped), 5 Space pills (Home/Work/Research/Boardroom/System) regrouping the real nav items per Draft A's decision — while preserving every existing real behavior unchanged: collapse/expand, chat list with delete-confirm, approval badge, connector status dot, coach/settings/theme footer buttons, simple-mode filtering, and the existing `AgentStatusStrip` (dots variant, untouched).

**Architecture:** Three independent, sequentially-dependent changes: (1) wire `SessionHistoryView.tsx` to a real tab for the first time (currently zero wiring anywhere — verified), (2) lift `toggle_search`/`MemorySearch` from `ChatView.tsx`-local state to `App.tsx`-global state (verified: today it only works while the Chat tab is mounted), (3) rebuild `Sidebar.tsx`'s structure using the now-real search trigger and the confirmed regrouping.

**Tech Stack:** React 18 + TypeScript, Framer Motion (already used in `Sidebar.tsx`).

**Scope note — real IA change, not just a reskin:** the 5-Space regrouping deliberately does not mirror today's 4 real groups 1:1 (per Draft A's already-locked decision): Research (Hector) and Boardroom move out of their current real groups into their own spaces. Research and Boardroom each end up with exactly 1 real item today — this is left honest, not padded with invented items, since `hectorResearchService`'s Reports/Bookmarks and Boardroom's sub-features don't have separate real `activeTab` branches to link to.

---

### Task 1: Wire `session_history` as a real tab (currently completely unwired)

**Files:**
- Modify: `src/App.tsx`
- Test: `src/test/appSessionHistoryNav.test.js` (new)

- [ ] **Step 1: Write the failing test**

```js
// src/test/appSessionHistoryNav.test.js
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('App.tsx — Session History nav wiring', () => {
  it('has a render branch for the session_history tab', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../App.tsx'), 'utf-8');
    expect(source).toMatch(/activeTab === 'session_history'/);
  });

  it('lazy-imports SessionHistoryView with the named-export mapping App.tsx requires', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../App.tsx'), 'utf-8');
    expect(source).toMatch(
      /lazy\(\(\) => import\('\.\/components\/SessionHistoryView'\)\.then\(\(mod\) => \(\{ default: mod\.SessionHistoryView \}\)\)\)/
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/appSessionHistoryNav.test.js --pool=threads`
Expected: FAIL — no such branch exists yet.

- [ ] **Step 3: Confirm `SessionHistoryView`'s real export name before wiring**

Run: `grep -n "^export" src/components/SessionHistoryView.tsx`
(Check the output names the export `SessionHistoryView` — if it's a default export instead, adjust the lazy-import mapping in Step 4/5 accordingly rather than assuming.)

- [ ] **Step 4: Add the lazy import**

In `src/App.tsx`, immediately after the `AgentPerformanceView` lazy import (added in Phase 1's Task 1), add:

```tsx
const SessionHistoryView = lazy(() => import('./components/SessionHistoryView').then((mod) => ({ default: mod.SessionHistoryView })));
```

- [ ] **Step 5: Add the render branch**

In `src/App.tsx`, immediately after the `agent_performance` branch (added in Phase 1's Task 1), add:

```tsx
                {activeTab === 'session_history' && (
                  <Suspense fallback={null}>
                    <SessionHistoryView />
                  </Suspense>
                )}
```

- [ ] **Step 6: Run test to verify it passes, plus the existing lazy-import regression test**

Run: `npx vitest run src/test/appSessionHistoryNav.test.js src/test/appLazyImports.test.js --pool=threads`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/test/appSessionHistoryNav.test.js
git commit -m "feat: wire session_history tab for real — SessionHistoryView had zero navigation path anywhere before this"
```

---

### Task 2: Lift `toggle_search`/`MemorySearch` from `ChatView.tsx` to `App.tsx`

**Files:**
- Modify: `src/App.tsx`, `src/components/ChatView.tsx`
- Test: `src/test/appGlobalSearch.test.js` (new)

Real code being moved (verified during planning): `ChatView.tsx:301` (`const [showMemorySearch, setShowMemorySearch] = useState(false);`), `ChatView.tsx:385` (`toggle_search: () => setShowMemorySearch((prev) => !prev),` inside its `useKeyboardShortcuts` call), `ChatView.tsx:1603-1610` (the `{showMemorySearch && <MemorySearch .../>}` render block). `new_chat`/`focus_input`/`abort_generation`/`show_shortcuts` all stay in `ChatView.tsx` exactly as they are — only `toggle_search` moves.

- [ ] **Step 1: Write the failing test**

```js
// src/test/appGlobalSearch.test.js
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('App.tsx — global memory search (lifted from ChatView)', () => {
  it('App.tsx owns a showMemorySearch state and renders MemorySearch globally', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../App.tsx'), 'utf-8');
    expect(source).toMatch(/showMemorySearch/);
    expect(source).toMatch(/<MemorySearch/);
  });

  it('App.tsx calls useKeyboardShortcuts with a toggle_search handler', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../App.tsx'), 'utf-8');
    expect(source).toMatch(/toggle_search:/);
  });

  it('ChatView.tsx no longer owns showMemorySearch or a toggle_search binding', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../components/ChatView.tsx'), 'utf-8');
    expect(source).not.toMatch(/showMemorySearch/);
    expect(source).not.toMatch(/toggle_search:/);
  });

  it('ChatView.tsx still keeps its other 4 shortcut bindings unchanged', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../components/ChatView.tsx'), 'utf-8');
    expect(source).toMatch(/new_chat:/);
    expect(source).toMatch(/focus_input:/);
    expect(source).toMatch(/abort_generation:/);
    expect(source).toMatch(/show_shortcuts:/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/appGlobalSearch.test.js --pool=threads`
Expected: FAIL — App.tsx has none of this yet.

- [ ] **Step 3: Remove the lifted pieces from `ChatView.tsx`**

Remove line 301 (`const [showMemorySearch, setShowMemorySearch] = useState(false);`).
Remove the `toggle_search: () => setShowMemorySearch((prev) => !prev),` line from the `useKeyboardShortcuts({...})` call (keep `new_chat`, `focus_input`, `abort_generation`, `show_shortcuts` exactly as they are).
Remove the `{showMemorySearch && (<MemorySearch onClose={...} onSelect={...} />)}` block (lines ~1603-1610).
Remove the now-unused `import { MemorySearch } from './MemorySearch';` line **only if** nothing else in the file still references `MemorySearch` — check with `grep -n MemorySearch src/components/ChatView.tsx` after the above removals before deleting the import, since an unused import would be a real (if harmless) leftover, not assumed safe to remove blind.

- [ ] **Step 4: Add the lifted pieces to `App.tsx`**

Add the import (alongside `KeyboardShortcutsModal`'s existing import):

```tsx
import { MemorySearch } from './components/MemorySearch';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
```

Add state (alongside `showKeyboardShortcuts`'s existing declaration):

```tsx
const [showMemorySearch, setShowMemorySearch] = useState(false);
```

Add the hook call (App.tsx has never called this hook before — this is a new, additive call, not modifying an existing one):

```tsx
useKeyboardShortcuts({
  toggle_search: () => setShowMemorySearch((prev) => !prev),
});
```

Add the render, alongside the existing `<KeyboardShortcutsModal .../>` render:

```tsx
{showMemorySearch && (
  <MemorySearch
    onClose={() => setShowMemorySearch(false)}
    onSelect={() => setShowMemorySearch(false)}
  />
)}
```

(Check `MemorySearch.tsx`'s real `onSelect` prop signature before wiring — Step 5 below verifies this compiles correctly; adjust the callback signature to match if `tsc` reports a mismatch rather than assuming this exact shape is correct.)

- [ ] **Step 5: Run the test to verify it passes, then the full typecheck**

Run: `npx vitest run src/test/appGlobalSearch.test.js --pool=threads`
Expected: PASS

Run: `npx tsc --noEmit`
Expected: clean, zero output — this step is required, not optional, given this session's repeated experience of real prop-shape mismatches only surfacing here.

- [ ] **Step 6: Run ChatView's existing test suite to confirm the removal didn't break anything real**

Run: `find src/test -iname "*ChatView*"` first to get the exact real test file name(s), then run whatever that returns with `--pool=threads`.
Expected: PASS (confirms `new_chat`/`focus_input`/`abort_generation`/`show_shortcuts` still work, and no test was asserting on the now-removed `showMemorySearch` local state)

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/components/ChatView.tsx src/test/appGlobalSearch.test.js
git commit -m "fix: lift memory search from ChatView-local state to App.tsx-global — Ctrl+P now works from any page, not just Chat"
```

---

### Task 3: Rebuild `Sidebar.tsx` with 5 Space pills, preserving all existing real behavior

**Files:**
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/App.tsx` (pass the new `onToggleSearch` prop to `<Sidebar>`)
- Test: `src/test/sidebarDeleteChat.test.jsx` (existing — must still pass unmodified), new assertions added to a new `src/test/sidebarSpaces.test.jsx`

- [ ] **Step 1: Write the failing tests**

```jsx
// src/test/sidebarSpaces.test.jsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Sidebar } from '../components/Sidebar';

vi.mock('../components/ConnectorStatusIndicators', () => ({
  ConnectorStatusStrip: () => null,
  ConnectorStatusDot: () => null,
}));
vi.mock('../components/AgentStatusStrip', () => ({
  AgentStatusStrip: () => null,
}));
vi.mock('../hooks/useTheme', () => ({
  useTheme: () => ({ theme: 'dark', toggleTheme: vi.fn() }),
}));

const baseProps = {
  activeTab: 'mission',
  setActiveTab: vi.fn(),
  isOpen: true,
  onToggle: vi.fn(),
  conversations: [],
  activeChatId: null,
  setActiveChatId: vi.fn(),
  onCreateChat: vi.fn(),
  onDeleteChat: vi.fn(),
  settings: {},
  onToggleSearch: vi.fn(),
};

describe('Sidebar — 5 Space pills', () => {
  it('renders all 5 Space pills', () => {
    render(<Sidebar {...baseProps} />);
    expect(screen.getByTestId('space-pill-home')).toBeTruthy();
    expect(screen.getByTestId('space-pill-work')).toBeTruthy();
    expect(screen.getByTestId('space-pill-research')).toBeTruthy();
    expect(screen.getByTestId('space-pill-boardroom')).toBeTruthy();
    expect(screen.getByTestId('space-pill-system')).toBeTruthy();
  });

  it('defaults to the Home space, showing Dashboard/Chat/Session History', () => {
    render(<Sidebar {...baseProps} />);
    expect(screen.getByTestId('sidebar-nav-mission')).toBeTruthy();
    expect(screen.getByTestId('sidebar-nav-chat')).toBeTruthy();
    expect(screen.getByTestId('sidebar-nav-session_history')).toBeTruthy();
  });

  it('clicking the Work space pill shows Projects/Content/Automation/Creative, hides Home items', () => {
    render(<Sidebar {...baseProps} />);
    fireEvent.click(screen.getByTestId('space-pill-work'));
    expect(screen.getByTestId('sidebar-nav-project_execution')).toBeTruthy();
    expect(screen.getByTestId('sidebar-nav-content')).toBeTruthy();
    expect(screen.getByTestId('sidebar-nav-automation')).toBeTruthy();
    expect(screen.getByTestId('sidebar-nav-miya')).toBeTruthy();
    expect(screen.queryByTestId('sidebar-nav-mission')).toBeNull();
  });

  it('clicking the Research space pill shows only Research Desk (Hector)', () => {
    render(<Sidebar {...baseProps} />);
    fireEvent.click(screen.getByTestId('space-pill-research'));
    expect(screen.getByTestId('sidebar-nav-hector')).toBeTruthy();
  });

  it('clicking the Boardroom space pill shows only Boardroom', () => {
    render(<Sidebar {...baseProps} />);
    fireEvent.click(screen.getByTestId('space-pill-boardroom'));
    expect(screen.getByTestId('sidebar-nav-mission_room')).toBeTruthy();
  });

  it('clicking the System space pill shows Orchestrator/All Agents/Agent Performance/Runtimes/Voice/Connectors/Operator', () => {
    render(<Sidebar {...baseProps} />);
    fireEvent.click(screen.getByTestId('space-pill-system'));
    expect(screen.getByTestId('sidebar-nav-orchestrator')).toBeTruthy();
    expect(screen.getByTestId('sidebar-nav-ecosystem')).toBeTruthy();
    expect(screen.getByTestId('sidebar-nav-agent_performance')).toBeTruthy();
    expect(screen.getByTestId('sidebar-nav-runtimes')).toBeTruthy();
    expect(screen.getByTestId('sidebar-nav-voice')).toBeTruthy();
    expect(screen.getByTestId('sidebar-nav-connectors')).toBeTruthy();
    expect(screen.getByTestId('sidebar-nav-operator')).toBeTruthy();
  });

  it('clicking a nav item still calls setActiveTab with its real id, regardless of which space it moved to', () => {
    render(<Sidebar {...baseProps} />);
    fireEvent.click(screen.getByTestId('space-pill-work'));
    fireEvent.click(screen.getByTestId('sidebar-nav-miya'));
    expect(baseProps.setActiveTab).toHaveBeenCalledWith('miya');
  });

  it('the search field calls onToggleSearch when clicked', () => {
    render(<Sidebar {...baseProps} />);
    fireEvent.click(screen.getByTestId('sidebar-search-trigger'));
    expect(baseProps.onToggleSearch).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/test/sidebarSpaces.test.jsx --pool=threads`
Expected: FAIL — no Space pills exist yet.

- [ ] **Step 3: Run the existing delete-chat test to record its current-passing baseline before touching the file**

Run: `npx vitest run src/test/sidebarDeleteChat.test.jsx --pool=threads`
Expected: PASS (confirms the starting point before this task's edit, so any later failure is attributable to this change, not pre-existing)

- [ ] **Step 4: Rebuild `Sidebar.tsx`**

Replace `src/components/Sidebar.tsx` entirely with:

```tsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Bot,
  BrainCircuit,
  ChevronDown,
  Cpu,
  Database,
  FileText,
  Gauge,
  GitBranch,
  History,
  LayoutDashboard,
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
  Activity,
  MessageSquare
} from 'lucide-react';
import alphonsoIcon from '../assets/alphonso-icon.svg';
import { ConnectorStatusStrip, ConnectorStatusDot } from './ConnectorStatusIndicators';
import { AgentStatusStrip } from './AgentStatusStrip';
import { useTheme } from '../hooks/useTheme';

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
  emoji: string;
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
}

// Regrouping per Draft A's locked "Rooms" design (draft-a-power-user-direction.md,
// Revision 2) — deliberately NOT a 1:1 mirror of the old 4 groups. Research and
// Boardroom are pulled out of their old real groups into their own Spaces, each
// with exactly one real item today — left honest, not padded with invented items.
const SPACES: Space[] = [
  {
    id: 'home',
    emoji: '🏠',
    label: 'Home',
    items: [
      { id: 'mission', icon: LayoutDashboard, label: 'Dashboard' },
      { id: 'chat', icon: MessageSquare, label: 'Chat' },
      { id: 'session_history', icon: History, label: 'Session History' },
    ]
  },
  {
    id: 'work',
    emoji: '🧰',
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
    emoji: '📚',
    label: 'Research',
    items: [
      { id: 'hector', icon: Database, label: 'Research Desk' },
    ]
  },
  {
    id: 'boardroom',
    emoji: '🗣',
    label: 'Boardroom',
    items: [
      { id: 'mission_room', icon: Sparkles, label: 'Boardroom' },
    ]
  },
  {
    id: 'system',
    emoji: '⚙',
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

export function Sidebar({ activeTab, setActiveTab, isOpen, onToggle, conversations, activeChatId, setActiveChatId, onCreateChat, onDeleteChat, settings, pendingApprovalCount = 0, onOpenCoach, mode = 'advanced', onToggleSearch }: SidebarProps) {
  const zeroCostMode = Boolean(settings?.zeroCostMode);
  const { theme, toggleTheme } = useTheme();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const pendingDeleteTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeSpace, setActiveSpace] = useState<SpaceId>('home');

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
    <aside className={`${isOpen ? 'w-52' : 'w-14'} flex flex-col transition-all duration-300 ease-in-out bg-[var(--surface-1)] shrink-0 border-r border-[var(--border)]`}>
      {/* Logo */}
      <div className="h-14 flex items-center px-4 py-3 border-b border-[var(--border)] shrink-0">
        <div className="flex items-center gap-2.5 w-full">
          <img src={alphonsoIcon} alt="Alphonso" className="w-7 h-7 rounded-lg shrink-0 shadow-glow-sm" />
          {isOpen && <span className="font-heading font-bold text-sm tracking-wide text-white">ALPHONSO</span>}
          <button
            onClick={onToggle}
            className="ml-auto p-1.5 rounded-lg text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--surface-3)] transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50"
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
          className="flex items-center gap-2 mx-3 mt-3 px-3 py-2 rounded-lg bg-[var(--surface-2)] text-[var(--text-3)] text-xs hover:bg-[var(--surface-3)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50"
          aria-label="Search"
        >
          <Search className="w-3.5 h-3.5" />
          <span>Search</span>
          <span className="ml-auto text-[10px] font-mono text-[var(--text-4)]">Ctrl+P</span>
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
              className={`text-center py-1.5 rounded-lg text-base transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50 ${
                activeSpace === space.id ? 'bg-[var(--accent-muted)]' : 'hover:bg-[var(--surface-3)]'
              }`}
              aria-label={space.label}
              aria-current={activeSpace === space.id ? 'true' : undefined}
            >
              {space.emoji}
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
              className={`relative flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50 ${
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

        {/* Chat list — unchanged, only shown in the Home space (chat itself lives there) */}
        {isOpen && activeSpace === 'home' && (
          <div className="flex flex-col flex-1 px-2 mt-2 overflow-hidden">
            <div className="flex items-center justify-between px-3 mb-2">
              <span className="section-label">Recent Chats</span>
              <button onClick={onCreateChat} className="p-1 hover:bg-[var(--surface-3)] rounded-lg transition-colors text-[var(--text-3)] hover:text-[var(--text-1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50" aria-label="Create new chat">
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
                    className={`p-0.5 rounded transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50 focus-visible:opacity-100 ${
                      pendingDeleteId === chat.id
                        ? 'opacity-100 bg-danger/20 text-danger'
                        : 'opacity-0 group-hover:opacity-100 hover:bg-danger/20 hover:text-danger'
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
            className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-[var(--text-3)] hover:bg-[var(--surface-3)] hover:text-[var(--text-2)] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50 rounded-lg"
            aria-label="Open Coach mode"
          >
            <BrainCircuit className="w-4 h-4" />
            {isOpen && <span>Coach</span>}
          </button>
        )}
        <button
          onClick={() => setActiveTab('settings')}
          className={`flex items-center gap-2.5 w-full px-3 py-2 text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50 ${
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
          className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-[var(--text-3)] hover:bg-[var(--surface-3)] hover:text-[var(--text-2)] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50 rounded-lg"
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          {isOpen && <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>}
        </button>
      </div>
    </aside>
  );
}
```

- [ ] **Step 5: Update `App.tsx`'s `<Sidebar>` call site to pass the new prop**

Add `onToggleSearch={() => setShowMemorySearch((prev) => !prev)}` to the existing `<Sidebar ...>` props at `App.tsx:828`.

- [ ] **Step 6: Run all 3 Sidebar-related test files**

Run: `npx vitest run src/test/sidebarSpaces.test.jsx src/test/sidebarDeleteChat.test.jsx --pool=threads`
Expected: PASS, all tests in both files (confirms the rebuild didn't regress the pre-existing delete-confirm behavior)

- [ ] **Step 7: Run the full typecheck**

Run: `npx tsc --noEmit`
Expected: clean, zero output

- [ ] **Step 8: Commit**

```bash
git add src/components/Sidebar.tsx src/App.tsx src/test/sidebarSpaces.test.jsx
git commit -m "feat: rebuild Sidebar with Draft A's 5-Space skeleton, preserving all existing real behavior (chat list, badges, connector dot, footer, simple mode)"
```

---

## Self-Review

**Spec coverage:** Covers Draft A's locked sidebar skeleton (search + 5 Space pills + regrouped items) applied to the real, current `Sidebar.tsx`, with the two real prerequisite gaps (session_history's missing wiring, search's Chat-only scoping) fixed first rather than built around. Simple-mode filtering, chat delete-confirm, approval badge, connector dot, coach/settings/theme footer, and the existing dots-variant `AgentStatusStrip` are all explicitly preserved, not silently dropped.

**Placeholder scan:** No TBD/TODO. Every real prop, test id, and existing behavior referenced was verified against the real current file during planning. Step 3 of Task 1 and Step 6 of Task 2 are deliberately "confirm before assuming" checks (real export shape, real test file name) rather than guessed values — consistent with this session's established discipline after the tsc-catches-real-bugs pattern seen twice already in Phase 1.

**Type consistency:** `SpaceId` and the `SPACES` array's `id` values match exactly; `onToggleSearch: () => void` is defined once in `SidebarProps` and wired identically at the one real call site in `App.tsx`.
