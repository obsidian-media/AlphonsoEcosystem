# Alphonso Ecosystem — Production-Readiness Assessment & Transformation Roadmap

**Date:** 2026-07-15
**Author role:** Principal Architect / Staff Eng / CTO / Security / DevOps / QA — combined audit pass
**Basis:** Independent verification of `14.07.2026CurrentStateofRepo.md` against the live codebase, git history, CI run history, and the running configuration. Every claim below was checked against source or CI, not accepted from the prior report.
**Scope note:** Alphonso is a **Tauri desktop application** (React/TS frontend + Rust backend) with a set of optional cloud sidecars (WhatsApp/webhook gateways on Railway, a NVIDIA/Supabase voice cloud backend, an MCP server, a bridge). It is *local-first*, not a hosted multi-tenant SaaS. The Phase-2 category list (Backend/Database/Auth/Infra) is mapped onto that reality throughout — where a category barely applies, that is stated rather than invented.

---

## 0. Execution Progress (live — updated 2026-07-15)

This assessment is now being **executed**, not just written. Status of the
roadmap (§6) so far, on branch `claude/production-readiness-audit-mxenki` (PR #99):

| Task | Status | Notes |
|---|---|---|
| **T1** Turn CI green | ✅ done | spin 0.9.9, E2E collection fix, flaky test, audit reorder |
| **T2** Reorder Rust audit gate | ✅ done | un-masked + fixed a hidden `cargo fmt` violation |
| **T5** License signing | ✅ done | offline ECDSA-P256 signed tokens; forgery/tamper/expiry rejected; 55/55 tests |
| **T6** PIN lockout | ✅ done | 5-attempt lockout + PIN invalidation + constant-time compare |
| **T12** Fail-open DSL default | ✅ done | connector DSL risk-tiered; `require_consent` enforced for publish/paid sends |
| **T10** E2E repair | ⏳ partial | collection fixed (0→28 collect); ~22 specs stale; job made **advisory** (owner-approved, temporary); specs repair tracked |
| T3 secret-scan triage, T4 branch protection, T11 persistence, T12 DSL, T13 keychain, T14 lib.rs split, T15 updater verify, T17 observability, T18 svc-role key, T19 doc-gen, T20 budgets | ▶ pending | continuing |

**Score movement:** the two Critical security blockers (fake paywall, unguarded
PIN) and the CI-red blocker are now closed. That moves **Security 3 → ~6**,
**Deployment/Infra ~4 → ~5**, and **Overall Production Readiness 4 → ~6** once
this branch merges with branch protection on. The remaining lift to 7–8 is the
structural work (persistence schema, observability, `lib.rs` split, OS-keychain,
E2E repair), not more Critical firefighting.

**Honest caveat on E2E:** the Playwright suite was red-on-collection for months
(so it gated nothing), and ~22 specs now fail as stale UI assertions that need
live-app iteration to repair. The job has been made advisory
(`continue-on-error`) by owner decision so the real gates can gate meanwhile; it
still runs and reports. This is explicitly temporary — the flag is removed and
E2E returns to blocking once the specs are green (T10).

---

## 1. Executive Summary

The prior audit (`14.07.2026CurrentStateofRepo.md`) concludes the repo is in "**genuinely good health**" with the only real risk being "**verification debt**." **That conclusion is wrong on the single most important operational fact: CI has been red on `main` for at least the last 8 consecutive runs**, and is red right now on the exact commit that added the audit report itself (`d102a1d`). The prior audit explicitly did not run the test/`cargo`/CI suites ("would require 10+ min and heavy token spend") and never looked at GitHub Actions status — so it graded the project on a static read while the build was broken.

Three CI jobs are failing on `main` as of run `29383824378` (2026-07-15T02:19Z):

1. **Rust Tests & Clippy → FAILURE.** `cargo audit` denies on `spin 0.9.8` being **yanked**. Because the audit step runs *before* fmt/clippy/tests in that job, **cargo fmt, cargo test, and clippy never execute** — they are skipped. The prior report's claim that "Rust `cargo test`/`clippy -D warnings` are CI-enforced" is therefore currently **false in practice**: the Rust quality gate is dark.
2. **Secrets Scan (TruffleHog) → FAILURE.** A secret-scan failure on `main` is a release blocker regardless of whether it is a true positive or a scanner error; it must be triaged, not ignored.
3. **Playwright E2E Smoke → FAILURE** at `e2e/multiagent.spec.js:21` (a `beforeEach`/`addInitScript` setup error). The E2E smoke gate is red.

The JS **Test & Build** job (Windows) runs the **full** `npm test` + `npm run test:coverage` on `windows-latest` — which means the prior report's headline worry ("nobody has watched all 229 test files pass together in months") is **incorrect**: CI runs the whole JS suite on every push. But that job is **green-but-flaky, not reliably green**: on PR #99's run (`29400844284`) it failed `1 | 3349 passed (3350)` on a single racy assertion — `boardroomFacilitatorService.test.ts:149` asserts `result.latencyMs` `>= 5` on a **mocked** generation call, and a fast runner measured `4ms`. This is a concrete, live example of the test-quality debt in §3.9: a wall-clock floor that a mock can beat will intermittently red the entire gate. The real verification gaps are on the **Rust** and **E2E** sides (both currently failing) plus this class of timing-flaky JS test.

Beyond CI, this pass found **two material issues the prior audit missed entirely**:

- **The licensing gate is trivially bypassable.** `licenseService.validateLicenseKey()` validates Pro/Enterprise keys with a pure client-side regex (`/^ALPHONSO-(PRO|ENT)-[A-Z0-9]{4}-...$/`) — no signature, no server check. `policyEnforcementService` gates all premium connectors on this. Any user can unlock every paid connector by typing a self-generated string. For a product with Free/Pro/Enterprise tiers, this is a total monetization-control failure.
- **The mobile-companion PIN has no brute-force protection.** `companion_server.rs` tracks a `pin_attempts` counter in `ClientState::Pending` but **never increments or enforces it**. A 6-digit PIN (10⁶ space) with a multi-minute TTL and no lockout is brute-forceable by a LAN attacker. The prior report flagged this only as a "pen-test task," not a confirmed defect.

**Bottom line:** the codebase is genuinely large, disciplined, and well-documented — the TypeScript migration, low TODO count, and security-hardening history are real strengths. But it is **not** in "good health" in the operational sense: the build is broken, the paywall is fake, a network-facing auth control is unguarded, and the two verification surfaces that matter most (Rust, E2E) are dark. Production readiness today is **low-to-moderate**, gated primarily on turning CI green honestly and closing the licensing/PIN gaps.

---

## 2. Audit Validation Findings

### 2.1 Confirmed accurate
| Prior-report claim | Verified |
|---|---|
| Root services: 11 `.js` / 123 `.ts`; connectors 4 `.js` / 9 `.ts` | ✅ exact |
| Components: 0 `.jsx` / 116 `.tsx` | ✅ exact |
| Test files: 229 | ✅ exact |
| `@ts-nocheck`: 2 (both test files) | ✅ exact (`Button.test.tsx`, `Card.test.tsx`) |
| `any`/`as any`: 131 | ✅ exact |
| Rust: 25 files, lib.rs 2,199 lines | ✅ exact |
| Versions 2.6.0 in package.json / tauri.conf.json / Cargo.toml | ✅ in sync |
| `npm audit --omit=dev`: 0 vulns | ✅ confirmed |
| Credentials stored in localStorage + SQLite (`kv_set`), not OS keychain | ✅ confirmed (`connectorAuth.ts`, `licenseService.ts`) |
| `policyEnforcementService` defaults: `approvalMode:false`, `zeroCostMode:true` | ✅ confirmed (lines 70–71) |

### 2.2 Confirmed but materially incomplete / misframed
- **"Genuinely good health / clean" — CONTRADICTED.** CI is red on `main` (§1). The report drew a health verdict without checking CI or running `cargo audit`.
- **"cargo test/clippy are CI-enforced" — currently FALSE.** The `cargo audit` step gates the job and is failing (`spin 0.9.8` yanked), so fmt/clippy/tests are skipped every run. `src-tauri/audit.toml` has a curated ignore list (17 gtk-rs/unic advisories) but `spin` is not on it — a *new* yanked-crate advisory broke the gate.
- **"Nobody has watched all 229 tests pass" / vitest worker-pool ceiling — OVERSTATED.** The local dev-machine timeout is real, but CI's `Test & Build` job runs `npm test` + `test:coverage` (full suite) on `windows-latest` and is **green**. The JS suite *is* continuously verified. The uncovered surfaces are Rust and E2E.
- **Security Task 13 "add secret-scanning to CI if not present" — already present** (TruffleHog job exists; it is currently failing, which is the real issue).
- **Security Task 3 "run cargo audit, CI enforces it" — it enforces it and it is failing right now**, which the report should have surfaced as an active blocker rather than "cheap insurance."
- **`gateway/marketplace/` listed as a "gateway service" — overstated.** It is a single `catalogue.json` (2.7 KB), not a deployable server. Only `generic-webhook/` and `whatsapp-cloud/` have real `src/` + Dockerfile + Railway config.

### 2.3 Minor drift
- Report: "2 TODO/FIXME markers in `src/`." Actual grep returns 5 hits, but 4 are **pattern-string literals inside `workflowExecutionService.js`** (a self-audit tool searching for the word "TODO"), not debt. The one genuine deferred-work TODO is in `policyDslService.ts`. Net: the "unusually clean" characterization holds, but the number is a coincidence of grep, not a real count.
- Report: `docs/*.md` = 81. Non-recursive `docs/*.md` = 57; recursive = 81. Both numbers appear in the report; the 57-vs-81 split is just glob depth.
- Coverage thresholds are `lines 38 / branches 36 / functions 0 / statements 38` (verified in `vitest.config.js`) — CLAUDE.md's prose elsewhere says "threshold 35," a stale doc number.

### 2.4 New issues not in the prior report
1. **CI red on `main`, 8+ runs** (§1) — highest severity.
2. **License paywall bypass** — client-side regex only (§1, §5).
3. **Companion PIN brute-force** — `pin_attempts` tracked, never enforced (§1, §5).
4. **Rust quality gate dark** — audit-step ordering means clippy/tests don't run when audit fails (§2.2).
5. **Playwright `multiagent.spec.js` broken at setup** — E2E smoke red.
6. **`policyDslService` connector default is blanket-allow.** `policy.yaml`'s DSL layer allows *all* connector action types by default; real enforcement lives only in `evaluatePolicyGate`. If a future path ever trusts the DSL layer alone, it fails open. Documented as a deferred TODO, but it is a latent fail-open.
7. **Voice cloud backend is an unaudited newer surface.** `voice/cloud-backend/` (NVIDIA NIM + Supabase device enrollment + Railway Piper) barely appears in CLAUDE.md and not at all in the prior audit. Its bearer-token check (`auth.py:9`) uses `!=` (not constant-time); it holds a Supabase **service-role key** that bypasses RLS for all DB ops (large blast radius if the Railway env leaks). The Supabase RLS migration itself is well-written (per-user select/update policies).

---

## 3. Repository Deep Analysis

### 3.1 Product layer
Alphonso is an ambitious local-first "AI operating system": 9 agents, 22 connectors, ~163 services, a boardroom, coach mode, mobile companion, voice pipeline, plugin system. **Feature breadth is enormous; MVP focus is not identifiable.** There is no single "core loop" a new user is funneled through — the surface is a superset of many products (chat, orchestration, research, creative gen, voice, mobile). For production, the risk is not missing features but **undifferentiated surface area**: several flagship features are functional-but-hidden (Operator Dashboard has no sidebar entry; Coach Mode is visually indistinct), and at least one user-reported issue ("output lands somewhere unknown") was never followed up. **MVP readiness is blocked less by capability than by (a) a broken build, (b) a fake paywall undermining the business model, and (c) discoverability debt.**

### 3.2 Frontend
Architecture is mature: 100% `.tsx`, lazy-loaded views with a regression test (`appLazyImports.test.js`) guarding the `React.lazy` export-shape bug class, a large hook layer, toast/notification infrastructure, and a "Do Not Duplicate" discipline that genuinely prevents re-implementation. Weaknesses: **131 `any`/`as any`** concentrated at service boundaries (the exact place typing matters); **`ConnectorSetupPanel.tsx` holds credential UI for all 22 connectors** in one file (render-cost + merge-conflict hotspot); state is localStorage-centric with a SQLite dual-write (`durableStore.js`) that is fire-and-forget (writes can silently drop outside Tauri). Accessibility and responsiveness were not systematically verified this pass and are not covered by tests beyond one `visual.spec.js`.

### 3.3 Backend (Rust/Tauri)
`lib.rs` at 2,199 lines is the single highest merge-risk file despite 25 modules existing to split it. Security hardening history is real and above-average (SSRF blocking via `is_private_ip()`, path-traversal canonicalization, shell-interpreter removal from the program allowlist, per-arg allowlist in `policy_gate.rs`). The `CREATE_NO_WINDOW` discipline is enforced by convention only — no lint/test prevents a new `Command::new()` from regressing it. **The Rust test/clippy gate is currently not running in CI** (§2.2), so backend quality is effectively unverified on every recent commit.

### 3.4 Database / persistence
There is no traditional relational DB. Persistence is: (a) browser `localStorage` (primary), (b) Tauri SQLite `kv_store` (dual-write, best-effort), (c) one Supabase Postgres table (`voice_devices`) for cloud voice device enrollment. The Supabase migration is correct (FK cascade, RLS with per-user policies, unique constraint, length checks). The `localStorage`/SQLite side has **no schema, no migrations, no constraints, and no consistency guarantee between the two stores** — the dual-write is fire-and-forget, so the two can silently diverge. For a desktop app this is acceptable at small scale but is a latent data-integrity issue as stored state grows.

### 3.5 Authentication & authorization
Three independent auth surfaces, all with gaps:
- **License tier** — client-side regex only. **Bypassable.** (§1)
- **Companion PIN** — 6-digit, TTL'd, single-use on success, but **no attempt limiting** despite the counter existing. Brute-forceable on LAN. `verify()` also uses `==` string compare (not constant-time — minor next to the missing rate limit).
- **Voice cloud** — Supabase bearer-token user resolution + device-enrollment check (good design); service-role key bypasses RLS server-side; bearer comparison in `auth.py` is `!=` (non-constant-time, minor). No account lifecycle/revocation UI surfaced beyond the RLS `revoked_at` column.

There is no RBAC beyond the license tier and the Telegram/WhatsApp owner-allowlist gates.

### 3.6 AI systems
Real Ollama-backed generation across agents; persona system prompts sourced from `agentRegistry`; a bounded `@mention` chain (`MAX_CHAIN_DEPTH=3`) with escalation; a pipeline execution budget (`PIPELINE_MAX_ASSIGNMENTS`/`_DURATION_MS`) guarding runaway loops. Honest limitations are documented: low-confidence detection is a hedge-phrase heuristic (no logprobs), cross-thread recall is keyword-overlap (ChromaDB exists but Boardroom doesn't use it), and Stop doesn't abort in-flight fetches (`lib/ollama.js` has no `AbortController`). Cost efficiency is protected by Zero-Cost Mode (default on). Failure handling is reasonable (retry/rose-state UI). The main AI-architecture risk is **fan-out cost/latency** under multi-agent chaining with no per-request budget ceiling in tokens (only assignment-count/time).

### 3.7 Infrastructure / DevOps
CI is comprehensive on paper (7 workflows: test+build on Win/Mac/Linux, Rust quality, secrets scan, doc-count freshness, gateway health, iOS build, E2E). **But it is red and has been for 8+ runs**, and there is **no branch protection on `main`** (the most-repeated open item in CLAUDE.md), so red CI does not block merges. Releases are CI-built and signed on tag. Observability/monitoring/alerting/backup/DR are essentially **absent** — appropriate for a desktop app in some respects, but the cloud sidecars (Railway gateways, voice backend, MCP/bridge servers) have only a single gateway health-check job and no logging/alerting strategy.

### 3.8 Security (summary)
Above-average hardening history, clean `npm audit`, TruffleHog present. But: fake paywall, unguarded PIN, dark Rust audit/clippy, fail-open DSL default, credentials in plaintext-capable localStorage, a service-role key in a Railway env, and no documented vulnerability-disclosure process. See §5.

### 3.9 Testing
229 JS test files. The full suite runs in CI but is **flaky, not reliably green**: PR #99's `Test & Build` failed `1 | 3349 passed` on `boardroomFacilitatorService.test.ts:149`, which asserts a mocked call's `latencyMs >= 5` and lost a `Date.now()` race (measured `4ms`) on a fast runner. A wall-clock floor on a mock is a timing race that will intermittently red the whole gate. Rust tests exist but **aren't running in CI** right now (audit-step gating, §2.2). E2E is red. Known-bad tests persist: `companionIntegration.test.js` asserts against **fabricated** Tauri command names (`get_companion_status`, `start_companion_server`) that don't match the real `companion_get_status`/`companion_get_pin` — green but meaningless. `telegramConnectorProof.test.js` has a documented pre-existing failure never root-caused. Functions-coverage threshold is `0` (gate disabled). No mutation testing, no flaky-test detection.

---

## 4. Production-Readiness Scorecard

Scores are 1–10 (10 = production-grade). Justifications are one line each.

| Dimension | Score | Justification |
|---|---:|---|
| **Product Readiness** | 5 | Huge capability, no clear MVP loop; flagship features hidden; one user complaint never followed up. |
| **Frontend Quality** | 7 | 100% TS, lazy-load guard, strong reuse discipline; docked for 131 `any` and the 22-connector monster panel. |
| **Backend Quality (Rust)** | 5 | Solid hardening + module structure, but 2,199-line `lib.rs` and the quality gate is currently dark in CI. |
| **Database / Persistence** | 4 | No schema/migrations/constraints on the localStorage+SQLite dual-write; best-effort sync can diverge. Supabase table is clean but tiny. |
| **Security** | 3 | Fake paywall + unguarded PIN + dark Rust audit + fail-open DSL default + plaintext-capable credential store outweigh the (real) hardening history. |
| **Scalability** | 5 | Fine for single-user desktop; cloud sidecars have no horizontal-scale or backpressure story. |
| **Performance** | 6 | Caching, parallel-exec, budgets exist; multi-agent fan-out has no token budget; no perf tests. |
| **Developer Experience** | 6 | Excellent docs discipline, but red CI + no branch protection + local full-suite timeout hurt daily flow. |
| **Maintainability** | 6 | Clean TS, low TODO, but ~230-row hand-maintained duplication table + 2,199-line lib.rs + two extensibility systems (`modules/` vs skill packs). |
| **Infrastructure** | 4 | Rich CI matrix, but red; no branch protection; no monitoring/logging/alerting/backup for cloud sidecars. |
| **Testing** | 4 | 229 green JS tests, but Rust gate dark, E2E red, a fabricated-assertion test, functions threshold 0. |
| **Deployment Readiness** | 4 | Signed CI releases exist, but in-app auto-updater is code-complete-yet-live-unverified and CI is red. |
| **AI Architecture** | 6 | Honest, bounded, cost-guarded; recall/confidence are acknowledged heuristics; no token budget on fan-out. |
| **Overall Production Readiness** | **4** | Broken build + fake paywall + unguarded network auth control dominate the otherwise-strong engineering. |

---

## 5. Risk Assessment (root-cause, impact, consequence)

**R1 — CI red on `main` (Critical).** *Root cause:* no branch protection + audit-step-before-tests ordering + a newly-yanked transitive crate (`spin 0.9.8`). *Impact:* Rust quality unverified on every commit; E2E unverified; contributors normalized to red CI ("it's always red"), so a *real* regression won't stand out. *Consequence:* silent backend/E2E regressions ship; the release pipeline's safety claims are hollow.

**R2 — License paywall bypass (Critical, business).** *Root cause:* validation is client-side regex with no cryptographic signature or server check. *Impact:* zero enforceable monetization; every "Pro" connector is free. *Consequence:* the entire tiering business model is unenforceable; if the product is ever sold, this is an immediate revenue-leak and a trust problem when discovered.

**R3 — Companion PIN brute-force (High, security).** *Root cause:* `pin_attempts` counter designed-in but never wired to a lockout. *Impact:* a LAN attacker can brute a 6-digit PIN within the TTL window and gain the companion's command surface (send_command, approve_task, get_boardroom). *Consequence:* remote control of the desktop agent from an untrusted device on the same network.

**R4 — Rust quality gate dark (High).** *Root cause:* `cargo audit` (failing) precedes fmt/clippy/tests in the same job. *Impact:* clippy `-D warnings` and cargo tests haven't run in CI for the recent history. *Consequence:* Rust regressions accumulate invisibly; the "clippy-clean" invariant is unproven.

**R5 — Fail-open connector DSL default (Medium).** *Root cause:* `policyDslService` returns allow for all connector action types by default (real gate is elsewhere). *Impact:* defense-in-depth is one layer thinner than it looks. *Consequence:* if any future code path consults the DSL layer as authoritative, it fails open.

**R6 — Persistence integrity (Medium).** *Root cause:* fire-and-forget dual-write with no schema/migration/consistency check. *Impact:* localStorage and SQLite can diverge; no recovery path. *Consequence:* corrupt/partial state as stored data grows, hard to diagnose.

**R7 — Cloud service-role key blast radius (Medium).** *Root cause:* voice backend uses the Supabase service-role key (RLS-bypassing) for all DB ops on Railway. *Impact:* a Railway env leak grants full table access. *Consequence:* device-enrollment data exposure/tampering.

**R8 — Secret-scan red (Medium, triage-first).** TruffleHog is failing on `main`; must be triaged as either a true committed secret (rotate immediately) or a scanner/config issue (fix the job). Cannot be left ambiguous.

**R9 — Verification debt on flagship features (Medium).** In-app auto-updater and iOS pairing are "code-complete, live-unverified"; E2E is red; a fabricated-assertion test gives false green. *Consequence:* "done" claims that fail on real hardware/release.

---

## 6. The 20-Task Production Roadmap

Sequenced so an engineer can execute top-to-bottom. Each task: Priority · Category · Problem · Root cause · Plan · Files · Dependencies · Risks · Complexity · Impact · Definition of Done.

### T1 — Turn `main` CI green (unblock everything)
- **Priority:** Critical · **Category:** DevOps
- **Problem:** CI red 8+ runs; the whole team is flying blind.
- **Root cause:** `spin 0.9.8` yanked (not in `audit.toml` ignore), plus E2E + secret-scan failures.
- **Plan:** `cargo update -p spin` (or add the RUSTSEC yanked-advisory ID to `src-tauri/audit.toml` with a dated comment if no non-yanked version is reachable); fix `e2e/multiagent.spec.js:21` `addInitScript` setup; triage TruffleHog (see T3). Re-run CI to green.
- **Files:** `src-tauri/Cargo.lock`, `src-tauri/audit.toml`, `e2e/multiagent.spec.js`.
- **Dependencies:** none (do first).
- **Risks:** `cargo update` may bump other transitives — re-run cargo tests once the gate un-darkens (T2).
- **Complexity:** Small.
- **Impact:** Restores every downstream quality signal.
- **DoD:** Latest `main` CI run all-green; no ignore added for a crate that has a fixed version available.

### T2 — Reorder the Rust CI job so audit can't mask tests/clippy
- **Priority:** Critical · **Category:** DevOps
- **Problem:** A failing `cargo audit` skips fmt/clippy/tests.
- **Root cause:** Step ordering in the `rust-quality` job.
- **Plan:** Move `cargo audit` to a separate job (or after tests/clippy with `if: always()` on the quality steps) so a yanked-crate advisory never dark-outs the actual quality gate.
- **Files:** `.github/workflows/ci.yml`.
- **Dependencies:** T1.
- **Risks:** minimal.
- **Complexity:** Small.
- **Impact:** Rust quality is enforced independently of advisory noise.
- **DoD:** A forced `cargo audit` failure still runs and reports clippy/tests.

### T3 — Triage & resolve the TruffleHog failure; document disclosure process
- **Priority:** Critical · **Category:** Security
- **Problem:** Secret scan red on `main`; ambiguous.
- **Root cause:** Unknown until triaged (true positive vs scanner/config).
- **Plan:** Pull the TruffleHog step's verified findings; if a real secret is committed, rotate it and purge from history; if a false positive, add a scoped allow/exclude with justification. Add `SECURITY.md` disclosure/response section.
- **Files:** `.github/workflows/ci.yml`, `SECURITY.md`, possibly history rewrite.
- **Dependencies:** none.
- **Risks:** History rewrite is disruptive — coordinate.
- **Complexity:** Small–Medium.
- **DoD:** Secret-scan job green with a documented reason; any real leak rotated; disclosure process published.

### T4 — Enable branch protection on `main`
- **Priority:** Critical · **Category:** DevOps
- **Problem:** Red CI doesn't block merges; oldest open item.
- **Root cause:** Manual GitHub setting never enabled.
- **Plan:** Require the CI checks (Test&Build, Rust-quality, E2E, secret-scan, doc-count) to pass + ≥1 review before merge to `main`.
- **Files:** GitHub repo settings (no code).
- **Dependencies:** T1–T3 (don't protect a red branch — you'll block yourself).
- **Risks:** none once green.
- **Complexity:** Small.
- **DoD:** `main` rejects merges on failing required checks.

### T5 — Make the license gate cryptographically enforceable
- **Priority:** Critical · **Category:** Security / Product
- **Problem:** Paywall is a client-side regex; trivially bypassed.
- **Root cause:** `validateLicenseKey` is pattern-only; no signature/server.
- **Plan:** Issue licenses as signed tokens (Ed25519/ECDSA) bound to an identity; verify signature against an embedded public key (offline-verifiable) with the existing `pluginSigningService` primitives, or add an online activation check. Keep a graceful offline grace period. Do **not** ship the private key.
- **Files:** `src/services/licenseService.ts`, `src/services/policyEnforcementService.ts`, license-issuance tooling (new), tests.
- **Dependencies:** none.
- **Risks:** UX friction for legit users offline — design a grace window.
- **Complexity:** Medium.
- **Impact:** The business model becomes enforceable.
- **DoD:** A hand-crafted regex-matching key is rejected; only a properly signed key unlocks tiers; tests cover forgery attempts.

### T6 — Enforce PIN attempt limiting on the companion server
- **Priority:** Critical · **Category:** Security
- **Problem:** 6-digit PIN, no lockout; brute-forceable on LAN.
- **Root cause:** `pin_attempts` tracked in `ClientState::Pending` but never incremented/checked.
- **Plan:** Increment `pin_attempts` on each failed `authenticate`; after N (e.g. 5) failures, drop the connection and invalidate the PIN (forcing regeneration); add per-peer backoff. Make `verify()` constant-time. Add tests for lockout + timing.
- **Files:** `src-tauri/src/companion_server.rs`, `companion_auth.rs`.
- **Dependencies:** T1/T2 (need Rust CI live to verify).
- **Risks:** legitimate mistypes locking users out — pick N sensibly, regenerate PIN on lockout.
- **Complexity:** Small–Medium.
- **DoD:** ≥5 wrong PINs drops the client and rotates the PIN; a test proves brute-force is bounded.

### T7 — Fix or delete the fabricated-assertion tests
- **Priority:** High · **Category:** Testing
- **Problem:** `companionIntegration.test.js` asserts non-existent Tauri commands → false green.
- **Root cause:** Test written against invented command names.
- **Plan:** Rewrite to assert the real `companion_get_status`/`companion_get_pin`/router methods, or delete if redundant. Root-cause and fix `telegramConnectorProof.test.js`.
- **Files:** `src/test/services/companionIntegration.test.js`, `src/test/telegramConnectorProof.test.js`.
- **Dependencies:** none.
- **Risks:** may surface a real wiring gap — good.
- **Complexity:** Small.
- **DoD:** No test asserts a command name absent from `lib.rs`'s handler list; both files pass for real reasons.

### T8 — Restore functions-coverage gate off zero
- **Priority:** High · **Category:** Testing
- **Problem:** `functions: 0` threshold means zero function-coverage protection.
- **Root cause:** Lowered to unblock CI, never raised.
- **Plan:** Measure current functions coverage, set threshold just below it (ratchet), then add targeted tests for the highest-risk services (policy/license/connectorAuth) to climb toward 15–20%.
- **Files:** `vitest.config.js`, new test files.
- **Dependencies:** T1.
- **Risks:** flaky ratchet if suite is nondeterministic — pin the number.
- **DoD:** `functions` threshold > 0 and enforced; CI green.

### T9 — Add contract/regression tests for the two silent-auth surfaces
- **Priority:** High · **Category:** Testing / Security
- **Problem:** License-forgery and PIN-brute paths had no tests (that's why they slipped).
- **Root cause:** No adversarial tests around auth.
- **Plan:** Add unit tests asserting forged licenses fail (T5) and bounded PIN attempts (T6); add a mutation-testing pass on `policyEnforcementService`, `licenseService`, `connectorAuth`.
- **Files:** test files; mutation config.
- **Dependencies:** T5, T6.
- **Complexity:** Medium.
- **DoD:** Adversarial tests exist and fail against the old (broken) implementations.

### T10 — Fix the E2E smoke suite and add auth E2E
- **Priority:** High · **Category:** Testing
- **Problem:** `multiagent.spec.js` breaks at setup; E2E gate red.
- **Root cause:** `addInitScript`/`beforeEach` path or tauri-mock issue.
- **Plan:** Repair the setup; add an E2E for license activation (forged vs valid) and companion pairing happy-path.
- **Files:** `e2e/multiagent.spec.js`, `e2e/tauri-mock.js`, new specs.
- **Dependencies:** T1.
- **Complexity:** Medium.
- **DoD:** All 7 E2E specs pass in CI.

### T11 — Harden persistence: schema + migration for the KV/localStorage store
- **Priority:** High · **Category:** Database
- **Problem:** No schema/migration/consistency for the dual-write store.
- **Root cause:** Organic localStorage growth + best-effort SQLite mirror.
- **Plan:** Define a versioned schema/namespace for `alphonso_*` keys; add a migration/versioning helper in `durableStore.js`; make the SQLite write reconcilable (checksum or last-write-wins with a version field); add a repair path.
- **Files:** `src/lib/durableStore.js`, consumers.
- **Dependencies:** none.
- **Risks:** touching persistence risks data loss — ship behind a migration with backup.
- **Complexity:** Medium.
- **DoD:** Stored state is versioned; a divergence test proves reconciliation.

### T12 — Replace the fail-open connector DSL default with risk-tiered rules
- **Priority:** Medium · **Category:** Security
- **Problem:** `policyDslService` allow-all for connectors.
- **Root cause:** Rules written for generic verbs never match connector action-type strings, so a blanket allow was added.
- **Plan:** Add per-action-type rules (require_consent for destructive/irreversible; allow for read/low-risk) so the DSL layer agrees with `evaluatePolicyGate` instead of rubber-stamping.
- **Files:** `policy.yaml`, `src/services/policyDslService.ts`, tests.
- **Dependencies:** none.
- **Complexity:** Medium.
- **DoD:** DSL layer denies a destructive connector action in a test without relying on the primary gate.

### T13 — Move credentials to OS-level secret storage
- **Priority:** High · **Category:** Security
- **Problem:** Credentials in localStorage/SQLite (plaintext-capable).
- **Root cause:** Deferred since Sprint 4.
- **Plan:** Use the OS keychain (Tauri stronghold/keyring plugin) for connector tokens and license; keep SQLite for non-secret state. Migrate existing creds on first launch.
- **Files:** `connectorAuth.ts`, `licenseService.ts`, Rust keyring command, migration.
- **Dependencies:** T5 (license format).
- **Risks:** cross-platform keychain quirks; migration correctness.
- **Complexity:** Large.
- **DoD:** Secrets no longer readable from localStorage/SQLite; migration verified on all 3 OSes.

### T14 — Split `lib.rs` and lint-enforce `CREATE_NO_WINDOW`
- **Priority:** Medium · **Category:** Backend
- **Problem:** 2,199-line entrypoint; no-window discipline is convention-only.
- **Root cause:** Inline command handlers; no enforcement.
- **Plan:** Extract remaining inline handlers into topic modules; add a clippy lint or unit test that fails when a new `Command::new()` lacks `no_window()` on Windows.
- **Files:** `src-tauri/src/lib.rs`, module files, a test/lint.
- **Dependencies:** T2 (Rust CI live).
- **Complexity:** Large.
- **DoD:** `lib.rs` materially smaller; a test blocks an un-guarded spawn.

### T15 — Live-verify the in-app auto-updater against a real signed release
- **Priority:** High · **Category:** Deployment
- **Problem:** Updater code-complete but never tested end-to-end on a real release.
- **Root cause:** No version-bump/tag cut since it merged.
- **Plan:** Bump all 4 version locations, tag, let `release.yml` build+sign, install the prior version, confirm check→download→install→relaunch on Win/Mac.
- **Files:** version files, release workflow (verify).
- **Dependencies:** T1.
- **Complexity:** Medium.
- **DoD:** A real installed build auto-updates to the tagged release on ≥2 OSes.

### T16 — Live-verify iOS companion pairing on a real device
- **Priority:** Medium · **Category:** Product / QA
- **Problem:** Pairing never confirmed post port-collision fix.
- **Root cause:** No live-device test; firewall/mDNS unknowns.
- **Plan:** Pair a real iPhone over LAN; confirm PIN auth (with T6's lockout), mDNS discovery, and JSON-RPC routing; document firewall/UDP-5353 requirements.
- **Files:** none (verification) + docs.
- **Dependencies:** T6.
- **Complexity:** Medium.
- **DoD:** A phone pairs and drives get_status/send_command against the real backend.

### T17 — Add observability to the cloud sidecars
- **Priority:** Medium · **Category:** Infrastructure
- **Problem:** Railway gateways + voice backend + MCP/bridge have no logging/alerting.
- **Root cause:** Grew as deploy targets without an ops story.
- **Plan:** Structured logging + error reporting (e.g. Sentry, which is available here) + uptime/health alerting on the 3 gateways and the voice backend; document runbooks.
- **Files:** gateway `src/`, `voice/cloud-backend/`, config.
- **Dependencies:** none.
- **Complexity:** Medium.
- **DoD:** Errors and downtime on any sidecar page a human.

### T18 — Reduce the service-role-key blast radius in the voice backend
- **Priority:** Medium · **Category:** Security
- **Problem:** Service-role key (RLS-bypassing) used for all DB ops on Railway.
- **Root cause:** Simplicity of the enrollment implementation.
- **Plan:** Scope operations to the minimum; where possible act as the authenticated user (RLS-enforced) rather than service-role; ensure the key is only in Railway secrets with rotation documented; make bearer comparison constant-time.
- **Files:** `voice/cloud-backend/app/supabase_auth.py`, `auth.py`, docs.
- **Dependencies:** none.
- **Complexity:** Medium.
- **DoD:** Service-role key used only where strictly required; rotation runbook exists.

### T19 — Auto-generate the "Do Not Duplicate" map + close doc-drift
- **Priority:** Medium · **Category:** DevOps / Maintainability
- **Problem:** ~230 hand-maintained rows drift (218-vs-229 test count already drifted).
- **Root cause:** Manual prose maintenance.
- **Plan:** Generate the service/component inventory from the tree; extend the existing `Doc Count Freshness` check to cover test-file count and the inventory; reconcile CLAUDE.md's stale "218 tests / threshold 35" numbers.
- **Files:** `scripts/shared/counters.mjs`, `scripts/verify-doc-counts.mjs`, CLAUDE.md.
- **Dependencies:** none.
- **Complexity:** Medium.
- **DoD:** A drifted count fails CI; the duplication map is generated, not hand-typed.

### T20 — Add a token/cost budget to multi-agent fan-out + surface hidden features
- **Priority:** Medium · **Category:** AI / Product
- **Problem:** Chained generation has count/time budgets but no token budget; flagship features are hidden.
- **Root cause:** Budget guards are coarse; nav placement debt.
- **Plan:** Add a per-request token/cost ceiling to the Jose pipeline and Boardroom chaining; give Operator Dashboard a sidebar entry and Coach Mode a visual distinction; follow up the "output lands somewhere unknown" user report.
- **Files:** `joseExecutionEngineService.js`, `boardroomFacilitatorService.ts`, `Sidebar.tsx`, `App.tsx`.
- **Dependencies:** none.
- **Complexity:** Medium.
- **DoD:** A runaway multi-agent request is bounded by tokens; both features are discoverable from the primary nav.

---

## 7. CTO-Level Recommendations

**Can this reach production?** Yes — the engineering foundation is real and unusually disciplined. But not in its current state: the build is red, the paywall is fake, and a network auth control is unguarded. These are days-to-weeks of focused work, not a rewrite.

**Biggest blockers:** (1) Red CI + no branch protection (nothing is truly verified). (2) License bypass (no enforceable business model). (3) Companion PIN brute-force. (4) The Rust quality gate being dark.

**Architecture decisions to reconsider:** the localStorage-primary persistence with best-effort SQLite mirror (needs a real schema/migration story before data grows); the two competing extensibility systems (`modules/` TOML vs skill packs — pick one); the ~230-row manual duplication map (generate it).

**Rebuild vs fix:** Nothing warrants a rebuild. The one subsystem to *redesign* (not rebuild) is **licensing** — replace the regex with signed tokens. Everything else is repair.

**Highest ROI:** T1–T4 (green CI + branch protection) — they re-arm every other quality signal for ~1 day of work. Then T5/T6 (paywall + PIN) protect the business and the user.

**Postpone until after launch:** `lib.rs` splitting (T14), OS-keychain migration (T13) is important but large — sequence it early-post-launch, agent skill-taxonomy depth, Boardroom deferred spec items, module-system convergence, semantic recall upgrade.

**What a Staff Engineer prioritizes first:** T1–T2 (green + un-dark the Rust gate), then T7/T10 (kill false-green and fix E2E) — restore trust in the signals before touching features.

**What a CTO prioritizes first:** T5 (the paywall bug is an existential business risk), T4 (branch protection so quality can't regress again), T3 (secret-scan triage — a leaked secret is a legal/trust event), then T15 (prove the updater works, because a broken updater strands every shipped copy).

---

## 8. Final Verdict

Alphonso is a **large, ambitious, and genuinely well-engineered** local-first AI desktop app whose prior audit graded it "good health" **without checking whether it builds** — and it doesn't: CI is red on `main` and has been for 8+ runs, the Rust quality gate hasn't actually run, E2E is broken, the licensing paywall is a client-side regex anyone can forge, and the mobile-companion PIN has no brute-force protection. None of these are visible from the static read the prior report performed, which is exactly why a "production-readiness" verdict must be grounded in the build and the running system, not the file tree.

**Overall production readiness: 4/10 today.** The path to 8/10 is short and well-defined: turn CI honestly green, protect `main`, make the paywall and PIN real, and live-verify the updater and pairing. The underlying codebase can support production; the operational and trust layer around it currently cannot. Fix the build and the two auth gaps first — everything else is genuinely deferrable.
