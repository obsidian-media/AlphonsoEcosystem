# AgentStatusStrip Portrait Variant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, per this session's standing "no subagents" instruction). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the real, already-working `AgentStatusStrip.tsx` (currently dot-pill only, used today in `Sidebar.tsx`) with a `variant="portraits"` mode — all 9 agents shown via their real portrait (`getAgentMascotPath`), idle agents dimmed, active agents get a breathing-glow animation (Framer Motion, per Phase 1's convention) — reusing the component's existing, real 30-second activity-detection logic rather than building a separate system. Default behavior (`variant="dots"`, the current unnamed default) is unchanged for every existing caller.

**Architecture:** One component, one shared activity-derivation effect, two render branches selected by a new `variant` prop. No new service — `listAgentActivity()` is already the real, correct data source this component already uses.

**Tech Stack:** React 18 + TypeScript, Framer Motion (already a dependency, already used in `Sidebar.tsx`), Vitest + React Testing Library.

---

### Task 1: Add the `variant` prop and portrait render path

**Files:**
- Modify: `src/components/AgentStatusStrip.tsx`
- Test: `src/test/components/AgentStatusStrip.test.tsx` (new — no prior test existed for this component)

Real APIs this task calls, verified during planning:
- `getAgentMascotPath(agentId): string | null` and `getAgentInitials(nameOrId): string` from `agentVisualService.ts`.
- `listAgentProfiles(): Profile[]` from `agents/agentRegistry.js` — each profile has `{ id, name, ... }`.
- The component's own existing `deriveActiveAgents()` closure (30s window, unchanged) — portraits mode reuses its output, does not reimplement activity detection.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/test/components/AgentStatusStrip.test.tsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgentStatusStrip } from '../../components/AgentStatusStrip';

vi.mock('../../agents/agentRegistry.js', () => ({
  listAgentProfiles: () => [
    { id: 'alphonso', name: 'Alphonso' },
    { id: 'jose', name: 'Jose' },
    { id: 'hector', name: 'Hector' },
  ],
}));

