# Attention Aggregator Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `attentionAggregatorService.ts` — a new service that merges "needs attention" items from 4 real, already-existing sources (both real approval queues, Coach's fired signals, and connectors with a genuinely tripped circuit breaker) into one normalized, severity-sorted list — plus the dismissal mechanic for its non-actionable items. This is the backend half of `07-phase2-mission-control-spec.md`; the visual page rewiring that consumes it is a separate, follow-up plan.

**Architecture:** Two new, independent services, each with its own tests: `attentionAggregatorService.ts` (the merge/normalize/sort logic, pure read, `Promise.allSettled` for failure isolation) and `dismissedAttentionItemsService.ts` (a small localStorage-backed ring, mirroring `agentAuditService.ts`'s existing log/get/clear pattern exactly). Neither touches any UI.

**Tech Stack:** TypeScript, Vitest.

**Scope note:** Sentinel security findings were dropped from this build — verified that `sentinelSecurityService.ts`'s only real caller (`RightPanel.tsx`'s `runQuickScan`) calls `scanForThreats('', {})`, which can never match any pattern against an empty string, so there is currently no real Sentinel finding to surface. Logged as a separate real bug (Bug Log #4) rather than building a source around it. 4 sources are in this plan, not 5.

---

### Task 1: `dismissedAttentionItemsService.ts`

**Files:**
- Create: `src/services/dismissedAttentionItemsService.ts`
- Test: `src/test/services/dismissedAttentionItemsService.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/test/services/dismissedAttentionItemsService.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { dismissAttentionItem, isAttentionItemDismissed, clearDismissedAttentionItems } from '../../services/dismissedAttentionItemsService';

describe('dismissedAttentionItemsService', () => {
  beforeEach(() => {
    clearDismissedAttentionItems();
  });

  it('an item is not dismissed by default', () => {
    expect(isAttentionItemDismissed('coach-abc123')).toBe(false);
  });

  it('dismissing an item makes isAttentionItemDismissed return true for that exact id', () => {
    dismissAttentionItem('coach-abc123');
    expect(isAttentionItemDismissed('coach-abc123')).toBe(true);
  });

  it('dismissing one id does not affect a different id', () => {
    dismissAttentionItem('coach-abc123');
    expect(isAttentionItemDismissed('connector-github')).toBe(false);
  });

  it('persists across separate calls (not held only in memory)', () => {
    dismissAttentionItem('connector-github');
    // Re-check via a fresh call chain, simulating a page reload reading localStorage again
    expect(isAttentionItemDismissed('connector-github')).toBe(true);
  });

  it('clearDismissedAttentionItems removes all dismissals', () => {
    dismissAttentionItem('coach-abc123');
    clearDismissedAttentionItems();
    expect(isAttentionItemDismissed('coach-abc123')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/services/dismissedAttentionItemsService.test.ts`
Expected: FAIL — `../../services/dismissedAttentionItemsService` does not exist yet.

- [ ] **Step 3: Implement the service**

```ts
// src/services/dismissedAttentionItemsService.ts
import { durableGet, durableSet } from '../lib/durableStore';

const STORAGE_KEY = 'alphonso_dismissed_attention_items_v1';

// Mirrors agentAuditService.ts's log/get/clear shape exactly — a flat
// durable-backed list, here of dismissed AttentionItem ids rather than
// audit entries. An id stays dismissed until the underlying condition
// changes (a genuinely new id is generated upstream by
// attentionAggregatorService.ts) — this service itself has no concept of
// "the same problem recurring", it only tracks exact id strings.
function readDismissed(): string[] {
  try {
    const raw = durableGet(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function dismissAttentionItem(id: string): void {
  const dismissed = readDismissed();
  if (!dismissed.includes(id)) {
    dismissed.push(id);
    durableSet(STORAGE_KEY, JSON.stringify(dismissed));
  }
}

export function isAttentionItemDismissed(id: string): boolean {
  return readDismissed().includes(id);
}

export function clearDismissedAttentionItems(): void {
  durableSet(STORAGE_KEY, JSON.stringify([]));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/services/dismissedAttentionItemsService.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/dismissedAttentionItemsService.ts src/test/services/dismissedAttentionItemsService.test.ts
git commit -m "feat: add dismissedAttentionItemsService — dismissal tracking for non-actionable attention items"
```

---

### Task 2: `attentionAggregatorService.ts` — types, normalization, and the 4 real sources

**Files:**
- Create: `src/services/attentionAggregatorService.ts`
- Test: `src/test/services/attentionAggregatorService.test.ts`

Real APIs this task calls, verified during planning (not assumed):
- `listApprovalQueue(): AgentPacket[]` from `agentBusService.ts` — `AgentPacket { id, title, riskLevel, createdAtMs, ... }`. `approvePacket(packetId, approvedBy?)` / `rejectPacket(packetId, reason?)`.
- `listPendingApprovals(): PendingApprovalRow[]` from `services/approval/approvalService.js` — row shape `{ id, status, riskLevel, actionType, reason, summary, createdAt (ISO string), ... }`. `approveRequest(id)` / `rejectRequest(id)`.
- `getCoachHistory(): CoachHistoryEntry[]` from `coachHistoryService.ts` — `CoachHistoryEntry = CoachSignal = { id, severity: 'critical'|'warning'|'neutral'|'positive', message, detectedAtMs }`.
- `getAll(): Record<string, CircuitState>` and `isOpen(connectorId): boolean` from `connectorCircuitBreakerService.ts` — `CircuitState { state, failures, lastFailure: number | null }`. Connector display names from `DEFAULT_CONNECTORS` in `services/connectors/connectorRegistry.js` (`{ id, name, ... }[]`).

- [ ] **Step 1: Write the failing tests**

```ts
// src/test/services/attentionAggregatorService.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/agentBusService', () => ({
  listApprovalQueue: vi.fn(),
  approvePacket: vi.fn(),
  rejectPacket: vi.fn(),
}));
vi.mock('../../services/approval/approvalService.js', () => ({
  listPendingApprovals: vi.fn(),
  approveRequest: vi.fn(),
  rejectRequest: vi.fn(),
}));
vi.mock('../../services/coachHistoryService', () => ({
  getCoachHistory: vi.fn(),
}));
vi.mock('../../services/connectorCircuitBreakerService', () => ({
  getAll: vi.fn(),
  isOpen: vi.fn(),
}));
vi.mock('../../services/connectors/connectorRegistry.js', () => ({
  DEFAULT_CONNECTORS: [{ id: 'github', name: 'GitHub' }, { id: 'telegram', name: 'Telegram Bridge' }],
}));

import { listApprovalQueue, approvePacket, rejectPacket } from '../../services/agentBusService';
import { listPendingApprovals, approveRequest, rejectRequest } from '../../services/approval/approvalService.js';
import { getCoachHistory } from '../../services/coachHistoryService';
import { getAll, isOpen } from '../../services/connectorCircuitBreakerService';
import { getAttentionItems } from '../../services/attentionAggregatorService';

describe('attentionAggregatorService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (listApprovalQueue as any).mockReturnValue([]);
    (listPendingApprovals as any).mockReturnValue([]);
    (getCoachHistory as any).mockReturnValue([]);
    (getAll as any).mockReturnValue({});
    (isOpen as any).mockReturnValue(false);
  });

  it('normalizes an agentBusService approval with a real riskLevel passthrough', async () => {
    (listApprovalQueue as any).mockReturnValue([
      { id: 'pkt-1', title: 'Publish draft to Slack', riskLevel: 'high', createdAtMs: 1000 },
    ]);
    const items = await getAttentionItems();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 'approval-chat-pkt-1',
      source: 'approval-chat',
      severity: 'high',
      title: 'Publish draft to Slack',
      timestamp: 1000,
      actionable: true,
    });
  });

  it('wires onApprove/onReject for an agentBusService item to the real packet functions', async () => {
    (listApprovalQueue as any).mockReturnValue([
      { id: 'pkt-1', title: 'Publish draft to Slack', riskLevel: 'high', createdAtMs: 1000 },
    ]);
    const items = await getAttentionItems();
    items[0].onApprove!();
    expect(approvePacket).toHaveBeenCalledWith('pkt-1');
    items[0].onReject!();
    expect(rejectPacket).toHaveBeenCalledWith('pkt-1');
  });

  it('normalizes an approvalService.js approval, parsing its ISO createdAt into an epoch-ms timestamp', async () => {
    (listPendingApprovals as any).mockReturnValue([
      { id: 'approval-2', riskLevel: 'medium', actionType: 'deployment', reason: 'Deployment changes live environments.', summary: 'Deploy v2.7.1', createdAt: '2026-09-05T12:00:00.000Z' },
    ]);
    const items = await getAttentionItems();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 'approval-project-approval-2',
      source: 'approval-project',
      severity: 'medium',
      title: 'Deploy v2.7.1',
      actionable: true,
    });
    expect(items[0].timestamp).toBe(Date.parse('2026-09-05T12:00:00.000Z'));
  });

  it('wires onApprove/onReject for an approvalService.js item to the real request functions', async () => {
    (listPendingApprovals as any).mockReturnValue([
      { id: 'approval-2', riskLevel: 'medium', actionType: 'deployment', reason: 'r', summary: 'Deploy v2.7.1', createdAt: '2026-09-05T12:00:00.000Z' },
    ]);
    const items = await getAttentionItems();
    items[0].onApprove!();
    expect(approveRequest).toHaveBeenCalledWith('approval-2');
    items[0].onReject!();
    expect(rejectRequest).toHaveBeenCalledWith('approval-2');
  });

  it('maps a Coach critical signal to critical severity, non-actionable', async () => {
    (getCoachHistory as any).mockReturnValue([
      { id: 'coach-1', severity: 'critical', message: 'Repeated pipeline failure detected', detectedAtMs: 2000 },
    ]);
    const items = await getAttentionItems();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 'coach-coach-1',
      source: 'coach',
      severity: 'critical',
      title: 'Repeated pipeline failure detected',
      timestamp: 2000,
      actionable: false,
    });
    expect(items[0].onApprove).toBeUndefined();
  });

  it('maps a Coach warning signal to medium severity (not a native match, documented mapping)', async () => {
    (getCoachHistory as any).mockReturnValue([
      { id: 'coach-2', severity: 'warning', message: 'Approval theater detected', detectedAtMs: 2000 },
    ]);
    const items = await getAttentionItems();
    expect(items[0].severity).toBe('medium');
  });

  it('only includes a connector whose circuit is actually open, using DEFAULT_CONNECTORS for its display name', async () => {
    (getAll as any).mockReturnValue({
      github: { state: 'open', failures: 5, lastFailure: 3000 },
      telegram: { state: 'closed', failures: 0, lastFailure: null },
    });
    (isOpen as any).mockImplementation((id: string) => id === 'github');
    const items = await getAttentionItems();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 'connector-github',
      source: 'connector',
      severity: 'medium',
      title: 'GitHub',
      timestamp: 3000,
      actionable: false,
    });
  });

  it('sorts by severity first (critical > high > medium > low), then by timestamp descending within a tier', async () => {
    (listApprovalQueue as any).mockReturnValue([
      { id: 'low-old', title: 'Low, old', riskLevel: 'low', createdAtMs: 100 },
      { id: 'high-new', title: 'High, new', riskLevel: 'high', createdAtMs: 500 },
    ]);
    (getCoachHistory as any).mockReturnValue([
      { id: 'crit-1', severity: 'critical', message: 'Critical', detectedAtMs: 200 },
    ]);
    const items = await getAttentionItems();
    expect(items.map((i) => i.id)).toEqual([
      'coach-crit-1',
      'approval-chat-high-new',
      'approval-chat-low-old',
    ]);
  });

  it('isolates a failing source — one source throwing does not prevent the other 3 sources from returning items', async () => {
    (listApprovalQueue as any).mockImplementation(() => {
      throw new Error('agentBusService is down');
    });
    (getCoachHistory as any).mockReturnValue([
      { id: 'coach-1', severity: 'critical', message: 'Still works', detectedAtMs: 1000 },
    ]);
    const items = await getAttentionItems();
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('coach-coach-1');
  });

  it('returns an empty array when all 4 sources have nothing', async () => {
    const items = await getAttentionItems();
    expect(items).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/test/services/attentionAggregatorService.test.ts`
Expected: FAIL — `../../services/attentionAggregatorService` does not exist yet.

- [ ] **Step 3: Implement the service**

```ts
// src/services/attentionAggregatorService.ts
import { listApprovalQueue, approvePacket, rejectPacket } from './agentBusService';
import { listPendingApprovals, approveRequest, rejectRequest } from './approval/approvalService.js';
import { getCoachHistory } from './coachHistoryService';
import { getAll as getAllCircuits, isOpen as isCircuitOpen } from './connectorCircuitBreakerService';
import { DEFAULT_CONNECTORS } from './connectors/connectorRegistry.js';

export type AttentionSource = 'approval-chat' | 'approval-project' | 'coach' | 'connector';
export type AttentionSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface AttentionItem {
  id: string;
  source: AttentionSource;
  severity: AttentionSeverity;
  title: string;
  detail?: string;
  timestamp: number;
  actionable: boolean;
  onApprove?: () => void;
  onReject?: () => void;
}

const SEVERITY_ORDER: Record<AttentionSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

function fromChatApprovals(): AttentionItem[] {
  return listApprovalQueue().map((packet) => ({
    id: `approval-chat-${packet.id}`,
    source: 'approval-chat' as const,
    severity: (packet.riskLevel as AttentionSeverity) || 'medium',
    title: packet.title,
    timestamp: packet.createdAtMs,
    actionable: true,
    onApprove: () => approvePacket(packet.id),
    onReject: () => rejectPacket(packet.id),
  }));
}

function fromProjectApprovals(): AttentionItem[] {
  return listPendingApprovals().map((row: any) => ({
    id: `approval-project-${row.id}`,
    source: 'approval-project' as const,
    severity: (row.riskLevel as AttentionSeverity) || 'medium',
    title: row.summary || row.actionType,
    detail: row.reason,
    timestamp: Date.parse(row.createdAt),
    actionable: true,
    onApprove: () => approveRequest(row.id),
    onReject: () => rejectRequest(row.id),
  }));
}

// Coach's severity vocabulary ('critical'/'warning'/'neutral'/'positive') is
// not the same scale as the shared AttentionSeverity — only 'critical' and
// 'warning' ever actually fire (coachEngineService.ts's own gate), and
// 'warning' maps to 'medium' rather than inventing a 6th shared tier for one
// source. See 07-phase2-mission-control-spec.md's severity table.
function fromCoach(): AttentionItem[] {
  return getCoachHistory().map((signal) => ({
    id: `coach-${signal.id}`,
    source: 'coach' as const,
    severity: signal.severity === 'critical' ? 'critical' : 'medium',
    title: signal.message,
    timestamp: signal.detectedAtMs,
    actionable: false,
  }));
}

// Only a connector whose circuit is genuinely open (tripped by real recent
// failures) qualifies — never a merely-unconfigured/disabled connector. See
// 07-phase2-mission-control-spec.md's "Connector normalization fix" section
// for why this is a fixed bug, not a style choice.
function fromConnectors(): AttentionItem[] {
  const circuits = getAllCircuits();
  return Object.entries(circuits)
    .filter(([id]) => isCircuitOpen(id))
    .map(([id, state]) => {
      const connector = DEFAULT_CONNECTORS.find((c: { id: string }) => c.id === id);
      return {
        id: `connector-${id}`,
        source: 'connector' as const,
        severity: 'medium' as const,
        title: connector ? connector.name : id,
        timestamp: state.lastFailure ?? Date.now(),
        actionable: false,
      };
    });
}

async function safeCollect(fn: () => AttentionItem[]): Promise<AttentionItem[]> {
  try {
    return fn();
  } catch {
    return [];
  }
}

export async function getAttentionItems(): Promise<AttentionItem[]> {
  const results = await Promise.allSettled([
    safeCollect(fromChatApprovals),
    safeCollect(fromProjectApprovals),
    safeCollect(fromCoach),
    safeCollect(fromConnectors),
  ]);

  const items = results.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));

  return items.sort((a, b) => {
    const severityDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (severityDiff !== 0) return severityDiff;
    return b.timestamp - a.timestamp;
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/test/services/attentionAggregatorService.test.ts`
Expected: PASS, all 10 tests

- [ ] **Step 5: Run the full targeted test suite plus a full-project typecheck**

Run: `npx vitest run src/test/services/attentionAggregatorService.test.ts src/test/services/dismissedAttentionItemsService.test.ts`
Expected: PASS

Run: `npx tsc --noEmit`
Expected: clean, zero output (per this session's Phase 1 experience — this step is not optional, it caught two real bugs the test steps alone missed)

- [ ] **Step 6: Commit**

```bash
git add src/services/attentionAggregatorService.ts src/test/services/attentionAggregatorService.test.ts
git commit -m "feat: add attentionAggregatorService — merges 4 real sources into one normalized, severity-sorted list"
```

---

## Self-Review

**Spec coverage:** Covers `07-phase2-mission-control-spec.md`'s Architecture, Data model, Severity normalization, Sorting, and all 4 self-critique fixes (connector normalization bug, no-fresh-expensive-ops for connectors, failure isolation, dismissal mechanic). Does NOT cover: the Mission Control page itself, its visual layer, empty-state UI, or the breathing-glow agent strip — those are the follow-up plan once this backend exists. Sentinel is deliberately absent (see Scope note above), not a coverage gap.

**Placeholder scan:** No TBD/TODO. Every function referenced (`listApprovalQueue`, `approvePacket`, `rejectPacket`, `listPendingApprovals`, `approveRequest`, `rejectRequest`, `getCoachHistory`, `getAll`, `isOpen`, `DEFAULT_CONNECTORS`) was verified against the real source files during planning, not assumed.

**Type consistency:** `AttentionItem`/`AttentionSource`/`AttentionSeverity` are defined once in Task 2's implementation and used identically in Task 2's own tests. `dismissAttentionItem`/`isAttentionItemDismissed`/`clearDismissedAttentionItems` names are consistent between Task 1's test and implementation. The two services are independent (Task 2 does not import Task 1's dismissal service — dismissal filtering is explicitly a page-level concern per the spec, applied by whatever consumes `getAttentionItems()`, not baked into the aggregator itself).
