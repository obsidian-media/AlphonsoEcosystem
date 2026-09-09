# Phase 1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay the smallest real, independently-shippable slice of Phase 1's design-system foundation: fix a found nav bug, resolve a found naming collision, add the accent-theme mechanism, and build the `Zone` primitive that replaces `Card` for the new no-shadow visual language — all four verified against the real, already-live codebase (`tokens.css`, `tailwind.config.js`, `App.tsx`), not invented from the brainstorming mockups alone.

**Architecture:** Extend the existing OKLCH token system in `src/styles/tokens.css` and its Tailwind mapping in `tailwind.config.js` (do not create a parallel token system). New `Zone` component follows the same file/export conventions as the existing `src/components/ui/` primitives. Accent theming follows the existing `[data-theme="light"]` attribute pattern already used for light/dark mode.

**Tech Stack:** React 18 + TypeScript, Tailwind CSS v3.4, Vitest + React Testing Library.

**Scope note:** This plan deliberately covers only the smallest real, ready-to-build slice of the Phase 1 spec (`docs/ui-redesign/05-phase1-design-system-spec.md`). `RoomShell`, `AgentShortcutRow`, full room pages, and the agent-portrait/connector-logo asset pipeline are NOT in this plan — they depend on decisions (asset file locations, per-page Zone-vs-hairline-row choices) not yet finalized, and belong in their own follow-up plans once Phase 2 page work starts. Each task below produces working, tested software on its own.

---

### Task 1: Fix dead "Agent Performance" nav link (Bug Log #1)

