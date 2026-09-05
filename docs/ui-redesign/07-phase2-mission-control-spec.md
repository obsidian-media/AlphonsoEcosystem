# Phase 2 — Mission Control / Home Page Spec

First real page of Phase 2 (page-by-page redesign, following Phase 1's foundation). Applies Draft A's power-user "Home room" visual language (locked in `draft-a-power-user-direction.md`) to real data, with one deliberate scope expansion agreed during brainstorming: building a real unified attention-aggregator, not just wiring the mockup's illustrative approvals list.

## Scope

**In scope:**
- A new `attentionAggregatorService.ts` that merges real "needs attention" items from 5 real sources into one normalized, sorted list.
- Mission Control's page itself, consuming that service, styled per Draft A's Home room (blue-dust tint, `Zone` primitive for section washes, breathing-glow agent status strip).
- A real empty state for when nothing needs attention.

**Explicitly out of scope for this page/task** (real, planned future consumers of the same service — do not bundle in):
- Wiring the sidebar's notification badge to this service (Draft A's nav concept) — separate task.
- Wiring the sidebar's ambient status dots (the RightPanel-fold-in decision from Draft A) — separate task.
- Any other page beyond Mission Control itself.

## Architecture

A new service, not page-level logic directly, so the "what needs attention" concept is reusable (the sidebar badge/dots will need the exact same data later — see Scope).

```
attentionAggregatorService.ts
  ├─ reads: agentBusService (real chat/Jose approvals)
  ├─ reads: services/approval/approvalService.js (real Project Execution approvals, made real by PR #225)
  ├─ reads: sentinelSecurityService (scanForThreats results)
  ├─ reads: coachHistoryService (fired coach signals)
  └─ reads: connectorCircuitBreakerService.getAll() (real tripped-circuit state — see §Connector normalization fix below; deliberately NOT connectorHealthCheckService, see §No fresh expensive operations)
```

This mirrors `RightPanel.tsx`'s existing polling pattern in this codebase (chosen over an event-driven rewrite of all 5 source services, and over page-level direct queries — see the brainstorming session's SWOT comparison for the full reasoning). Poll interval: 60s, matching `proactiveAgentService.js`'s existing convention rather than inventing a new number.

### No fresh expensive operations (self-critique fix #2)

`getAttentionItems()` must only read each source's **already-computed, cached, last-known state** — it must never trigger a new operation itself. This matters concretely for two of the five sources:
- **Sentinel:** read whatever the last `scanForThreats()` result already sitting in the app's existing scheduled-scan state is (the same data `RightPanel.tsx` already displays) — do not call `scanForThreats()` fresh from inside the aggregator.
- **Connectors:** verified that `connectorHealthCheckService.ts`'s `checkConnectorHealth()` performs a real live network ping per call (confirmed: real `fetch`-style calls per connector, e.g. `checkGitHubConnection()`, `checkSlackConnection()`, etc.). Calling this for every configured connector on every 60s poll would mean a live network ping storm every minute across potentially dozens of connectors — a real cost/rate-limit risk, not a style preference. The aggregator must never call this service. Use `connectorCircuitBreakerService.getAll()` instead (see next section) — it's a passive read of state already recorded by real connector usage elsewhere in the app, zero new network calls.

### Connector normalization fix (self-critique fix #1)

