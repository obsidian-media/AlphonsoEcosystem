# Alphonso UX Specification

**Version:** 1.0  
**Date:** 2026-09-01  
**Author:** Miya (Creative Agent)  
**Branch:** `launch/day1-critical-fixes`  
**Status:** Implementation-ready

---

## Table of Contents

1. [Design Principles](#1-design-principles)
2. [Simple/Advanced Mode Split](#2-simpleadvanced-mode-split)
3. [First-Launch Guided Tour](#3-first-launch-guided-tour)
4. [Unified Digest View](#4-unified-digest-view)
5. [Implementation Guidance](#5-implementation-guidance)

---

## 1. Design Principles

### Core Tenets

| Tenet | Description |
|-------|-------------|
| **Progressive Disclosure** | Show only what's needed for the user's current context. Power features are one click away, not in the way. |
| **Calm Density** | Information-rich without feeling crowded. Every pixel earns its place. |
| **Mode-Aware** | The interface adapts to user expertise. Simple mode is not a "lite" version — it's a focused one. |
| **Zero Dead Ends** | Every state has a next action. Empty states teach, errors guide, loading states inform. |

### Personas

- **New Explorer (Simple mode):** First-time user. Wants to chat, see what's possible, get value in < 60 seconds. Overwhelmed by 20+ sidebar items.
- **Mission Operator (Advanced mode):** Daily power user. Needs orchestrator, runtimes, connectors, agent performance — all visible, all reachable in one click.

---

## 2. Simple/Advanced Mode Split

### 2.1 Mode Toggle

**Location:** TopBar, right side — left of the notification bell.  
**Visual:** A segmented control with two options: `Simple` | `Advanced`.  
**Persistence:** Saved to `localStorage` as `alphonso_ux_mode` (`'simple' | 'advanced'`).  
**Default:** `simple` for new users; `advanced` if the user has ever toggled it on.

```
[Simple | Advanced]  🔔
```

### 2.2 Sidebar Item Allocation

#### Simple Mode (7 items)

The Simple sidebar shows only the items a new user needs to get started and stay productive. No sections — just a clean, flat list.

| ID | Icon | Label | Rationale |
|----|------|-------|-----------|
| `chat` | MessageSquare | Chat | Primary interaction point — always first |
| `mission` | LayoutDashboard | Dashboard | Home base, shows what's happening |
| `project_execution` | Terminal | Projects | Core work mode |
| `hector` | Database | Research | High-value discovery tool |
| `miya` | Palette | Creative | Content creation |
| `content` | FileText | Content | Publishing pipeline |
| `settings` | Settings | Settings | Always accessible, always last |

**Footer (always visible in both modes):**
- Theme toggle (Sun/Moon)
- Mode toggle (only in Simple — Advanced users already have the TopBar toggle)

#### Advanced Mode (full item set)

The Advanced sidebar restores the full sectioned navigation from the current `NAV_SECTIONS`, plus the Coach button.

| Section | Items |
|---------|-------|
| *(none)* | Chat, Dashboard |
| **Work** | Projects, Research, Content, Automation |
| **Agents** | Orchestrator, Creative, Boardroom, All Agents, Agent Performance |
| **System** | Runtimes, Voice, Connectors |
| **Footer** | Coach, Settings, Theme |

### 2.3 What Changes Between Modes

| Surface | Simple | Advanced |
|---------|--------|----------|
| **Sidebar items** | 7 flat items | Full sectioned list |
| **TopBar page title** | Same | Same |
| **CommandRib** | Hidden | Visible (if enabled) |
| **AgentStatusStrip** | Compact (dots only) | Full (dots + labels) |
| **RightPanel** | Hidden by default | Visible with tabs |
| **MissionControlHome** | Simplified hero + 3 actions | Full dashboard with all cards |
| **NotificationCenter** | Same | Same |
| **Coach** | Accessible via footer | Accessible via footer |

### 2.4 Mode Switch Behavior

- Switching modes **does not** navigate away from the current tab.
- If the active tab doesn't exist in Simple mode (e.g., `orchestrator`), switching to Simple navigates to `chat`.
- If the active tab doesn't exist in Advanced mode (shouldn't happen), switching to Advanced navigates to `mission`.
- The switch animates with a 200ms ease-out transition on the sidebar width and item list.

---

## 3. First-Launch Guided Tour

### 3.1 Trigger Conditions

The guided tour launches when **all** of the following are true:
- `localStorage.getItem('alphonso_guided_tour_complete_v1')` is not `'true'`
- The onboarding wizard (`OnboardingWizard`) has been completed
- The user has landed on the Dashboard (`mission` tab)

### 3.2 Tour Architecture

The tour is a **spotlight tour** — a semi-transparent overlay dims everything except the highlighted element, with a tooltip callout describing it. This is NOT a modal wizard — it's contextual and non-blocking.

**Component:** `GuidedTour` (new, `src/components/GuidedTour.tsx`)  
**State machine:** Sequential steps with `currentStep` index.  
**Dismissible:** User can close at any time via an `×` button or `Escape` key.  
**Resumable:** Progress is saved to `localStorage` as `alphonso_tour_progress` (step index). If dismissed, a "Resume tour" link appears in the Dashboard for 7 days.

### 3.3 Tour Steps (Simple Mode)

| Step | Target | Position | Title | Body |
|------|--------|----------|-------|------|
| 1 | Dashboard hero | below | **Welcome to Alphonso** | This is your mission control. Your agents, approvals, and next actions live here. |
| 2 | "What to do next" first card | right | **Your next move** | Alphonso suggests what to do next — approvals, tasks, or starting a conversation. Click any card to jump in. |
| 3 | Sidebar — Chat item | right | **Chat with Alphonso** | Your primary interface. Ask anything, run commands, or delegate to agents. Press `Cmd/Ctrl+K` to open chat from anywhere. |
| 4 | Sidebar — Projects item | right | **Structured work** | Projects break work into packets with proof-first planning. Great for complex tasks. |
| 5 | Sidebar — Research item | right | **Research desk** | Hector gathers and synthesizes information. Ask it to research any topic. |
| 6 | Sidebar — Creative item | right | **Create content** | Miya handles images, video, and creative assets. Powered by local or cloud models. |
| 7 | TopBar — notification bell | below | **Stay informed** | Notifications appear here — agent completions, approvals needed, system events. |
| 8 | TopBar — mode toggle | below | **Grow into Advanced** | When you're ready, switch to Advanced mode for the full agent orchestrator, runtimes, and connectors. |

### 3.4 Tour Steps (Advanced Mode)

If the user is in Advanced mode when the tour triggers, the tour includes additional steps after step 6:

| Step | Target | Position | Title | Body |
|------|--------|----------|-------|------|
| 6a | Sidebar — Orchestrator | right | **Orchestrator** | Jose's command center. Dispatch multi-agent workflows and manage approvals. |
| 6b | Sidebar — Boardroom | right | **Boardroom** | Multi-agent discussions. @mention agents to weigh in on decisions. |
| 6c | Sidebar — Connectors | right | **Connectors** | Telegram, WhatsApp, Composio, and more. Extend Alphonso's reach. |
| 6d | Sidebar — Runtimes | right | **Runtimes** | Manage local AI models, image generators, and voice services. |
| 6e | Footer — Coach | above | **Coach** | Your AI safety net. Intervenes when something looks off. |

### 3.5 Tour Interaction Model

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│   ┌─────────────────┐                               │
│   │  Highlighted    │  ← Spotlight cutout           │
│   │  Element        │                               │
│   └─────────────────┘                               │
│                                                     │
│         ┌──────────────────────────┐                │
│         │  Title                   │  ← Tooltip     │
│         │  Body text               │     card       │
│         │                          │                │
│         │  [← Back]  [Next →]  [×] │                │
│         │  ● ○ ○ ○ ○ ○ ○ ○         │  ← Step dots  │
│         └──────────────────────────┘                │
│                                                     │
└─────────────────────────────────────────────────────┘
```

- **Navigation:** `Back` / `Next` buttons, clickable step dots, `←` / `→` arrow keys.
- **Close:** `×` button, `Escape` key, clicking outside the tooltip.
- **Animation:** Spotlight transitions with 300ms ease-in-out. Tooltip fades in 150ms.
- **Z-index:** 1000 (above everything except modals).

### 3.6 Tour Completion

On the final step, the button label changes to **"Get started"**. On click:
1. Set `localonso_guided_tour_complete_v1 = 'true'` in localStorage.
2. Clear `alphonso_tour_progress`.
3. Fade out the overlay (200ms).
4. Show a brief toast: "You're all set. Press `?` anytime for keyboard shortcuts."

### 3.7 Edge Cases

| Scenario | Behavior |
|----------|----------|
| User resizes window mid-tour | Recalculate spotlight position on resize |
| Target element not in DOM (e.g., Simple mode item) | Skip to next valid step |
| User navigates to another tab mid-tour | Pause tour, show "Resume tour" link on Dashboard |
| User has already seen onboarding | Tour starts at Dashboard, not at model selection |
| User is in Advanced mode but has < 3 sessions | Still show full Advanced tour |

---

## 4. Unified Digest View

### 4.1 Concept

The **Digest View** is a single, scannable surface that aggregates the most important signals from across the ecosystem:
- Pending approvals
- Recent agent activity
- System health
- Unread notifications
- Upcoming scheduled tasks

It replaces the current fragmented experience where this information is scattered across MissionControlHome, RightPanel, NotificationCenter, and the Orchestrator.

### 4.2 Entry Point

**Location:** TopBar — a new digest icon (bell with a dot, or a dedicated "inbox" icon) between the notification bell and the model status.  
**Badge:** Shows the count of unread digest items (max 9+).  
**Keyboard shortcut:** `Cmd/Ctrl+Shift+D`

### 4.3 Digest Layout

The Digest is a **slide-out panel** (not a modal) that enters from the right edge, 400px wide, full height. It does not overlay the sidebar.

```
┌────────────────────────────────────────────────────────────┐
│  TopBar                                                    │
├──────────┬─────────────────────────────────────┬───────────┤
│          │                                     │           │
│ Sidebar  │        Main Content                 │  Digest   │
│          │        (unchanged)                  │  Panel    │
│          │                                     │  400px    │
│          │                                     │           │
│          │                                     │           │
└──────────┴─────────────────────────────────────┴───────────┘
```

### 4.4 Digest Sections (Top to Bottom)

#### 4.4.1 Header

```
┌──────────────────────────────────┐
│  Digest                    [×]   │
│  12 items · Updated 2m ago       │
│  [Mark all read]        [Filter ▾]│
└──────────────────────────────────┘
```

- Title: "Digest"
- Subtitle: Item count + last updated timestamp
- Actions: "Mark all read" link, Filter dropdown (All / Approvals / Activity / System)

#### 4.4.2 Priority Section (collapsible)

**Only shown when there are urgent items.**  
**Items:** Approvals needed, coach interventions, system errors.

```
┌──────────────────────────────────┐
│  ⚠ Needs your attention     [▾]  │
│  ┌────────────────────────────┐  │
│  │ 🔴 Approval: Jose wants to │  │
│     publish to LinkedIn       │  │
│    [Review]                   │  │
│  └────────────────────────────┘  │
│  ┌────────────────────────────┐  │
│  │ 🟡 Coach: Unusual command  │  │
│    pattern detected           │  │
│    [View]                     │  │
│  └────────────────────────────┘  │
└──────────────────────────────────┘
```

#### 4.4.3 Activity Feed (scrollable)

**The main section.** Chronological feed of agent activity, notifications, and system events. Grouped by time: "Today", "Yesterday", "Earlier".

```
┌──────────────────────────────────┐
│  Today                           │
│  ┌────────────────────────────┐  │
│  │ 🟢 Jose completed          │  │
│  │    "Research competitors"  │  │
│  │    3m ago · [View result]  │  │
│  └────────────────────────────┘  │
│  ┌────────────────────────────┐  │
│  │ 🔵 Miya generated 4 images │  │
│  │    for "Product launch"    │  │
│  │    12m ago · [Open]        │  │
│  └────────────────────────────┘  │
│  ┌────────────────────────────┐  │
│  │ ⚪ System: Ollama updated  │  │
│  │    to 0.3.12               │  │
│  │    1h ago                  │  │
│  └────────────────────────────┘  │
│                                  │
│  Yesterday                       │
│  ┌────────────────────────────┐  │
│  │ 🟡 Approval needed:        │  │
│  │    Send WhatsApp message   │  │
│  │    [Review]                │  │
│  └────────────────────────────┘  │
└──────────────────────────────────┘
```

**Item types and their visual treatment:**

| Type | Icon | Color | Action |
|------|------|-------|--------|
| Agent completion | 🟢 CheckCircle | success | "View result" |
| Agent failure | 🔴 AlertCircle | error | "Retry" / "Debug" |
| Approval needed | 🟡 Shield | warning | "Review" |
| Coach intervention | 🛡️ ShieldAlert | error | "View" |
| System event | ⚪ Info | text-3 | none |
| Connector status | 🔵 Plug | accent | "Configure" |
| Scheduled task | 🕐 Clock | text-2 | "View schedule" |

#### 4.4.4 System Health Strip (footer)

```
┌──────────────────────────────────┐
│  Local AI  🟢  Coach  🟢         │
│  Memory   🟢  Connectors  🟡 2   │
└──────────────────────────────────┘
```

- Compact status chips for the 4 key systems.
- Tapping a chip navigates to the relevant tab.

### 4.5 Digest Item Data Model

```typescript
interface DigestItem {
  id: string;
  type: 'approval' | 'activity' | 'system' | 'coach' | 'connector' | 'schedule';
  priority: 'urgent' | 'normal' | 'low';
  title: string;
  detail?: string;
  timestamp: number;
  read: boolean;
  agentId?: string;
  actionLabel?: string;
  action?: () => void;
  navigateTo?: string;
}
```

### 4.6 Digest Behavior

| Behavior | Detail |
|----------|--------|
| **Auto-refresh** | Poll every 30s for new items |
| **Push integration** | New notifications from App.tsx's polling effects also push into the digest |
| **Deduplication** | Same event within 5s window is deduplicated |
| **Max items** | 50 items retained; older items drop off |
| **Persistence** | Read state persisted to `localStorage` as `alphonso_digest_read_v1` |
| **Empty state** | "All caught up ✓" with a subtle illustration |
| **Animation** | New items slide in from top with 200ms ease-out |

### 4.7 Digest vs. NotificationCenter

| Aspect | NotificationCenter | Digest |
|--------|-------------------|--------|
| **Trigger** | Push (real-time) | Pull (on-demand) |
| **Lifetime** | Ephemeral (dismissed = gone) | Persistent (scrollable history) |
| **Scope** | Single events | Aggregated feed |
| **Position** | Fixed top-right toast | Slide-out right panel |
| **Interaction** | Dismiss only | Navigate, act, filter |

Both coexist. The NotificationCenter handles immediate toasts; the Digest is the comprehensive history.

---

## 5. Implementation Guidance

### 5.1 New Components to Create

| Component | File | Purpose |
|-----------|------|---------|
| `ModeToggle` | `src/components/ModeToggle.tsx` | Segmented Simple/Advanced control |
| `GuidedTour` | `src/components/GuidedTour.tsx` | Spotlight tour overlay |
| `DigestPanel` | `src/components/DigestPanel.tsx` | Slide-out digest view |
| `useUxMode` | `src/hooks/useUxMode.ts` | Mode state hook with persistence |

### 5.2 Components to Modify

| Component | Change |
|-----------|--------|
| `Sidebar.tsx` | Accept `mode` prop; conditionally render items based on mode |
| `TopBar.tsx` | Add ModeToggle, Digest icon button |
| `App.tsx` | Add `useUxMode` hook, pass mode to Sidebar, conditionally render CommandRib/RightPanel |
| `MissionControlHome.tsx` | Accept `mode` prop; simplify layout in Simple mode |
| `NotificationCenter.tsx` | Add `digestItems` prop for unified feed |

### 5.3 State Management

```typescript
// src/hooks/useUxMode.ts
export type UxMode = 'simple' | 'advanced';

export function useUxMode(): [UxMode, (mode: UxMode) => void] {
  const [mode, setMode] = useState<UxMode>(() => {
    return (localStorage.getItem('alphonso_ux_mode') as UxMode) || 'simple';
  });

  const updateMode = (newMode: UxMode) => {
    localStorage.setItem('alphonso_ux_mode', newMode);
    setMode(newMode);
  };

  return [mode, updateMode];
}
```

### 5.4 CSS Tokens to Use

All new components must use the existing CSS token system. Key tokens:

| Token | Usage |
|-------|-------|
| `var(--surface-0)` | Panel backgrounds |
| `var(--surface-1)` | Card backgrounds |
| `var(--surface-2)` | Hover states |
| `var(--accent)` | Active/selected states |
| `var(--accent-muted)` | Subtle accent backgrounds |
| `var(--text-1)` | Primary text |
| `var(--text-2)` | Secondary text |
| `var(--text-3)` | Muted text |
| `var(--border)` | Borders |
| `var(--success)` | Success states |
| `var(--warning)` | Warning states |
| `var(--error)` | Error states |

### 5.5 Accessibility Requirements

- All interactive elements must have `aria-label` or visible text.
- Tour must trap focus within the tooltip while active.
- Digest panel must be navigable via keyboard (arrow keys, Tab, Escape).
- Mode toggle must announce the new mode via `aria-live="polite"`.
- Color is never the sole indicator of state — always pair with icon or text.

### 5.6 Animation Specifications

| Animation | Duration | Easing |
|-----------|----------|--------|
| Sidebar item add/remove | 200ms | ease-out |
| Mode switch | 200ms | ease-out |
| Tour spotlight transition | 300ms | ease-in-out |
| Tour tooltip fade-in | 150ms | ease-out |
| Digest panel slide-in | 250ms | ease-out |
| Digest item appear | 200ms | ease-out |
| Notification toast | 300ms | ease-out |

### 5.7 Testing Checklist

- [ ] Mode toggle switches between Simple and Advanced without page reload
- [ ] Mode preference persists across sessions
- [ ] Tour triggers only after onboarding completion
- [ ] Tour can be dismissed and resumed
- [ ] Tour spotlight correctly positions on all target elements
- [ ] Digest panel opens/closes smoothly
- [ ] Digest items are grouped by date
- [ ] Digest "Mark all read" works
- [ ] Digest filter dropdown works
- [ ] Keyboard shortcuts work (`Escape` to close, `←`/`→` for tour)
- [ ] Simple mode hides Advanced-only sidebar items
- [ ] Switching to Simple while on an Advanced tab navigates to Chat
- [ ] Empty digest shows "All caught up" state
- [ ] All new components use CSS tokens (no hardcoded colors)
- [ ] All interactive elements have accessible labels

---

## Appendix A: Current Sidebar Item Reference

The current `NAV_SECTIONS` in `Sidebar.tsx` contains:

```typescript
const NAV_SECTIONS: NavSection[] = [
  { label: null, items: [
    { id: 'chat', icon: MessageSquare, label: 'Chat' },
    { id: 'mission', icon: LayoutDashboard, label: 'Dashboard' },
  ]},
  { label: 'Work', items: [
    { id: 'project_execution', icon: Terminal, label: 'Projects' },
    { id: 'hector', icon: Database, label: 'Research' },
    { id: 'content', icon: FileText, label: 'Content' },
    { id: 'automation', icon: GitBranch, label: 'Automation' },
  ]},
  { label: 'Agents', items: [
    { id: 'orchestrator', icon: Shield, label: 'Orchestrator', showApprovalBadge: true },
    { id: 'miya', icon: Palette, label: 'Creative' },
    { id: 'mission_room', icon: Sparkles, label: 'Boardroom' },
    { id: 'ecosystem', icon: Bot, label: 'All Agents' },
    { id: 'agent_performance', icon: Activity, label: 'Agent Performance' },
  ]},
  { label: 'System', items: [
    { id: 'runtimes', icon: Cpu, label: 'Runtimes' },
    { id: 'voice', icon: Mic, label: 'Voice' },
    { id: 'connectors', icon: Plug, label: 'Connectors', showStatusDot: true },
  ]},
];
```

## Appendix B: Tour Step Target Selectors

```typescript
// CSS selectors for tour spotlight targets
const TOUR_TARGETS = {
  simple: [
    '[data-tour="dashboard-hero"]',
    '[data-tour="next-action-0"]',
    '[data-tour="sidebar-chat"]',
    '[data-tour="sidebar-projects"]',
    '[data-tour="sidebar-research"]',
    '[data-tour="sidebar-creative"]',
    '[data-tour="topbar-notifications"]',
    '[data-tour="topbar-mode-toggle"]',
  ],
  advanced: [
    // ... simple targets plus:
    '[data-tour="sidebar-orchestrator"]',
    '[data-tour="sidebar-boardroom"]',
    '[data-tour="sidebar-connectors"]',
    '[data-tour="sidebar-runtimes"]',
    '[data-tour="sidebar-coach"]',
  ],
};
```

Add `data-tour="..."` attributes to the relevant elements during implementation.

---

*End of specification.*
