# Alphonso Session Coach — Implementation Plan

**Status:** Ready for implementation — full spec, 6 phases (not v1-only)
**Author:** Claude Code (planning pass), 2026-07-23 — expanded same day from an initial v1-only draft after explicit direction to make it comprehensive
**Implementer:** OpenCode (this document is the handoff)
**Verifier:** Claude Code (post-implementation audit — see the verification prompt at the bottom of this doc's companion message)

**Recommended delivery approach:** implement and PR **one phase at a time**, not as one giant PR. This repo's own Boardroom rebuild (`docs/superpowers/plans/2026-07-10-boardroom-*-phase{1..12}.md`) used exactly this pattern — independently planned, independently committed-and-pushed phases, each stating its own scope up front — and it's called out favorably in `CLAUDE.md` as the model to follow. Phase 0 and Phase 1 (§2–§4) are the load-bearing core; Phases 2–5 (§9–§12) are real, fully-specced, but each is independently useful and independently deferrable if priorities shift mid-build.

---

## 0. Why this exists (read this before touching code)

Alphonso has a fully-built Coach Mode desktop window (`src/components/CoachWindow.tsx`, `src/contexts/CoachContext.jsx`, `src/services/coachModeService.ts`). The window opens correctly, shows live agent-status badges, a skill grid, mic status — all real. It also has an **intervention card** slot designed to proactively surface "notice this" messages (`src/services/coachInterventionService.ts`).

That intervention card has never had a real signal source. The only thing that ever populates it today is a manual "Demo" button (`showDemoIntervention()` in `CoachContext.jsx`) that fabricates a fake message. `coachInterventionService.ts` is named and shaped around a "SessionGuard bridge" — a planned integration with a separate, unrelated local product (`D:\AgentDevWork\repos\SESSIONGUARD`, a casino/slot-session gambling-risk intelligence platform). **That bridge was investigated and confirmed to not exist on either side** — SessionGuard has zero references to Alphonso anywhere in its codebase, and nothing in Alphonso talks to a running SessionGuard instance. It's a dead naming artifact, not a working integration.

### What we're building instead

Not a connection between the two products — they solve unrelated problems for unrelated sessions (gambling-risk monitoring vs. AI-agent orchestration). Instead: **borrow SessionGuard's proven coaching *architecture*** (`engines/live_coach_engine.py` — rolling event window → stats aggregation → ordered threshold detectors → severity-tiered message) and build Alphonso's own version of it, fed entirely by telemetry Alphonso already collects about its own user's session. Fully local. No new infrastructure class — reuses `durableStore.js` (the existing SQLite dual-write layer) for persistence.

### Non-goals (explicitly out of scope — do not build these)

- **No connection to the SessionGuard repo or product**, in code, data, or naming. Do not add any dependency, import, network call, file-read, or shared-storage path pointing at `D:\AgentDevWork\repos\SESSIONGUARD` or anything resembling it. This plan borrows a *pattern*, not a *pipe*.
- No new database engine, ORM, or cloud service. Everything here fits in the existing local SQLite store.
- No screen capture, OCR, or keystroke/activity monitoring of any kind. All signals come from services Alphonso already runs and already logs to.
- Phase 1 ships one well-written tone per trigger, no style selector, and rule-based text only, no LLM generation — but both of those ARE now in scope, specced in full in §10 (message styles) and §11 (Ollama narrative layer). "Not v1" does not mean "not in this plan" — see the phase breakdown below.

---

## 1. Architecture overview

```
[Alphonso services already emit/store]          [NEW]                              [ALREADY BUILT — do not touch shape]
agentAuditService (approvals)         ──┐
orchestrationReceiptService (failures) ─┤        coachEngineService.ts              CoachContext.jsx
orchestrationQueueService (DLQ)        ─┼──►    (rolling window, detectors,   ──►   coachIntervention state
agentPerformanceService (trends)       ─┤        severity tiers, cooldown)          CoachInterventionCard.tsx
[Phase 0 fix below]                    ─┘                                            (renders whatever it's given)
```

The detection engine is a **new, small, pure-logic module** (`src/services/coachEngineService.ts`) that:
1. Reads from existing services (no new event bus, no new telemetry — pull-based, computed on demand)
2. Runs an ordered list of detector functions, each returning `null` or a `CoachSignal`
3. Applies a cooldown/dedup rule so the same trigger doesn't fire every render
4. Hands the winning signal to the *existing* `coachIntervention` state in `CoachContext.jsx` via the *existing* `pushSessionGuardBridgeEvent`-shaped call (renamed — see §5)

This mirrors `live_coach_engine.py`'s `_detect_patterns()` shape almost exactly: an ordered `if` chain, most-severe-first, first match wins, each returning a typed message object.

---

## 2. Prerequisite fix — Phase 0 (do this first, blocks 2 of the 7 triggers)

**Real gap found during planning, not hypothetical:** `logApprovalEvent()` in `src/services/agentAuditService.ts` has a complete, tested API (`logApprovalEvent`, `getAuditLog`, `clearAuditLog` — 100-entry ring buffer, SQLite dual-write) — but grep confirms **it is never called from any non-test file in the entire codebase**. The Audit tab in `RightPanel.tsx` that's supposed to show "last 10 approval events" is fed from an API that nothing in production ever writes to. It's a real, present, but silently-empty feature.

`src/components/ApprovalModal.tsx` already receives everything needed at render time: `action`, `connector`, `riskLevel`, `mariaScore`, and calls a plain `onConfirm()`/`onCancel()` callback with no arguments. Find wherever `<ApprovalModal>` is rendered (search for `<ApprovalModal` — as of this writing it's wired through the app shell's approval-flow state, not inside the component itself) and:

1. Wire `onConfirm`/`onCancel` at that call site to call `logApprovalEvent(packetId, agent, action, outcome)` — you'll need to thread `packetId`/`agent` through if they aren't already in scope there (they should be, since that's what triggered the modal).
2. **Extend `ApprovalAuditEntry`** (in `agentAuditService.ts`) with two new optional fields: `riskLevel?: string` and `mariaScore?: number | null`. Pass them through from the same call site — `ApprovalModal` already has both as props, so the caller already has them in scope.
3. Update `src/test/agentAuditService.test.js` with tests covering the new fields (optional — must not break existing entries that omit them).
4. Do **not** change the storage key (`alphonso_approval_audit_v1`) or break the 100-entry ring buffer behavior — only add fields.

**Acceptance for Phase 0:** `grep -rn "logApprovalEvent" src --include="*.tsx" --include="*.ts" --include="*.jsx" --include="*.js" | grep -v /test/` returns at least one hit outside `agentAuditService.ts` itself. Existing `agentAuditService.test.js` suite still passes. `RightPanel.tsx`'s Audit tab shows a real entry after approving or denying something in a manual smoke test.

---

## 3. The 7 triggers (v1 scope)

Message tone: one fixed, well-written string (or short template) per trigger — no style selector. Each detector returns `{ severity, trigger, message }` matching the existing `CoachIntervention` shape already consumed by `CoachInterventionCard.tsx` (check that interface in `coachInterventionService.ts` — reuse it exactly, do not redefine).

Severity tiers, in firing priority order (most severe wins if multiple fire at once — mirrors `live_coach_engine.py`'s ordered-check pattern):

### 3.1 `critical_override_pattern` — "Approval theater" (merges the original "ignoring warnings" idea with chronic-pattern detection — richer than a single-event check)
- **Data source:** `getAuditLog()` from `agentAuditService.ts` (post-Phase-0, now carrying `riskLevel`/`mariaScore`).
- **Logic:** In the last 20 audit entries, count entries where `riskLevel === 'high'` (or `mariaScore >= 70`) AND `outcome === 'approved'`. If that count is ≥ 5 **and** they span ≥ 3 distinct `action` values sharing a common prefix/category (start simple: same `action` string, exact match, appearing ≥ 3 times) → fire.
- **Message (critical):** `"You've approved {N} high-risk '{action}' actions recently despite the risk flag each time. Worth reviewing whether this category should just be pre-approved, or whether it needs a closer look."`

### 3.2 `late_night_approval` — "The late-night tell"
- **Data source:** `getAuditLog()`, `timestamp` field (already present, no Phase 0 dependency for this one specifically — but still benefits from riskLevel if available).
- **Logic:** Most recent audit entry has `outcome === 'approved'`, `riskLevel === 'high'` (skip if riskLevel absent — don't guess), and local hour-of-day from `timestamp` is in `[0, 5]` (midnight–5am).
- **Message (warning):** `"That was a high-risk approval at {hour}am. No judgment — just flagging it in case a fresher look tomorrow changes anything."`
- Keep this gentle — it's explicitly the one idea borrowed most directly from SessionGuard's tilt-detection logic, reframed for fatigue instead of gambling. Do not make the tone alarmist.

### 3.3 `repeated_pipeline_failure`
- **Data source:** `orchestrationReceiptService.js` (or `orchestrationQueueService.ts`'s packet history — check both, use whichever actually records per-attempt outcomes with an agent/task identifier) and `crashLogService.ts` (`getCrashLog()`).
- **Logic:** Same agent + same action-type combination fails ≥ 3 times within the last 10 recorded attempts for that agent.
- **Message (warning):** `"{agent} has failed '{actionType}' {N} times in a row. Might be worth checking its skill pack or recent output before retrying again."`

### 3.4 `dead_letter_graveyard`
- **Data source:** `getDeadLetterCount()` and `getOldestDeadLetterTimestamp()` — **both already exist, exactly built for this, in `src/services/orchestrationQueueService.ts`.** This is the cheapest trigger to implement in the whole plan.
- **Logic:** `getDeadLetterCount() >= 5` OR oldest dead-letter item is more than 48 hours old.
- **Message (neutral/warning):** `"{N} items sitting in the dead-letter queue, oldest from {relativeTime} ago. Worth a review, or safe to clear?"`

### 3.5 `confidence_decay`
- **Data source:** `getPerformanceTrend(agentName, days)` — **already exists, exactly built for this, in `src/services/agentPerformanceService.ts`.** Loop it over the 9 agents.
- **Logic:** For each agent, compare the trend's recent-window success rate vs. its earlier-window success rate (check the exact shape `getPerformanceTrend` returns — it's described as agent + days → trend result). Fire if any agent's recent rate has dropped by ≥ 25 percentage points from its earlier rate, with a minimum sample size guard (don't fire on 1–2 data points).
- **Message (warning):** `"{agent}'s success rate has dropped noticeably over the last {days} days ({oldRate}% → {newRate}%). Might be worth a look at recent tasks or its skill pack."`

### 3.6 `approval_rubber_stamp`
- **Data source:** `getAuditLog()` (post-Phase-0 for `timestamp` deltas — already present regardless).
- **Logic:** Look at consecutive `outcome === 'approved'` entries; if ≥ 4 approvals happened with < 3 seconds between each `timestamp` (i.e., clicked through without plausible time to read the modal), fire. Tune the threshold during implementation — 3s is a starting guess, not a hard requirement; document whatever you land on.
- **Message (warning):** `"The last {N} approvals went through in under {threshold}s each. If that's a batch of things you already reviewed, ignore this — just checking nothing's getting rubber-stamped."`

### 3.7 `long_unbroken_session`
- **Data source:** New, minimal: a session-start timestamp. Check whether something already tracks "app session start" (search `App.tsx`/boot effects for an existing session-start marker before adding a new one — do not duplicate if one exists). If nothing does, the smallest correct fix is a single `localStorage`/`durableStore` timestamp set once on boot, cleared on a defined "break" signal (e.g., app losing focus for >10 minutes, if that's cheaply detectable via the `visibilitychange`/`blur` events — otherwise just use wall-clock since boot, documented as an approximation).
- **Logic:** Elapsed time since session start (or since last detected break) exceeds a threshold — suggest 90 minutes as the v1 default, but this is a judgment call, not a hard number; note your choice and reasoning in the PR description.
- **Message (neutral):** `"You've been actively driving Alphonso for over {N} minutes straight. No rush — just a nudge to take a break if it's a good moment."`

The 4 remaining ideas from the original brainstorm are not deferred/vague anymore — they're fully specced in **§9 (Phase 2 triggers)**, grounded in real code the same way as the 7 above. Build them after Phase 1 is merged and stable, in their own phase/PR.

---

## 4. Engine design

```ts
// src/services/coachEngineService.ts (new file)

export interface CoachSignal {
  id: string;              // trigger id, e.g. 'dead_letter_graveyard'
  severity: 'critical' | 'warning' | 'neutral' | 'positive';
  message: string;
  detectedAtMs: number;
}

// One function per trigger in §3, each pure and independently testable:
export function detectApprovalTheater(): CoachSignal | null { ... }
export function detectLateNightApproval(): CoachSignal | null { ... }
export function detectRepeatedPipelineFailure(): CoachSignal | null { ... }
export function detectDeadLetterGraveyard(): CoachSignal | null { ... }
export function detectConfidenceDecay(): CoachSignal | null { ... }
export function detectApprovalRubberStamp(): CoachSignal | null { ... }
export function detectLongUnbrokenSession(): CoachSignal | null { ... }

// Ordered, most-severe-first, mirrors live_coach_engine.py's _detect_patterns() shape:
const DETECTORS = [
  detectApprovalTheater,        // critical
  detectLateNightApproval,      // warning
  detectRepeatedPipelineFailure,// warning
  detectConfidenceDecay,        // warning
  detectApprovalRubberStamp,    // warning
  detectDeadLetterGraveyard,    // neutral/warning
  detectLongUnbrokenSession,    // neutral
];

export function runCoachDetectors(): CoachSignal | null {
  for (const detect of DETECTORS) {
    const signal = detect();
    if (signal) return signal;
  }
  return null;
}
```

**Cooldown/dedup:** Do not fire the same `id` more than once per N minutes (suggest 15 — tune during implementation) and do not re-fire the exact same signal if the user already dismissed/acknowledged it this session. Store last-fired state in a small local map (in-memory is fine for "this session"; persist to `durableStore` only if you want it to survive app restart — your call, document which you chose).

**Wiring point:** Call `runCoachDetectors()` on an interval (reuse the existing pattern from `proactiveAgentService.js`'s 60s interval if one already exists that's a good fit — check before adding a second interval timer) or on the same cadence `RightPanel.tsx`'s auto-refresh uses (10 minutes — probably too slow for this; a dedicated shorter interval, e.g. 60–120s, is reasonable). When a signal fires, feed it into `CoachContext.jsx`'s existing intervention state through the same path `showDemoIntervention` uses today, just with a real signal instead of `buildDemoSlotIntervention()`.

---

## 5. Rename the dead "SessionGuard bridge" naming

`src/services/coachInterventionService.ts` currently exports `SESSION_GUARD_BRIDGE_STORAGE_KEY`, `SESSION_GUARD_BRIDGE_EVENT`, `listSessionGuardBridgeEvents`, `pushSessionGuardBridgeEvent`, `subscribeSessionGuardBridge`, `getLatestSessionGuardBridgeIntervention` — all named after an integration that was investigated and confirmed to not exist (see §0). Since this plan replaces that dead path with a real one:

1. Rename these to something accurate — e.g. `COACH_ENGINE_STORAGE_KEY`, `COACH_ENGINE_EVENT`, `pushCoachSignal`, `subscribeCoachEngine`, `getLatestCoachSignal`. Pick names that read correctly once this plan is implemented; don't just keep the misleading names for compatibility.
2. Grep for every caller of the old names (`CoachContext.jsx` and its test file at minimum) and update them.
3. Check `.gitignore`'s `.sessionguard/`, `.coach-bridge/`, `sessionguard-bridge/` entries — these can be removed if nothing in the codebase writes to those paths after this change (verify with a grep before removing; don't remove speculatively).
4. Update the "Coach system" and "SessionGuard" rows in `CLAUDE.md`'s "Do Not Duplicate" table to reflect the new reality — this is a **required** part of the PR per this repo's own stated rule (docs must be updated in the same commit as the code, not as a follow-up — see `CLAUDE.md`'s feedback memory on this).

---

## 6. File-by-file task list

### Phase 0 + 1 (core — do these first)

| File | Change |
|---|---|
| `src/services/agentAuditService.ts` | Extend `ApprovalAuditEntry` with optional `riskLevel`/`mariaScore` (Phase 0) |
| Wherever `<ApprovalModal>` is actually rendered (find it — likely `App.tsx` or an approval-flow hook) | Wire real `logApprovalEvent()` calls on confirm/deny (Phase 0) |
| `src/services/coachEngineService.ts` | **New file** — 7 detector functions + `runCoachDetectors()` (§4) |
| `src/services/coachInterventionService.ts` | Rename SessionGuard-bridge exports to Coach-engine naming (§5); keep the underlying storage/event mechanics, just rename |
| `src/contexts/CoachContext.jsx` | Wire a real interval calling `runCoachDetectors()`, feeding results through the (renamed) existing intervention plumbing; update references to renamed exports |
| `src/test/services/coachEngineService.test.js` | **New file** — unit tests per detector, each with a fabricated data scenario proving it fires/doesn't fire correctly |
| `src/test/agentAuditService.test.js` | Extend for new optional fields |
| `src/test/coachContextTauriDetection.test.jsx` / other Coach test files | Update for renamed exports if referenced |
| `CLAUDE.md` | Update "Coach system" row in Do Not Duplicate table; remove or correct any stale "SessionGuard bridge" description |
| `.gitignore` | Remove `.sessionguard/`/`.coach-bridge/`/`sessionguard-bridge/` entries only if confirmed unused post-rename |

### Phase 2 (§9)

| File | Change |
|---|---|
| `src/services/coachEngineService.ts` | Add `detectAgentWhiplash`, `detectBoardroomHedgePileup`, `detectUnusedSurfaceArea`, `detectLicenseWall`; extend `DETECTORS` array |
| `src/services/licenseService.ts` (or a new small companion service) | Add the denial-logging prerequisite from §9.4 |
| `src/services/skillPackService.js` | Optional: add "last invoked at" tracking if building the skill-pack half of §9.3 |
| `src/test/services/coachEngineService.test.js` | Add fire/silent tests for the 4 new detectors |

### Phase 3 (§10)

| File | Change |
|---|---|
| `src/services/coachEngineService.ts` | Add `style` parameter to every detector's message construction; 3 hand-written variants each |
| `src/services/coachModeService.ts` or settings store | Persist chosen style |

### Phase 4 (§11)

| File | Change |
|---|---|
| `src/services/coachEngineService.ts` | Add `generateNarrativeCoachMessage()`, gated + fallback-safe per §11 |

### Phase 5 (§12)

| File | Change |
|---|---|
| `src/components/SettingsView.tsx` | New Coach settings section — master toggle, per-trigger toggles, style selector, Ollama toggle, snooze control |
| `src/components/CoachHistoryPanel.tsx` | **New file** — history list UI, mirrors `NovaHistoryChart.jsx`/`EchoTimeline` pattern |
| `src/services/coachEngineService.ts` or a new `coachHistoryService.ts` | Persist fired signals to a capped ring buffer |

---

## 7. Testing & merge requirements (repo standard — see `CLAUDE.md`)

- `npm run test` on every touched/new test file — all passing, no regressions in existing Coach/audit suites.
- `npx tsc --noEmit` clean.
- `npm run lint` clean.
- This repo has **branch protection on `main`** requiring 4 status checks (Test & Build, Rust Tests & Clippy, Secrets Scan, Doc Count Freshness) — direct pushes to `main` are rejected by GitHub. Work on a feature branch, push it, open a PR via `gh pr create`, wait for CI to go green, then merge — do not attempt `git push origin main` directly, it will fail.
- If `docs/ALPHONSO_GROUND_TRUTH.md`, `README.md`, or `AGENTS.md` reference version/count numbers that this change affects, run `node scripts/verify-doc-counts.mjs` before opening the PR (this exact check has failed a real PR before over a missed doc sync — see repo history).
- Every detector across all phases (7 in Phase 1, 4 more in Phase 2 — 11 total) needs at least one test proving it fires under a constructed scenario and one proving it stays silent under a normal/clean scenario — mirroring how `live_coach_engine.py`'s detectors are individually testable.
- Ship each phase as its own PR, in order (0 → 1 → 2 → 3 → 4 → 5), each independently green on CI before the next starts. Do not batch multiple phases into one PR — this repo's own precedent (the 12-phase Boardroom rebuild) shows small, independently-verified phases catch real bugs (a timeout bug, a lazy-import crash) that a single giant PR would have buried.

---

## 8. Explicit boundaries for whoever implements this

- Do not touch `D:\AgentDevWork\repos\SESSIONGUARD` in any way — it's a separate repo, separate product, not in scope, in any phase.
- Phase 1 (§3–§4) ships one message per trigger, no style selector, rule-based only. Do not pull §10/§11 work forward into the Phase 1 PR — keep phases independently mergeable.
- Do not invent a new local database/storage mechanism in any phase — use `durableStore.js`.
- If any of the "find the real call site" tasks (Phase 0's ApprovalModal wiring, the session-start-for-§3.7 check, the license-denial logging in §9.4) turn out to already exist somewhere not mentioned in this doc, use what's there — don't build a duplicate. This repo has a documented history of exactly that mistake (see `CLAUDE.md`'s "Do Not Duplicate" table) and it's explicitly called out as something to check first.
- Every new prerequisite instrumentation point this doc introduces (Phase 0's approval logging, §9.4's license-denial logging) must follow the same shape: extend an existing service's data with new optional fields / a new small logging call, never a parallel duplicate logging system.

---

## 9. Phase 2 — the 4 originally-deferred triggers, now fully specced

These were "ideas" in the original brainstorm. They are now grounded in real, verified code — same rigor as §3. Build after Phase 1 is merged.

### 9.1 `agent_whiplash`
- **Data source:** task-type → agent assignment history. **Not yet grounded in an existing store** — before writing new tracking, check `joseExecutionEngineService.js`'s assignment records and `agentBusService`'s packet history for whether action-type + assigned-agent is already recorded per packet (it likely is, since routing decisions have to be persisted somewhere for the orchestration queue to work at all — confirm the exact field name before assuming a shape).
- **Logic:** In the last 10 packets sharing the same normalized `actionType`, if the assigned `agent` changes ≥ 3 times (A→B→A or similar oscillation, not just "3 different agents ever") within a short window (e.g. last hour), fire.
- **Message (neutral):** `"'{actionType}' has bounced between {agentList} a few times recently. Might be worth deciding which agent should own this task type."`

### 9.2 `boardroom_hedge_pileup`
- **Data source:** confirmed real and already persisted — `BoardroomChatView.tsx` already calls `detectLowConfidence(replyText)` (from `boardroomFacilitatorService.ts`) and, when true, persists a real message via `addThreadMessage({ ..., kind: 'escalation' })` into `boardroomThreadService.ts`'s thread storage. No new instrumentation needed — this is the cheapest Phase 2 trigger.
- **Logic:** Query recent thread messages (via `listThreadMessages`/equivalent) across active threads; if ≥ 3 messages with `kind === 'escalation'` land in the same thread within a short window (e.g. last 30 minutes), fire — regardless of which agents produced them.
- **Message (warning):** `"{N} agents have flagged low confidence in the same Boardroom thread. This might genuinely need your judgment call rather than another agent's guess."`

### 9.3 `unused_surface_area` — "You built it, you never used it"
- **Data source:** `getConnectorAuditLog()` / `getLastEntryForConnector(connectorId)` from `connectorAuditLogService.ts` (confirmed real, tracks per-connector call attempts with `ok`/`latencyMs`/`errorCode`) cross-referenced with `connectorRegistryService.ts`'s "configured" connectors (from `envPresence`/`status`). Skill-pack usage tracking was **not found** in `skillPackService.js` during this planning pass — if you want the skill-pack half of this trigger, you'll need to add a lightweight "last invoked at" timestamp to skill-pack records first (a Phase-0-shaped prerequisite); the connector half needs no new instrumentation and can ship alone if the skill-pack half is deferred further.
- **Logic (connector half):** A connector is "configured" (has required env present / `status === 'configured'`) but `getLastEntryForConnector(connectorId)` is `null` or older than N days (suggest 14).
- **Message (neutral):** `"{connectorName} has credentials saved but hasn't been used in {days} days. Worth trying it, or is it safe to disable?"`

### 9.4 `license_wall` — "The wall you keep hitting"
- **Prerequisite instrumentation gap found, same pattern as Phase 0:** `licenseService.ts` has a real `canUseConnector(connectorId)` gate function, consumed by `policyEnforcementService.ts`, but **nothing logs when it returns `false`** — there is no denial-event history anywhere in the codebase (confirmed via grep). This trigger cannot be built until that's added.
- **Prerequisite task:** wherever `canUseConnector`'s `false` result actually blocks an action in the UI (trace it from `policyEnforcementService.ts`'s consumers), log a lightweight denial event — connector id + timestamp — into a small new ring buffer (mirror `agentAuditService.ts`'s exact shape: a capped array in `durableStore`). Do not build a generic analytics system for this — one small, purpose-built log, same pattern as the audit log.
- **Logic (after the prerequisite exists):** Same connector denied ≥ 5 times within the last 7 days.
- **Message (neutral):** `"You've tried to use {connectorName} {N} times this week — that's Pro-gated on your current tier. Worth upgrading, or should this stay off your radar?"`

---

## 10. Phase 3 — configurable message styles

SessionGuard's `live_coach_engine.py` supports `strict/balanced/supportive` — same detection, different phrasing. Port that idea, renamed to fit Alphonso's tone (avoid literally reusing SessionGuard's names, to keep the "borrowed pattern, not shared identity" boundary clean — suggest `direct / balanced / gentle`).

- Extend each `detect*()` function's message construction to take a `style` parameter and return the right variant — mirror `live_coach_engine.py`'s `m(critical_text, balanced_text, supportive_text)` helper pattern exactly, it's a clean, proven shape.
- Every trigger in §3 and §9 needs all 3 style variants written — this is real writing work, not boilerplate; don't auto-generate from a template, each should read like it was written for that tone.
- Store the user's chosen style as a setting (see §12) — default to `balanced`.
- **Acceptance:** every detector has 3 hand-written message variants; switching the setting changes live output without needing an app restart.

---

## 11. Phase 4 — optional Ollama-narrative layer

SessionGuard's `_nvidia_coach()` is gated behind `has_issue` (only called for consequential situations, not every trigger) and falls back cleanly to rule-based text on any failure (`except Exception: return None`, then `_detect_patterns()` runs anyway). Port that exact gating and fallback shape — do not make every intervention an LLM call, and never let an LLM failure produce a blank/broken intervention.

- New function, e.g. `generateNarrativeCoachMessage(signal: CoachSignal, style: string): Promise<string | null>` — calls local Ollama (reuse `generateOllamaResponse`/whatever the existing single-turn helper is in `src/lib/ollama.js` — do not add a second Ollama client) with a system prompt adapted from `live_coach_engine.py`'s `COACH_SYSTEM` constant, but rewritten for Alphonso's actual domain (agent orchestration, not gambling) — do not reuse gambling-specific language.
- Only call it for `critical` and `warning` severity signals — skip it for `neutral`/`positive` (matches SessionGuard's `has_issue` gate, adapted).
- Timeout it aggressively (SessionGuard's Boardroom work already hit a real 30s-default-timeout bug against local Ollama under cold model-swap — see `CLAUDE.md`'s Boardroom Phase 4 note; budget for a slow first call, but don't block Coach Mode's UI on it — fire the rule-based message immediately and swap in the narrative version if/when it resolves, rather than delaying the intervention).
- On any failure or timeout, silently fall back to the Phase 3 rule-based/styled message — never surface an Ollama error to the user in the coach window.
- Gate this behind a setting, default **off** — Phase 1–3 already deliver full value without it, and it adds a real dependency (Ollama running) to a feature that's supposed to work standalone.

---

## 12. Phase 5 — settings, history, and observability

Coach Mode currently has zero user configurability and zero record of what it's ever said. Fix both:

**Settings** (add to `SettingsView.tsx`, alongside the existing Coach-adjacent settings):
- Master on/off toggle for the whole detection engine (independent of the Coach window itself being open/closed — detectors can run and queue a signal even if the window isn't open, so it's there when the user next opens it).
- Per-trigger enable/disable checkboxes (all 11 triggers across §3 + §9).
- Message style selector (§10) — `direct / balanced / gentle`.
- Ollama-narrative toggle (§11) — default off.
- A "snooze" control — mute all coaching for N hours, separate from disabling individual triggers.

**History** (new, mirrors the existing `NovaHistoryChart.jsx` / `EchoTimeline` pattern already in `SettingsView.tsx` — same UI convention, don't invent a new one):
- Persist every fired `CoachSignal` (not just the currently-displayed one) to a capped local log, same ring-buffer shape as `agentAuditService.ts`.
- A `CoachHistoryPanel.tsx` component listing recent interventions with timestamp, trigger id, severity, and the exact message shown — lets the user see what the coach has said over time, and lets *you* (or a future implementer) tell whether detectors are firing too often, too rarely, or on noise.
- **This history log is also the feedback loop for tuning thresholds** — if a trigger fires constantly and gets dismissed every time, that's a signal the threshold in §3/§9 was set too aggressively; this doc's suggested numbers (5 approvals, 25 percentage points, 48 hours, etc.) are starting points, not final — the history panel is what lets someone actually validate or correct them post-launch.

**Acceptance:** a user can turn off a specific trigger and confirm it stops firing; a user can review the last 20 things Coach Mode has said; snoozing suppresses all firing for the chosen duration.

---

## 13. Full phase summary (for planning/sequencing)

| Phase | What | Depends on | New instrumentation needed |
|---|---|---|---|
| 0 | Wire real approval logging | — | Yes — `logApprovalEvent` call site (§2) |
| 1 | 7 core triggers + engine + rename | Phase 0 (2 of 7 triggers) | No (beyond Phase 0) |
| 2 | 4 more triggers | Phase 1 (reuses engine) | Yes — license-denial log (§9.4); optional skill-pack "last used" (§9.3) |
| 3 | 3 message styles per trigger | Phase 1 (+ Phase 2 if built) | No |
| 4 | Ollama-narrative layer | Phase 3 (styles feed the prompt) | No (reuses existing Ollama client) |
| 5 | Settings + history panel | Phase 1 minimum, ideally all prior phases | Yes — new capped history log (reuse `agentAuditService.ts`'s shape) |

Phases 0–1 are the minimum viable version of "Coach Mode actually coaches." Phases 2–5 are what makes it complete — this is the honest answer to "is the doc comprehensive": it is now; it wasn't in the original v1-only draft.