Originally this spec mapped any `disabled` connector (per `connectorStatusService.ts`'s `deriveConnectorStatus()`) to `medium` severity. **This was a real bug, not a style choice:** verified `deriveConnectorStatus()`'s real categories — `'live' | 'missing_config' | 'foundation_only' | 'placeholder' | 'disabled'` — and none of them distinguish "the user never configured this" from "this broke." This app has 14 disabled connectors today per its own real connector-status counts; treating all of them as "needs attention" would flood the list with noise from connectors nobody ever intended to use, burying whatever actually matters.

**Fixed approach:** only connectors whose circuit is currently open in `connectorCircuitBreakerService.ts` (`isOpen(connectorId)` returns `true`, populated by real `recordFailure()` calls from actual connector usage elsewhere in the app) produce an `AttentionItem`. This is a genuine "was working, now failing" signal, not a static configuration category — a connector the user never set up will never trip a circuit breaker, so it correctly never appears. Severity for these: `medium` (unchanged from before, still the roughest tier in this table since circuit-breaker state doesn't carry its own severity scale either, but at least the *inclusion criterion* is now correct).

### Failure isolation across the 5 sources (self-critique fix #3)

Each source is fetched independently (`Promise.allSettled`, not `Promise.all`) so one source's failure doesn't take down the whole list. If, say, Sentinel's read throws, `getAttentionItems()` logs the failure (via the existing `crashLogService.ts` pattern used elsewhere in this codebase) and returns the other 4 sources' items — never an empty list or a thrown error just because one of five sources had a problem.

### Dismissal / acknowledgment (self-critique fix #4)

Approval items need no dismissal mechanic — they naturally leave the list once approved or rejected via the real underlying call. Sentinel/Coach/Connector items have no such natural resolution and would otherwise resurface on every single 60s poll forever, even after a user has seen and consciously decided to ignore one. Fix: a small `dismissedAttentionItems` set, keyed by each item's stable `id`, persisted the same way `agentAuditService.ts`'s audit log already persists (durable localStorage-backed, matching this codebase's established pattern rather than inventing a new storage mechanism) — a dismissed item is suppressed from the rendered list until the underlying condition actually changes (a new/different `id` is generated, e.g. a new Sentinel finding or a different connector's circuit tripping), not permanently silenced regardless of new problems. Dismissal is a page-level UI action (not part of `attentionAggregatorService.ts` itself, which stays a pure read — dismissal filtering happens in the component consuming it), so the service itself stays simple and the same raw list is available to future consumers (sidebar badge/dots) that may want their own, different dismissal behavior.

## Data model

```ts
// src/services/attentionAggregatorService.ts

export type AttentionSource = 'approval-chat' | 'approval-project' | 'sentinel' | 'coach' | 'connector';
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

export function getAttentionItems(): Promise<AttentionItem[]>;
```

## Severity normalization (verified against each source's real field, not assumed)

| Source | Real field checked | Mapping |
|---|---|---|
| Sentinel (`sentinelSecurityService.ts`) | `severity: 'critical' \| 'high' \| 'medium' \| 'low'` (confirmed in `THREAT_PATTERNS`) | Direct passthrough — native match |
| Approvals, both systems (`agentBusService.ts`, `approvalService.js`) | `riskLevel: string` (defaults `'medium'`, confirmed in both files) | Direct passthrough |
| Coach (`coachEngineService.ts`) | `severity: 'critical' \| 'warning' \| 'neutral' \| 'positive'`, but only `critical`/`warning` ever actually fire (confirmed: `if (signal.severity !== 'critical' && signal.severity !== 'warning') return null`) | `critical` → `critical`; `warning` → `medium` (Coach's "warning" isn't equivalent to a medium-risk approval, but avoids inventing a 6th severity tier for one source alone) |
| Connectors (`connectorCircuitBreakerService.ts`) | **No native severity field**, and — verified, not assumed — `connectorStatusService.ts`'s static config categories (`live`/`missing_config`/`foundation_only`/`placeholder`/`disabled`) cannot distinguish "never configured" from "broke," so those are NOT used for inclusion (see the Connector normalization fix section above). Only a connector with `isOpen(connectorId) === true` (a real, currently-tripped circuit from actual recent failures) qualifies at all. | `medium`. Still the roughest severity in this table since circuit-breaker state carries no native severity scale either, but the *inclusion criterion* is now a genuine degradation signal instead of a static configuration category. |

## Sorting

Severity tier first (`critical` > `high` > `medium` > `low`), then timestamp descending within each tier. Matches the user's explicit choice over strict recency or per-source grouping, reasoning being that a routine connector blip should never bury an urgent security finding just because it's newer.

## Interaction model

- **Approvals (both sources, `actionable: true`):** render inline Approve/Reject buttons directly in the list. Clicking calls the real underlying approve/reject function for that item's source (`agentBusService`'s or `approvalService.js`'s, matching which one produced the item) — never a generic shared handler that assumes one API shape for both.
- **Sentinel / Coach / Connector items (`actionable: false`):** click-to-expand-detail only. No inline action, since these aren't "approve or reject" decisions.

## Empty state

Per Phase 1 spec §8 (added during the self-critique pass earlier this session): a real empty state, not a hidden/blank section. Uses the current room's `Zone` mood (`neutral` for Home) and plain-language copy (e.g. "Nothing needs you right now" — exact copy is an implementation-time detail, not fixed here), not a bare "no items" default.

## Visual layer (from Draft A, unchanged, applied here for real)

- Top nav: brand mark, curated primary tabs, right-cluster search/bell/theme/avatar (bell's badge count now sources from `getAttentionItems().length`, but the sidebar wiring itself is a separate task per Scope above — this page just needs the service to exist and be callable).
- Agent status strip below nav: real agent portraits, breathing-glow animation on genuinely active agents (needs a real "is this agent currently active" signal — likely `agentActivityService.ts`, to be confirmed during implementation, not assumed here).
- Attention list rendered inside a `Zone` (mood: `neutral` for Home), one row per `AttentionItem`, using `StatusDot`/`Badge` primitives already in `ui/` for severity color-coding (per Phase 1's accessibility requirement: color is paired with text/icon, never color-only).

## Testing approach (TDD, per the executing-plans convention already used in Phase 1)

1. Unit tests for `attentionAggregatorService.ts`'s merge/normalize/sort logic, mocking all 5 source functions — covering: correct severity mapping per source, correct sort order (severity then recency), correct `actionable`/`onApprove`/`onReject` wiring only for the two approval sources, **one source throwing does not prevent the other 4's items from being returned** (self-critique fix #3), and **a connector with `isOpen() === false` never produces an item regardless of its `deriveConnectorStatus()` category** (self-critique fix #1 — the regression test for the exact bug this fix corrects).
2. Component test for the Mission Control page consuming the service (mocked), covering: rendering items, empty state, inline approve/reject triggering the right underlying call for the right source, and **dismissing a non-actionable item removes it from view but a fresh poll with a genuinely new item's `id` still shows that new one** (self-critique fix #4).

## Explicitly open / deferred (not resolved by this spec)

- Exact "is this agent active" signal for the breathing-glow strip — needs confirming against `agentActivityService.ts` during implementation, not assumed here.
- Exact empty-state copy — a real implementation-time decision, not fixed in this spec.
- Sidebar badge/ambient-dot wiring — separate task, explicitly out of scope (see Scope section).
- Dark-mode tokens for the Home room — Phase 1 spec already flagged this as unresolved (only light-mode was mocked); this page's implementation will need a real decision here too, not deferred silently a second time.
