# Deferred Work Register

Rule 12 / Rule 11. This register survives the session. Future agents resume from here.

## Format
- `[DATE] <scope>: <what> — <why deferred> — <resume hint> — <status>`

## Items

- [2026-08-21] **Windows/Linux Tauri installer builds broken since 2026-08-16 —
  release pipeline currently non-functional.** `ci.yml`'s `Tauri Desktop
  Build` (Windows) and `Tauri Desktop Build (Linux)` jobs have failed on
  every push to `main` since commit `e387067` ("Implement WIN1 (WebView2
  offline installer) and O1/O3 (bundle Ollama runtime)", 2026-08-16) —
  confirmed via `gh run list --branch main`: last success `31929916332`
  (2026-08-16), every run since has failed. macOS build is unaffected (still
  succeeds). Root cause, confirmed 2026-08-21 by actually downloading and
  extracting the real `ollama-windows-amd64.zip` (v0.32.13) rather than
  estimating: `lib/ollama/cuda_v12` is ~1.1GB uncompressed, `cuda_v13` is
  ~630MB — shipping both pushed the Windows NSIS installer past a
  `makensis` data-block size limit (`error mmapping datablock`, a known NSIS
  bug class for oversized single blocks); Linux fails separately with
  `failed to run linuxdeploy` during AppImage assembly, not yet independently
  root-caused (may or may not be the same size story — `linuxdeploy` is a
  different tool with a different failure mode). Both only fail at the final
  packaging step — `cargo build --release` succeeds on both platforms every
  time.
  **Fix attempted same day, Option 2 of the three considered (owner chose
  this order: try Option 2, then 3, then 1):** `scripts/fetch-ollama-runtime.mjs`
  now prunes `lib/ollama/cuda_v13` after staging, keeping only `cuda_v12` —
  verified for real by running the fetch script end-to-end twice (before/after
  the change) against the live `windows-amd64` asset on this machine: the
  `cuda_v13` directory is confirmed absent from `src-tauri/vendor/ollama/`
  post-fetch, `cuda_v12` and the small `vulkan` fallback dir remain. Kept v12
  over v13 deliberately — NVIDIA drivers are backward-compatible, so v12
  binaries run on both older and newer driver installs, while dropping v12
  instead would have saved more space (~1.1GB vs. ~630MB) at the cost of
  silently losing GPU acceleration for anyone without the newest driver.
  **Verified 2026-08-22 via a real CI run** (manually dispatched against the
  fix branch with `gh workflow run ci.yml --ref ...`, since these jobs only
  trigger on push-to-main/workflow_dispatch, not on `pull_request`): **Windows
  `Tauri Desktop Build` now succeeds** — `makensis` completed in ~9 minutes
  and produced a real `Alphonso_2.6.2_x64-setup.exe` artifact (~957MB,
  confirmed via `gh api .../artifacts`), no more datablock error. Merged to
  `main` at `96354f9` (PR #172).
  **Linux `Tauri Desktop Build (Linux)` still fails** — same
  `failed to run linuxdeploy` error, now in ~20 seconds (vs. ~2 minutes for
  the last known-good run on 2026-08-16), with zero diagnostic output between
  "Bundling ... .AppImage" and the failure — Tauri swallows linuxdeploy's own
  stderr. The near-instant failure time suggests this may NOT be the same
  size-driven root cause as Windows's NSIS bug (a real size problem would
  likely fail partway through processing ~1GB+ of payload, not in 20s flat) —
  worth investigating as a possibly distinct issue (FUSE/AppImage execution
  environment on the runner, a linuxdeploy/plugin version regression, disk
  space) rather than assuming the same CUDA-trim fix will resolve it.
  **This is not currently blocking anything**: `desktop-linux` has
  `continue-on-error: true` in `ci.yml` (same as macOS), so it was never a
  required check — Windows was the only gating job, and it's fixed. Resume
  hint if picked up: get real stderr out of linuxdeploy directly (run
  `linuxdeploy-x86_64.AppImage` by hand against the built `app` binary
  outside of Tauri's bundler, or add `RUST_LOG=debug`/`--verbose` to
  `tauri build` if supported) before assuming it's the same size issue.

- [2026-08-18] Hermes agent-backend delegation (per-agent Ollama/NVIDIA/Gemini/Hermes
  provider picker, wiring 9 in-app agents to a separate live Hermes Agent
  install the user runs on this machine): **planned, not started, no code
  written.** Full design (context, PR 1a/1b split, Phase 2 bundling spec,
  engineering-review findings, and corrections found against an independent
  second trace) lives in `docs/HERMES_AGENT_DELEGATION_PLAN.md` —
  **gitignored, machine-local only**, not in git history, because it
  references this dev machine's own local Hermes install paths/ports. Also
  tracked in `docs/TRUTH_FIRST_EXECUTION_PLAN.md` §I (tasks I1/I2/I3) and
  noted in `docs/AGENT_GUIDE.md`. Resume hint: read the plan doc's Phase 0
  first (two open PRs — #152 dependency-bundling, #153 handoff-review-feedback
  — need merging before any Hermes code starts; #151 recover/hook-test-coverage
  stays unmerged, red). If the plan doc is missing on the machine you're on,
  it needs to be re-derived or requested from the owner — the summary in TFEP
  §I and this entry are not a substitute for the full file. Status: design
  complete, awaiting owner go-ahead to start PR 1a.
  **2026-08-21:** both PR 1a (merged 2026-08-19, PR #165) and PR 1b
  (hardening — circuit breaker/rate limiter tuning, audit logging,
  policy/approval gating, session continuity) are now **done**. 1a was also
  live-verified for real against a running Hector Hermes profile (see
  `docs/TRUTH_FIRST_EXECUTION_PLAN.md` §I1 for the session-log evidence).
  Status: **1a/1b code complete and merged** (PR #168). The end-to-end
  approval-flow gap noted below at this same timestamp was closed the same
  day — see that entry's resolution. Phase 2 (bundling) remains not started
  per its own explicit gate; its one open rollout-scope question (§2.5) was
  resolved 2026-08-21 (per-agent opt-in, PR #169).

- [2026-08-21] **Hermes approval-flow wiring** — **RESOLVED same day.** None
  of Hermes' real call sites passed `approved:true` to the policy gate, so
  with Approval Mode on (the default) every Hermes call was blocked before
  reaching the profile. Fixed with two mechanisms, matching how each call
  site actually runs:
  - **Jose's pipeline** (non-React, packet/queue-based): added
    `isBlockedByHermesApproval(assignment)` in `joseExecutionEngineService.ts`,
    mirroring the existing Zero-Cost Mode / Sentinel gates exactly — routes
    a Hermes-backed Miya/Hector assignment to `pending_approval` status
    *before* the wave loop ever reaches `buildMiyaPackage`/
    `executeHectorAssignment`, using the same `ApprovalPanel`/
    `executeApprovedPackets` re-execution path every other high-risk gate
    already uses. Once a packet reaches those two functions, `approved: true`
    is safe unconditionally — the gate already proved either the provider
    isn't Hermes, Approval Mode is off, or a human explicitly approved it.
  - **Boardroom** (live React chat, no packet/queue system to reuse): calls
    the existing app-wide `requestApproval()` bridge
    (`useRequestApprovalBridge()` in `App.tsx`, already used by
    `PluginProvider`/`WorkspaceProvider`) directly and synchronously before
    a Hermes-backed reply, via a new `resolveHermesApproval()` helper in
    `BoardroomChatView.tsx`. `requestApproval` is passed down as a prop from
    `MissionRoomBoardroomTabs` in `App.tsx` (no component previously
    imported *from* `App.tsx` — passing it down as a prop instead of a
    reverse import keeps that precedent intact).
  - Both mechanisms reuse the *same* single approval primitive
    (`requestApproval()`/`ApprovalModal`) rather than inventing a second
    one — this was the open architecture question from the original entry,
    now answered: one shared bridge, invoked from each surface's own
    natural call site.
  - 5 new tests (2 in `joseExecutionEngineService.test.js`, 3 in
    `boardroomChatView.test.jsx`) prove both the blocked-by-default and
    explicitly-approved paths for real, plus that a non-Hermes agent never
    triggers an unnecessary approval prompt. `tsc --noEmit` clean, lint
    clean, 263+ tests across every file touched re-verified with 0
    regressions.

- [2026-08-21] **Hermes Zero-Cost Mode bypass via a non-loopback endpoint**:
  `saveHermesAgentEndpoint` accepts any URL, and `hermes_agents` is
  deliberately excluded from `PAID_OR_METERED_CONNECTORS` on the stated
  assumption that every Hermes profile is local/self-hosted (same posture
  as Ollama) — but nothing actually verifies the saved endpoint is a
  loopback address. A user (or a misconfigured/malicious credential entry)
  pointing "Hermes" at a real remote paid API would bypass Zero-Cost Mode
  entirely. Pre-existing since PR 1a, not introduced by PR #168 — but PR
  #168 added a test (`policyEnforcementService.test.js` — "does not block
  hermes_agents on Zero-Cost Mode") that documents this behavior as current
  fact without flagging it as a gap, which is corrected by this entry.
  Deferred rather than fixed in #168 because the real fix needs a design
  decision this repo hasn't made yet: what counts as "local" (bare
  loopback only, or also a user's own remote box reached via Tailscale,
  which `docs/HERMES_AGENT_DELEGATION_PLAN.md`'s Phase 2 discusses as a
  legitimate future case)? Resume hint: decide the locality policy, then
  add an endpoint-locality check in `hermesAgentConnector.ts` before the
  policy gate call, gated on that decision — see
  `src/services/connectors/hermesAgentConnector.ts`'s `sendHermesAgentMessage`.

- [2026-08-14] `recover/hook-test-coverage` branch (PR #151 open against
  `main`, CI red as of 2026-08-16): the rescued stash@0 test suite, now
  sitting at 257+/396 passing with the act-import and duplicate-file issues
  fixed. 132 tests across `useAppShellState`, `useBootEffects`,
  `usePersistenceEffects`, `useSessionEffects`, `useTrayEffects` still fail —
  root cause identified as a Vitest 2.1.9→4.1.8 major-version jump changing
  `vi.mock` hoisting semantics, which needs real per-file mock-pattern
  rewrites, not something to force through quickly. Status: deferred.
  **2026-08-19:** handed off to OpenCode for pickup — full handoff with
  branch state, PR CI status, per-file diagnosis (including one finding that
  complicates the pure-hoisting theory — `useAppShellState.test.js`'s mocks
  don't show the classic capture pattern, so not all 5 files' failures may
  share one root cause) and quick-start commands in
  `docs/handoffs/2026-08-19_OpenCode_HookTestCoverageRecovery_Handoff.md`.
  Branch was 52 commits behind `main` at handoff time but merges cleanly
  (verified via `git merge-tree`, zero conflicts).
  **2026-08-20:** all 5 files fixed — `useAppShellState`, `useBootEffects`,
  `useKeyboardShortcuts`, `usePersistenceEffects`, `useSessionEffects`,
  `useTrayEffects` (6 files, one more than originally flagged) all pass.
  Full `src/test/hooks/` suite: 15 files / 345 tests, 0 failures. Branch
  merged with `main` (zero conflicts). Status: **resolved**, PR #151 ready
  for CI re-run and merge review.

- [2026-08-02] Voice runtime and temporary Cloud Voice bypass: **open.**
  Ollama cold-load remains unverified after the five-minute timeout fix, and
  Voice OS health can disagree with its watchdog toast. Cloud Voice runs with
  temporary owner-only bypass enabled and must be rolled back before broader
  use. Resume from
  `docs/handoffs/2026-08-02_Codex_VoiceRuntimeAndCloudVoice_Handoff.md`.

- [2026-07-31] AWS Cloud Voice endpoint cutover: **in progress, not cut over.**
  AWS staging at `https://voice.obsidianmedia.online` has one healthy Fargate
  task and successful public `/health` + `/ready`, but authenticated iPhone
  enrollment, English/Farsi voice acceptance, a rollback exercise, CloudWatch
  alarm verification, and a least-privilege deployment identity are still
  required. Railway `precious-enjoyment` remains the rollback service. Status:
  pending real-device and operational verification.