**Files:**
- Modify: `src/App.tsx:138` (add lazy import), `src/App.tsx` (add render branch near the other `activeTab ===` cases, e.g. after line 933's `AgentActivityLog` branch)
- Test: `src/test/appAgentPerformanceNav.test.tsx` (new)

- [ ] **Step 1: Write the failing test**

```tsx
// src/test/appAgentPerformanceNav.test.tsx
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('App.tsx — Agent Performance nav wiring', () => {
  it('has a render branch for the agent_performance tab (Bug Log #1)', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../App.tsx'), 'utf-8');
    expect(source).toMatch(/activeTab === 'agent_performance'/);
  });

  it('lazy-imports AgentPerformanceView with the named-export mapping App.tsx requires', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../App.tsx'), 'utf-8');
    expect(source).toMatch(
      /lazy\(\(\) => import\('\.\/components\/AgentPerformanceView'\)\.then\(\(mod\) => \(\{ default: mod\.AgentPerformanceView \}\)\)\)/
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/test/appAgentPerformanceNav.test.tsx`
Expected: FAIL — both `expect` calls fail because neither string exists in `App.tsx` yet.

- [ ] **Step 3: Add the lazy import**

In `src/App.tsx`, immediately after line 138 (`const AgentActivityLog = lazy(...)`), add:

```tsx
const AgentPerformanceView = lazy(() => import('./components/AgentPerformanceView').then((mod) => ({ default: mod.AgentPerformanceView })));
```

- [ ] **Step 4: Add the render branch**

In `src/App.tsx`, immediately after the existing block:

```tsx
                {activeTab === 'activity' && (
                  <Suspense fallback={null}>
                    <AgentActivityLog />
                  </Suspense>
                )}
```

add:

```tsx
                {activeTab === 'agent_performance' && (
                  <Suspense fallback={null}>
                    <AgentPerformanceView />
                  </Suspense>
                )}
```

(No `receipts` prop passed — the component defaults to `[]` per its own `AgentPerformanceViewProps` signature. Wiring real orchestration receipts into this view is a real fast-follow, not this bug fix's scope — don't silently expand it here.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- src/test/appAgentPerformanceNav.test.tsx`
Expected: PASS

- [ ] **Step 6: Run the existing lazy-import regression test to confirm no collateral break**

Run: `npm run test -- src/test/appLazyImports.test.js`
Expected: PASS (this test parses every `lazy()` call in `App.tsx` and checks the target module's real export shape — confirms the new import follows the same convention as all the others)

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/test/appAgentPerformanceNav.test.tsx
git commit -m "fix: wire Agent Performance nav item to AgentPerformanceView (was a dead link, Bug Log #1)"
```

---

### Task 2: Resolve the "Boardroom" naming collision

**Context:** `BoardroomPanel.tsx` (project-goal/task-batch tracker over `batchOrchestratorService.js`) and `BoardroomChatView.tsx`/`mission_room` (the real multi-agent chat) share the word "Boardroom" despite being unrelated features — flagged in the pages inventory doc. Only 2 files reference `BoardroomPanel`: itself and `OperatorDashboard.tsx:25,795`. Renaming to `ProjectBatchPanel` (matches what it actually does — project goals and task batches).

**Files:**
- Rename: `src/components/BoardroomPanel.tsx` → `src/components/ProjectBatchPanel.tsx`
- Modify: `src/components/OperatorDashboard.tsx:25,795`
- Test: `src/test/projectBatchPanelRename.test.tsx` (new)

- [ ] **Step 1: Write the failing test**

```tsx
// src/test/projectBatchPanelRename.test.tsx
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('ProjectBatchPanel rename (resolves Boardroom naming collision)', () => {
  it('the renamed file exists and exports ProjectBatchPanel as its default export', () => {
    const filePath = path.resolve(__dirname, '../components/ProjectBatchPanel.tsx');
    expect(fs.existsSync(filePath)).toBe(true);
    const source = fs.readFileSync(filePath, 'utf-8');
    expect(source).toMatch(/export default function ProjectBatchPanel\(\)/);
  });

  it('the old BoardroomPanel.tsx no longer exists', () => {
    const oldPath = path.resolve(__dirname, '../components/BoardroomPanel.tsx');
    expect(fs.existsSync(oldPath)).toBe(false);
  });

  it('OperatorDashboard.tsx imports the renamed component, not the old name', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../components/OperatorDashboard.tsx'), 'utf-8');
    expect(source).not.toMatch(/BoardroomPanel/);
    expect(source).toMatch(/ProjectBatchPanel/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/test/projectBatchPanelRename.test.tsx`
Expected: FAIL — renamed file doesn't exist yet, old file still does, OperatorDashboard.tsx still says `BoardroomPanel`.

- [ ] **Step 3: Rename the file and its default export**

```bash
git mv src/components/BoardroomPanel.tsx src/components/ProjectBatchPanel.tsx
```

In the newly-renamed `src/components/ProjectBatchPanel.tsx`, change line 283 from:

```tsx
export default function BoardroomPanel() {
```

to:

```tsx
export default function ProjectBatchPanel() {
```

- [ ] **Step 4: Update the one real consumer**

In `src/components/OperatorDashboard.tsx`, change line 25 from:

```tsx
const BoardroomPanel = lazy(() => import('./BoardroomPanel'));
```

to:

```tsx
const ProjectBatchPanel = lazy(() => import('./ProjectBatchPanel'));
```

and change line 795 from:

```tsx
          <BoardroomPanel />
```

to:

```tsx
          <ProjectBatchPanel />
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- src/test/projectBatchPanelRename.test.tsx`
Expected: PASS

- [ ] **Step 6: Run the full lazy-import regression test and the OperatorDashboard test suite**

Run: `npm run test -- src/test/appLazyImports.test.js src/test/operatorDashboard.test.jsx`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/ProjectBatchPanel.tsx src/components/OperatorDashboard.tsx src/test/projectBatchPanelRename.test.tsx
git commit -m "refactor: rename BoardroomPanel to ProjectBatchPanel, resolving the naming collision with real Boardroom chat"
```

---

### Task 3: Accent theming (Green/Purple, light/dark) via the existing `[data-theme]` attribute pattern

**Context:** Per the Phase 1 spec's §2.4/§0 reconciliation — accent theme is a separate token layer from status/agent colors, implemented as `[data-accent="green"]`/`[data-accent="purple"]` attribute blocks in `tokens.css`, composable with the existing `[data-theme="light"]` block. Default (no `data-accent` attribute) stays the current cyan.

**Files:**
- Modify: `src/styles/tokens.css` (add 2 new attribute blocks, each with a light-mode nested override)
- Create: `src/hooks/useAccentTheme.ts`
- Test: `src/test/hooks/useAccentTheme.test.ts` (new)

- [ ] **Step 1: Write the failing test**

```ts
// src/test/hooks/useAccentTheme.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAccentTheme } from '../../hooks/useAccentTheme';

describe('useAccentTheme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-accent');
  });

  it('defaults to cyan (no data-accent attribute set) when nothing is persisted', () => {
    const { result } = renderHook(() => useAccentTheme());
    expect(result.current[0]).toBe('cyan');
    expect(document.documentElement.getAttribute('data-accent')).toBeNull();
  });

  it('persists the chosen theme to localStorage and sets the data-accent attribute', () => {
    const { result } = renderHook(() => useAccentTheme());
    act(() => result.current[1]('green'));
    expect(result.current[0]).toBe('green');
    expect(localStorage.getItem('alphonso_accent_theme')).toBe('green');
    expect(document.documentElement.getAttribute('data-accent')).toBe('green');
  });

  it('reads a previously-persisted theme on mount', () => {
    localStorage.setItem('alphonso_accent_theme', 'purple');
    const { result } = renderHook(() => useAccentTheme());
    expect(result.current[0]).toBe('purple');
    expect(document.documentElement.getAttribute('data-accent')).toBe('purple');
  });

  it('removes the data-accent attribute when switching back to cyan', () => {
    const { result } = renderHook(() => useAccentTheme());
    act(() => result.current[1]('green'));
    act(() => result.current[1]('cyan'));
    expect(document.documentElement.getAttribute('data-accent')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/test/hooks/useAccentTheme.test.ts`
Expected: FAIL — `../../hooks/useAccentTheme` does not exist yet.

- [ ] **Step 3: Implement the hook**

```ts
// src/hooks/useAccentTheme.ts
import { useState, useEffect } from 'react';

export type AccentTheme = 'cyan' | 'green' | 'purple';

const STORAGE_KEY = 'alphonso_accent_theme';

export function useAccentTheme(): [AccentTheme, (theme: AccentTheme) => void] {
  const [theme, setThemeState] = useState<AccentTheme>(() => {
    return (localStorage.getItem(STORAGE_KEY) as AccentTheme) || 'cyan';
  });

  useEffect(() => {
    if (theme === 'cyan') {
      document.documentElement.removeAttribute('data-accent');
    } else {
      document.documentElement.setAttribute('data-accent', theme);
    }
  }, [theme]);

  const setTheme = (newTheme: AccentTheme) => {
    localStorage.setItem(STORAGE_KEY, newTheme);
    setThemeState(newTheme);
  };

  return [theme, setTheme];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/test/hooks/useAccentTheme.test.ts`
Expected: PASS

- [ ] **Step 5: Add the Green and Purple CSS blocks to tokens.css**

In `src/styles/tokens.css`, after the existing `[data-theme="light"], .light { ... }` block (ends at line 140), add:

```css
/* Accent theme overrides — composable with [data-theme="light"] above.
   Only --accent* tokens change; --success/--warning/--error/--agent-* stay
   fixed regardless of accent theme (see Phase 1 spec §2.4 for why these
   layers are kept separate). */
[data-accent="green"] {
  --accent: oklch(72% 0.19 145);
  --accent-hover: oklch(77% 0.17 145);
  --accent-dim: oklch(72% 0.19 145 / 0.12);
  --accent-border: oklch(72% 0.19 145 / 0.28);
  --accent-glow: oklch(72% 0.19 145 / 0.08);
  --accent-muted: oklch(72% 0.19 145 / 0.15);
}
[data-theme="light"][data-accent="green"],
.light[data-accent="green"] {
  --accent: oklch(52% 0.19 145);
  --accent-hover: oklch(47% 0.19 145);
  --accent-dim: oklch(52% 0.19 145 / 0.1);
  --accent-border: oklch(52% 0.19 145 / 0.3);
  --accent-glow: oklch(52% 0.19 145 / 0.1);
  --accent-muted: oklch(52% 0.19 145 / 0.12);
}

[data-accent="purple"] {
  --accent: oklch(72% 0.2 295);
  --accent-hover: oklch(77% 0.18 295);
  --accent-dim: oklch(72% 0.2 295 / 0.12);
  --accent-border: oklch(72% 0.2 295 / 0.28);
  --accent-glow: oklch(72% 0.2 295 / 0.08);
  --accent-muted: oklch(72% 0.2 295 / 0.15);
}
[data-theme="light"][data-accent="purple"],
.light[data-accent="purple"] {
  --accent: oklch(55% 0.2 295);
  --accent-hover: oklch(50% 0.2 295);
  --accent-dim: oklch(55% 0.2 295 / 0.1);
  --accent-border: oklch(55% 0.2 295 / 0.3);
  --accent-glow: oklch(55% 0.2 295 / 0.1);
  --accent-muted: oklch(55% 0.2 295 / 0.12);
}
```

(Note: the green accent's oklch values intentionally match `--success`'s hue family (145) at a similar lightness/chroma — this is the exact accent/status collision named in the spec. It is not fixed by choosing different numbers here, since the user explicitly wants a real Green option; it's mitigated at the component level by never letting a status badge/dot read `--accent`, only ever `--success` directly. Verify this holds by grepping for any future component that uses `--accent` for a status indicator — that would be the bug, not this token block.)

- [ ] **Step 6: Verify the existing full suite still passes (tokens.css is imported by 11+ real components)**

Run: `npm run test`
Expected: all previously-passing tests still pass — this change is additive (new attribute blocks), not a modification of any existing selector, so no existing test should be affected. If anything fails, stop and investigate before continuing — do not assume it's unrelated.

- [ ] **Step 7: Commit**

```bash
git add src/styles/tokens.css src/hooks/useAccentTheme.ts src/test/hooks/useAccentTheme.test.ts
git commit -m "feat: add Green/Purple accent theme options via data-accent attribute, composable with existing light/dark"
```

---

### Task 4: Build the `Zone` primitive (replaces `Card` for new no-shadow sections)

**Context:** Per the Phase 1 spec §3 — a new borderless, no-shadow section-background primitive for the redesign's "wash" sections, distinct from the existing `ui/Card.tsx` (which uses borders/shadows and stays as-is for now — see spec §0/§8 on scoping "no shadows" to new work only). Takes a `mood` prop mapping to the real per-agent/room colors already in `tailwind.config.js` (`agent-hector`, `agent-miya`, etc., plus a neutral default).

**Files:**
- Create: `src/components/ui/Zone.tsx`
- Modify: `src/components/ui/index.ts` (add export)
- Test: `src/test/ui/Zone.test.tsx` (new)

- [ ] **Step 1: Write the failing test**

```tsx
// src/test/ui/Zone.test.tsx
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Zone } from '../../components/ui/Zone';

describe('Zone', () => {
  it('renders its children', () => {
    render(<Zone>Some section content</Zone>);
    expect(screen.getByText('Some section content')).toBeTruthy();
  });

  it('defaults to the neutral mood', () => {
    render(<Zone data-testid="zone">content</Zone>);
    expect(screen.getByTestId('zone').className).toMatch(/bg-surface-2/);
  });

  it('applies the hector mood as a tinted background, not a border or shadow', () => {
    render(<Zone mood="hector" data-testid="zone">content</Zone>);
    const el = screen.getByTestId('zone');
    expect(el.className).toMatch(/bg-agent-hector\/10/);
    expect(el.className).not.toMatch(/shadow/);
    expect(el.className).not.toMatch(/border/);
  });

  it('applies the miya mood as a tinted background', () => {
    render(<Zone mood="miya" data-testid="zone">content</Zone>);
    expect(screen.getByTestId('zone').className).toMatch(/bg-agent-miya\/10/);
  });

  it('never includes a shadow or border class regardless of mood', () => {
    (['neutral', 'hector', 'miya'] as const).forEach((mood) => {
      const { unmount } = render(<Zone mood={mood} data-testid={`zone-${mood}`}>x</Zone>);
      const el = screen.getByTestId(`zone-${mood}`);
      expect(el.className).not.toMatch(/shadow/);
      expect(el.className).not.toMatch(/\bborder\b/);
      unmount();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/test/ui/Zone.test.tsx`
Expected: FAIL — `../../components/ui/Zone` does not exist yet.

- [ ] **Step 3: Implement the component**

```tsx
// src/components/ui/Zone.tsx
import React from 'react';

type ZoneMood = 'neutral' | 'hector' | 'miya';

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

Run: `npm run test -- src/test/ui/Zone.test.tsx`
Expected: PASS

- [ ] **Step 5: Export from the ui barrel**

In `src/components/ui/index.ts`, add:

```ts
export { Zone } from './Zone';
```

- [ ] **Step 6: Run the full ui test directory to confirm the barrel change didn't break anything**

Run: `npm run test -- src/test/ui/`
Expected: all pass, including the new `Zone.test.tsx`

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/Zone.tsx src/components/ui/index.ts src/test/ui/Zone.test.tsx
git commit -m "feat: add Zone primitive — borderless, no-shadow section background for the new design system"
```

---

## Self-Review

**Spec coverage:** This plan intentionally covers a subset of the Phase 1 spec — the bug fix (§4.1), naming collision (§4.2), multi-theme accent mechanism (§2.4), and the `Zone` primitive (§3) foundation piece. It does NOT cover `RoomShell`, `AgentShortcutRow`, empty/loading/error state components, the asset pipeline, or any per-page work — these are explicitly out of scope per this plan's own Scope note, not gaps to silently paper over. They need their own follow-up plans once their remaining open decisions (asset file locations, per-page Zone-vs-row choices) are made.

**Placeholder scan:** No TBD/TODO markers. Every code block is complete, runnable code, not a description of code. Every file path referenced (including the `operatorDashboard.test.jsx` path in Task 2 Step 6) was verified to exist against the real filesystem during planning, not guessed.

**Type consistency:** `AccentTheme` type (`'cyan' | 'green' | 'purple'`) is defined once in `useAccentTheme.ts` and used consistently in its own tests. `ZoneMood` (`'neutral' | 'hector' | 'miya'`) is defined once in `Zone.tsx` and used consistently in its tests. No cross-task naming drift.
