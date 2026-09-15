# Mission Control Visual Pass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, per this session's standing "no subagents" instruction). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute `07-phase2-mission-control-spec.md`'s "Visual Pass Design" section — replace `MissionControlHome.tsx`'s static banner hero and 4-tile stats row with the locked design (agent-portrait strip, dynamic greeting, 2 context-rich stat tiles, Zone-styled sections, a real empty state) — while resolving one real conflict this plan found between that spec and an already-passing test, documented in Task 4 below.

**Architecture:** Five small, independently-testable tasks: (1) extend the `Zone` primitive with the two moods this page's spec calls for (`warm`/`cool`) that don't exist yet, (2) add a small persistent Ollama status dot to `Sidebar.tsx` (the spec moves this off the stats row entirely, into the sidebar next to search), (3) rewrite `MissionControlHome.tsx`'s hero (portrait strip + dynamic greeting), (4) rewrite the stats row (4 tiles → 2, real context), (5) add the Zone-wrapped empty-state treatment for "What to do next."

**Tech Stack:** React 18 + TypeScript, existing `AgentStatusStrip` (portraits variant, already built), existing `Zone` primitive (already built).

**Real conflict found and resolved during planning (documented so it isn't silently papered over):** the spec's empty-state section says "When `getAttentionItems()` returns nothing, the 'What to do next' Zone is replaced by a distinct empty-state Zone." Taken completely literally, this would delete the two filler suggestion rows ("Continue your mission," "Talk to Alphonso") that `src/test/components/MissionControlHome.test.tsx`'s already-passing "still falls back to the existing filler actions when the aggregator has nothing" test requires to still render. Resolution locked for this plan: the empty-state *visual treatment* (Zone mood change to `cool`, centered icon, "Nothing needs you right now" headline) triggers only when there is truly nothing real to act on — `attentionItems.length === 0` AND no hard/firm coach intervention AND Ollama is connected — and in that exact case the two filler rows still render underneath the headline (they're genuinely useful, not clutter, and the existing test keeps passing unmodified). When any real attention item, a hard/firm coach intervention, or an Ollama-down state exists, the normal (non-empty, `warm`-mood) Zone renders exactly as it does today. This is a narrower, more useful reading of the spec's intent ("nothing needs you right now" is only true when nothing — including coach/Ollama — actually needs attention) rather than a literal one that would regress functionality.

---

### Task 1: Extend `Zone` with `warm` and `cool` moods

**Files:**
- Modify: `src/components/ui/Zone.tsx`
- Test: `src/test/components/ui/Zone.test.tsx` (new)

- [ ] **Step 1: Write the failing test**

```tsx
// src/test/components/ui/Zone.test.tsx
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Zone } from '../../../components/ui/Zone';

describe('Zone — warm/cool moods', () => {
  it('applies the warm mood class', () => {
    render(<Zone mood="warm" data-testid="z">content</Zone>);
    expect(screen.getByTestId('z').className).toMatch(/bg-\[var\(--warning-dim\)\]/);
  });

  it('applies the cool mood class', () => {
    render(<Zone mood="cool" data-testid="z">content</Zone>);
    expect(screen.getByTestId('z').className).toMatch(/bg-\[var\(--accent-dim\)\]/);
  });

  it('never adds a border or shadow class for any mood', () => {
    render(<Zone mood="warm" data-testid="z">content</Zone>);
    expect(screen.getByTestId('z').className).not.toMatch(/border-|shadow-/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/components/ui/Zone.test.tsx --pool=threads`
Expected: FAIL — `warm`/`cool` aren't valid `ZoneMood` values yet, `moodClasses` has no entries for them.

- [ ] **Step 3: Implement**

Replace `src/components/ui/Zone.tsx` entirely with:

