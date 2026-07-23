# Alphonso Session Coach — Implementation Plan

**Status:** Ready for implementation
**Author:** Claude Code (planning pass), 2026-07-23
**Implementer:** OpenCode (this document is the handoff)
**Verifier:** Claude Code (post-implementation audit — see the verification prompt at the bottom of this doc's companion message)

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
- No multi-style message tone configuration (SessionGuard's `strict/balanced/supportive` selector) in v1 — ship one well-written tone per trigger. Configurable tone is an explicit Phase 2 candidate, not v1 scope.
- No LLM-generated intervention text in v1 (rule-based only, per explicit decision — see §3). Ollama-narrative generation is an explicit Phase 2 candidate.

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

**Deferred to Phase 2 (documented here so they aren't forgotten, not built now):** "Agent whiplash" (task type bouncing between agents), "Boardroom hedge pile-up" (cross-referencing `detectLowConfidence` hits across a thread), "You built it, you never used it" (unused skill packs/connectors), "The wall you keep hitting" (repeated license-tier gate denials). Each needs its own data-source audit before scoping — do not start these without a fresh planning pass.

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

---

## 7. Testing & merge requirements (repo standard — see `CLAUDE.md`)

- `npm run test` on every touched/new test file — all passing, no regressions in existing Coach/audit suites.
- `npx tsc --noEmit` clean.
- `npm run lint` clean.
- This repo has **branch protection on `main`** requiring 4 status checks (Test & Build, Rust Tests & Clippy, Secrets Scan, Doc Count Freshness) — direct pushes to `main` are rejected by GitHub. Work on a feature branch, push it, open a PR via `gh pr create`, wait for CI to go green, then merge — do not attempt `git push origin main` directly, it will fail.
- If `docs/ALPHONSO_GROUND_TRUTH.md`, `README.md`, or `AGENTS.md` reference version/count numbers that this change affects, run `node scripts/verify-doc-counts.mjs` before opening the PR (this exact check has failed a real PR before over a missed doc sync — see repo history).
- Each of the 7 detectors needs at least one test proving it fires under a constructed scenario and one proving it stays silent under a normal/clean scenario — mirroring how `live_coach_engine.py`'s detectors are individually testable.

---

## 8. Explicit boundaries for whoever implements this

- Do not touch `D:\AgentDevWork\repos\SESSIONGUARD` in any way — it's a separate repo, separate product, not in scope.
- Do not add a 3-style message tone system in v1 — one message per trigger.
- Do not add LLM-generated messages in v1 — rule-based only (explicit decision, see §0).
- Do not build the 4 deferred Phase 2 triggers listed in §3 — document them if you want, but don't implement.
- Do not invent a new local database/storage mechanism — use `durableStore.js`.
- If any of the "find the real call site" tasks (Phase 0's ApprovalModal wiring, the session-start-for-§3.7 check) turn out to already exist somewhere not mentioned in this doc, use what's there — don't build a duplicate. This repo has a documented history of exactly that mistake (see `CLAUDE.md`'s "Do Not Duplicate" table) and it's explicitly called out as something to check first.