- [2026-07-31] AWS Cloud Voice least-privilege deployment identity: role
  `AlphonsoCloudVoiceDeployRole` exists and is restricted to the Cloud Voice
  ECR/ECS/health surface, but root CLI credentials cannot assume it (AWS
  rejected the validation attempt). Resume hint: establish a non-root IAM or
  IAM Identity Center principal, allow it `sts:AssumeRole` for this role, then
  configure the AWS CLI profile and verify `sts get-caller-identity` through
  the role. Do not store a long-lived key in the repository. Status: blocked
  on owner identity setup.

- [2026-07-31] AWS Cloud Voice staging image/service: **resolved for the
  current host.** Docker Desktop 29.6.2 was installed and its Linux engine
  answered the Docker client after launch. The actual program location is
  `C:\Program Files\Docker`, not the requested `D:\AgentDevWork\docker`;
  relocating Docker Desktop/data remains an owner decision and is not needed
  to build or deploy Cloud Voice. Status: closed.
- [2026-08-01] Cloud Voice/Supabase Auth: **paused by owner request.** The
  iOS Cloud Voice selector and sign-in UI are intentionally hidden while Local
  Voice testing proceeds. Re-enable only after explicitly requested, then
  validate the magic-link callback, device enrollment, English/Farsi turns,
  and rollback path. Status: deferred.