```tsx
import React from 'react';

type ZoneMood = 'neutral' | 'hector' | 'miya' | 'warm' | 'cool';

interface ZoneProps {
  mood?: ZoneMood;
  children: React.ReactNode;
  className?: string;
  'data-testid'?: string;
}

const moodClasses: Record<ZoneMood, string> = {
  neutral: 'bg-surface-2',
  hector: 'bg-agent-hector/10',
  miya: 'bg-agent-miya/10',
  warm: 'bg-[var(--warning-dim)]',
  cool: 'bg-[var(--accent-dim)]',
};

// No border, no shadow, no radius-as-card treatment — hierarchy comes from
// the tinted background wash alone, per the Phase 1 design system spec's
// "no cards" rule. Extend moodClasses as more rooms/agents need a Zone
// variant; never add a border-* or shadow-* class here.
export function Zone({ mood = 'neutral', children, className = '', ...rest }: ZoneProps) {
  return (
    <div className={`rounded-2xl p-4 ${moodClasses[mood]} ${className}`} {...rest}>
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/components/ui/Zone.test.tsx --pool=threads`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/Zone.tsx src/test/components/ui/Zone.test.tsx
git commit -m "feat: add warm/cool moods to Zone primitive for Mission Control's visual pass"
```

---

### Task 2: Add a persistent Ollama status dot to `Sidebar.tsx`, next to search

**Files:**
- Modify: `src/components/Sidebar.tsx`, `src/App.tsx`
- Test: `src/test/sidebarSpaces.test.jsx` (add to existing file)

Per the spec: "Local AI online/offline status moves from a big stat tile to a small persistent status dot next to the sidebar's search field — always visible regardless of what else is happening." This is a small, additive prop on the already-rebuilt `Sidebar.tsx` — not touched by `12-sidebar-redesign-plan.md`, since that plan predated this spec section being read closely.

- [ ] **Step 1: Add the failing test to `src/test/sidebarSpaces.test.jsx`**

Add this test and this one prop to `baseProps` (append, don't replace the existing object):

```jsx
// add to baseProps:
// ollamaConnected: false,

it('shows a persistent Ollama status dot next to the search field, colored by connection state', () => {
  const { rerender } = render(<Sidebar {...baseProps} ollamaConnected={false} />);
  expect(screen.getByTestId('sidebar-ollama-dot').className).toMatch(/bg-\[var\(--text-4\)\]/);
  rerender(<Sidebar {...baseProps} ollamaConnected={true} />);
  expect(screen.getByTestId('sidebar-ollama-dot').className).toMatch(/bg-\[var\(--success\)\]/);
});
```

(Add `ollamaConnected: false` to the shared `baseProps` object at the top of the file so every other existing test keeps passing unmodified with an explicit, known value rather than `undefined`.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/test/sidebarSpaces.test.jsx --pool=threads`
Expected: FAIL — no such test id exists yet.

- [ ] **Step 3: Add the prop and render to `Sidebar.tsx`**

Add to `SidebarProps` interface:

```tsx
  onToggleSearch: () => void;
  ollamaConnected?: boolean;
```

Add to the component's destructured params: `ollamaConnected = false` (append after `onToggleSearch`).

Change the search trigger button's render to include the dot (replace the existing search button block):

```tsx
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
          <span
            data-testid="sidebar-ollama-dot"
            title={ollamaConnected ? 'Local AI online' : 'Local AI offline'}
            className={`h-1.5 w-1.5 rounded-full shrink-0 ${ollamaConnected ? 'bg-[var(--success)]' : 'bg-[var(--text-4)]'}`}
          />
        </button>
      )}
```

- [ ] **Step 4: Wire the real value from `App.tsx`**

Add `ollamaConnected={ollamaStatus?.state === 'connected'}` to the existing `<Sidebar ...>` call site in `App.tsx` (alongside `onToggleSearch`).

- [ ] **Step 5: Run to verify it passes, plus the full Sidebar suite**

Run: `npx vitest run src/test/sidebarSpaces.test.jsx src/test/sidebarDeleteChat.test.jsx --pool=threads`
Expected: PASS, all tests in both files

- [ ] **Step 6: Run `tsc --noEmit`**

Expected: clean, zero output

- [ ] **Step 7: Commit**

```bash
git add src/components/Sidebar.tsx src/App.tsx src/test/sidebarSpaces.test.jsx
git commit -m "feat: add persistent Ollama status dot to Sidebar search field, per Mission Control spec's stats-row simplification"
```

---

### Task 3: `MissionControlHome.tsx` — hero rewrite (portrait strip + dynamic greeting)

**Files:**
- Modify: `src/components/MissionControlHome.tsx`
- Test: `src/test/components/MissionControlHome.test.tsx` (add to existing file)

- [ ] **Step 1: Add the failing tests**

