# TODO

Tracks confirmed, not-forgotten deferred work. For general historical
narrative and completed-work records, see `docs/ALPHONSO_GROUND_TRUTH.md`
and `docs/CHANGELOG.md`. This file is for what's still open.

---

## Boardroom rebuild — remaining spec items (2026-07-10 handoff PDF)

12 phases shipped 2026-07-10 (`docs/superpowers/plans/2026-07-10-boardroom-*-phase{1..12}.md`,
narrative in `docs/ALPHONSO_GROUND_TRUTH.md` §11.16). These are the items from
the original handoff spec that were **explicitly scoped out**, not silently
dropped:

- [ ] **1.5 — Cards.** Rich structured content cards in the chat stream
  (e.g. a decision card, a summary card) beyond plain text messages.
  No design work started.
- [ ] **1.10.3 — Regenerate.** Let the user ask an agent to regenerate a
  reply without retyping the whole message (distinct from Phase 9's
  Retry, which only fires on failure — this would apply to any reply,
  successful or not).
- [ ] **1.10.4 — Diff view.** When a reply is regenerated, show what
  changed between the old and new version. Depends on 1.10.3 existing
  first.
- [ ] **1.10.6 — Voice input.** Explicitly deferred by the user mid-session
  ("defer items 1.10.6 and 1.10.8"). Boardroom has no voice entry point
  today; the existing Jarvis voice hook (`useJarvisVoice.ts`) is wired
  into `ChatView.tsx` only, not Boardroom.
- [ ] **1.10.8 — Mobile parity.** Explicitly deferred alongside 1.10.6.
  The iOS companion app (`ios/`, `AlphonsoCompanion/`) has its own
  `BoardroomView.swift` that was never updated for the chat rebrand —
  it still reflects the old session-summary model.
- [ ] **1.10.14 — Resource contention handling.** No design work started.
  Open question: what happens if two Boardroom threads try to generate
  concurrently, or if a generation is in flight when the user switches
  threads — current behavior is untested for this case.

## Boardroom — scope limits called out during the 12 phases (revisit if the product grows)

Not necessarily "must build," but every phase's plan doc stated these as
conscious scope cuts. Listed here so a future session doesn't have to
re-derive them from 12 separate plan docs:

- [ ] **Real fetch cancellation for Stop (Phase 8).** `generateOllamaResponse`
  in `src/lib/ollama.js` has no `AbortController` wiring. Stop currently
  only prevents the *next* hop from starting; an in-flight hop always
  finishes. Fixing this properly means touching the shared Ollama client
  used by every other caller in the app (ChatView, all agent services) —
  deliberately out of scope for a Boardroom-only phase.
- [ ] **Semantic cross-thread recall (Phase 6).** `findCrossThreadContext()`
  is plain keyword overlap. `chromaDbService.ts` is a real vector store
  already in the app; wiring Boardroom into it for actual semantic
  search is a distinct, larger integration.
- [ ] **Real model confidence (Phase 7).** `detectLowConfidence()` is a
  fixed hedge-phrase list. Ollama exposes no logprob/confidence signal
  to build a real detector from — would need a different model backend
  or a second verification pass to do this properly.
- [ ] **Per-topic/per-pair chain-depth tracking (Phase 5).** `MAX_CHAIN_DEPTH`
  is a single global counter per message cascade, not real disagreement
  detection between two specific agents. The escalation banner also
  doesn't show both agents' positions side by side — it just says the
  cap was hit.
- [ ] **`MAX_CHAIN_DEPTH` configurability.** Currently a hardcoded
  constant (`= 3`) in `BoardroomChatView.tsx`, not exposed in Settings.
- [ ] **Retry chaining (Phase 9).** Clicking Retry on a failed reply does
  not re-trigger the `@mention` chaining a successful original reply
  would have. Intentional (avoids reintroducing the Phase 5 cascade
  risk on every retry), but worth a UI affordance if users find it
  surprising.
- [ ] **Escalation resume (Phase 5/7).** Once an escalation posts, there's
  no built-in way to "resolve" it and resume the chain from where it
  stopped — the user just sends a normal follow-up message.
- [ ] **Cumulative cost/latency tracking (Phase 12).** The model+latency
  label is per-message only. No session-level token/cost/throughput
  aggregation exists.

## Other confirmed-open items (pre-dating the Boardroom rebuild)

- [ ] `companionIntegration.test.js` asserts against fabricated Tauri
  command names (`get_companion_status`, `start_companion_server`) that
  don't match any real registered command. Test-quality issue, not a
  production bug. Found 2026-07-10, not yet fixed.
