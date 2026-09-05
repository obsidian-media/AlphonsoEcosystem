# Phase 2 — Mission Control / Home Page Spec

First real page of Phase 2 (page-by-page redesign, following Phase 1's foundation). Applies Draft A's power-user "Home room" visual language (locked in `draft-a-power-user-direction.md`) to real data, with one deliberate scope expansion agreed during brainstorming: building a real unified attention-aggregator, not just wiring the mockup's illustrative approvals list.

**Implementation split:** during plan-writing, this spec turned out to cover two genuinely independent subsystems — a new backend service, and an open-ended visual page rewrite — so it's implemented as two separate plans rather than one. The backend half (`attentionAggregatorService.ts` + dismissal mechanic) is `08-phase2-attention-aggregator-plan.md`, already written and ready to execute. The page-visual half (wiring `MissionControlHome.tsx` to consume it, styled per Draft A) is a follow-up plan, not yet written, to be done once the backend exists.

**Sentinel dropped from scope (found during plan-writing, not assumed during brainstorming):** verified `sentinelSecurityService.ts`'s only real caller — `RightPanel.tsx`'s `runQuickScan()` — calls `scanForThreats('', {})` with empty command text, which structurally can never match any threat pattern. There is currently no real Sentinel finding anywhere in this app to surface. Logged as Bug Log #4 (a real, pre-existing bug independent of this redesign) rather than building a source around it.

**Coach ALSO dropped from scope (found during implementation, after the sections below were written — a second, later amendment, not a rewrite of history):** tracing `CoachContext.jsx`/`coachEngineService.ts`/`coachHistoryService.ts`/`coachInterventionService.ts` live during Task 2's implementation surfaced 3 distinct, unreconciled "coach signal" representations, none with any durable "resolved" concept — pulling from any of them risks resurfacing an intervention the user already dismissed via the Coach overlay. Logged as Bug Log #5. **The sections below (Architecture, Data model, Severity table, Interaction model) still describe the original 4-source design as first written and were not rewritten line-by-line** — the actually-shipped code in `attentionAggregatorService.ts` has 3 sources (`approval-chat`, `approval-project`, `connector`), Coach entirely absent. Treat any "Coach"/"4 sources" reference below as superseded by this note, not as current fact.

## Scope

**In scope:**
- A new `attentionAggregatorService.ts` that merges real "needs attention" items from 4 real sources into one normalized, sorted list. (See `08-phase2-attention-aggregator-plan.md` — this half is done/ready.)
- Mission Control's page itself, consuming that service, styled per Draft A's Home room (blue-dust tint, `Zone` primitive for section washes, breathing-glow agent status strip). (Follow-up plan, not yet written.)
- A real empty state for when nothing needs attention.

**Explicitly out of scope for this page/task** (real, planned future consumers of the same service — do not bundle in):
- Wiring the sidebar's notification badge to this service (Draft A's nav concept) — separate task.
- Wiring the sidebar's ambient status dots (the RightPanel-fold-in decision from Draft A) — separate task.
- Any other page beyond Mission Control itself.
- Sentinel security findings — see above, dropped entirely from this page's v1 scope, not deferred to a "later task" within this same plan.

## Architecture

A new service, not page-level logic directly, so the "what needs attention" concept is reusable (the sidebar badge/dots will need the exact same data later — see Scope).

```
attentionAggregatorService.ts
  ├─ reads: agentBusService (real chat/Jose approvals)
  ├─ reads: services/approval/approvalService.js (real Project Execution approvals, made real by PR #225)
  ├─ reads: coachHistoryService (fired coach signals)
  └─ reads: connectorCircuitBreakerService.getAll() (real tripped-circuit state — see §Connector normalization fix below; deliberately NOT connectorHealthCheckService, see §No fresh expensive operations)
```

This mirrors `RightPanel.tsx`'s existing polling pattern in this codebase (chosen over an event-driven rewrite of all 4 source services, and over page-level direct queries — see the brainstorming session's SWOT comparison for the full reasoning). Poll interval: 60s, matching `proactiveAgentService.js`'s existing convention rather than inventing a new number.

### No fresh expensive operations (self-critique fix #2)