Add to the existing test file (keep every existing test as-is):

```tsx
import { AgentStatusStrip } from '../../components/AgentStatusStrip';
// (add this mock near the other vi.mock calls, before any describe block)
vi.mock('../../components/AgentStatusStrip', () => ({
  AgentStatusStrip: ({ onAgentsChange }: { onAgentsChange?: (agents: { name: string; status: string }[]) => void }) => {
    React.useEffect(() => {
      onAgentsChange?.([{ name: 'jose', status: 'running' }, { name: 'hector', status: 'running' }]);
    }, [onAgentsChange]);
    return <div data-testid="mock-agent-strip" />;
  },
}));
```

```tsx
describe('MissionControlHome — hero (portrait strip + dynamic greeting)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getAttentionItems as any).mockResolvedValue([]);
  });

  it('renders the agent portrait strip instead of the static banner image', () => {
    render(<MissionControlHome {...baseProps} />);
    expect(screen.getByTestId('mock-agent-strip')).toBeTruthy();
    expect(screen.queryByAltText('Alphonso')).toBeNull(); // the old static banner img had alt="Alphonso"
  });

  it('renders a time-of-day greeting instead of the hardcoded "Executor online." headline', () => {
    render(<MissionControlHome {...baseProps} />);
    expect(screen.queryByText('Executor online.')).toBeNull();
    expect(screen.getByText(/Good (morning|afternoon|evening)/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/test/components/MissionControlHome.test.tsx --pool=threads`
Expected: FAIL

- [ ] **Step 3: Rewrite the hero section in `MissionControlHome.tsx`**