- [ ] Full in-app auto-updater is merged (PR #98) and code-complete but
  **not yet verified against a real signed release** — needs an actual
  version bump + tag to test the `check()` → `downloadAndInstall()` →
  `relaunch()` flow end-to-end against a real GitHub Release artifact.
- [ ] macOS support — deferred until Windows reaches full maturity (see
  `docs/ALPHONSO_GROUND_TRUTH.md` §11 "Gap 5" for the full checklist of
  what's needed when the time comes).
- [ ] Branch protection required-check list only covers `Test & Build`
  and `Rust Tests & Clippy` — `Playwright E2E Smoke Test` currently fails
  on a pre-existing, unrelated issue (`test.describe.slow is not a
  function` in `e2e/multiagent.spec.js`, a Playwright API version
  mismatch) and isn't gating merges. Worth fixing so E2E coverage isn't
  silently broken.

- [ ] `src/test/tauri-mock.ts` + `src/test/test-mocks.ts` (added 2026-07-12,
  see `docs/ALPHONSO_GROUND_TRUTH.md` §11.18) — Tauri API + service-layer
  mock scaffolding, imported by zero test files today. Either write the
  hook tests it was intended for, or reconsider keeping unconsumed test
  infrastructure around.

## Dead code — written but never wired in (found 2026-07-10)

Real, substantial implementations (not stubs), confirmed via a full
unimported-symbol scan of `src/services/` and `src/components/`. Each
needs a decision: wire it in, or delete it — "written but disconnected"
is worse than either extreme.

- [ ] `src/components/BoardroomView.tsx` (452 lines) — the pre-rebuild
  Boardroom component, confirmed fully superseded by
  `BoardroomChatView.tsx` (this session's rebuild). Safe to delete.
- [ ] `src/services/whatsappWebhookService.ts` (476 lines) — the largest
  orphan. Looks like a complete webhook-ingestion feature (routing,
  audit, orchestration receipts) that was built but never connected to
  anything.
- [ ] `src/services/pluginSigningService.ts` (277 lines) — ECDSA plugin
  signing/verification, a real security feature sitting unused. Worth
  checking whether `pluginRegistryService.js` should be calling into it.
- [ ] `src/components/AgentPerformanceView.tsx` (138 lines) — dead-letter
  queue stats/retry UI, real implementation, no nav entry anywhere.
- [ ] `src/components/CompanionWidget.tsx`,
  `HectorCompanionWidget.tsx`, `JoseCompanionWidget.tsx`,
  `MiyaCompanionWidget.tsx` — a matched set of per-agent companion avatar
  widgets, none wired in anywhere. Looks like an older companion-UI
  concept superseded by the current agent dock.
- [ ] `src/components/ErrorBoundary.tsx` (104 lines) — `App.tsx` uses
  `ViewErrorBoundary.tsx` instead; this one is dead.
- [ ] Other orphaned services worth a look: `agentPerformanceService.ts`,
  `agentPairingExecutionService.ts`, `a2aProtocolService.ts`,
  `connectorCircuitBreakerService.ts`, `connectorRateLimiterService.ts`,
  `hectorBookmarkService.ts`, `runtimeApiService.ts`,
  `streamingService.ts`, `whisperTranscriptionService.ts`.

## UI/UX — surfaced during a 2026-07-10 codebase review

- [ ] **Simple/Advanced mode split.** Sidebar has 11 top-level
  destinations across 4 groups, plus Coach Mode, Operator Dashboard,
  Agent Pairing, Ecosystem Maturity, Self-Development, Plugin
  Marketplace only reachable via Settings or a quick-launch card. A
  default lean view (Chat, Boardroom, Connectors, Settings) with an
  explicit Advanced toggle for everything else would match how OBS
  (Basic/Advanced output) and VS Code (basic/full settings) handle the
  same problem — no capability removed, just not required on day one.
- [ ] **Unified home/digest view.** Status is fragmented across
  Notification Center, Agent Activity Log, Nova opportunity history,
  Sentinel scan results, and (as of this session) Boardroom escalations
  — none surface proactively in one place. A single "what happened since
  you last looked" view would tie these together, including surfacing
  unacknowledged Boardroom escalations outside their own thread.
- [ ] **Orchestration page duplication** (already known, left alone per
  explicit prior instruction) — the Packets tab embeds
  `OrchestratorQueueView` while the Monitor tab separately re-implements
  the same dead-letter/queue data on a different refresh cadence.
- [ ] **No first-launch guided tour** beyond the onboarding wizard's
  connector step — Coach Mode, Boardroom, and Runtime Hub have zero
  in-app explanation of what they're for or when to use them.

---

_Last updated: 2026-07-10, alongside the Boardroom rebuild + PR #98 merge.
When you close an item here, move the detail to `docs/CHANGELOG.md` and
`docs/ALPHONSO_GROUND_TRUTH.md` rather than just deleting the line._