- [2026-08-10] Cloud Voice owner-only testing bypass: **removed.** The
  `VOICE_ALLOW_OWNER_TESTING_BYPASS` mechanism (backend
  `Settings.allow_owner_testing_bypass`, iOS `CloudVoiceOwnerTestingBypass`
  Info.plist key) was never rolled back after its short test window and was
  flagged as a Critical finding in PR #140 code review, unresolved at merge.
  Removed from source entirely rather than re-disabled, since the code path
  itself — not just its default — was the risk. `/v1/voice/respond` now
  unconditionally requires an active Supabase device; iOS always sends its
  bearer token. If ECS still has `VOICE_ALLOW_OWNER_TESTING_BYPASS` set in its
  task definition, that env var is now inert and should be removed on next
  deploy. Enrollment, English/Farsi turns, and iOS sign-in UI restoration
  still need live validation. Status: deferred (validation only).
- [2026-08-01] Cloud Voice owner-only testing bypass: **temporary.**
  Superseded by the 2026-08-10 entry above — the bypass was removed from
  source, not merely reset. Restore the iOS sign-in UI and validate
  enrollment, English/Farsi, and rollback before closing. Status: deferred.
- [2026-07-31] AWS Cloud Voice Supabase configuration: **resolved.** The
  owner supplied the publishable/anonymous key and it was placed directly in
  AWS Secrets Manager as `alphonso/cloud-voice/supabase-anon-key`; the ECS
  execution role received `GetSecretValue` for that exact entry only. The old
  Railway service-role secret was not copied. Status: closed.