Add these imports (remove the 3 now-unused static asset imports and their now-unused icon imports `Crown` stays since it's still used on the Orchestrator button and `nextActions`'s coach row — check before removing any icon import that it's genuinely unused elsewhere in the file):

```tsx
import { AgentStatusStrip } from './AgentStatusStrip';
```

Remove these 3 lines (no longer used anywhere once the hero is rewritten):
```tsx
import alphonsoBanner from '../../logo-banner-thumbnail-media/ALPHONSO_BANNER.webp';
import alphonsoIcon from '../../logo-banner-thumbnail-media/ALPHONSO_ICON.webp';
import alphonsoLogo from '../../logo-banner-thumbnail-media/ALPHONSO_LOGO.webp';
```

Add this small helper above the component function:

```tsx
function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning.';
  if (hour < 18) return 'Good afternoon.';
  return 'Good evening.';
}
```

Add state to capture the active-agent list from the portrait strip (add near the existing `attentionItems` state):

```tsx
  const [activeAgents, setActiveAgents] = React.useState<{ name: string; status: string }[]>([]);
```

Replace the entire hero `<div className="relative overflow-hidden rounded-3xl">...</div>` block with:

```tsx
      <div className="relative overflow-hidden rounded-3xl bg-[var(--surface-1)] px-8 py-6 md:px-12 md:py-8">
        <div className="mb-6">
          <AgentStatusStrip variant="portraits" useAutoFeed onAgentsChange={setActiveAgents} />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-white md:text-5xl">
          {getGreeting()}
        </h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-[var(--text-2)]">
          Coordinate your 9 agents, manage approvals, and keep the next move clear.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <button
            onClick={() => onNavigate?.('chat')}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-[var(--surface-0)] hover:bg-[var(--accent-hover)] transition-colors"
          >
            <MessageSquare className="h-4 w-4" />
            Open Chat
          </button>
          <button
            onClick={() => onNavigate?.('orchestrator')}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-white/5 px-5 py-2.5 text-sm font-semibold text-[var(--text-1)] hover:bg-white/10 transition-colors"
          >
            <Crown className="h-4 w-4" />
            Orchestrator
          </button>
        </div>
      </div>
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/test/components/MissionControlHome.test.tsx --pool=threads`
Expected: PASS, all tests in the file (existing + new)

- [ ] **Step 5: Run `tsc --noEmit`, checking specifically for now-unused-import errors**

Expected: clean. If `Crown`, `MessageSquare`, or any other lucide import is now flagged unused, remove it; if any is still used elsewhere in the file (e.g. `nextActions`'s coach row uses `Shield`, not `Crown`), leave it.

- [ ] **Step 6: Commit**

```bash
git add src/components/MissionControlHome.tsx src/test/components/MissionControlHome.test.tsx
git commit -m "feat: replace Mission Control's static banner hero with the agent-portrait strip + dynamic greeting"
```

---

### Task 4: `MissionControlHome.tsx` — stats row (4 tiles → 2, real context)

**Files:**
- Modify: `src/components/MissionControlHome.tsx`
- Test: `src/test/components/MissionControlHome.test.tsx` (add to existing file)

- [ ] **Step 1: Add the failing tests**

```tsx
describe('MissionControlHome — 2-tile stats row', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows only Approvals and Active agents tiles — no Local AI or Memory or Coach tiles', async () => {
    (getAttentionItems as any).mockResolvedValue([]);
    render(<MissionControlHome {...baseProps} />);
    await waitFor(() => expect(screen.getByText('Approvals')).toBeTruthy());
    expect(screen.getByText('Active agents')).toBeTruthy();
    expect(screen.queryByText('Local AI')).toBeNull();
    expect(screen.queryByText('Memory')).toBeNull();
    expect(screen.queryByText('Coach')).toBeNull();
  });

  it('shows the oldest-waiting duration under Approvals when actionable items exist', async () => {
    (getAttentionItems as any).mockResolvedValue([
      { id: 'a', source: 'approval-chat', severity: 'high', title: 'Item A', timestamp: Date.now() - 65 * 60_000, actionable: true },
    ]);
    render(<MissionControlHome {...baseProps} />);
    expect(await screen.findByText(/oldest waiting/i)).toBeTruthy();
  });

  it('shows "queue clear" under Approvals when there are no actionable items', async () => {
    (getAttentionItems as any).mockResolvedValue([]);
    render(<MissionControlHome {...baseProps} />);
    await waitFor(() => expect(screen.getByText('queue clear')).toBeTruthy());
  });

  it('names the active agents under the Active agents tile', async () => {
    (getAttentionItems as any).mockResolvedValue([]);
    render(<MissionControlHome {...baseProps} />);
    // the mocked AgentStatusStrip (Task 3) always reports jose + hector active
    expect(await screen.findByText(/jose/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/test/components/MissionControlHome.test.tsx --pool=threads`
Expected: FAIL

- [ ] **Step 3: Add a duration-formatting helper and the actionable-items derivation**

Add above the component function, next to `getGreeting`:

```tsx
function formatWaitingDuration(oldestTimestamp: number): string {
  const minutes = Math.max(1, Math.round((Date.now() - oldestTimestamp) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  return `${hours}h`;
}
```

Add inside the component, after `attentionItems` state (before `nextActions`'s `useMemo`):

```tsx
  const actionableItems = useMemo(() => attentionItems.filter((item) => item.actionable), [attentionItems]);
  const oldestActionable = actionableItems.length
    ? actionableItems.reduce((oldest, item) => (item.timestamp < oldest.timestamp ? item : oldest))
    : null;
```

- [ ] **Step 4: Replace the stats grid**

Replace the entire `<div className="grid grid-cols-2 gap-3 md:grid-cols-4">...</div>` block with:

```tsx
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-white/[0.07] bg-[var(--surface-1)] px-4 py-3.5">
          <div className="flex items-center gap-1.5 mb-2">
            <span className={`h-1.5 w-1.5 rounded-full ${actionableItems.length ? 'bg-[var(--warning)]' : 'bg-[var(--border-strong)]'}`} />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-3)]">Approvals</span>
          </div>
          <div className="text-xl font-bold text-[var(--text-1)]">{actionableItems.length || '—'}</div>
          <div className="mt-0.5 text-[11px] text-[var(--text-4)]">
            {oldestActionable ? `oldest waiting ${formatWaitingDuration(oldestActionable.timestamp)}` : 'queue clear'}
          </div>
        </div>
        <div className="rounded-2xl border border-white/[0.07] bg-[var(--surface-1)] px-4 py-3.5">
          <div className="flex items-center gap-1.5 mb-2">
            <span className={`h-1.5 w-1.5 rounded-full ${activeAgents.length ? 'bg-[var(--accent)]' : 'bg-[var(--border-strong)]'}`} />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-3)]">Active agents</span>
          </div>
          <div className="text-xl font-bold text-[var(--text-1)]">{activeAgents.length}/9</div>
          <div className="mt-0.5 text-[11px] text-[var(--text-4)] truncate">
            {activeAgents.length
              ? activeAgents.map((a) => a.name.charAt(0).toUpperCase() + a.name.slice(1)).join(', ')
              : 'idle'}
          </div>
        </div>
      </div>
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/test/components/MissionControlHome.test.tsx --pool=threads`
Expected: PASS, all tests

- [ ] **Step 6: Run `tsc --noEmit`**

Expected: clean. `memoryItems`/`updateCheckState` props are likely now unused inside the component body (only referenced by the removed Memory tile) — leave the props themselves in the `Props` interface (removing a public prop is a bigger, separate decision than this visual pass), but remove any now-dead local usage `tsc`/`eslint` flags.

- [ ] **Step 7: Commit**

```bash
git add src/components/MissionControlHome.tsx src/test/components/MissionControlHome.test.tsx
git commit -m "feat: replace Mission Control's 4-tile stats row with 2 context-rich tiles (Approvals w/ oldest-waiting, Active agents w/ names)"
```

---

### Task 5: `MissionControlHome.tsx` — Zone-wrapped sections + real empty state

**Files:**
- Modify: `src/components/MissionControlHome.tsx`
- Test: `src/test/components/MissionControlHome.test.tsx` (add to existing file)

- [ ] **Step 1: Add the failing tests**

```tsx
describe('MissionControlHome — Zone-wrapped empty state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the empty-state headline when there is truly nothing to act on', async () => {
    (getAttentionItems as any).mockResolvedValue([]);
    render(<MissionControlHome {...baseProps} />);
    expect(await screen.findByText('Nothing needs you right now')).toBeTruthy();
    // filler rows still present underneath, per this plan's documented resolution
    expect(screen.getByText('Continue your mission')).toBeTruthy();
    expect(screen.getByText('Talk to Alphonso')).toBeTruthy();
  });

  it('does NOT show the empty-state headline when a real attention item exists', async () => {
    (getAttentionItems as any).mockResolvedValue([
      { id: 'a', source: 'approval-chat', severity: 'high', title: 'Item A', timestamp: 1000, actionable: true },
    ]);
    render(<MissionControlHome {...baseProps} />);
    await waitFor(() => expect(screen.getByText('Item A')).toBeTruthy());
    expect(screen.queryByText('Nothing needs you right now')).toBeNull();
  });

  it('does NOT show the empty-state headline when a hard coach intervention exists, even with an empty aggregator', async () => {
    (getAttentionItems as any).mockResolvedValue([]);
    render(<MissionControlHome {...baseProps} coachIntervention={{ level: 'hard', message: 'Pause recommended' }} />);
    await waitFor(() => expect(screen.getByText('Coach intervention')).toBeTruthy());
    expect(screen.queryByText('Nothing needs you right now')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/test/components/MissionControlHome.test.tsx --pool=threads`
Expected: FAIL

- [ ] **Step 3: Import `Zone` and add the `isTrulyEmpty` check**

Add import:

```tsx
import { Zone } from './ui/Zone';
```

Add inside the component, after `nextActions`'s `useMemo` (needs `attentionItems`, `coachIntervention`, `ollamaStatus` already in scope):

```tsx
  const isTrulyEmpty = attentionItems.length === 0
    && coachIntervention?.level !== 'hard'
    && coachIntervention?.level !== 'firm'
    && ollamaStatus?.state === 'connected';
```

- [ ] **Step 4: Wrap "What to do next" in a `Zone`, add the empty-state headline**

Replace the `<div>` wrapping "What to do next" (the first child of the `grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]` row) with a `Zone`:

```tsx
        <Zone mood={isTrulyEmpty ? 'cool' : 'warm'}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-3)]">What to do next</h2>
          </div>
          {isTrulyEmpty && (
            <div className="mb-4 flex flex-col items-center text-center py-4">
              <CheckCircle2 className="h-6 w-6 text-[var(--accent)] mb-2" />
              <div className="text-sm font-semibold text-[var(--text-1)]">Nothing needs you right now</div>
              <p className="mt-1 max-w-xs text-[12px] text-[var(--text-4)]">Everything's running clean. Try Quick Launch below for something to work on.</p>
            </div>
          )}
          <div className="space-y-2">
            {nextActions.map((action) => (
              <button
                key={`${action.tab}-${action.title}`}
                type="button"
                onClick={() => onNavigate?.(action.tab)}
                className="group flex w-full items-center gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3.5 text-left transition hover:border-white/[0.10] hover:bg-[var(--surface-2)]"
              >
                <action.icon className={`h-4 w-4 shrink-0 ${action.accent}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-[var(--text-1)]">{action.title}</div>
                  <div className="mt-0.5 text-[12px] text-[var(--text-3)] truncate">{action.detail}</div>
                </div>
                <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-4)] group-hover:text-[var(--text-2)] transition-colors shrink-0">
                  {action.cta}
                  <ArrowRight className="h-3 w-3" />
                </div>
              </button>
            ))}
          </div>
        </Zone>
