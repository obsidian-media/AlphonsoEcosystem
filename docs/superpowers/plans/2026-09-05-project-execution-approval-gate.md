# Project Execution Mode: Real Approval Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Project Execution Mode's three dead approval widgets with one real gate: a generalized `ApprovalPanel` shared with the real Jose pipeline, wired into a new "Approval" tab that actually blocks the Results tab until every gate for the current run is resolved.

**Architecture:** `ApprovalPanel.tsx` stops hardcoding `agentBusService` and instead takes `onApprove`/`onReject`/`getItemDetail` as props, keyed on a normalized `itemId` field. `approvalService.js` gets two additive trace-filtered read helpers. `ProjectExecutionMode.tsx` gets a new `'approval'` tab wired into `runWorkshop()`'s post-computation branch, and the Results tab button becomes `disabled` while any gate for the current trace is still pending — closing the click-through the auto-nav-only fix would have left open. The Setup tab's inert 4-button toggle and the read-only `ApprovalGatePanel.tsx` card are deleted.

**Tech Stack:** React + TypeScript (`.tsx`) for components, plain JS for `services/approval/approvalService.js` (unmigrated, out of scope per spec), Vitest + `@testing-library/react` for tests.

**Spec:** `docs/superpowers/specs/2026-09-05-project-execution-approval-gate-design.md` (PR #224, patched through 5 self-review fixes — read it before starting; this plan implements it exactly, including all five fixes).

---

## Task 1: `approvalService.js` — add trace-filtered read helpers

**Files:**
- Modify: `src/services/approval/approvalService.js`
- Test: `src/test/services/approvalService.test.js`

The file currently exports `listPendingApprovals()` (filters to `status === 'pending'`) and `listAllApprovals()` (no filter). Both stay unchanged. Add two new exports that filter either of those down to one trace/run, using each row's `metadata.traceId` (already set on every row created via `createApprovalRequest({ metadata: { traceId, ... } })` in `agentRunnerService.js`).

- [ ] **Step 1: Write the failing tests**

Open `src/test/services/approvalService.test.js`. Add `listPendingApprovalsByTrace` and `listApprovalsByTrace` to the destructured import at the top of the file:

```js
const {
  requiresApproval,
  getApprovalReason,
  createApprovalRequest,
  requireApproval,
  approveRequest,
  rejectRequest,
  listPendingApprovals,
  listAllApprovals,
  listPendingApprovalsByTrace,
  listApprovalsByTrace
} = await import('../../services/approval/approvalService');
```

Add a new `describe` block anywhere after the existing ones (e.g. right before the file's closing). This file's `localStorageMock.getItem` is a static per-test mock (not backed by a real in-memory store — `setItem` is a no-op `vi.fn()`), so — matching the file's own established convention (see the existing `listPendingApprovals` tests above) — seed fixture rows directly via `getItem.mockReturnValue(...)` rather than building state through `createApprovalRequest` + a later read:

```js
describe('listPendingApprovalsByTrace', () => {
  it('returns only pending items matching the given traceId', () => {
    localStorageMock.getItem.mockReturnValue(JSON.stringify([
      { id: 'a', status: 'pending', actionType: 'file_write', metadata: { traceId: 'trace-a' } },
      { id: 'b', status: 'pending', actionType: 'deployment', metadata: { traceId: 'trace-b' } }
    ]));
    const rows = listPendingApprovalsByTrace('trace-a');
    expect(rows).toHaveLength(1);
    expect(rows[0].actionType).toBe('file_write');
  });

  it('excludes approved/rejected items even if the trace matches', () => {
    localStorageMock.getItem.mockReturnValue(JSON.stringify([
      { id: 'c', status: 'approved', actionType: 'file_write', metadata: { traceId: 'trace-c' } }
    ]));
    expect(listPendingApprovalsByTrace('trace-c')).toHaveLength(0);
  });

  it('returns an empty array for an unknown traceId', () => {
    localStorageMock.getItem.mockReturnValue(JSON.stringify([
      { id: 'd', status: 'pending', actionType: 'file_write', metadata: { traceId: 'trace-d' } }
    ]));
    expect(listPendingApprovalsByTrace('does-not-exist')).toEqual([]);
  });
});

describe('listApprovalsByTrace', () => {
  it('returns matching-trace items regardless of status', () => {
    localStorageMock.getItem.mockReturnValue(JSON.stringify([
      { id: 'e', status: 'rejected', actionType: 'deployment', metadata: { traceId: 'trace-e' } }
    ]));
    const rows = listApprovalsByTrace('trace-e');
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('rejected');
  });

  it('returns an empty array for an unknown traceId', () => {
    localStorageMock.getItem.mockReturnValue(JSON.stringify([
      { id: 'f', status: 'pending', actionType: 'file_write', metadata: { traceId: 'trace-f' } }
    ]));
    expect(listApprovalsByTrace('does-not-exist')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/test/services/approvalService.test.js`
Expected: FAIL — `listPendingApprovalsByTrace is not a function` (and same for `listApprovalsByTrace`).

- [ ] **Step 3: Implement the two exports**

In `src/services/approval/approvalService.js`, add after the existing `listAllApprovals` export at the bottom of the file:

```js
export function listPendingApprovalsByTrace(traceId) {
  return listPendingApprovals().filter((r) => r.metadata?.traceId === traceId);
}

export function listApprovalsByTrace(traceId) {
  return listAllApprovals().filter((r) => r.metadata?.traceId === traceId);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/test/services/approvalService.test.js`
Expected: PASS (all tests in the file, including the pre-existing ones).

- [ ] **Step 5: Commit**

```bash
git add src/services/approval/approvalService.js src/test/services/approvalService.test.js
git commit -m "feat(approval): add trace-filtered read helpers to approvalService"
```

---

## Task 2: `ApprovalPanel.tsx` — generalize props, drop the hardcoded `agentBusService` import

**Files:**
- Modify: `src/components/ApprovalPanel.tsx`
- Test: `src/test/ApprovalPanel.test.jsx` (full rewrite)

Today the component imports `approvePacket`/`rejectPacket`/`getPacketById` from `agentBusService` directly, hardcodes `packetId` as the item key, and hardcodes the reason strings `'chatview-inline'` / `'Rejected from chat inline approval'` inside its own click handlers. This task removes all three couplings: the component becomes a pure props-driven view over a normalized `itemId`, taking `onApprove`/`onReject`/`getItemDetail` as props. The two hardcoded reason strings move to `ChatView.tsx`'s call site in Task 3 — they are **not** reproduced inside the component at all after this task.

- [ ] **Step 1: Write the failing tests (full rewrite of the test file)**

Replace the entire contents of `src/test/ApprovalPanel.test.jsx` with:

```jsx
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ApprovalPanel } from '../components/ApprovalPanel.jsx';

const ONE_PENDING = [
  { itemId: 'item-1', agent: 'marcus', actionType: 'external_publish', riskLevel: 'high', reason: 'External publish requires approval' }
];

const TWO_PENDING = [
  { itemId: 'item-1', agent: 'marcus', actionType: 'external_publish', riskLevel: 'high', reason: 'External publish' },
  { itemId: 'item-2', agent: 'miya', actionType: 'creative_upload', riskLevel: 'medium', reason: 'Creative package upload' }
];

describe('ApprovalPanel', () => {
  let onApprove;
  let onReject;

  beforeEach(() => {
    onApprove = vi.fn();
    onReject = vi.fn();
  });

  it('renders nothing when no pending approvals', () => {
    const { container } = render(<ApprovalPanel pendingApprovals={[]} onApprove={onApprove} onReject={onReject} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows item count and pending badge', () => {
    render(<ApprovalPanel pendingApprovals={ONE_PENDING} commandId="cmd-1" onApprove={onApprove} onReject={onReject} />);
    expect(screen.getByText('1 item awaiting approval')).toBeTruthy();
  });

  it('renders agent name and action type for each item', () => {
    render(<ApprovalPanel pendingApprovals={TWO_PENDING} commandId="cmd-1" onApprove={onApprove} onReject={onReject} />);
    expect(screen.getByText('marcus')).toBeTruthy();
    expect(screen.getByText('miya')).toBeTruthy();
  });

  it('calls the injected onApprove with the item id when Approve is clicked', () => {
    render(<ApprovalPanel pendingApprovals={ONE_PENDING} commandId="cmd-1" onApprove={onApprove} onReject={onReject} />);
    fireEvent.click(screen.getByRole('button', { name: /Approve/i }));
    expect(onApprove).toHaveBeenCalledWith('item-1');
  });

  it('calls the injected onReject with the item id when Deny is clicked', () => {
    render(<ApprovalPanel pendingApprovals={ONE_PENDING} commandId="cmd-1" onApprove={onApprove} onReject={onReject} />);
    fireEvent.click(screen.getByRole('button', { name: /Deny/i }));
    expect(onReject).toHaveBeenCalledWith('item-1');
  });

  it('shows Continue button after all items are resolved', () => {
    render(<ApprovalPanel pendingApprovals={ONE_PENDING} commandId="cmd-1" onApprove={onApprove} onReject={onReject} />);
    fireEvent.click(screen.getByRole('button', { name: /Approve/i }));
    expect(screen.getByRole('button', { name: /Continue/i })).toBeTruthy();
  });

  it('does not show Continue button when items are unresolved', () => {
    render(<ApprovalPanel pendingApprovals={TWO_PENDING} commandId="cmd-1" onApprove={onApprove} onReject={onReject} />);
    expect(screen.queryByRole('button', { name: /Continue/i })).toBeNull();
  });

  it('calls onAllResolved with results keyed by itemId when Continue is clicked', () => {
    const onAllResolved = vi.fn();
    render(
      <ApprovalPanel
        pendingApprovals={ONE_PENDING}
        commandId="cmd-1"
        onApprove={onApprove}
        onReject={onReject}
        onAllResolved={onAllResolved}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Approve/i }));
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));
    expect(onAllResolved).toHaveBeenCalledWith('cmd-1', { 'item-1': 'approved' });
  });

  it('shows risk badge for high-risk items', () => {
    render(<ApprovalPanel pendingApprovals={ONE_PENDING} commandId="cmd-1" onApprove={onApprove} onReject={onReject} />);
    expect(screen.getByText('High')).toBeTruthy();
  });

  it('shows reason text when provided', () => {
    render(<ApprovalPanel pendingApprovals={ONE_PENDING} commandId="cmd-1" onApprove={onApprove} onReject={onReject} />);
    expect(screen.getByText('External publish requires approval')).toBeTruthy();
  });

  it('surfaces an inline error and does not mark the item resolved if onApprove throws', () => {
    onApprove.mockImplementation(() => { throw new Error('boom'); });
    render(<ApprovalPanel pendingApprovals={ONE_PENDING} commandId="cmd-1" onApprove={onApprove} onReject={onReject} />);
    fireEvent.click(screen.getByRole('button', { name: /Approve/i }));
    expect(screen.getByText('Approve failed: boom')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Continue/i })).toBeNull();
  });

  it('surfaces an inline error and does not mark the item resolved if onReject throws', () => {
    onReject.mockImplementation(() => { throw new Error('boom'); });
    render(<ApprovalPanel pendingApprovals={ONE_PENDING} commandId="cmd-1" onApprove={onApprove} onReject={onReject} />);
    fireEvent.click(screen.getByRole('button', { name: /Deny/i }));
    expect(screen.getByText('Reject failed: boom')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Continue/i })).toBeNull();
  });

  it('uses the item riskLevel directly (no getItemDetail call) when riskLevel is already present', () => {
    const getItemDetail = vi.fn();
    render(
      <ApprovalPanel pendingApprovals={ONE_PENDING} onApprove={onApprove} onReject={onReject} getItemDetail={getItemDetail} />
    );
    expect(getItemDetail).not.toHaveBeenCalled();
    expect(screen.getByText('High')).toBeTruthy();
  });

  it('falls back to getItemDetail + inferred risk when the item has no riskLevel', () => {
    const NO_RISK_ITEM = [{ itemId: 'pkt-1', reason: 'External publish requires approval' }];
    const getItemDetail = vi.fn(() => ({ agent: 'marcus', actionType: 'external_publish', riskLevel: 'high' }));
    render(
      <ApprovalPanel pendingApprovals={NO_RISK_ITEM} onApprove={onApprove} onReject={onReject} getItemDetail={getItemDetail} />
    );
    expect(getItemDetail).toHaveBeenCalledWith('pkt-1');
    expect(screen.getByText('marcus')).toBeTruthy();
    expect(screen.getByText('High')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/test/ApprovalPanel.test.jsx`
Expected: FAIL — the component still requires no `onApprove`/`onReject` props and reads `packetId`, so items render with `agent: 'unknown'` / no risk badge, and clicking Approve calls the real (now-unmocked, since the test file no longer mocks `agentBusService`) `approvePacket` instead of the injected `onApprove`, and the props-shape assertions fail.

- [ ] **Step 3: Rewrite the component**

Replace the entire contents of `src/components/ApprovalPanel.tsx` with:

```tsx
import React from 'react';
import { useState } from 'react';
import { Shield, ShieldAlert, Check, X } from 'lucide-react';

const RISK_STYLES: Record<string, { badge: string; dot: string; label: string }> = {
  high: { badge: 'border-red-500/40 bg-red-500/10 text-red-300', dot: 'bg-red-400', label: 'High' },
  medium: { badge: 'border-amber-500/40 bg-amber-500/10 text-amber-300', dot: 'bg-amber-400', label: 'Medium' },
  low: { badge: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300', dot: 'bg-emerald-400', label: 'Low' }
};

export interface PendingApprovalItem {
  itemId: string;
  actionType?: string;
  reason?: string;
  previewContent?: string | null;
  agent?: string;
  riskLevel?: string;
}

export interface ApprovalItemDetail {
  agent?: string;
  actionType?: string;
  riskLevel?: string;
}

interface ResolvedApprovalItem {
  itemId: string;
  agent: string;
  actionType: string;
  riskLevel: string;
  reason: string;
  previewContent: string | null;
}

function inferRisk(detail: ApprovalItemDetail) {
  const risk = String(detail?.riskLevel || '').toLowerCase();
  if (risk === 'high' || risk === 'critical') return 'high';
  if (risk === 'low') return 'low';
  const action = String(detail?.actionType || '').toLowerCase();
  if (/external_publish|upload|post|delete|destroy/.test(action)) return 'high';
  if (/read|list|check|verify/.test(action)) return 'low';
  return 'medium';
}

function resolveItem(
  item: PendingApprovalItem,
  getItemDetail?: (itemId: string) => ApprovalItemDetail | null
): ResolvedApprovalItem {
  // Project Execution's ApprovalRequest items already carry riskLevel directly --
  // no indirection needed. ChatView's items don't, so fall back to getItemDetail
  // (which resolves a real AgentPacket's assignment) + risk inference.
  const detail = item.riskLevel ? null : (getItemDetail?.(item.itemId) ?? null);
  const merged: ApprovalItemDetail = {
    agent: item.agent ?? detail?.agent,
    actionType: item.actionType ?? detail?.actionType,
    riskLevel: item.riskLevel ?? detail?.riskLevel
  };
  return {
    itemId: item.itemId,
    agent: merged.agent || 'unknown',
    actionType: merged.actionType || 'unknown',
    riskLevel: item.riskLevel || inferRisk(merged),
    reason: item.reason || '',
    previewContent: item.previewContent || null
  };
}

interface Props {
  pendingApprovals?: PendingApprovalItem[];
  commandId?: string;
  onApprove: (itemId: string) => void;
  onReject: (itemId: string, reason?: string) => void;
  getItemDetail?: (itemId: string) => ApprovalItemDetail | null;
  onAllResolved?: (commandId: string | undefined, resolved: Record<string, string>) => void;
}

export function ApprovalPanel({ pendingApprovals = [], commandId, onApprove, onReject, getItemDetail, onAllResolved }: Props) {
  const [resolved, setResolved] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const items = pendingApprovals.map((item) => resolveItem(item, getItemDetail));
  const allResolved = items.length > 0 && items.every((item) => resolved[item.itemId]);

  const handleApprove = (itemId: string) => {
    try {
      onApprove(itemId);
      setResolved((prev) => ({ ...prev, [itemId]: 'approved' }));
      setError(null);
    } catch (err) {
      setError(`Approve failed: ${String((err as Error)?.message || err)}`);
    }
  };

  const handleReject = (itemId: string) => {
    try {
      onReject(itemId);
      setResolved((prev) => ({ ...prev, [itemId]: 'rejected' }));
      setError(null);
    } catch (err) {
      setError(`Reject failed: ${String((err as Error)?.message || err)}`);
    }
  };

  const handleContinue = () => {
    onAllResolved?.(commandId, resolved);
  };

  if (items.length === 0) return null;

  return (
    <div className="border border-amber-500/20 bg-amber-500/5 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Shield className="w-4 h-4 text-amber-400" />
        <span className="text-xs font-bold uppercase tracking-widest text-amber-400">
          {items.length} item{items.length !== 1 ? 's' : ''} awaiting approval
        </span>
      </div>

      {error && (
        <div className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <div className="space-y-2">
        {items.map((item) => {
          const status = resolved[item.itemId];
          const risk = RISK_STYLES[item.riskLevel] || RISK_STYLES.medium;
          const RiskIcon = item.riskLevel === 'high' ? ShieldAlert : Shield;

          return (
            <div
              key={item.itemId}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${
                status === 'approved'
                  ? 'border-emerald-500/30 bg-emerald-500/5'
                  : status === 'rejected'
                    ? 'border-red-500/30 bg-red-500/5 opacity-60'
                    : 'border-white/10 bg-zinc-800/40'
              }`}
            >
              <RiskIcon className={`w-3.5 h-3.5 shrink-0 ${item.riskLevel === 'high' ? 'text-red-400' : 'text-amber-400'}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-zinc-200 truncate">{item.agent}</span>
                  <span className="text-[10px] text-zinc-500 truncate">{item.actionType}</span>
                </div>
                {item.reason && (
                  <div className="text-[10px] text-zinc-500 truncate mt-0.5">{item.reason}</div>
                )}
                {item.previewContent && (
                  <div className="mt-2 p-2 rounded-lg bg-zinc-900/60 border border-white/[0.06]">
                    <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-600 mb-1">Preview</div>
                    <div className="text-[10px] text-zinc-400 whitespace-pre-wrap leading-relaxed">{item.previewContent}</div>
                  </div>
                )}
              </div>
              <div className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest ${risk.badge}`}>
                <span className={`h-1 w-1 rounded-full ${risk.dot}`} />
                {risk.label}
              </div>
              {status ? (
                <div className={`flex items-center gap-1 text-[10px] font-bold ${status === 'approved' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {status === 'approved' ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                  {status === 'approved' ? 'Approved' : 'Denied'}
                </div>
              ) : (
                <div className="flex gap-1.5">
                  <button
                    onClick={() => handleReject(item.itemId)}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest text-zinc-400 bg-zinc-800 border border-white/10 hover:bg-zinc-700 transition-colors"
                  >
                    Deny
                  </button>
                  <button
                    onClick={() => handleApprove(item.itemId)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest text-white transition-colors ${
                      item.riskLevel === 'high'
                        ? 'bg-red-700 hover:bg-red-600'
                        : 'bg-amber-600 hover:bg-amber-500'
                    }`}
                  >
                    Approve
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {allResolved && (
        <div className="flex justify-end pt-1">
          <button
            onClick={handleContinue}
            className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest text-white bg-indigo-600 hover:bg-indigo-500 transition-colors shadow-lg"
          >
            Continue
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/test/ApprovalPanel.test.jsx`
Expected: PASS (all 14 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/ApprovalPanel.tsx src/test/ApprovalPanel.test.jsx
git commit -m "refactor(approval): generalize ApprovalPanel via props, drop hardcoded agentBusService coupling"
```

---

## Task 3: `ChatView.tsx` — update the one real production call site

**Files:**
- Modify: `src/components/ChatView.tsx`
- Test: `src/test/ChatView.test.jsx`

`ApprovalPanel` no longer imports `agentBusService` itself, so `ChatView.tsx` must supply `onApprove`/`onReject`/`getItemDetail` explicitly, and map its `packetId`-keyed pending items to the new `itemId` field. The two reason strings that used to live inside `ApprovalPanel` (`'chatview-inline'`, `'Rejected from chat inline approval'`) move here, preserving ChatView's exact prior on-disk behavior.

- [ ] **Step 1: Write the failing regression test**

In `src/test/ChatView.test.jsx`, replace the existing dumb stub mock:

```jsx
vi.mock('../components/ApprovalPanel', () => ({
  ApprovalPanel: () => <div data-testid="approval-panel" />
}));
```

with a prop-capturing mock (uses `vi.hoisted` so the capture object is visible both inside the mock factory and in test bodies below):

```jsx
const approvalPanelCalls = vi.hoisted(() => ({ props: null }));

vi.mock('../components/ApprovalPanel', () => ({
  ApprovalPanel: (props) => {
    approvalPanelCalls.props = props;
    return <div data-testid="approval-panel" />;
  }
}));
```

Add a mock for `agentBusService` right after the existing `joseExecutionEngineService` mock block (around line 47):

```jsx
vi.mock('../services/agentBusService', () => ({
  approvePacket: vi.fn(),
  rejectPacket: vi.fn(),
  getPacketById: vi.fn()
}));
```

Add the corresponding import near the other controlled-mock imports (next to the existing `import { generateOllamaChatStream } from '../lib/ollama';` block):

```jsx
import { isJoseIntakeCommand, runJoseCommandExecutionPipeline } from '../services/joseExecutionEngineService';
import { approvePacket, rejectPacket, getPacketById } from '../services/agentBusService';
```

Add a new test in the `describe('ChatView', ...)` block:

```jsx
it('maps pendingApprovals to itemId and wires approve/reject/detail callbacks for ApprovalPanel', async () => {
  isJoseIntakeCommand.mockReturnValueOnce(true);
  runJoseCommandExecutionPipeline.mockResolvedValueOnce({
    commandId: 'cmd-1',
    pendingApprovalCount: 1,
    executionReceipts: [
      { packetId: 'pkt-1', agent: 'marcus', status: 'approval_required', reason: 'External publish requires approval' }
    ]
  });
  getPacketById.mockReturnValue({
    id: 'pkt-1',
    payload: { assignment: { agent: 'marcus', actionType: 'external_publish', riskLevel: 'high' } }
  });

  render(<ChatView {...makeProps()} />);
  // Wait for the async chat-history hydration effect to settle before sending --
  // otherwise its setMessages([]) can land after our send and wipe the messages
  // this test is about to add (found live during Task 3 execution, not assumed).
  await screen.findByText('What can I help you build?');

  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'do the risky thing' } });
  fireEvent.click(screen.getByRole('button', { name: /send message/i }));

  await screen.findByTestId('approval-panel');

  const props = approvalPanelCalls.props;
  expect(props.pendingApprovals).toEqual([
    expect.objectContaining({ itemId: 'pkt-1', packetId: 'pkt-1', agent: 'marcus' })
  ]);

  props.onApprove('pkt-1');
  expect(approvePacket).toHaveBeenCalledWith('pkt-1', 'chatview-inline');

  props.onReject('pkt-1');
  expect(rejectPacket).toHaveBeenCalledWith('pkt-1', 'Rejected from chat inline approval');

  expect(props.getItemDetail('pkt-1')).toEqual({ agent: 'marcus', actionType: 'external_publish', riskLevel: 'high' });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/test/ChatView.test.jsx -t "maps pendingApprovals to itemId"`
Expected: FAIL — `props.pendingApprovals` still has raw `packetId`-only items with no `itemId`, and `props.onApprove`/`props.onReject`/`props.getItemDetail` are `undefined` (ChatView doesn't pass them yet).

If the test instead fails earlier with an unrelated error inside `handleJoseCommand` (this is the first test in the file to exercise that code path — no other current test sets `isJoseIntakeCommand` to `true`), read the failure: it will name the first unmocked call. `computeOpportunityScores`/`runNovaAnalysis`/`listOrchestrationReceipts` are all either already mocked at the top of this file or fire-and-forget/non-throwing; if a new one surfaces, add a minimal mock for it following the existing pattern in this file rather than changing production code.

- [ ] **Step 3: Update the call site**

In `src/components/ChatView.tsx`, add the import right after the existing `import { ApprovalPanel } from './ApprovalPanel';` line (~line 34):

```tsx
import { ApprovalPanel } from './ApprovalPanel';
import { approvePacket, rejectPacket, getPacketById } from '../services/agentBusService';
```

Then replace:

```tsx
                <ApprovalPanel
                  pendingApprovals={pendingApprovals}
                  commandId={approvalCommandId}
                  onAllResolved={async (cmdId, results) => {
```

with:

```tsx
                <ApprovalPanel
                  pendingApprovals={pendingApprovals.map((p: Record<string, unknown>) => ({ ...p, itemId: p.packetId as string }))}
                  commandId={approvalCommandId}
                  onApprove={(itemId) => approvePacket(itemId, 'chatview-inline')}
                  onReject={(itemId) => rejectPacket(itemId, 'Rejected from chat inline approval')}
                  getItemDetail={(itemId) => {
                    const packet = getPacketById(itemId) as { payload?: { assignment?: { agent?: string; actionType?: string; riskLevel?: string } } } | null;
                    return packet?.payload?.assignment ?? null;
                  }}
                  onAllResolved={async (cmdId, results) => {
```

Leave everything from `onAllResolved={async (cmdId, results) => {` through the matching `}}\n                />` completely unchanged — only the props listed above are new/modified.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/test/ChatView.test.jsx`
Expected: PASS (the new test plus all pre-existing `ChatView.test.jsx` tests — the stub still renders `data-testid="approval-panel"` for every other test, only now via the prop-capturing version).

- [ ] **Step 5: Commit**

```bash
git add src/components/ChatView.tsx src/test/ChatView.test.jsx
git commit -m "refactor(chatview): wire ApprovalPanel's generalized props, preserve exact prior behavior"
```

---

## Task 4: `ProjectExecutionMode.test.tsx` — write the failing test file for the real gate

**Files:**
- Create: `src/test/ProjectExecutionMode.test.tsx`

This is written before the component changes (RED first), against the *target* behavior described in the spec's Testing section. It mocks every heavy service `ProjectExecutionMode.tsx` imports (workshop computation, research, audit, memory, all child display components) but leaves `approvalService.js` **unmocked** — jsdom provides real `localStorage`, so the real `createApprovalRequest`/`listPendingApprovalsByTrace`/`listApprovalsByTrace`/`approveRequest`/`rejectRequest`/`ApprovalPanel` all run for real, giving genuine end-to-end coverage of the gate rather than a re-mocked stand-in.

- [ ] **Step 1: Write the test file**

Create `src/test/ProjectExecutionMode.test.tsx`:

```tsx
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(null) }));

vi.mock('../services/agentWorkshop/agentRunnerService', () => ({
  runProjectWorkshop: vi.fn()
}));
vi.mock('../services/audit/marcusAuditService', () => ({
  auditProjectPlan: vi.fn(() => ({ score: 100, findings: [] }))
}));
vi.mock('../services/hectorResearchService', () => ({
  createResearchBrief: vi.fn().mockResolvedValue({})
}));
vi.mock('../services/memory/ecosystemMemoryService', () => ({
  addMemoryItem: vi.fn()
}));
vi.mock('../services/agentWorkshop/traceabilityService', () => ({
  getTraceSummary: vi.fn(() => ({ stagesCovered: [], total: 0, pendingApprovals: 0, executed: 0, failed: 0 }))
}));
vi.mock('../services/agentWorkshop/diffProposalService', () => ({
  listDiffProposals: vi.fn(() => [])
}));
vi.mock('../services/agentWorkshop/workContractService', () => ({
  listWorkContracts: vi.fn(() => []),
  signWorkContract: vi.fn(),
  archiveWorkContract: vi.fn()
}));
vi.mock('../services/agentWorkshop/verificationChainService', () => ({
  listVerificationChains: vi.fn(() => [])
}));
vi.mock('../services/agentWorkshop/operationalModeService', () => ({
  OPERATIONAL_MODES: [],
  getOperationalMode: vi.fn(() => ({ id: 'balanced', emphasis: [] })),
  setOperationalMode: vi.fn(() => ({ id: 'balanced', emphasis: [] }))
}));
vi.mock('../services/agentWorkshop/executionModeService', () => ({
  AGENT_MODES: { PROPOSAL: 'proposal', EXECUTION: 'execution' },
  getAgentMode: vi.fn(() => 'proposal'),
  setAgentMode: vi.fn()
}));

vi.mock('../components/agents/AgentDock', () => ({ AgentDock: () => <div data-testid="agent-dock" /> }));
vi.mock('../components/agents/AgentProfilePanel', () => ({ AgentProfilePanel: () => <div data-testid="agent-profile" /> }));
vi.mock('../components/agents/AgentCapabilityMatrix', () => ({ AgentCapabilityMatrix: () => <div data-testid="agent-matrix" /> }));
vi.mock('../components/agentWorkshop/ProjectIntakePanel', () => ({
  ProjectIntakePanel: ({ intake, setIntake }) => (
    <input
      data-testid="project-name-input"
      value={intake.projectName}
      onChange={(e) => setIntake((cur) => ({ ...cur, projectName: e.target.value }))}
    />
  )
}));
vi.mock('../components/agentWorkshop/AgentAssignmentBoard', () => ({ AgentAssignmentBoard: () => <div data-testid="assignment-board" /> }));
vi.mock('../components/agentWorkshop/AgentOutputPanel', () => ({ AgentOutputPanel: () => <div data-testid="agent-output" /> }));
vi.mock('../components/agentWorkshop/ExecutionTimeline', () => ({ ExecutionTimeline: () => <div data-testid="execution-timeline" /> }));
vi.mock('../components/agentWorkshop/FinalExecutionPacket', () => ({ FinalExecutionPacket: () => <div data-testid="final-packet" /> }));
vi.mock('../components/projectExecution/ProjectRiskRegister', () => ({ ProjectRiskRegister: () => <div data-testid="risk-register" /> }));
vi.mock('../components/projectExecution/ProjectVerificationChecklist', () => ({ ProjectVerificationChecklist: () => <div data-testid="verification-checklist" /> }));
vi.mock('../components/projectExecution/ProjectRoadmap', () => ({ ProjectRoadmap: () => <div data-testid="roadmap" /> }));
vi.mock('../components/audit/MarcusAuditPanel', () => ({ MarcusAuditPanel: () => <div data-testid="marcus-audit" /> }));
vi.mock('../components/research/HectorResearchPanel', () => ({ HectorResearchPanel: () => <div data-testid="hector-research" /> }));
vi.mock('../components/agentWorkshop/SystemHealthPanel', () => ({ SystemHealthPanel: () => <div data-testid="system-health" /> }));

import { ProjectExecutionMode } from '../components/projectExecution/ProjectExecutionMode';
// vi.mocked() gives the mocked import its Mock type back -- TS otherwise infers
// the real function's type from agentRunnerService.js and rejects .mockImplementation.
import { runProjectWorkshop as runProjectWorkshopImport } from '../services/agentWorkshop/agentRunnerService';
import { createApprovalRequest } from '../services/approval/approvalService';

const runProjectWorkshop = vi.mocked(runProjectWorkshopImport);

function makeWorkshopResult(traceId) {
  return {
    traceId,
    project: { id: 'proj-1', projectName: 'Test Project' },
    packets: [],
    outputs: [],
    sequence: [],
    approvalGates: [],
    finalPacket: { summary: 'Packet ready.' },
    projectDna: {},
    aiReviewGate: { passes: true, blockers: [] }
  };
}

// Reproduces agentRunnerService's real side effect (creating one ApprovalRequest
// per gate, tagged with this run's traceId) at the point runProjectWorkshop would
// have done it -- before the component's own post-computation gate check runs.
function mockWorkshop(traceId, gateSpecs) {
  runProjectWorkshop.mockImplementation(() => {
    gateSpecs.forEach((spec) => createApprovalRequest({ ...spec, metadata: { traceId } }));
    return makeWorkshopResult(traceId);
  });
}

// AnimatePresence (mode="wait") delays mounting the next tab's content until the
// previous tab's exit transition completes, which takes real wall-clock time even
// in jsdom (found live during Task 4/5 execution, not assumed) -- so each tab
// switch needs an async wait via findBy*, not an immediate query.
async function generatePacket() {
  fireEvent.change(screen.getByTestId('project-name-input'), { target: { value: 'Test Project' } });
  fireEvent.click(screen.getByRole('button', { name: /Continue to Execution/i }));
  const generateBtn = await screen.findByRole('button', { name: 'Generate' });
  fireEvent.click(generateBtn);
}

describe('ProjectExecutionMode — approval gate', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('routes to the Approval tab (not Results) after Generate when gates are pending, and disables Results', async () => {
    mockWorkshop('trace-1', [{ actionType: 'file_write', riskLevel: 'high', reason: 'Prevent unsupervised writes.' }]);
    render(<ProjectExecutionMode />);
    await generatePacket();

    expect(await screen.findByText('1 item awaiting approval')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Results' })).toBeDisabled();
  });

  it('does not navigate to Results when the disabled Results tab is clicked directly', async () => {
    mockWorkshop('trace-2', [{ actionType: 'deployment', riskLevel: 'critical', reason: 'Needs approval.' }]);
    render(<ProjectExecutionMode />);
    await generatePacket();
    await screen.findByText('1 item awaiting approval');

    fireEvent.click(screen.getByRole('button', { name: 'Results' }));
    expect(screen.queryByText('No execution packet yet.')).toBeNull();
    expect(screen.getByText('1 item awaiting approval')).toBeTruthy();
  });

  it('enables and reveals Results with the full packet once every gate is approved', async () => {
    mockWorkshop('trace-3', [{ actionType: 'file_write', riskLevel: 'high', reason: 'Needs approval.' }]);
    render(<ProjectExecutionMode />);
    await generatePacket();
    await screen.findByText('1 item awaiting approval');

    fireEvent.click(screen.getByRole('button', { name: /Approve/i }));
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));

    expect(await screen.findByTestId('final-packet')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Results' })).not.toBeDisabled();
    expect(screen.queryByText(/BLOCKED/i)).toBeNull();
  });

  it('shows a blocked banner in Results when a gate is denied', async () => {
    mockWorkshop('trace-4', [{ actionType: 'deployment', riskLevel: 'critical', reason: 'Needs approval.' }]);
    render(<ProjectExecutionMode />);
    await generatePacket();
    await screen.findByText('1 item awaiting approval');

    fireEvent.click(screen.getByRole('button', { name: /Deny/i }));
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));

    expect(await screen.findByText(/BLOCKED — one or more approval gates were denied/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Results' })).not.toBeDisabled();
  });

  it('no longer renders the Setup-tab approval/audit/verification/dependencies toggle group', () => {
    runProjectWorkshop.mockReturnValue(makeWorkshopResult('trace-5'));
    render(<ProjectExecutionMode />);
    expect(screen.queryByText(/Dependencies/i)).toBeNull();
    expect(screen.queryByText(/Verification/i)).toBeNull();
    expect(screen.queryByText(/^Audit/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Proposal' })).toBeTruthy();
    // Two "Execution" buttons are expected: the top-nav Execution tab and the
    // Proposal/Execution mode toggle -- both must survive the toggle-group removal.
    expect(screen.getAllByRole('button', { name: 'Execution' }).length).toBe(2);
  });

  it('no longer renders an Approval Gates card in Results', async () => {
    mockWorkshop('trace-6', []);
    render(<ProjectExecutionMode />);
    await generatePacket();

    expect(await screen.findByTestId('final-packet')).toBeTruthy();
    expect(screen.queryByText('Approval Gates')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail for the right reason**

Run: `npx vitest run src/test/ProjectExecutionMode.test.tsx`
Expected: FAIL on most tests — there is no `'approval'` tab yet, no Results-tab disabling, the Setup toggle group still renders (so the "no longer renders" test also fails), and `ApprovalGatePanel`'s "Approval Gates" label still appears in Results.

- [ ] **Step 3: Commit the test file**

```bash
git add src/test/ProjectExecutionMode.test.tsx
git commit -m "test(project-execution): add failing coverage for the real approval gate"
```

---

## Task 5: `ProjectExecutionMode.tsx` — implement the real gate

**Files:**
- Modify: `src/components/projectExecution/ProjectExecutionMode.tsx`
- Delete: `src/components/agentWorkshop/ApprovalGatePanel.tsx`

- [ ] **Step 1: Update imports**

Replace:

```tsx
import { ApprovalGatePanel } from '../agentWorkshop/ApprovalGatePanel';
```

with:

```tsx
import { ApprovalPanel } from '../ApprovalPanel';
```

Replace:

```tsx
import {
  AGENT_MODES,
  getAgentMode,
  getExecutionApprovalState,
  setAgentMode,
  setExecutionApprovalState
} from '../../services/agentWorkshop/executionModeService';
```

with:

```tsx
import {
  AGENT_MODES,
  getAgentMode,
  setAgentMode
} from '../../services/agentWorkshop/executionModeService';
import {
  listPendingApprovalsByTrace,
  listApprovalsByTrace,
  approveRequest,
  rejectRequest
} from '../../services/approval/approvalService';
```

- [ ] **Step 2: Add the `'approval'` tab and remove dead `execState`**

Replace:

```tsx
const PAGE_TABS = [
  { id: 'setup', label: 'Setup' },
  { id: 'agents', label: 'Agents' },
  { id: 'execution', label: 'Execution' },
  { id: 'results', label: 'Results' },
] as const;
```

with:

```tsx
const PAGE_TABS = [
  { id: 'setup', label: 'Setup' },
  { id: 'agents', label: 'Agents' },
  { id: 'execution', label: 'Execution' },
  { id: 'approval', label: 'Approval' },
  { id: 'results', label: 'Results' },
] as const;
```

Remove the now-dead `execState` state (its only consumer was the Setup-tab toggle group removed in Step 4 below). Replace:

```tsx
  const [mode, setMode] = useState<string>(getAgentMode());
  const [execState, setExecState] = useState<Record<string, boolean>>(getExecutionApprovalState());
  const [opMode, setOpMode] = useState<Record<string, unknown>>(getOperationalMode());
```

with:

```tsx
  const [mode, setMode] = useState<string>(getAgentMode());
  const [opMode, setOpMode] = useState<Record<string, unknown>>(getOperationalMode());
```

- [ ] **Step 3: Compute gate status and update `runWorkshop()`**

Replace:

```tsx
    setActiveTab('results');
  };

  const traceSummary = result?.traceId ? getTraceSummary(result.traceId as string) : null;
```

with:

```tsx
    const traceId = (workshop as { traceId?: string }).traceId;
    const pending = traceId ? listPendingApprovalsByTrace(traceId) : [];
    setActiveTab(pending.length > 0 ? 'approval' : 'results');
  };

  const traceSummary = result?.traceId ? getTraceSummary(result.traceId as string) : null;
  const pendingGates = result?.traceId
    ? (listPendingApprovalsByTrace(result.traceId as string) as { id: string; actionType: string; riskLevel: string; reason: string }[])
    : [];
  const hasDeniedGate = result?.traceId
    ? (listApprovalsByTrace(result.traceId as string) as { status: string }[]).some((g) => g.status === 'rejected')
    : false;
  const resultsLocked = pendingGates.length > 0;
```

- [ ] **Step 4: Remove the Setup-tab toggle group**

Replace:

```tsx
                <div className="flex items-center gap-3 pt-1">
                  <span className="text-[11px] text-zinc-500">Execution mode:</span>
                  <button type="button" onClick={() => { setAgentMode(AGENT_MODES.PROPOSAL); setMode(AGENT_MODES.PROPOSAL); }}
                    className={`rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-colors ${mode === AGENT_MODES.PROPOSAL ? 'border-indigo-400/25 bg-indigo-500/10 text-indigo-200' : 'border-white/[0.07] text-zinc-500 hover:text-zinc-300'}`}>Proposal</button>
                  <button type="button" onClick={() => { setAgentMode(AGENT_MODES.EXECUTION); setMode(AGENT_MODES.EXECUTION); }}
                    className={`rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-colors ${mode === AGENT_MODES.EXECUTION ? 'border-amber-400/25 bg-amber-500/10 text-amber-200' : 'border-white/[0.07] text-zinc-500 hover:text-zinc-300'}`}>Execution</button>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {([['approved', 'Approval'], ['audited', 'Audit'], ['verified', 'Verification'], ['dependenciesChecked', 'Dependencies']] as [string, string][]).map(([key, label]) => (
                    <button key={key} type="button" onClick={() => { const next = { ...execState, [key]: !execState[key] }; setExecutionApprovalState(next); setExecState(next); }}
                      className={`rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-colors ${execState[key] ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-300' : 'border-white/[0.07] bg-zinc-900/50 text-zinc-500'}`}>
                      {label} {execState[key] ? '✓' : '·'}
                    </button>
                  ))}
                </div>
              </div>
            </Card>
          </div>
        )}
```

with:

```tsx
                <div className="flex items-center gap-3 pt-1">
                  <span className="text-[11px] text-zinc-500">Execution mode:</span>
                  <button type="button" onClick={() => { setAgentMode(AGENT_MODES.PROPOSAL); setMode(AGENT_MODES.PROPOSAL); }}
                    className={`rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-colors ${mode === AGENT_MODES.PROPOSAL ? 'border-indigo-400/25 bg-indigo-500/10 text-indigo-200' : 'border-white/[0.07] text-zinc-500 hover:text-zinc-300'}`}>Proposal</button>
                  <button type="button" onClick={() => { setAgentMode(AGENT_MODES.EXECUTION); setMode(AGENT_MODES.EXECUTION); }}
                    className={`rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-colors ${mode === AGENT_MODES.EXECUTION ? 'border-amber-400/25 bg-amber-500/10 text-amber-200' : 'border-white/[0.07] text-zinc-500 hover:text-zinc-300'}`}>Execution</button>
                </div>
              </div>
            </Card>
          </div>
        )}
```

- [ ] **Step 5: Disable the Results tab button while gates are pending**

Replace:

```tsx
        <div className="flex gap-1">
          {PAGE_TABS.map((tab) => (
            <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
              className={`rounded-lg px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors ${activeTab === tab.id ? 'bg-indigo-500/15 text-indigo-200 border border-indigo-400/20' : 'text-zinc-500 hover:text-zinc-300 border border-transparent'}`}>
              {tab.label}
            </button>
          ))}
        </div>
```

with:

```tsx
        <div className="flex gap-1">
          {PAGE_TABS.map((tab) => {
            const disabled = tab.id === 'results' && resultsLocked;
            return (
              <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} disabled={disabled}
                title={disabled ? 'Resolve pending approval gates on the Approval tab before viewing Results' : undefined}
                className={`rounded-lg px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${activeTab === tab.id ? 'bg-indigo-500/15 text-indigo-200 border border-indigo-400/20' : 'text-zinc-500 hover:text-zinc-300 border border-transparent'}`}>
                {tab.label}
              </button>
            );
          })}
        </div>
```

- [ ] **Step 6: Add the Approval tab content**

Replace:

```tsx
        {activeTab === 'results' && (
          <div className="space-y-4">
            {!result ? (
```

with:

```tsx
        {activeTab === 'approval' && (
          <div className="space-y-4">
            <Card label="Execution Approval Gates">
              {!result ? (
                <EmptyState text="Generate an execution packet first." />
              ) : pendingGates.length === 0 ? (
                <div className="text-[12px] text-zinc-500">
                  {hasDeniedGate
                    ? 'All gates resolved — at least one was denied. See Results for the blocked packet.'
                    : 'All gates resolved. See Results for the full packet.'}
                </div>
              ) : (
                <ApprovalPanel
                  pendingApprovals={pendingGates.map((g) => ({ itemId: g.id, actionType: g.actionType, reason: g.reason, riskLevel: g.riskLevel }))}
                  commandId={result.traceId as string}
                  onApprove={approveRequest}
                  onReject={rejectRequest}
                  onAllResolved={() => setActiveTab('results')}
                />
              )}
            </Card>
          </div>
        )}

        {activeTab === 'results' && (
          <div className="space-y-4">
            {!result ? (
```

(This inserts the new tab block immediately before the existing `{activeTab === 'results' && (` block, which is otherwise untouched here — its contents are edited separately in Step 7.)

- [ ] **Step 7: Remove `ApprovalGatePanel` from Results and add the blocked banner**

Replace:

```tsx
            ) : (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card label="Assignments"><AgentAssignmentBoard packets={safeCast(result.packets, 'result.packets')} /></Card>
                  <Card label="Agent Outputs"><AgentOutputPanel outputs={safeCast(result.outputs, 'result.outputs')} /></Card>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <Card label="Timeline"><ExecutionTimeline timeline={safeCast(result.sequence, 'result.sequence')} /></Card>
                  <Card label="Approval Gates"><ApprovalGatePanel gates={safeCast(result.approvalGates, 'result.approvalGates')} /></Card>
                  <Card label="Final Packet"><FinalExecutionPacket finalPacket={safeCast(result.finalPacket, 'result.finalPacket')} /></Card>
                </div>
```

with:

```tsx
            ) : (
              <>
                {hasDeniedGate && (
                  <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4">
                    <div className="text-sm font-semibold text-red-300">BLOCKED — one or more approval gates were denied</div>
                    <p className="mt-1 text-[12px] text-red-200/80">Review the denied gate(s) on the Approval tab before proceeding with this packet.</p>
                  </div>
                )}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card label="Assignments"><AgentAssignmentBoard packets={safeCast(result.packets, 'result.packets')} /></Card>
                  <Card label="Agent Outputs"><AgentOutputPanel outputs={safeCast(result.outputs, 'result.outputs')} /></Card>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card label="Timeline"><ExecutionTimeline timeline={safeCast(result.sequence, 'result.sequence')} /></Card>
                  <Card label="Final Packet"><FinalExecutionPacket finalPacket={safeCast(result.finalPacket, 'result.finalPacket')} /></Card>
                </div>
```

- [ ] **Step 8: Delete the superseded component**

```bash
git rm src/components/agentWorkshop/ApprovalGatePanel.tsx
```

`npx tsc --noEmit` will then surface a second importer this plan's earlier grep missed:
`src/components/EcosystemHub.tsx` renders `<ApprovalGatePanel gates={[]} />` inside its
static "Workshop" showcase tab (a demo panel with all-empty dummy data — `packets={[]}`,
`outputs={[]}`, etc. — not a real data path). Remove that one line and its import too:

```tsx
import { ApprovalGatePanel } from './agentWorkshop/ApprovalGatePanel';
```
→ delete this import line entirely.

```tsx
              <AgentOutputPanel outputs={[]} />
              <ApprovalGatePanel gates={[]} />
              <ExecutionTimeline timeline={[]} />
```
→
```tsx
              <AgentOutputPanel outputs={[]} />
              <ExecutionTimeline timeline={[]} />
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npx vitest run src/test/ProjectExecutionMode.test.tsx`
Expected: PASS (all 6 tests from Task 4).

Run: `npx tsc --noEmit`
Expected: 0 errors (confirms no dangling reference to the deleted `ApprovalGatePanel` or removed `execState`/`getExecutionApprovalState`/`setExecutionApprovalState`). If the mocked `runProjectWorkshop` import in the test file surfaces `.mockImplementation`/`.mockReturnValue` type errors, wrap it with `vi.mocked()` (TS otherwise infers the real function's much wider return type from `agentRunnerService.js` and rejects the mock calls) and cast `makeWorkshopResult`'s return value through `as unknown as ReturnType<typeof runProjectWorkshopImport>` rather than reproducing that whole real shape in the test fixture.

- [ ] **Step 10: Commit**

```bash
git add src/components/projectExecution/ProjectExecutionMode.tsx src/components/EcosystemHub.tsx
git commit -m "feat(project-execution): wire the real approval gate, remove dead Setup toggle and ApprovalGatePanel"
```

---

## Task 6: Update `CLAUDE.md`'s "Do Not Duplicate" table

**Files:**
- Modify: `CLAUDE.md`

Two rows now describe stale facts: the "Approval panel" row still says `ApprovalPanel.tsx` hardcodes `agentBusService`, and the Agent Workshop row still lists the now-deleted `ApprovalGatePanel.tsx`.

- [ ] **Step 1: Update the Approval panel row**

Replace:

```
| Approval panel (agentBusService packets) | `src/components/ApprovalPanel.tsx` — approve/reject UI over `approvePacket`/`rejectPacket`/`getPacketById` from `agentBusService`; distinct from `ApprovalModal.tsx` (risk-level modal) and `src/components/approval/ApprovalCenterPanel.tsx` (read-only pending list for Project Execution Mode, backed by `services/approval/approvalService.js` — a separate, simulated approval store, not `agentBusService`) |
```

with:

```
| Approval panel (shared, props-driven) | `src/components/ApprovalPanel.tsx` — generalized approve/reject UI over injected `onApprove`/`onReject`/`getItemDetail` props, keyed on a normalized `itemId` (not a hardcoded `agentBusService` import). Two real callers: `ChatView.tsx` (wraps `approvePacket`/`rejectPacket`/`getPacketById` from `agentBusService`) and `ProjectExecutionMode.tsx`'s Approval tab (wraps `approveRequest`/`rejectRequest` from `services/approval/approvalService.js`). Distinct from `ApprovalModal.tsx` (risk-level modal) and `src/components/approval/ApprovalCenterPanel.tsx` (a separate, older read-only pending list, superseded for gating purposes by the Approval tab but left in place — see `docs/superpowers/specs/2026-09-05-project-execution-approval-gate-design.md`) |
```

- [ ] **Step 2: Update the Agent Workshop subsystem row**

In the row starting `| Agent Workshop / Project Execution Mode subsystem |`, remove `agentWorkshop/ApprovalGatePanel.tsx,` from the file list (it's deleted), and append one sentence noting the real gate now lives in a dedicated `'approval'` tab wired via `ApprovalPanel.tsx` + `approvalService.js`'s `listPendingApprovalsByTrace`/`listApprovalsByTrace`, superseding the old Setup-tab toggle and the deleted `ApprovalGatePanel.tsx` read-only card.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update Do Not Duplicate table for the generalized ApprovalPanel and real approval gate"
```

---

## Task 7: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full targeted test run**

Run: `npx vitest run src/test/services/approvalService.test.js src/test/ApprovalPanel.test.jsx src/test/ChatView.test.jsx src/test/ProjectExecutionMode.test.tsx`
Expected: PASS, 0 failures.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: 0 errors (fix any that surface from the edited files before continuing).

- [ ] **Step 4: Confirm no remaining references to deleted/removed symbols**

Run: `grep -rn "ApprovalGatePanel\|getExecutionApprovalState\|setExecutionApprovalState" src/components/projectExecution/ProjectExecutionMode.tsx`
Expected: no output (empty).

Run: `grep -rln "ApprovalGatePanel" src/`
Expected: no output (the component is fully deleted with no remaining importers).

- [ ] **Step 5: Final commit (if any cleanup was needed in Steps 2–4)**

```bash
git add -A
git commit -m "chore: verification pass for the real approval gate"
```

(Skip this step if Steps 1–4 required no changes — don't create an empty commit.)