- [2026-07-29] Local Voice Python regression suite: **resolved.** A clean Windows Python 3.11 venv installed every pinned dependency, including `webrtcvad`; `pytest voice/backend/tests -q` passed 37/37. Piper's model downloaded and real synthesis returned a 63,020-byte WAV. Runtime Hub now installs the same pinned set and its model into the launch-visible directory. Remaining work is fresh Rust compilation plus microphone/Ollama/playback validation, recorded in H1 rather than deferred as a dependency issue. Status: closed.
- [2026-07-29] Focused npm Voice test invocation: **resolved.** Added `npm run test:file -- <path>`, which calls Vitest directly instead of the repository-wide programmatic runner that does not honor a focused file filter. Status: closed.
- [2026-07-29] `scripts/verify.ps1` fallback secret-scan: the required verifier timed out after 600 seconds in `== secret-scan ==` before reaching build/test/deploy stages when `gitleaks` was unavailable. The fallback has now been changed to Git-native tracked-file searches; its content scan completes in ~22 seconds and the script passes PowerShell syntax parsing. Resume hint: rerun `pwsh -File scripts/verify.ps1` to completion after this change and add a timing/exclusion regression test. Status: in progress.
- [2026-07-28] `src-tauri/src/connector_commands.rs` and `src-tauri/src/youtube.rs` added new ClickUp / YouTube argument-validation tests: the first `cargo test` retry was blocked by a shared backend process holding the voice runtime files open; after stopping that process, a lower-memory retry progressed further but then hit paging pressure and an application-control policy block on Cargo's `icu_properties_data` build script (`os error 4551`). Resume hint: rerun `cargo test` from a clean host with sufficient pagefile / relaxed application-control policy and confirm the new tests pass. Status: open, verification deferred.
- [2026-07-24] docs/AGENTS.md content-loss regression: the governance bootstrap (commit 46a1eb0) overwrote AGENTS.md's real architecture/version/test-count content with a 14-line governance-pointer stub, silently breaking 9/12 `verify-doc-counts.mjs` checks (a required CI check). Restored + fixed same session (commit 0923c90) — recorded here per R11 for visibility, not because it's still open. Resume hint: none needed, closed.
- [2026-07-24] Production-readiness T19 (auto-generate "Do Not Duplicate" map): only the numeric doc-drift half was closed this pass (AGENTS.md/README.md counts fixed, verify-doc-counts.mjs green). Full auto-generation of the ~230-row Do Not Duplicate table from the source tree (replacing hand-typed prose descriptions in CLAUDE.md) was not attempted — it needs a semantic description per service/component that isn't derivable from file structure alone. Resume hint: consider a hybrid — auto-generate the file-path column, keep descriptions hand-maintained, and add a CI check that flags any service/component file with no corresponding table row. Status: partial, open.
- [2026-07-25] `nvidiaNimConnector.ts`/`geminiConnector.ts` (branch `feat/free-tier-cloud-providers`, implementing `docs/superpowers/plans/2026-07-23-free-tier-cloud-providers.md` §2/§3/§5): shipped as code-complete and test-passing, but **never verified against a real NVIDIA or Gemini API call** — every test uses a mocked `fetch`. Specifically unverified and guessed rather than confirmed, contrary to the source doc's own instruction not to guess: (1) NVIDIA's `/v1/models` list-endpoint path, (2) Gemini's exact auth style (`?key=` query param, chosen over an `x-goog-api-key` header, unconfirmed), (3) both providers' current free-tier-eligible default model (`meta/llama-3.1-8b-instruct`, `gemini-1.5-flash` — plausible, not checked against either provider's live catalog), (4) whether either provider ever signals rate-limiting via a non-429 status (e.g. Gemini `RESOURCE_EXHAUSTED` in a 200 body) — only literal HTTP 429 is handled. Also not done: the credential UI (`ConnectorSetupPanel.tsx`) was never exercised in a running dev server — type-checked and lint-clean only, not browser-verified per `CLAUDE.md`'s UI-change rule; `licenseService.ts` was never checked to confirm nvidia_nim/gemini don't need a tier entry; no regression test enforces the required disclosure copy stays present; `docs/ALPHONSO_GROUND_TRUTH.md` was skipped despite being named in the source plan's own file list (only `CLAUDE.md` was updated). Resume hint: get a real free-tier key from build.nvidia.com and aistudio.google.com, run one live `sendNvidiaMessage`/`sendGeminiMessage` call each, fix whatever the real response shape reveals, then open the dev server and click through `ConnectorSetupPanel.tsx`'s two new sections. **Update 2026-07-25 (later same day):** NVIDIA half closed — see the dedicated entry below for what was actually verified live and what's still open (Gemini auth, browser click-through). Status: partially closed, see below.
- [2026-07-25] `ChatView.tsx` chat-loading race (found while writing tests for §4's cloud-provider chat routing, branch `feat/free-tier-cloud-providers`): the mount-time `useEffect` that hydrates `messages` from `loadChatMessages`/`kv_get`/localStorage is unconditional and has no guard against a message already being in flight — if it resolves after a `setMessages` call from an in-progress send, it silently clobbers the conversation back to whatever was persisted (or `[]` on a fresh chat). Status: **resolved (2026-08-12).** Fixed by immediately calling `setMessages([])` at the start of the `useEffect` trigger block, resolving the message clobber and preventing UI flickering of the prior conversation.
- [2026-07-25] §4/§6 free-tier cloud provider wiring, self-review gaps found after initial "done" report (branch `feat/free-tier-cloud-providers`, PR #122): (1) `geminiConnector.ts` filters out `role: 'system'` messages entirely and never maps `CHAT_ASSISTANT_PROMPT` to Gemini's `systemInstruction` field — the system prompt silently vanishes for Gemini conversations while NVIDIA (OpenAI-compatible) keeps it, a real behavioral inconsistency between the two providers that was not caught or disclosed until a second self-review pass. (2) `getSelectedProvider`/`setSelectedProvider` added to `modelSelectionService.ts` are unused in production — `agentBrainService.js`/`composioService.ts` (the file's existing consumers) were never wired to call them; only `getCloudModelList` is genuinely exercised (by `CloudModelPicker`). Framed in the PR description as "extending the existing pattern" without being clear this half is currently dead code. (3) The `evaluatePolicyGate` fix in `nvidiaNimConnector.ts`/`geminiConnector.ts` has near-zero practical security effect as shipped: both call it with `actionType: 'chat'`, which never matches `HIGH_RISK_ACTION_PATTERNS`, so Approval Mode gains no real new protection from the fix — it only matters if a future pass adds these connectors to `PAID_OR_METERED_CONNECTORS`. (4) `ModelProviderPicker` checks `isNvidiaConfigured()`/`isGeminiConfigured()` once on mount (`useEffect(..., [])`) — adding a credential elsewhere while ChatView stays mounted won't enable the tab without a remount. (5) Provider tabs are never disabled during `isGenerating`, so a user can switch providers mid-stream; resulting state untested. (6) `historySnapshot.slice(-20)`'s flat message cap is tuned for Ollama's typical local context windows and isn't adjusted per cloud model — a small NVIDIA model could plausibly reject a request for context-length reasons that surface as a generic error, not the rate-limit path. (7) `SkipOllamaCloudGuide`'s onboarding disclosure copy has the same no-regression-test gap already logged for `ConnectorSetupPanel.tsx`. Resume hint: fix (1) by mapping system messages to Gemini's `systemInstruction`; either wire (2) into `agentBrainService.js`/`composioService.ts` or remove the unused exports; be explicit in future PR descriptions about (3)'s actual security value; (4)/(5) need either a refetch-on-focus or a shared connector-config-changed event; (6) needs a per-provider token budget once real usage data exists. **Update 2026-07-25 (later same day):** (1) and (4) fixed — see the dedicated CodeRabbit-fix entry below. (2), (3), (5), (6), (7) still open.
- [2026-07-25] iOS companion pairing — "Could not form websocket URL" (branch `fix/ios-companion-websocket-url`): a prior Codex read-only investigation traced the failure to `MDNSService.swift`'s `resolveHost()` stringifying a resolved `NWEndpoint.Host` with plain string interpolation (`"\(host)"`), which can embed an IPv6 zone/scope id (e.g. `fe80::1%en0`); the raw `%` then makes `URLComponents.url` in `WebSocketService.makeWebSocketURL()` return `nil`. Fixed by (1) sanitizing the host via a new `MDNSService.sanitizedHostString(from:)` that strips any `%zone` suffix and handles `.ipv4`/`.ipv6`/`.name` explicitly, (2) hardening `makeWebSocketURL` to bracket bare IPv6 literals (`URLComponents` requires `[...]` for IPv6), and (3) adding `print()` diagnostics at both sites, since Codex's investigation flagged that none existed — if this fix is incomplete, the next real-device run's console output will show the actual malformed value instead of nothing. Added `WebSocketServiceURLTests.swift` and `MDNSServiceHostTests.swift` (both registered in `project.pbxproj` by hand — this project uses explicit `PBXFileReference`/`PBXBuildFile` entries, not a synchronized file-system group) exercising the fixed logic directly (`static`, not `private`, so `@testable import` can reach them). **Not verified against a real device.** This session has no macOS/Xcode toolchain (Windows dev box). PR #121 opened. First `workflow_dispatch` run of `ios-build.yml` on this branch (run 30150847006) **failed to compile**: the diagnostic `print()` added alongside the fix referenced `host.name` inside `if case .hostPort(let host, let port) = ...`, where the pattern-matched `host` shadowed the outer `resolveHost(_ host: DiscoveredHost, ...)` parameter with an `NWEndpoint.Host` — which has no instance member `.name` (only an enum case). This is exactly the kind of mistake that recommending a push-and-CI-check step over "looks right to me" is meant to catch, and it worked: fixed by renaming the destructured value to `resolvedHost` (commit `96bde1a`), re-triggered (`workflow_dispatch`, run 30150978259), and that run went **green end-to-end** — Archive iOS app, Export IPA, and Upload to TestFlight all succeeded. That confirms the fixed `MDNSService.swift`/`WebSocketService.swift` compile and the app archives/exports/uploads cleanly. It does **not** confirm the fix logic is correct at runtime, and — separately — `ios-build.yml` only runs `xcodebuild archive`, never `xcodebuild test`, so it still does **not** execute `WebSocketServiceURLTests.swift`/`MDNSServiceHostTests.swift` — nothing in this repo's CI currently runs the `AlphonsoCompanionTests` target at all, for any test file, not just the ones added here. Confirming the new unit tests actually pass requires someone to run the test target locally in Xcode (Cmd+U) or a follow-up PR that adds an `xcodebuild test` step to `ios-build.yml`. The IPv6-zone-stripping branch of `sanitizedHostString` specifically could not be unit-tested at all regardless of that gap — constructing a zoned `NWEndpoint.Host` requires a live `NWInterface`, which has no public test-friendly initializer; only the zone-free `.ipv4`/`.ipv6`/`.name` cases have real test coverage. Secondary tradeoff worth flagging: stripping the zone id from a link-local IPv6 address makes the URL constructible but not necessarily routable (link-local addresses need their scope id to connect) — in practice this repo's mDNS advertisement (`companion_discovery.rs`) only registers an IPv4 A record, so IPv6 resolution shouldn't normally occur, but that's inferred from the Rust side, not confirmed via a live capture of what NWConnection actually resolves on a real device. Resume hint: (1) add an `xcodebuild test` step to `ios-build.yml` (or a lighter PR-triggered test-only workflow) so this test target ever runs in CI at all — currently a gap independent of this fix; (2) run this exact pairing scenario on a real iOS device against a real Alphonso Desktop, capture the new `[MDNSService]`/`[WebSocketService]` console logs, and confirm pairing succeeds — if it still fails, the logs will show the real host string for the next diagnosis step. Status: fix implemented, compiles and archives clean in CI (run 30150978259, all green), unit tests written but not yet run anywhere (no test step in CI), live-device-unverified, open until confirmed. PR: https://github.com/obsidian-media/AlphonsoEcosystem/pull/121
- [2026-07-25] iOS companion pairing — live-device retest of the above still fails (same "Invalid host or port" message) on the tapped-Bonjour-discovery path; a separate manual-entry attempt hit an unrelated UI bug (keyboard not dismissing, blocking tab navigation — not investigated yet, out of scope for this entry). User has no Mac/Console.app access, so the `print()` diagnostics added in the previous entry are currently unreadable to them. Root-cause theory, unconfirmed: `connection.currentPath?.remoteEndpoint` matching `.hostPort(host:, port:)` does not guarantee the inner `NWEndpoint.Host` is `.ipv4`/`.ipv6` — Apple's Network framework commonly surfaces the *resolved hostname* (`.name(String, NWInterface?)`) rather than a concrete IP for Bonjour-dialed connections. If so, `sanitizedHostString`'s `.name` branch returns that name verbatim, which could be the Rust-side mDNS SRV target (`to_mdns_host_name()` in `companion_discovery.rs` — sanitizes spaces to hyphens but does nothing about other characters a real Windows computer name could contain) or, less likely, the raw Bonjour *instance* name (`"Alphonso-{hostname}"`) if NWConnection doesn't fully resolve it — either could contain characters invalid for a URI host component. Not confirmed because there's no way to read the actual string without device console access. Fix applied without confirmation (best available option given the constraint): `WebSocketService.connect()`'s URL-construction failure branch now surfaces the literal `host`/`port` values directly in `connectionHint`, which the Pairing screen already renders on-screen — so the next test attempt reveals the exact malformed string without needing a Mac. Built in an isolated `git worktree` (`fix/ios-companion-websocket-url` checked out separately from the shared main working directory, which had a concurrent session's uncommitted changes on `feat/free-tier-cloud-providers` — per R18, did not touch those). Resume hint: once the next TestFlight build with this on-screen diagnostic is tested, read the exact host string it reports and fix `sanitizedHostString`/`to_mdns_host_name` accordingly — likely needs either preferring an IP-typed endpoint over `.name` when both are somehow available, or sanitizing whatever character set is actually breaking it (currently unknown, no point guessing further without the real value). Status: open, root cause still unconfirmed, on-screen diagnostic shipped as the next investigative step.
- [2026-07-25] iOS companion pairing — root cause **confirmed** via the on-screen diagnostic from the previous entry: the tester's device reported `Could not build ws:// URL for host="10.0.0.17%en0" port=8765`. This is a concrete `.ipv4` address (not the `.name`/resolved-hostname theory from the previous entry, which was wrong but harmless — no fix had been committed against it) carrying an interface-scope suffix, something only `.ipv6` was assumed capable of when `sanitizedHostString` was first written; `.ipv4`'s case in that switch did no stripping at all, so the raw `%en0` flowed straight through into `URLComponents.host` exactly like the original IPv6 zone-id bug. Fixed by extracting a single `stripInterfaceSuffix(_ raw: String) -> String` helper (removes anything from the first `%` onward) and applying it uniformly to `.ipv4`, `.ipv6`, `.name`, and the `@unknown default` case in `sanitizedHostString` — no more asymmetry between address types. Added direct unit tests for `stripInterfaceSuffix` itself (including the literal reported string `"10.0.0.17%en0"` -> `"10.0.0.17"`) in `MDNSServiceHostTests.swift`, sidestepping the live-`NWInterface` construction limitation that blocked testing this via `NWEndpoint.Host` directly. Built in the same isolated worktree as the prior two entries. Resume hint: retest pairing on the real device with the next TestFlight build; if it still fails, the on-screen `connectionHint` will again show the exact string, and previous entries in this register document the diagnostic pattern to follow. Status: **confirmed working** — user retested the tapped-Bonjour-discovery pairing flow against this build and the iOS companion connected successfully. CI run 30153504808 green end-to-end (archive, export, TestFlight upload). Closing this issue; PR #121 ready for review/merge. Residual, smaller-scope items not closed by this: `ios-build.yml` still never runs `xcodebuild test` (the new unit tests still haven't executed anywhere, though the underlying logic is now live-confirmed correct via the real pairing success); the unrelated keyboard/tab-navigation UI bug hit during manual-entry testing earlier in this investigation was never looked at.
- [2026-07-25] Live API verification of `nvidiaNimConnector.ts`/`geminiConnector.ts` (branch `feat/free-tier-cloud-providers`, PR #122), following up the "never verified against a real API call" entry above: **NVIDIA NIM is now confirmed correct end-to-end against the real API**, using a real key provided by the user. `POST /v1/chat/completions` with the exact request shape the connector sends returned HTTP 200 with `choices[0].message.content`/`model`/`usage` all present and shaped as the code expects; `GET /v1/models` returned HTTP 200 with 118 models under `data.data[].id`, confirming the list-endpoint path and response shape `listNvidiaModels()` assumes, and confirming the chosen default model (`meta/llama-3.1-8b-instruct`) is genuinely in the live free-tier catalog. **Gemini could not be verified** — tried both plausible auth styles (the shipped `?key=` query param, and the `x-goog-api-key` header alternative flagged as unconfirmed in the earlier entry) against a real `GEMINI_API_KEY` present in this machine's user environment; both returned `401 ACCESS_TOKEN_TYPE_UNSUPPORTED / "Expected OAuth 2 access token..."`. The key's shape (`AQ.Ab8...`, 53 chars) doesn't match the standard AI-Studio-issued format (`AIzaSy...`, ~39 chars), so this is most likely an invalid/wrong-type credential rather than a bug in `geminiConnector.ts`'s `?key=` approach, which does match Google's documented public REST API — but this is *inferred*, not confirmed, since no valid Gemini key was available to test against. Do not "fix" the `?key=` auth style based on this finding without a real AI-Studio key to test with first. **Browser click-through still not done** — `mcp__claude-in-chrome__tabs_context_mcp` returned "Browser extension is not connected" on two separate attempts in this environment; `ConnectorSetupPanel.tsx`'s two new credential sections and the `CloudModelPicker`/`ModelProviderPicker`/`SkipOllamaCloudGuide` UI remain completely unverified visually, same gap as originally logged. Resume hint: get a real AI-Studio key (`AIzaSy...` prefix) from aistudio.google.com and repeat this same live test for Gemini; separately, get the Chrome extension connected (or use a different browser-automation path) and actually click through the UI pieces this branch added. Status: NVIDIA closed/confirmed; Gemini auth still open (likely a bad test key, not a code bug, but unconfirmed); browser UI verification still open.
- [2026-07-25] CodeRabbit review fixes on PR #122 (branch `feat/free-tier-cloud-providers`), all confirmed real and fixed same day: (1) **Gemini's default model was retired** — `gemini-1.5-flash` and the entire `GEMINI_FREE_TIER_MODELS` 1.5-era list (plus Gemini 2.0 Flash/Flash-Lite) are retired as of 2026-07-25; Pro-tier is paid-only since 2026-04-01. Switched default to `gemini-2.5-flash-lite` (chosen over `gemini-2.5-flash`, which already has a scheduled 2026-10-16 deprecation) in both `geminiConnector.ts` and `modelSelectionService.ts` — confirmed via live web research, not re-verified against a real API call (still blocked on a valid AI-Studio key, see the entry above). (2) **`geminiConnector.ts` dropped the system prompt** — now maps `role:'system'` messages to Gemini's `systemInstruction` field instead of silently filtering them out; this closes item (1) from the self-review entry above. (3) **`listNvidiaModels()` skipped the policy gate** that `sendNvidiaMessage()` right above it already had — added, matching the same pattern. (4) **Stop button didn't cancel cloud generation** — clicking Stop during NVIDIA/Gemini generation cleared `abortRef`/`isGenerating` but the in-flight request kept running and its result still got applied when it resolved, so an aborted reply could silently reappear; guarded with an `abortRef.current` null-check after the await, dropping the result if aborted. (5) **Rate-limited messaging was shown for any `ok:false`**, not just confirmed `rateLimited:true` — harmless today (connectors only return `ok:false` on 429) but fragile; now distinguishes a generic "request failed" case. (6) **`modelReady`/credential checks recomputed on every keystroke** — memoized with `useMemo`, keyed on `selectedProvider`/`selectedModel`/`selectedModelMissing`. (7) **`ModelProviderPicker`'s configured-status check ran once on mount only** — closes item (4) from the self-review entry above; now also re-checks on `window` `focus` events, so adding a credential in Settings while ChatView stays mounted (the common case) is picked up without a remount. (8) **Onboarding's skip-to-cloud cleared `selectedModel` to `''`** instead of assigning a real default — exported each connector's `DEFAULT_MODEL` constant and assign it directly. (9) Doc nits: `CLAUDE.md` had a second, unrelated "Connector registry (all 22)" table row that wasn't caught when the count was fixed elsewhere in the same file; `AGENTS.md`'s directory-structure fence had no language identifier; the implementation plan doc's own scope section claimed §4/§6 were out of scope, contradicting the PR that implements them — all three corrected. All fixes covered by new/updated tests (229 tests passing across 13 touched files after this pass), `tsc --noEmit` and `npm run lint` clean. Still open, NOT covered by this pass: items (2), (3), (5), (6), (7) from the self-review entry above (unused `getSelectedProvider`/`setSelectedProvider`, near-zero-value policy gate, provider tabs not disabled during generation, flat token/context-window budget not tuned per provider, no regression test for the onboarding disclosure copy); Gemini auth still unconfirmed against a real key; browser click-through of any of this UI still not done. Status: 9 real findings fixed, several pre-existing self-review gaps remain open.
- [2026-07-25] `src/test/ChatView.test.jsx`'s new "does not apply a cloud provider result after Stop was clicked mid-request" test resolves `resolveCloud(...)` outside `act()` — CodeRabbit flagged this on the re-review after the PR #122 CodeRabbit-fix batch. Test-quality only, not a functional bug — the test passes and correctly exercises the abortRef guard fix; React may log an act() warning. Resume hint: wrap the resolveCloud(...) call and its assertion in `await act(async () => { ... })`. Status: open, cosmetic.

- [2026-08-12] Mobile approvals biometric gating (FaceID / TouchID): **deferred.** Local authentication (FaceID / TouchID) on iOS for high-risk approvals represents defense-in-depth and is deferred to a future cycle. Resume hint: integrate standard Apple `LocalAuthentication` and wire it into the `approveTask` flow. Status: open, deferred.