```

(`CheckCircle2` is already imported at the top of the file — confirm before assuming; if it isn't, add it to the existing `lucide-react` import block rather than a separate import line.)

- [ ] **Step 5: Wrap "Quick launch" in a `cool`-mood `Zone`**

Replace the final `<div>` wrapping "Quick launch" with:

```tsx
      <Zone mood="cool">
        <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-widest text-[var(--text-3)]">Quick launch</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {[
            { title: 'Miya Studio', detail: 'Create images and video locally', tab: 'miya', icon: Clapperboard, color: 'text-fuchsia-400' },
            { title: 'Connectors', detail: 'Telegram, Slack, YouTube and more', tab: 'connectors', icon: RadioTower, color: 'text-cyan-400' },
            { title: 'Operator', detail: 'Settings, Coach, and memory', tab: 'operator', icon: Bot, color: 'text-violet-400' },
          ].map((item) => (
            <button
              key={item.tab}
              type="button"
              onClick={() => onNavigate?.(item.tab)}
              className="group flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3.5 text-left transition hover:border-white/[0.10] hover:bg-[var(--surface-2)]"
            >
              <item.icon className={`h-4 w-4 shrink-0 ${item.color}`} />
              <div>
                <div className="text-sm font-semibold text-[var(--text-1)]">{item.title}</div>
                <div className="text-[11px] text-[var(--text-4)] mt-0.5">{item.detail}</div>
              </div>
              <ArrowRight className="ml-auto h-3.5 w-3.5 text-[var(--text-4)] group-hover:text-[var(--text-2)] transition-colors shrink-0" />
            </button>
          ))}
        </div>
      </Zone>
