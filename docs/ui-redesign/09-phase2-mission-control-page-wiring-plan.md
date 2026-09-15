# Mission Control — Functional Swap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, per this session's standing "no subagents" instruction). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `MissionControlHome.tsx`'s existing ad-hoc, approvals-only "Review approvals" summary line with real, individual rows sourced from `attentionAggregatorService.ts` (its 3 real sources: chat/Jose approvals, Project Execution approvals, tripped connector circuits). Visual treatment (bordered rows, current layout) is explicitly **unchanged** this pass — that's the separate, later visual rewrite. No inline approve/reject buttons yet — clicking a row still just navigates, matching today's exact interaction model.

**Architecture:** `MissionControlHome.tsx`'s `nextActions` list moves from a synchronous `useMemo` reading `listApprovalQueue()` directly, to state populated by `getAttentionItems()` on mount + a 60s poll (matching the aggregator's own documented interval), inserted at the same priority position the old "Review approvals" line occupied (before the coach-intervention and Ollama-offline checks, same as today). The existing "Approvals" stat tile (a separate UI element, `listApprovalQueue().length` only) is untouched — broadening its meaning is a different decision not made here.

**Tech Stack:** React 18 + TypeScript, Vitest + React Testing Library.

**Scope note:** `MissionControlHome.tsx` currently has **zero test coverage** (verified — no `MissionControlHome.test.*` file exists anywhere in `src/test/`). This plan adds real coverage for the changed behavior as part of making this change, not as an afterthought.

---

### Task 1: Wire `attentionAggregatorService` into `nextActions`, add real test coverage

**Files:**
- Modify: `src/components/MissionControlHome.tsx`
- Test: `src/test/components/MissionControlHome.test.tsx` (new)

- [ ] **Step 1: Write the failing tests**

```tsx
// src/test/components/MissionControlHome.test.tsx
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('../../services/agentBusService', () => ({
  listApprovalQueue: vi.fn(() => []),
  listAgentPackets: vi.fn(() => []),
}));
vi.mock('../../services/agentActivityService', () => ({
  listAgentActivity: vi.fn(() => []),
}));
vi.mock('../../services/attentionAggregatorService', () => ({
  getAttentionItems: vi.fn(),
}));

import { getAttentionItems } from '../../services/attentionAggregatorService';
import { MissionControlHome } from '../../components/MissionControlHome';

const baseProps = {
  settings: {},
  ollamaStatus: { state: 'connected' },
  operatorMode: false,
  coachMode: false,
  coachIntervention: null,
  onNavigate: vi.fn(),
};

describe('MissionControlHome — attention aggregator wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getAttentionItems as any).mockResolvedValue([]);
  });

  it('renders a real approval-chat attention item as its own next-action row, not a summary count', async () => {
    (getAttentionItems as any).mockResolvedValue([
      { id: 'approval-chat-pkt-1', source: 'approval-chat', severity: 'high', title: 'Publish draft to Slack', timestamp: 1000, actionable: true },
    ]);
    render(<MissionControlHome {...baseProps} />);
    await waitFor(() => expect(screen.getByText('Publish draft to Slack')).toBeTruthy());
    expect(screen.queryByText(/agent handoff.*need a decision/)).toBeNull();
  });

  it('renders a real approval-project attention item and navigates to project_execution on click', async () => {
    (getAttentionItems as any).mockResolvedValue([
      { id: 'approval-project-approval-2', source: 'approval-project', severity: 'medium', title: 'Deploy v2.7.1', timestamp: 1000, actionable: true },
    ]);
    render(<MissionControlHome {...baseProps} />);
    const row = await screen.findByText('Deploy v2.7.1');
    row.closest('button')!.click();
    expect(baseProps.onNavigate).toHaveBeenCalledWith('project_execution');
  });

  it('renders a real connector attention item and navigates to connectors on click', async () => {
    (getAttentionItems as any).mockResolvedValue([
      { id: 'connector-github', source: 'connector', severity: 'medium', title: 'GitHub', timestamp: 1000, actionable: false },
    ]);
    render(<MissionControlHome {...baseProps} />);
    const row = await screen.findByText('GitHub');
    row.closest('button')!.click();
    expect(baseProps.onNavigate).toHaveBeenCalledWith('connectors');
  });

  it('still falls back to the existing filler actions when the aggregator has nothing', async () => {
    (getAttentionItems as any).mockResolvedValue([]);
    render(<MissionControlHome {...baseProps} />);
    await waitFor(() => expect(screen.getByText('Continue your mission')).toBeTruthy());
    expect(screen.getByText('Talk to Alphonso')).toBeTruthy();
  });

  it('still shows the coach hard-intervention row ahead of filler actions when both exist', async () => {
    (getAttentionItems as any).mockResolvedValue([]);
    render(<MissionControlHome {...baseProps} coachIntervention={{ level: 'hard', message: 'Pause recommended' }} />);
    await waitFor(() => expect(screen.getByText('Coach intervention')).toBeTruthy());
  });

  it('caps the combined list at 4 rows total', async () => {
    (getAttentionItems as any).mockResolvedValue([
      { id: 'a', source: 'approval-chat', severity: 'critical', title: 'Item A', timestamp: 5, actionable: true },
      { id: 'b', source: 'approval-chat', severity: 'high', title: 'Item B', timestamp: 4, actionable: true },
      { id: 'c', source: 'approval-project', severity: 'medium', title: 'Item C', timestamp: 3, actionable: true },
      { id: 'd', source: 'connector', severity: 'medium', title: 'Item D', timestamp: 2, actionable: false },
      { id: 'e', source: 'connector', severity: 'low', title: 'Item E', timestamp: 1, actionable: false },
    ]);
    render(<MissionControlHome {...baseProps} />);
    await waitFor(() => expect(screen.getByText('Item A')).toBeTruthy());
    expect(screen.queryByText('Item E')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/test/components/MissionControlHome.test.tsx --pool=threads`