`getAttentionItems()` must only read each source's **already-computed, cached, last-known state** — it must never trigger a new operation itself. This matters concretely for connectors: verified that `connectorHealthCheckService.ts`'s `checkConnectorHealth()` performs a real live network ping per call (confirmed: real `fetch`-style calls per connector, e.g. `checkGitHubConnection()`, `checkSlackConnection()`, etc.). Calling this for every configured connector on every 60s poll would mean a live network ping storm every minute across potentially dozens of connectors — a real cost/rate-limit risk, not a style preference. The aggregator must never call this service. Use `connectorCircuitBreakerService.getAll()` instead (see next section) — it's a passive read of state already recorded by real connector usage elsewhere in the app, zero new network calls.

### Connector normalization fix (self-critique fix #1)

Originally this spec mapped any `disabled` connector (per `connectorStatusService.ts`'s `deriveConnectorStatus()`) to `medium` severity. **This was a real bug, not a style choice:** verified `deriveConnectorStatus()`'s real categories — `'live' | 'missing_config' | 'foundation_only' | 'placeholder' | 'disabled'` — and none of them distinguish "the user never configured this" from "this broke." This app has 14 disabled connectors today per its own real connector-status counts; treating all of them as "needs attention" would flood the list with noise from connectors nobody ever intended to use, burying whatever actually matters.

**Fixed approach:** only connectors whose circuit is currently open in `connectorCircuitBreakerService.ts` (`isOpen(connectorId)` returns `true`, populated by real `recordFailure()` calls from actual connector usage elsewhere in the app) produce an `AttentionItem`. This is a genuine "was working, now failing" signal, not a static configuration category — a connector the user never set up will never trip a circuit breaker, so it correctly never appears. Severity for these: `medium` (unchanged from before, still the roughest tier in this table since circuit-breaker state doesn't carry its own severity scale either, but at least the *inclusion criterion* is now correct).

### Failure isolation across the 4 sources (self-critique fix #3)

Each source is fetched independently (`Promise.allSettled`, not `Promise.all`) so one source's failure doesn't take down the whole list. If, say, the connector-circuit read throws, `getAttentionItems()` swallows that one source's failure internally and returns the other 3 sources' items — never an empty list or a thrown error just because one of four sources had a problem. (Implemented in `08-phase2-attention-aggregator-plan.md` as a simple try/catch per source rather than a `crashLogService.ts` call — logging every transient poll failure to the crash log would be noisy for what's expected to be an occasional, recoverable condition; revisit if that turns out to hide a real recurring problem.)

### Dismissal / acknowledgment (self-critique fix #4)

Approval items need no dismissal mechanic — they naturally leave the list once approved or rejected via the real underlying call. Sentinel/Coach/Connector items have no such natural resolution and would otherwise resurface on every single 60s poll forever, even after a user has seen and consciously decided to ignore one. Fix: a small `dismissedAttentionItems` set, keyed by each item's stable `id`, persisted the same way `agentAuditService.ts`'s audit log already persists (durable localStorage-backed, matching this codebase's established pattern rather than inventing a new storage mechanism) — a dismissed item is suppressed from the rendered list until the underlying condition actually changes (a new/different `id` is generated, e.g. a new Sentinel finding or a different connector's circuit tripping), not permanently silenced regardless of new problems. Dismissal is a page-level UI action (not part of `attentionAggregatorService.ts` itself, which stays a pure read — dismissal filtering happens in the component consuming it), so the service itself stays simple and the same raw list is available to future consumers (sidebar badge/dots) that may want their own, different dismissal behavior.

## Data model

```ts
// src/services/attentionAggregatorService.ts

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

export function getAttentionItems(): Promise<AttentionItem[]>;
```

## Severity normalization (verified against each source's real field, not assumed)

| Source | Real field checked | Mapping |
|---|---|---|
| Approvals, both systems (`agentBusService.ts`, `approvalService.js`) | `riskLevel: string` (defaults `'medium'`, confirmed in both files) | Direct passthrough |
| Coach (`coachEngineService.ts`) | `severity: 'critical' \| 'warning' \| 'neutral' \| 'positive'`, but only `critical`/`warning` ever actually fire (confirmed: `if (signal.severity !== 'critical' && signal.severity !== 'warning') return null`) | `critical` → `critical`; `warning` → `medium` (Coach's "warning" isn't equivalent to a medium-risk approval, but avoids inventing a 6th severity tier for one source alone) |
| Connectors (`connectorCircuitBreakerService.ts`) | **No native severity field**, and — verified, not assumed — `connectorStatusService.ts`'s static config categories (`live`/`missing_config`/`foundation_only`/`placeholder`/`disabled`) cannot distinguish "never configured" from "broke," so those are NOT used for inclusion (see the Connector normalization fix section above). Only a connector with `isOpen(connectorId) === true` (a real, currently-tripped circuit from actual recent failures) qualifies at all. | `medium`. Still the roughest severity in this table since circuit-breaker state carries no native severity scale either, but the *inclusion criterion* is now a genuine degradation signal instead of a static configuration category. |

## Sorting

Severity tier first (`critical` > `high` > `medium` > `low`), then timestamp descending within each tier. Matches the user's explicit choice over strict recency or per-source grouping, reasoning being that a routine connector blip should never bury an urgent security finding just because it's newer.

## Interaction model

- **Approvals (both sources, `actionable: true`):** render inline Approve/Reject buttons directly in the list. Clicking calls the real underlying approve/reject function for that item's source (`agentBusService`'s or `approvalService.js`'s, matching which one produced the item) — never a generic shared handler that assumes one API shape for both.
- **Coach / Connector items (`actionable: false`):** click-to-expand-detail only. No inline action, since these aren't "approve or reject" decisions.

## Empty state

Per Phase 1 spec §8 (added during the self-critique pass earlier this session): a real empty state, not a hidden/blank section. Uses the current room's `Zone` mood (`neutral` for Home) and plain-language copy (e.g. "Nothing needs you right now" — exact copy is an implementation-time detail, not fixed here), not a bare "no items" default.

## Visual layer — SUPERSEDED, see "Visual Pass Design" section below

This section originally described a top-nav skeleton (brand mark, curated tabs, right-cluster search/bell/theme/avatar) — that skeleton was explicitly rejected during later brainstorming (see `draft-a-power-user-direction.md`'s Revision History) in favor of the Arc/Notion-style sidebar. Read the "Visual Pass Design" section below instead of this one for the current, real design. Left here struck-through-in-spirit rather than deleted so the rejection reasoning isn't lost.

## Testing approach (TDD, per the executing-plans convention already used in Phase 1)

1. Unit tests for `attentionAggregatorService.ts`'s merge/normalize/sort logic, mocking all 4 source functions — covering: correct severity mapping per source, correct sort order (severity then recency), correct `actionable`/`onApprove`/`onReject` wiring only for the two approval sources, **one source throwing does not prevent the other 3's items from being returned** (self-critique fix #3), and **a connector with `isOpen() === false` never produces an item regardless of its `deriveConnectorStatus()` category** (self-critique fix #1 — the regression test for the exact bug this fix corrects). All implemented and passing — see `08-phase2-attention-aggregator-plan.md`.
2. Component test for the Mission Control page consuming the service (mocked), covering: rendering items, empty state, inline approve/reject triggering the right underlying call for the right source, and **dismissing a non-actionable item removes it from view but a fresh poll with a genuinely new item's `id` still shows that new one** (self-critique fix #4). Not yet implemented — part of the follow-up page-visual plan.

## Visual Pass Design (locked via live brainstorming, backend half already shipped)

Backend half (`attentionAggregatorService.ts`, 3 sources: `approval-chat`/`approval-project`/`connector`) and the functional page-wiring (`MissionControlHome.tsx`'s next-actions list) are both already implemented and committed — see `08-phase2-attention-aggregator-plan.md` and `09-phase2-mission-control-page-wiring-plan.md`. This section specs the remaining visual rewrite: replacing the page's current bordered-card treatment with Draft A's Home room language.

### Skeleton change

- **Full replacement of the hero banner** (currently a static image with `ALPHONSO_BANNER.webp`/`ALPHONSO_LOGO.webp`) with Draft A's agent-portrait strip: all 9 real agent portraits, horizontally laid out, idle agents dimmed/desaturated, genuinely active agents (real signal, not illustrative — see Open Items below) get the breathing-glow animation.
- **Sidebar present** (the locked Arc/Notion-style sidebar from `draft-a-power-user-direction.md`'s Revision 2 "Rooms" skeleton — NOT the earlier, explicitly-rejected top-nav-with-dropdowns version). Home space's sidebar list gets 2 more real destinations beyond the original Dashboard/Chat: **Session History** (`SessionHistoryView.tsx` — a real, existing component with no current obvious home) and **Digest** (`DigestPanel.tsx` — same). This was a judgment call made during brainstorming, not independently confirmed as definitely correct — flagged as an open item below.
- Local AI online/offline status moves from a big stat tile to a **small persistent status dot** next to the sidebar's search field — always visible regardless of what else is happening, since it's arguably the single most consequential piece of status on this page (agent reasoning degrades without it).

### Stats

Down from 4 tiles to **2**, each carrying real context instead of a bare count:
- **Approvals** — real count from `attentionAggregatorService`'s actionable items, plus "oldest waiting {duration}" computed from the oldest item's `timestamp` field (real data already available, not new to fetch).
- **Active agents** — real count of agents with recent activity (see Open Items — exact signal/threshold not yet finalized) out of 9, plus a contextual sub-line (exact wording like "busier than your daily average" needs a real baseline to compare against — see Open Items, this is illustrative copy from the mockup, not a designed feature yet).

Memory and Coach counts explicitly removed from this row (were present in the original page, deemed "too big/bold for their importance" during brainstorming) — not relocated anywhere in this spec; if that data still matters somewhere, it's an explicit future decision, not assumed to belong on Home.

### Empty state (required by Phase 1 spec §8, designed here for the first time)

When `getAttentionItems()` returns nothing: the "What to do next" Zone is replaced by a distinct empty-state Zone (cool-mood wash), centered icon + title ("Nothing needs you right now") + plain-language sub-copy pointing at Quick Launch. Stats still render (showing real zeros with honest context: "queue clear", "idle") rather than being hidden.

### Dynamic greeting

"Good morning"/"Good afternoon"/"Good evening" based on real local time, replacing the current hardcoded "Executor online." headline. Exact time boundaries (e.g. is 5pm "afternoon" or "evening") are an implementation-time judgment call, not specified further here.

### Zone sections (Quick Launch, What to do next) — unchanged from earlier mockup rounds

Both use the `Zone` primitive (warm wash for "What to do next," cool wash for "Quick Launch"), matching the already-committed `ui/Zone.tsx` from Phase 1 — no new primitive needed, this page is `Zone`'s first real consumer.

## Explicitly open / deferred (not resolved by this spec)

- **Exact "is this agent active" signal** for the breathing-glow strip and the "Active agents X/9" stat — `MissionControlHome.tsx` already imports `listAgentActivity()` from `agentActivityService.ts` (real, confirmed), but the exact recency threshold that counts as "active" (mockups used an illustrative "3 of 9" throughout) needs a real decision during implementation — not assumed here.
- **"Busier than your daily average" is illustrative copy from the mockup, not a designed feature.** Computing a real daily-average baseline to compare against is real, separate logic (would need historical activity data over time) — do not implement literal copy like this without either building that baseline for real or replacing it with something honest that doesn't imply a comparison that doesn't exist.
- **Session History / Digest as new Home-sidebar destinations** — a judgment call made during brainstorming (both are real, existing, currently-homeless components), not independently confirmed as definitely the right 2 additions. Worth a final gut-check before implementation, not treated as fully locked.
- Exact empty-state copy — a real implementation-time decision, not fixed in this spec (mockup text — "Nothing needs you right now" — is illustrative, not final).
- Sidebar badge/ambient-dot wiring — separate task, explicitly out of scope (see Scope section).
- Dark-mode tokens for the Home room — Phase 1 spec already flagged this as unresolved (only light-mode was mocked); this page's implementation will need a real decision here too, not deferred silently a second time.
- **Local AI status dot** placement/behavior (next to sidebar search) is new to this pass — needs a real data source check (`ollamaStatus` prop, already passed into this component today) before implementation, not assumed to already exist in the right shape.