```

- [ ] **Step 6: Run to verify it passes, run the full test file, run `tsc --noEmit`**

Run: `npx vitest run src/test/components/MissionControlHome.test.tsx --pool=threads`
Expected: PASS, every test in the file (all 4 describe blocks — original + Tasks 3/4/5's additions)

Run: `npx tsc --noEmit`
Expected: clean

- [ ] **Step 7: Commit**

```bash
git add src/components/MissionControlHome.tsx src/test/components/MissionControlHome.test.tsx
git commit -m "feat: wrap Mission Control's Zone sections (warm/cool) and add the real empty-state treatment for What to do next"
```

---

## Self-Review

**Spec coverage:** Covers every item in `07-phase2-mission-control-spec.md`'s "Visual Pass Design" section: skeleton change (portrait strip, Ollama dot moved to sidebar), stats (2 tiles, real context), empty state, dynamic greeting, Zone sections. The one item explicitly deferred by the spec itself ("Exact 'is this agent active' signal... needs a real decision during implementation") is resolved here by reusing `AgentStatusStrip`'s already-real 30-second window via its `onAgentsChange` callback, rather than inventing a second threshold — consistent with the spec's own instruction to reuse "the same list the breathing-glow strip already computes."

**Conflict handling:** The empty-state-vs-filler-actions conflict (see header) is resolved with a stated rule, not silently guessed — a future reader can see exactly why filler rows survive inside the empty state.

**Placeholder scan:** No TBD/TODO. `formatWaitingDuration`'s minute/hour boundary and the greeting's hour boundaries are real, working implementations, not stubs.

**Type consistency:** `activeAgents` (from `AgentStatusStrip`'s `onAgentsChange`) and `attentionItems`/`actionableItems`/`oldestActionable` are each defined once and used with consistent shapes across Tasks 3-5.