describe('AgentStatusStrip — default (dots) variant, unchanged', () => {
  it('renders nothing when there are no active agents and useAutoFeed is off', () => {
    const { container } = render(<AgentStatusStrip useAutoFeed={false} activeAgents={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a dot pill per active agent when variant is omitted (default)', () => {
    render(<AgentStatusStrip useAutoFeed={false} activeAgents={[{ name: 'jose', status: 'running' }]} />);
    expect(screen.getByText('jose')).toBeTruthy();
  });
});

describe('AgentStatusStrip — portraits variant', () => {
  it('renders all agents from listAgentProfiles, not just active ones', () => {
    render(<AgentStatusStrip variant="portraits" useAutoFeed={false} activeAgents={[{ name: 'jose', status: 'running' }]} />);
    expect(screen.getByAltText('Alphonso')).toBeTruthy();
    expect(screen.getByAltText('Jose')).toBeTruthy();
    expect(screen.getByAltText('Hector')).toBeTruthy();
  });

  it('marks the active agent distinctly from idle ones via a data attribute', () => {
    render(<AgentStatusStrip variant="portraits" useAutoFeed={false} activeAgents={[{ name: 'jose', status: 'running' }]} />);
    expect(screen.getByTestId('agent-portrait-jose').getAttribute('data-active')).toBe('true');
    expect(screen.getByTestId('agent-portrait-alphonso').getAttribute('data-active')).toBe('false');
  });

  it('renders nothing extra when zero agents are active — idle agents still show, just all dimmed', () => {
    render(<AgentStatusStrip variant="portraits" useAutoFeed={false} activeAgents={[]} />);
    expect(screen.getByTestId('agent-portrait-alphonso').getAttribute('data-active')).toBe('false');
    expect(screen.getByTestId('agent-portrait-jose').getAttribute('data-active')).toBe('false');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/test/components/AgentStatusStrip.test.tsx --pool=threads`
Expected: FAIL — `variant` prop and portrait rendering don't exist yet; `listAgentProfiles` import isn't wired in yet either.

- [ ] **Step 3: Implement**

Replace `src/components/AgentStatusStrip.tsx` entirely with:

```tsx
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { listAgentActivity } from '../services/agentActivityService.js';
import { listAgentProfiles } from '../agents/agentRegistry.js';
import { getAgentMascotPath, getAgentInitials } from '../services/agentVisualService';

interface Agent {
  name: string;
  status: string;
}

interface AgentStatusStripProps {
  activeAgents?: Agent[];
  compact?: boolean;
  useAutoFeed?: boolean;
  onAgentsChange?: (agents: Agent[]) => void;
  variant?: 'dots' | 'portraits';
}

const AGENT_COLOR: Record<string, string> = {
  alphonso: 'var(--agent-alphonso)',
  jose:     'var(--agent-jose)',
  hector:   'var(--agent-hector)',
  miya:     'var(--agent-miya)',
  maria:    'var(--agent-maria)',
  marcus:   'var(--agent-marcus)',
  echo:     'var(--agent-echo)',
  sentinel: 'var(--agent-sentinel)',
  nova:     'var(--agent-nova)',
};

const AGENT_GLOW: Record<string, string> = {
  alphonso: 'var(--agent-alphonso-glow)',
  jose:     'var(--agent-jose-glow)',
  hector:   'var(--agent-hector-glow)',
  miya:     'var(--agent-miya-glow)',
  maria:    'var(--agent-maria-glow)',
  marcus:   'var(--agent-marcus-glow)',
  echo:     'var(--agent-echo-glow)',
  sentinel: 'var(--agent-sentinel-glow)',
  nova:     'var(--agent-nova-glow)',
};

export function AgentStatusStrip({
  activeAgents: activeAgentsProp,
  compact = false,
  useAutoFeed = true,
  onAgentsChange,
  variant = 'dots'
}: AgentStatusStripProps) {
  const [derivedAgents, setDerivedAgents] = useState<Agent[]>([]);

  useEffect(() => {
    if (!useAutoFeed) return;

    function deriveActiveAgents(): Agent[] {
      const WINDOW_MS = 30_000;
      const now = Date.now();
      const activity = listAgentActivity();
      const recentMap = new Map<string, number>();
      for (const entry of activity) {
        if (now - entry.ts <= WINDOW_MS) {
          recentMap.set(entry.agent, entry.ts);
        }
      }
      return Array.from(recentMap.keys()).map((name) => ({ name, status: 'running' }));
    }

    const update = () => {
      const agents = deriveActiveAgents();
      setDerivedAgents(agents);
      onAgentsChange?.(agents);
    };

    update();
    const id = setInterval(update, 3000);
    return () => clearInterval(id);
  }, [useAutoFeed, onAgentsChange]);

  const activeAgents = useAutoFeed ? derivedAgents : (activeAgentsProp ?? []);

  if (variant === 'portraits') {
    const activeIds = new Set(activeAgents.map((a) => a.name.toLowerCase()));
    return (
      <div className="flex gap-4 overflow-x-auto">
        {listAgentProfiles().map((profile: { id: string; name: string }) => {
          const isActive = activeIds.has(profile.id);
          const mascot = getAgentMascotPath(profile.id);
          const color = AGENT_COLOR[profile.id] ?? 'var(--accent)';
          const glow = AGENT_GLOW[profile.id] ?? 'var(--accent-glow)';
          return (
            <div key={profile.id} className="relative flex flex-col items-center gap-1 flex-shrink-0" data-testid={`agent-portrait-${profile.id}`} data-active={isActive}>
              {isActive && (
                <motion.div
                  className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full pointer-events-none"
                  style={{ width: 62, height: 62, background: `radial-gradient(circle, ${glow}, transparent 65%)` }}
                  animate={{ opacity: [0.6, 1, 0.6], scale: [0.95, 1.2, 0.95] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                />
              )}
              {mascot ? (
                <img
                  src={mascot}
                  alt={profile.name}
                  className={`relative z-10 h-11 w-11 rounded-full object-cover border-2 border-[var(--surface-0)] ${isActive ? '' : 'opacity-40 grayscale'}`}
                />
              ) : (
                <div
                  className={`relative z-10 h-11 w-11 rounded-full flex items-center justify-center text-xs font-bold border-2 border-[var(--surface-0)] ${isActive ? '' : 'opacity-40 grayscale'}`}
                  style={{ backgroundColor: color, color: 'var(--surface-0)' }}
                >
                  {getAgentInitials(profile.name)}
                </div>
              )}
              <span className="text-[9px] text-[var(--text-4)]">{profile.name}</span>
            </div>
          );
        })}
      </div>
    );
  }

  if (!activeAgents || activeAgents.length === 0) return null;

  return (
    <div className={`flex flex-wrap ${compact ? 'gap-1' : 'gap-2'}`}>
      {activeAgents.map((agent) => {
        const key = agent.name.toLowerCase();
        const color = AGENT_COLOR[key] ?? 'var(--accent)';
        const glow = AGENT_GLOW[key] ?? 'var(--accent-glow)';
        return (
          <div
            key={agent.name}
            className={`flex items-center gap-1.5 bg-[var(--surface-3)] border border-[var(--border)] rounded-full ${compact ? 'px-2 py-0.5' : 'px-3 py-1'}`}
          >
            <span className="relative flex h-2 w-2">
              {agent.status === 'running' && (
                <span
                  className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                  style={{ backgroundColor: color, boxShadow: `0 0 6px ${glow}` }}
                />
              )}
              <span
                className="relative inline-flex rounded-full h-2 w-2"
                style={{ backgroundColor: color }}
              />
            </span>
            {!compact && (
              <span className="text-[var(--text-2)] font-medium text-sm">{agent.name}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/test/components/AgentStatusStrip.test.tsx --pool=threads`
Expected: PASS, all 5 tests

- [ ] **Step 5: Run the full typecheck**

Run: `npx tsc --noEmit`
Expected: clean, zero output

- [ ] **Step 6: Commit**

```bash
git add src/components/AgentStatusStrip.tsx src/test/components/AgentStatusStrip.test.tsx
git commit -m "feat: add portraits variant to AgentStatusStrip, reusing its real 30s activity detection — no separate strip built for Mission Control"
```

---

## Self-Review

**Spec coverage:** Delivers Draft A's "breathing-glow agent strip" concept for real, reusing the actual correct activity-detection logic (30s window) instead of the illustrative, undecided threshold this session's mockups used. Default `dots` behavior for every existing caller (`Sidebar.tsx`) is completely unchanged — verified no existing call site passes `variant` today, so nothing regresses.

**Placeholder scan:** No TBD/TODO. Every function (`getAgentMascotPath`, `getAgentInitials`, `listAgentProfiles`, `listAgentActivity`) verified against real source during planning.

**Type consistency:** `variant?: 'dots' | 'portraits'` matches its two actual render branches exactly; no third undefined state.