Expected: FAIL — the component doesn't call `getAttentionItems` yet, so real attention items never render and the old summary-line behavior is still in place.

- [ ] **Step 3: Implement the change**

In `src/components/MissionControlHome.tsx`, add the import (alongside the existing service imports at the top):

```tsx
import { getAttentionItems, type AttentionItem } from '../services/attentionAggregatorService';
```

Add polling state right after the existing `snapshot` useMemo (after line 65, before the `nextActions` useMemo):

```tsx
  const [attentionItems, setAttentionItems] = React.useState<AttentionItem[]>([]);
  React.useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const items = await getAttentionItems();
      if (!cancelled) setAttentionItems(items);
    };
    poll();
    const id = window.setInterval(poll, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);
```

Replace the `nextActions` useMemo entirely with:

```tsx
  const ATTENTION_SOURCE_META: Record<AttentionItem['source'], { tab: string; cta: string; icon: React.ComponentType<{ className?: string }> }> = {
    'approval-chat': { tab: 'orchestrator', cta: 'Open Jose', icon: Crown },
    'approval-project': { tab: 'project_execution', cta: 'Open Project Exec', icon: Sparkles },
    connector: { tab: 'connectors', cta: 'Open Connectors', icon: RadioTower },
  };

  const nextActions = useMemo(() => {
    const items: Array<{
      title: string;
      detail: string;
      cta: string;
      tab: string;
      icon: React.ComponentType<{ className?: string }>;
      accent: string;
    }> = [];

    attentionItems.forEach((item) => {
      const meta = ATTENTION_SOURCE_META[item.source];
      items.push({
        title: item.title,
        detail: item.detail || 'Needs a decision',
        cta: meta.cta,
        tab: meta.tab,
        icon: meta.icon,
        accent: 'text-[var(--warning)]',
      });
    });

    if (coachIntervention?.level === 'hard' || coachIntervention?.level === 'firm') {
      items.push({ title: 'Coach intervention', detail: coachIntervention.message || 'Active protective intervention', cta: 'Open Operator', tab: 'operator', icon: Shield, accent: 'text-[var(--error)]' });
    }
    if (ollamaStatus?.state !== 'connected') {
      items.push({ title: 'Start Ollama', detail: 'Local AI is not running — agent reasoning is limited', cta: 'Open Settings', tab: 'settings', icon: Terminal, accent: 'text-[var(--text-3)]' });
    }
    items.push({ title: 'Continue your mission', detail: 'Use Project Execution for structured work packets and proof-first planning', cta: 'Open Project Exec', tab: 'project_execution', icon: Sparkles, accent: 'text-[var(--accent)]' });
    items.push({ title: 'Talk to Alphonso', detail: 'Direct commands, research, and Jose delegation', cta: 'Open Chat', tab: 'chat', icon: MessageSquare, accent: 'text-cyan-400' });
    return items.slice(0, 4);
  }, [attentionItems, coachIntervention, ollamaStatus]);
```

(`RadioTower`, `Crown`, `Sparkles`, `Shield`, `Terminal`, `MessageSquare` are all already imported at the top of this file — no new icon imports needed.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/test/components/MissionControlHome.test.tsx --pool=threads`
Expected: PASS, all 6 tests

- [ ] **Step 5: Run the full typecheck**

Run: `npx tsc --noEmit`
Expected: clean, zero output — this step is not optional, per this session's own repeated experience of it catching real bugs the test steps alone missed.

- [ ] **Step 6: Commit**

```bash
git add src/components/MissionControlHome.tsx src/test/components/MissionControlHome.test.tsx
git commit -m "feat: wire MissionControlHome's next-actions list to the real attentionAggregatorService (functional swap, visual pass deferred)"
```

---

## Self-Review

**Spec coverage:** Covers the agreed "functional swap first" scope exactly — real aggregator data replaces the old single-line approval summary, existing coach/Ollama priority checks and filler rows are preserved unchanged, the 4-item cap is preserved, no inline approve/reject added, no visual/Zone restyle attempted. The "Approvals" stat tile is explicitly untouched (different scope decision, not made here).

**Placeholder scan:** No TBD/TODO. `AttentionItem`, `getAttentionItems` match the real, already-committed `attentionAggregatorService.ts` exactly (3 sources: `approval-chat`/`approval-project`/`connector` — no `coach`, per Bug Log #5's resolution). All icon names (`Crown`, `Sparkles`, `RadioTower`, `Shield`, `Terminal`, `MessageSquare`) verified already imported in the real file.

**Type consistency:** `ATTENTION_SOURCE_META` is keyed by `AttentionItem['source']`, so if a new source is ever added to the aggregator without updating this map, TypeScript itself will catch the missing key — not a runtime surprise.
