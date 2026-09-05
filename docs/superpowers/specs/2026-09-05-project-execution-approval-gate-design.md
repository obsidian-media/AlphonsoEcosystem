# Project Execution Mode: Real Approval Gate — Design Spec

## Problem

Project Execution Mode (`src/components/projectExecution/ProjectExecutionMode.tsx`) presents
three separate approval-shaped UI elements that do not gate anything and do not communicate
with each other:

1. **Setup tab** — an "Approval / Audit / Verification / Dependencies" 4-button toggle group
   (`executionModeService.js`'s `setExecutionApprovalState`). In the default "Proposal" mode
   these flags have zero effect on output. They only matter at all if the user separately
   switches to "Execution" mode, and even then a failed gate only writes a background failure
   record — it never blocks the Results tab from rendering.
2. **Execution tab** — a "Sign" button on each generated Work Contract
   (`workContractService.js`'s `signWorkContract`). This fires *after* the full result has
   already been computed and stored in component state; it only flips a `state: 'signed'` label
   in `localStorage` that nothing downstream reads.
3. **Results tab** — an "Approval Gates" card (`ApprovalGatePanel.tsx`) that is purely read-only
   display. It has no buttons, no actions, and cannot influence anything.

Root cause: `runWorkshop()` calls `runProjectWorkshop()` (`agentRunnerService.js`), which
synchronously computes the entire result (tasks, outputs, final packet) in one call. Within
that same function, after `joseOrchestrationService.js`'s `produceApprovalGates(project)`
returns a fixed list of 4 local gate descriptors (itself pure — it never touches the approval
store), `runProjectWorkshop()` maps over them and calls `createApprovalRequest` once per gate
(`agentRunnerService.js` ~line 191), passing `metadata: { projectId, traceId, gateId }`. So the
4 approval records do land in `services/approval/approvalService.js`'s store, correctly tagged
with this run's `traceId` — the store side is fine. The bug is entirely on the UI side: the
component then unconditionally does `setResult(next); setActiveTab('results')` — nothing ever
checks those records' status before advancing, and (see Design step 4 below) nothing stops the
user from reaching Results directly regardless of navigation, since the tab bar itself has no
gating logic at all.

This is separate from the real Jose orchestration pipeline's approval system
(`agentBusService.ts`'s `AgentPacket` + `ApprovalModal.tsx` / `ApprovalPanel.tsx`), which
already gates correctly. This spec does not touch that pipeline.

## Non-goals (explicitly out of scope)

- **No data-model merge.** `agentBusService.ts`'s `AgentPacket` (retry/dead-letter/execution
  lifecycle, used by Jose's real pipeline) and `approvalService.js`'s `ApprovalRequest`
  (action-type + reason, used by Project Execution Mode *and* two other real callers —
  `providerAdapterService.js`'s paid ChatGPT/Claude/Qwen adapter gate, which already works
  correctly, and `notionSyncService.js`) stay as two separate stores. Unifying them was
  considered and rejected: it would touch two paths that already work correctly for zero
  user-visible gain here, for real regression risk.
- **No change to `produceApprovalGates()`'s content.** It returns a fixed list of 4 generic
  gate types regardless of the actual generated plan. Making it derive gates dynamically from
  the real tasks/packets is a separate, larger piece of work and not needed to fix the
  reported confusion.
- **No change to Work Contract signing** (`workContractService.js`). Signing an individual
  agent's contract is a legitimate, separate record-keeping action, not the project-level
  approval gate. It is not relabeled or removed by this spec.
- **No TypeScript migration.** `agentWorkshop/` and `approval/` are entirely `.js` — a
  pre-existing, unrelated gap. Not addressed here.

## Design

### One real checkpoint, one outcome

`runWorkshop()` keeps computing the full result synchronously exactly as it does today —
nothing in Project Execution Mode performs a real side effect (no real file write, API call,
payment, or deployment; it is entirely synthetic/simulated output), so computing it early is
safe. What changes is what happens *after* computation and *before* the user sees it:

1. `runWorkshop()` computes `result` as today, including the 4 approval requests already
   created via `createApprovalRequest`.
2. Instead of unconditionally calling `setActiveTab('results')`, it checks the new
   `listPendingApprovalsByTrace(traceId)` (see below — `listPendingApprovals()` itself already
   exists; only the trace-filtered variant is new) for this run's `traceId`.
3. If any are still pending, the UI navigates to a new **"Approval" tab** (inserted between
   "Execution" and "Results" in `PAGE_TABS`) instead of "Results". This tab renders the single
   real gate.
4. **The gate is enforced at the tab bar, not just at auto-navigation time.** Today
   `PAGE_TABS.map(...)` renders every tab (including "Results") as an unconditionally clickable
   button (`ProjectExecutionMode.tsx` ~line 229) — nothing currently stops a user from clicking
   "Results" directly regardless of pending approvals. Patching only `runWorkshop()`'s
   auto-navigation target would leave that click-through open, reproducing the same class of bug
   this spec exists to fix. So: the Results tab button is `disabled` whenever
   `result?.traceId` has any entries from `listPendingApprovalsByTrace(result.traceId)`, with a
   `title` tooltip explaining why (mirroring the existing disabled-button pattern already used
   for "Continue to Execution" at line 248, which disables on `!intake.projectName`). Once every
   pending item for this run is approved or denied, the Results tab becomes enabled and
   reachable by either path (auto-nav from the Approval tab's "Continue", or a direct click). If
   everything was approved, results render as today. If anything was denied, the Results tab
   shows a clear "blocked" state instead of the full packet (mirroring the existing
   `aiReviewGate`'s PASS/BLOCKED card pattern already in `ProjectExecutionMode.tsx`).
5. The Setup-tab 4-button toggle group is **removed**. It never gated anything real in the
   default mode and duplicates the concept the new Approval tab now owns for real. The
   "Proposal / Execution" mode toggle itself (`AGENT_MODES`) is left in place — it is a
   legitimate, separate concept (dry-run vs. would-execute) — but the four approval/audit/
   verify/dependency checkboxes tied to `executionModeService.js`'s `setExecutionApprovalState`
   are deleted from the Setup tab's JSX. `executionModeService.js` itself is left alone (its
   `canExecuteAction` gate in `agentRunnerService.js` still runs in Execution mode as before);
   only the redundant, confusing manual toggle UI goes away.
6. `ApprovalGatePanel.tsx` (the read-only Results-tab display) is removed from the Results tab
   grid, since the new Approval tab is now the single place gate status is shown and acted on.

### Reusing one visual component, not duplicating it

`ApprovalPanel.tsx` (`src/components/ApprovalPanel.tsx`) already implements exactly the
interaction this needs: a list of pending items with per-item Approve/Deny, and an
`onAllResolved` callback once everything is resolved. Today it is hardcoded to import
`approvePacket`/`rejectPacket`/`getPacketById` from `agentBusService.ts` directly, so it only
works for the real Jose pipeline (used from `ChatView.tsx`).

This spec generalizes it via props instead of forking a second copy. Two data-shape details
that today's hardcoded implementation papers over need to become explicit in the generalized
contract:

- **Key field.** The current component hardcodes `packetId` as the item identity — used as the
  React `key`, in `resolveAssignment`, in the `resolved` state map, and in every callback.
  `approvalService.js`'s `ApprovalRequest` objects use `id`, not `packetId`. Rather than teach
  the component two key names, both call sites normalize to one neutral field before passing
  items in: `itemId`. `ChatView.tsx` maps its packets (`{ ...p, itemId: p.packetId }`) and
  `ProjectExecutionMode.tsx` maps its requests (`{ ...r, itemId: r.id }`) at the call site; the
  component only ever reads `item.itemId`.
- **Detail resolution / `agent` field.** ChatView's items carry no `riskLevel` of their own and
  need indirection through `getPacketById` to reach `payload.assignment.agent`/`riskLevel`/
  `actionType`, with risk *inferred* from those via `inferRisk()`. Project Execution's
  `ApprovalRequest` objects already carry `riskLevel`/`actionType`/`reason` directly on the item
  (`PendingApprovalItem.riskLevel`) — no indirection or inference needed — but have no
  per-agent concept at all (gates are project-level, not per-agent). The panel's resolution
  logic is therefore: if `item.riskLevel` is already present, use the item as-is (Project
  Execution path); otherwise call `getItemDetail(item.itemId)` and run `inferRisk()` over the
  result (ChatView path). `ResolvedItem.agent` is optional (`agent?: string`); when absent the
  panel renders a static `'project'` label in that slot instead of an agent name.

```ts
interface PendingApprovalItem {
  itemId: string;
  actionType?: string;
  reason?: string;
  previewContent?: string | null;
  agent?: string;
  riskLevel?: string;
}

interface ResolvedItem {
  itemId: string;
  agent?: string;
  actionType: string;
  riskLevel: string;
  reason: string;
  previewContent: string | null;
}

interface ApprovalPanelProps {
  pendingApprovals: PendingApprovalItem[];
  commandId?: string;
  onApprove: (itemId: string) => void;
  onReject: (itemId: string, reason?: string) => void;
  getItemDetail?: (itemId: string) => ResolvedItem | null;
  onAllResolved?: (commandId: string | undefined, resolved: Record<string, string>) => void;
}
```

- `ChatView.tsx`'s existing call site maps packets to include `itemId` and passes
  `onApprove={(id) => approvePacket(id, 'chatview-inline')}`,
  `onReject={(id) => rejectPacket(id, 'Rejected from chat inline approval')}`,
  `getItemDetail={getPacketById}` — the two reason-string literals are hardcoded inside
  `ApprovalPanel.tsx` today (not passed in); they move to this call site as the wrapping
  closures shown, so ChatView's actual on-disk behavior is unchanged. (An earlier draft of this
  spec showed `onApprove={approvePacket}` directly — that does not compile against
  `approvePacket(packetId, approver)`'s real signature and was corrected here.)
- `ProjectExecutionMode.tsx`'s new Approval tab maps requests to include `itemId` and passes
  `onApprove={approveRequest}`, `onReject={rejectRequest}`, sourcing items from
  `approvalService.js`'s `listPendingApprovalsByTrace(result.traceId)` — no `getItemDetail`
  needed (items are already flat) and no import of `agentBusService.ts` anywhere in this file.

One component, one visual language, two independent data sources behind props. Neither real
call site's underlying data model changes — only the small `itemId`-mapping wrapper each call
site now supplies.

### `approvalService.js` additions

Two small, additive exports — no changes to existing exported functions' behavior:

```js
// List pending approval requests filtered to a specific trace/run.
export function listPendingApprovalsByTrace(traceId) {
  return listPendingApprovals().filter((r) => r.metadata?.traceId === traceId);
}
```

`listPendingApprovals()` already exists and is unchanged. `approveRequest(id)` /
`rejectRequest(id)` already exist and are unchanged.

### Data flow

```
runWorkshop()
  -> runProjectWorkshop(projectInput)   [unchanged: computes result + creates 4 approval requests]
  -> setResult(next)                    [unchanged: result stored in state immediately]
  -> listPendingApprovalsByTrace(result.traceId)
       -> pending.length > 0 ?
            yes -> setActiveTab('approval')
            no  -> setActiveTab('results')   [nothing was pending -- unlikely given the 4 fixed
                                               gates always fire, but handled for completeness]

Approval tab renders <ApprovalPanel> sourced from listPendingApprovalsByTrace(result.traceId)
  -> user approves/denies each item via approveRequest/rejectRequest
  -> onAllResolved(traceId, resolvedMap)
       -> any denied? -> setActiveTab('results'); result rendered with a "blocked" banner
       -> all approved? -> setActiveTab('results'); result rendered normally
```

### Error handling

- `approveRequest`/`rejectRequest` calls are wrapped in try/catch exactly as `ApprovalPanel.tsx`
  already does for `agentBusService.ts`'s equivalents — a failure surfaces an inline error
  string in the panel, does not crash the view, and does not silently mark the item resolved.
- If `result.traceId` is missing (should not happen given `runProjectWorkshop` always sets it,
  but defensively handled), `listPendingApprovalsByTrace` returns `[]` and the flow falls
  through directly to Results — matching today's actual behavior as a safe fallback rather than
  a hard error.

### Testing

- `src/test/services/approvalService.test.js` (existing file) — add tests for
  `listPendingApprovalsByTrace`: returns only matching-trace pending items, excludes
  approved/rejected items, returns `[]` for an unknown trace.
- `src/components/ApprovalPanel.tsx` — new/updated component test covering the generalized
  props contract: renders from injected `pendingApprovals`, calls the injected `onApprove`/
  `onReject` (not a hardcoded import), calls `onAllResolved` once every item is resolved,
  surfaces an inline error if `onApprove`/`onReject` throws.
- `src/test/chatView*.test.jsx` (existing) — verify `ChatView.tsx`'s existing `ApprovalPanel`
  usage still passes with the new prop-based contract (regression guard for the one real
  production call site).
- `src/components/projectExecution/ProjectExecutionMode.tsx` — new test(s): after `Generate`,
  the Approval tab (not Results) is shown while gates are pending; the Results tab button is
  `disabled` while any gate for the current `traceId` is pending, **and clicking it directly
  does not change `activeTab`** (the click-through this spec exists to close); approving all
  gates enables the Results tab and reveals it; denying at least one gate shows the blocked-state
  Results view instead of the full packet; the Setup tab no longer renders the 4-button toggle
  group; the Results tab no longer renders `ApprovalGatePanel`.
- `ApprovalGatePanel.tsx` and its existing test (if any) are deleted along with its Results-tab
  usage.

## Files touched

- `src/components/ApprovalPanel.tsx` — generalize props (remove hardcoded `agentBusService`
  import, accept `onApprove`/`onReject`/`getItemDetail` instead).
- `src/components/ChatView.tsx` — update its `ApprovalPanel` call site to pass
  `agentBusService`'s functions explicitly as props.
- `src/services/approval/approvalService.js` — add `listPendingApprovalsByTrace`.
- `src/components/projectExecution/ProjectExecutionMode.tsx` — add `'approval'` tab, wire the
  new gate-then-reveal flow into `runWorkshop()`, remove the Setup-tab toggle group and the
  Results-tab `ApprovalGatePanel` usage.
- `src/components/agentWorkshop/ApprovalGatePanel.tsx` — delete (superseded by the new
  Approval tab).
- Test files listed above.

## What this does not fix (tracked separately, not silently dropped)

- `produceApprovalGates()` still returns the same fixed 4 gates regardless of actual project
  content — a real gap, out of scope here.
- `agentWorkshop/` and `approval/` remain unmigrated to TypeScript.
- The deeper architectural question of whether Project Execution Mode and Jose's real pipeline
  should eventually converge into one orchestration system at all (not just one approval
  visual component) is unresolved and explicitly deferred — this spec only fixes the approval
  flow's internal incoherence, not the two-systems question itself.
