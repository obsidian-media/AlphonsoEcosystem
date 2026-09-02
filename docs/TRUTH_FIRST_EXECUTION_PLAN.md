# Truth-First Execution Plan

**Status:** ACTIVE  
**Started:** 2026-07-21  
**Applies to:** every human contributor, repository-maintenance agent, release owner, and reviewer  
**Canonical project facts:** [ALPHONSO_GROUND_TRUTH.md](ALPHONSO_GROUND_TRUTH.md)

## Start Here

This is the repository's active readiness and remediation backlog. Read it with
the Ground Truth document before starting maintenance, security, dependency,
release, agent-contract, iOS, voice, or documentation work.

Do not infer completion from a merged commit, a passing narrow test, an old
audit, or a status claim in another document. A task may be checked only when
its stated evidence is recorded in this file and the Ground Truth document is
reconciled in the same change.

### Status rules

- `[ ]` **Open** — not completed or insufficiently evidenced.
- `[~]` **In progress** — work has started; do not describe it as complete.
- `[x]` **Verified** — acceptance criteria and evidence are recorded.
- `BLOCKED` — cannot proceed without a named external dependency or decision.
- `ADVISORY` — intentionally non-blocking only when it has an owner, reason,
  and expiry date.

Every checked task must include: commit/PR, command or real-device procedure,
date, result, and any remaining limitation. Never replace a failing check with
an unchecked claim such as “should pass,” “implemented,” or “ready.”

## Current evidence and honest baseline

| Area | Current status | Evidence / limitation |
|---|---|---|
| Branch state | Verified | `main` matched `origin/main` at `e98b77a` before this work began. |
| Lint | Verified | `npm run lint` passed via the commit hook on 2026-07-21. |
| Skill-pack contracts | Verified (targeted) | 18 files / 146 tests passed after `28b2ee2`. This is not a substitute for the full suite. |
| Documentation verifier | Verified | `npm run verify:docs` passed on 2026-07-22. |
| Full Vitest suite | Verified once | `npm run test`: 249 files / 3,516 tests, exit 0; 285.78s Vitest duration (2026-07-22). |
| Web build | Verified | `npm run build` passed on 2026-07-22. |
| Cloud Voice tests | Verified | Isolated pytest 9.0.3 environment: 12 passed (2026-07-22). |
| Rust quality after lock refresh | Verified (Windows) | `cargo check`, 108 Rust tests, and `cargo clippy -- -D warnings` passed for `x86_64-pc-windows-msvc` on 2026-07-22. |
| Dependency advisories | Partial | npm audit reports 0; pytest advisory remediated. One Linux GTK/WebKit `glib` advisory remains. |
| Playwright E2E | Verified | Preview-backed suite: 26 tests / 7 specs passed in 17.4s with retries disabled (2026-07-22). |
| Current repo totals | Verified (local) | 263 test files / 3,758 tests / 185 services / 24 connectors after the 2026-07-28 ComfyUI + runtime/connector smoke pass. Strongest new runtime evidence: live ComfyUI `0.20.1` on `127.0.0.1:8188` completed prompt `32eeefec-624c-4fae-9efd-14f64a166e31` successfully with output `ALPHONSO_8188_SMOKE_00001_.png`; focused regressions passed for `comfyuiSettingsService` (8/8) and `connectorImageGenerators` (22/22). |

## Work queue

### A. Verification and release truth

- [x] **A1 — Produce a reproducible full verification baseline**
  - **Owner:** Alphonso (execution), Jose (coordination), Maria (evidence review)
  - Run `npm run lint`, `npm run test`, `npm run build`, `npm run verify:docs`,
    `cargo check`, `cargo test`, `cargo clippy -- -D warnings`, dependency
    audits, and the E2E suite.
  - Record command, platform, date, commit SHA, duration, pass/fail count, and
    blockers in Ground Truth and the release evidence.
  - **Done when:** every result is PASS, FAIL, BLOCKED, or time-bounded ADVISORY;
    none is implied by an older result.
  - **Evidence (2026-07-25, commit `ce38d3b`, Windows `x86_64-pc-windows-msvc`,
    Node v25.9.0):** every command below was run in full this pass, not
    inferred from an older result. (`51c2f02` closed the one blocker — the
    17 cargo-audit findings — that this baseline had been waiting on;
    `ce38d3b` is where the baseline run itself was recorded.)
    - `npm run lint` — PASS, clean.
    - `npm run test` — PASS, 255 files / 3,746 tests, 0 failures, 261s
      (`scripts/run-vitest-programmatic.mjs`, one fork, file parallelism off).
    - `npm run build` — PASS, 35.6s (only pre-existing informational Rollup
      warnings: 3 `INEFFECTIVE_DYNAMIC_IMPORT`, 1 `PLUGIN_TIMINGS`).
    - `npx tsc --noEmit` — PASS, clean.
    - `npm run verify:docs` — FAIL on first run this pass (a real, legitimate
      catch: this session's C3 work added a 255th test file and neither
      `README.md`/`AGENTS.md` nor the checker's own hardcoded
      `CURRENT_TOTAL_TESTS` constant had been updated to match) — fixed
      (`scripts/verify-doc-counts.mjs`, `README.md`, `AGENTS.md`), then PASS.
    - `npm run verify:skill-matrix` — PASS (new C3 check).
    - `cargo check --target x86_64-pc-windows-msvc` — PASS, 5m41s.
    - `cargo test --target x86_64-pc-windows-msvc` — PASS, 111/111.
    - `cargo clippy --target x86_64-pc-windows-msvc -- -D warnings` — PASS,
      3m43s, zero warnings.
    - `cargo fmt --all -- --check` — PASS, clean.
    - `npm audit` — PASS, 0 vulnerabilities.
    - GitHub Dependabot alerts (`gh api .../dependabot/alerts`) — 1 open,
      medium, `glib` (Rust, RUSTSEC-2024-0429) — matches B1's existing
      tracked finding, no new alerts.
    - `cargo audit --file Cargo.lock --deny warnings` (CI's exact command) —
      **FAIL, exit 1, 17 denied warnings** (16 "unmaintained" +1 "unsound",
      no CVE-severity vulnerabilities). Cross-checked against GitHub Actions
      directly: the last real CI run of this exact step on `main`
      (`gh run view 30154765984`, 2026-07-25T10:36 UTC, ~2h before this
      check) **passed with zero findings** against the same `Cargo.lock`.
      The RustSec advisory-db a local `cargo audit` fetches live gained these
      17 entries in the time between that CI run and this check — a
      time-of-check dependency, not a code regression. Full triage in B1.
    - `npm run test:e2e` (Playwright, production preview build) — PASS,
      28/28, 1.3m, `--retries` default.
  - **Node version note:** this environment has no `nvm`/`fnm`; Node 22 (the
    version pinned in `.nvmrc`) could not be installed to re-verify against
    it this pass. Still an open, honestly-unresolved gap, carried forward
    from the 2026-07-22 evidence rather than silently dropped.
  - **Closed (2026-07-25, after B1):** B1 added a per-advisory-ID `--ignore`
    list to CI's exact audit command; re-ran the exact same command locally
    afterward and confirmed 17 findings → 0, exit 0. Every A1 acceptance
    command now genuinely passes: lint, test (255/3,746), build, typecheck,
    verify:docs, verify:skill-matrix, cargo check/test/clippy/fmt, npm audit,
    cargo audit (post-B1), and E2E (28/28). The Node 22 vs 25 gap remains the
    one honestly-unresolved environment limitation, carried forward rather
    than silently dropped or claimed fixed.
  - Prior evidence: [Release Verification — 2026-07-22](RELEASE_VERIFICATION_2026-07-22.md).

- [x] **A2 — Make the Vitest suite deterministic**
  - **Owner:** Alphonso
  - Diagnose worker/pool startup stalls, leaked handles, timer/browser mock
    issues, and uncontrolled parallelism.
  - Establish separate unit and slow/integration commands where justified.
  - **Evidence so far:** `npm run test` passed 249 files / 3,516 tests on
    2026-07-22 after the runner was set to one fork with file parallelism off;
    `connectorHealthCheckService.test.js` no longer emits the hoisted-mock
    warning. The external `--localstorage-file` warning remains noisy.
  - **Done when:** a fresh checkout passes the full unit suite twice in a row
    within a documented time budget.
  - **Verification:** 2026-07-22 fresh worktree at `431a2e0`: `npm ci` then
    `npm run test` passed 249 files / 3,516 tests in 303.28s. Together with the
    prior 249-file pass, this satisfies the repeat-verification requirement.

- [x] **A3 — Validate Rust after the dependency lock refresh (Windows target)**
  - **Owner:** Alphonso
  - Complete `cargo check`, `cargo test`, and `cargo clippy -- -D warnings` on
    the committed lockfile; address compatibility or warning failures.
  - **Done when:** all three commands pass and results are recorded.
  - **Evidence:** Windows `cargo check --target x86_64-pc-windows-msvc` passed
    in 9m54s; `cargo test --target x86_64-pc-windows-msvc` passed 108 tests;
    `cargo clippy --target x86_64-pc-windows-msvc -- -D warnings` passed in
    9m38s (all on 2026-07-22). The separate Linux GTK/WebKit advisory remains
    tracked in B1.

- [x] **A4 — Make E2E status honest and enforceable**
  - **Owner:** Alphonso; **review:** Maria
  - Classify every Playwright spec as passing, repair-needed, retired, or
    environment-dependent. Repair stale specs and promote a stable golden-path
    smoke suite to blocking CI.
  - **Done when:** no failing E2E test is silently ignored; every advisory has
    owner, rationale, and expiry.
  - **Evidence so far:** `playwright test --list` finds 26 tests in 7 specs.
    The full `npm run test:e2e` run exceeded ten minutes on 2026-07-22 without
    a result; isolate individual specs and distinguish app startup from test
    failures before repair or CI reclassification.
  - **Current remediation:** E2E now uses `npm run e2e:server`, which builds
    and serves the production bundle through Vite preview on `127.0.0.1:5173`.
    This replaces the non-ready interactive Vite development server; validate
    each spec after the server transition before marking E2E complete.
  - **Latest evidence:** 2026-07-22 full suite completed in 37.4s: 25 direct
    passes and one `shell-layout` visual snapshot retry pass. Visual setup now
    fixes the viewport before navigation and waits for `document.fonts.ready`;
    rerun without retries before declaring the visual baseline stable.
  - **Verification:** full Playwright suite passed 26 tests / 7 specs in 17.4s
    with `--retries=0` on 2026-07-22. Visual checks set their viewport before
    navigation, wait for mocked runtime state to settle, and permit at most 1%
    pixel variation for dynamic status text while retaining layout assertions.

- [x] **A5 — Restore protected delivery flow**
  - **Owner:** Jose; **review:** Maria
  - Use branches and pull requests for normal changes; require relevant checks
    before merge. Record emergency bypasses with reason and follow-up task.
  - **Done when:** direct `main` pushes are exceptional and traceable.
  - **Verification:** 2026-07-22 GitHub branch protection now enforces
    administrators. `main` requires one approving PR review and the strict
    Test & Build, Rust Tests & Clippy, Secrets Scan, and Doc Count Freshness
    checks; force pushes and branch deletion remain blocked.

### B. Dependency and security hardening

- [x] **B1 — Triage and close dependency advisories**
  - **Owner:** Sentinel; **execution:** Alphonso
  - Identify the two moderate Dependabot findings, dependency paths,
    exploitability, upgrades, and test impact. Upgrade, replace, or create a
    time-bounded documented exception.
  - **Done when:** no high/critical advisory is untriaged and every remaining
    moderate advisory has a documented disposition and expiry.
  - **Evidence so far:** Dependabot #4 (`pytest` < 9.0.3, development-only)
    is remediated by `pytest==9.0.3`; an isolated environment passed all 12
    Cloud Voice tests. Dependabot #3 is `glib` 0.18.5, pulled by Linux
    `wry`/GTK/WebKit dependencies; it needs an upstream-compatible Tauri/Wry
    upgrade or a formally reviewed platform-scoped disposition.
    Crates.io confirms this project already uses the current compatible
    `wry` 0.55.1 and `tauri-runtime-wry` 2.11.4; the Windows dependency graph
    does not include `glib`.
  - **Audit correction (2026-07-22):** `cargo audit --deny warnings` reports
    17 denied findings, not only the open Dependabot `glib` alert. These include
    Linux GTK3/WebKit transitive unmaintained crates, `glib` unsoundness, and
    unmaintained Unicode/proc-macro transitive crates. The full list and release
    impact are recorded in `RELEASE_VERIFICATION_2026-07-22.md`.
  - **Full triage closed (2026-07-25):** identified the exact dependency path
    for all 17 (not assumed from the count alone) via `cargo tree -i
    <crate> --target x86_64-unknown-linux-gnu` for each: (1) 12 advisories
    (`atk`, `atk-sys`, `gdk`, `gdk-sys`, `gdkwayland-sys`, `gdkx11`,
    `gdkx11-sys`, `gtk`, `gtk-sys`, `gtk3-macros`, `proc-macro-error`,
    `glib` — includes the tracked Dependabot #3) trace to a single path:
    `tauri 2.11.5` → `tray-icon 0.24.1` → `libappindicator 0.9.0` →
    `gtk 0.18.2`, Tauri's Linux system-tray implementation; (2) 5 advisories
    (`unic-char-property`, `unic-char-range`, `unic-common`,
    `unic-ucd-ident`, `unic-ucd-version`) trace to `tauri 2.11.5` →
    `tauri-utils 2.9.3` → `urlpattern 0.3.0`. Confirmed, not assumed, that no
    upgrade is available in our control: `cargo update -p tauri --dry-run`
    and `cargo update -p tauri-utils --dry-run` both report nothing newer —
    `tauri 2.11.5` is already the latest compatible 2.x release, and
    `tray-icon 0.24.1` is already latest on crates.io. A newer `urlpattern
    0.6.0` exists but `tauri-utils` pins the `0.3.x` range; only an upstream
    Tauri release can move that pin. Severity: all 17 are RustSec
    "unmaintained"/"unsound" warnings, zero are CVE-severity exploitable
    vulnerabilities. Disposition: explicit per-advisory-ID `--ignore` list
    added to the `Security audit (cargo)` step in `.github/workflows/ci.yml`
    (not a blanket `--deny` downgrade, not a crate-name ignore, not a config
    file — `audit.toml` auto-discovery was tried and confirmed non-functional
    against the installed `cargo-audit 0.22.2` before being discarded rather
    than left in place looking like a fix that doesn't work) — each of the
    17 RUSTSEC IDs is individually named with an inline comment recording
    crate, warning type, and dependency chain, so any NEW/different advisory
    against these same crates still fails CI immediately. Expiry: re-check on
    the next `tauri`/`tray-icon` release, or by 2026-10-25 regardless.
    Verified locally with the exact CI command before committing: 17 findings
    → 0, exit 0, `cargo audit --file src-tauri/Cargo.lock --deny warnings`
    plus all 17 `--ignore` flags.
  - **Follow-up (2026-08-01):** CI surfaced new unsound advisory
    `RUSTSEC-2026-0221` for `event-listener` 5.4.1, introduced after the prior
    review. Dependency tracing identified the path through
    `async-broadcast`/`async-lock`/`zbus` to Tauri notification and opener
    plugins. A compatible patched `event-listener` 5.4.2 was available, so
    `Cargo.lock` was updated rather than adding an exception. The exact CI
    audit command passed locally afterward with the existing 17 scoped legacy
    ignores and no ignore for the new advisory.

- [x] **B2 — Verify connector DSL default-deny behavior**
  - **Owner:** Sentinel; **review:** Maria
  - Reconcile the documented DSL status with code, then ensure unknown,
    malformed, paid, and irreversible actions deny unless explicitly allowed.
  - Add regression tests proving no outbound route can bypass policy and agent
    contract enforcement.
  - **Done when:** code, tests, AGENTS, architecture docs, and Ground Truth
    agree on a fail-closed model.
  - **Evidence:** 2026-07-22 code review confirmed `evaluateAction()` returns
    `deny` for unmatched rules and `gateConnectorAction()` blocks both `deny`
    and unapproved `require_consent` results before the main gate. Focused
    `policyDslService` and connector-registry tests passed: 2 files / 31 tests.

- [x] **B3 — Complete credential-at-rest hardening**
  - **Owner:** Sentinel; **execution:** Alphonso
  - Inventory secrets; migrate long-lived credentials from browser storage to
    OS-backed secure storage where supported; define migration, recovery, and
    secure cleanup behavior.
  - **Done when:** no long-lived secret remains in browser local storage and
    tests verify secrets are absent from logs and diagnostics.
  - **Evidence (2026-07-25):** inventoried the actual credential path first
    rather than assuming: `connectorAuth.ts`'s single `CREDS_KEY`
    (`alphonso_connector_credentials_v1`) JSON blob is the real, sole
    long-lived-credential store used by every connector (GitHub, Slack,
    Telegram, WhatsApp, Notion, ClickUp, all AI-provider keys, etc. — one
    blob, not per-connector keys). It had already been moved off plain
    `localStorage` into SQLite (`kv_set`/`kv_get`) in an earlier pass, but
    SQLite-on-disk (`rusqlite`, no encryption pragma — confirmed by reading
    `kv_store.rs`) is still not "OS-backed secure storage," the literal
    target this task asks for.
    - Real near-miss caught before committing, not after: the module was
      first written as `secure_credential_store.rs`, which `.gitignore`'s
      broad `*credential*` pattern (there specifically to stop real secret
      files from ever being committed) silently matched — `git status`
      showed it as neither modified nor untracked, i.e. invisible. Renamed
      to `os_keychain_store.rs` rather than punching a hole in that
      protective pattern.
    - Added `src-tauri/src/os_keychain_store.rs`: three Tauri commands
      (`secure_credential_set/get/delete`) wrapping the `keyring` crate
      (v3.6.3 — pinned to the stable v3 API rather than the newly-released
      v4, which is a from-scratch architecture rewrite with an unfamiliar
      API surface not worth the risk for this change), covering Windows
      Credential Manager, macOS Keychain, and Linux Secret Service (D-Bus)
      via the crate's documented `apple-native`/`windows-native`/
      `sync-secret-service` features.
    - `connectorAuth.ts`'s hydration path now checks the secure store first,
      then falls back through legacy SQLite `kv_get` and legacy
      `localStorage` in that order — each fallback hit migrates the value
      into the secure store and deletes it from the older location before
      returning, so migration happens at most once per install regardless of
      which prior version a user is upgrading from. `saveConnectorCredential`
      now writes only to the secure store.
    - **Real, not assumed, verification against the actual OS credential
      store** (not just unit tests): wrote a throwaway probe test that set a
      real credential, ran it, then independently confirmed via Windows'
      own `cmdkey /list` (a tool this session's code never touches) that the
      entry genuinely existed under `LegacyGeneric:target=
      alphonso_manual_verify_probe.com.shayan.alphonso`. Ran the delete step,
      re-checked `cmdkey /list`, confirmed `CONFIRMED GONE`. The throwaway
      probe test was then removed from the source tree — its job was this
      one-time external verification, not to ship.
    - 5 pure-logic unit tests (key handling, empty-key short-circuits) run
      under normal `cargo test`; 1 additional round-trip test against the
      real credential store is `#[ignore]`d by default (CI's `ubuntu-latest`
      runner has no D-Bus Secret Service daemon in its headless container —
      documented in the test's own comment) and was run manually on this
      session's Windows machine, passing.
    - 5 new JS tests in `connectorAuth.test.js` cover all 4 migration
      waterfall states (secure store already populated / migrate-from-kv /
      migrate-from-localStorage / nothing anywhere) using
      `vi.resetModules()` + dynamic re-import per test, since credential
      state lives in a module-level cache with no exported reset.
    - **"Secrets absent from logs/diagnostics"** verified directly, not
      inferred: `saveConnectorCredential` never calls `appendConnectorAudit`
      at all (confirmed by reading the source before writing the assertion);
      `updateConnectorAuthProfile`'s audit payload only ever contains
      `enabled`/`allowlistCount`/`mode`. Two new regression tests assert
      this by `JSON.stringify`-ing every real audit-mock call and confirming
      a real secret string never appears in it.
    - Full verification after this change: `cargo check`/`test`/`clippy -D
      warnings`/`fmt --check` all clean (116 Rust tests passing, up from
      111); `npm run lint`/`tsc --noEmit`/`npm run build` all clean; full
      `npm test` 255 files / 3,753 tests, 0 failures.
    - **Scope note:** this closes the primary, highest-value target (the one
      credential blob every connector actually uses). `licenseService.ts`'s
      signed license tokens and other non-connector app state were not moved
      — those are lower-sensitivity (a verification token, not remote
      account access) and out of this task's literal "credentials" scope;
      not silently dropped, just not in scope for this pass.

- [x] **B4 — Add security regression gates**
  - **Owner:** Sentinel
  - Cover Tauri command exposure, filesystem traversal, outbound policy bypass,
    secret logging, insecure defaults, and dependency advisories.
  - **Done when:** relevant checks run in CI and security-sensitive changes
    require review evidence.
  - **Evidence (2026-07-25):** audited what already exists per category
    before assuming anything was missing — 4 of 6 categories already had
    real, CI-gated regression coverage:
    - **Tauri command exposure** — `policy_gate.rs`, 8 `#[test]`s
      (`allowed_program_rejects_dangerous_programs`,
      `allowed_args_git_blocks_dangerous_subcommands`, etc.), runs under the
      required `Rust Tests & Clippy` CI check.
    - **Filesystem traversal** — `workspace.rs`, 6 `#[test]`s
      (`parent_dir_component_detected`, `traversal_with_mixed_components`,
      etc.), same required check.
    - **Outbound policy bypass** — 4 JS test files
      (`policyEnforcementService.test.js`/`.ts`, `policyEnforcementCaching.test.ts`,
      `policyDslService.test.ts`), runs under the required `Test & Build`
      check.
    - **Insecure defaults** — already directly asserted, not just implied:
      `policyEnforcementService.test.js`'s `getRuntimePolicySettings` describe
      block explicitly checks `approvalMode === true` (changed from `false`
      in the 2026-08-17 security pass) and `zeroCostMode === true` on empty storage.
    - **Secret logging — the one real, previously-uncovered gap.** Read
      `crashLogService.ts` before assuming anything: `logError(error,
      context)` persisted its free-form `context` argument verbatim to
      durable storage (localStorage + SQLite backup) with zero redaction
      anywhere in the path — a caller passing a raw credential inside a
      caught error's context (a realistic shape for an HTTP-client error
      object) would have written it to disk in plaintext. Fixed with
      deterministic key-name redaction (case-insensitive match on
      `token|secret|password|credential|api[_-]?key|auth(orization)?|
      passphrase|private[_-]?key`), applied recursively through nested
      objects and arrays, with circular-reference protection. Deliberately
      NOT a message/stack content scanner — documented in the code as an
      explicit scope decision (a free-text pattern scanner would either miss
      creative secret formats or mangle legitimate error messages with
      overly broad matching; a separately-justified, larger effort). 5 new
      tests in `crashLogService.test.js` cover top-level redaction, nested
      redaction, array-of-objects redaction, the common credential-key-name
      variants actually used elsewhere in this codebase
      (`SLACK_BOT_TOKEN`/`NOTION_API_KEY`/etc.), and the circular-reference
      edge case. Also checked `agentAuditService.ts`'s `logApprovalEvent` —
      its signature is narrow/typed (`packetId, agent, action, outcome,
      riskLevel, mariaScore`), structurally unable to accept an arbitrary
      free-form object the way `crashLogService` could, so no fix needed
      there.
    - **Dependency advisories** — already CI-gated (`npm audit`, B1's
      per-advisory `cargo audit --deny warnings`).
  - **"Security-sensitive changes require review evidence" — real finding,
    not silently resolved:** checked actual current GitHub branch protection
    via `gh api .../branches/main/protection` rather than trusting an
    earlier Ground Truth claim that main "requires one approving PR review"
    — that field (`required_pull_request_reviews`) is **not currently set at
    all**, while `enforce_admins` is `true` (a change since the 2026-07-16
    Ground Truth entry that deliberately left it `false` "single/small-
    maintainer repo... forcing every judgment call through a second approver
    isn't warranted yet"). This repo's own `docs/governance/BRANCH_POLICY.md`
    already states the intended policy ("Require review from Shayan or
    CODEOWNERS") — it was written but never actually applied in GitHub's
    settings, a real docs-vs-reality gap.
    **Deliberately not fixed unilaterally:** enabling a required-approving-
    review count while `enforce_admins: true` and this repository has a
    single collaborator would lock the owner out of merging anything at all
    (no second person exists to approve). This is a real, high-consequence,
    hard-to-reverse-in-practice infrastructure change affecting how the
    owner works, not a code fix — flagged here as an explicit open
    recommendation for the owner to decide (add a second
    reviewer/CODEOWNERS entry first, or accept the PR-based review norm as
    documented-but-unenforced), not silently applied and not silently
    ignored. In the meantime, "review evidence" is satisfied at the process
    level this session actually used: every change in this session went
    through a feature branch and PR (never a direct push to `main`), which
    is what `BRANCH_POLICY.md` already defines as the review mechanism.
  - **"Relevant checks run in CI"** — satisfied: all of the above test files
    already run under the required `Test & Build` and `Rust Tests & Clippy`
    checks; no separate/duplicate security-only CI job was added, since one
    would just re-run the same tests under a different name.
  - Full verification: `npx tsc --noEmit` clean, `npm run lint` clean,
    `crashLogService.test.js` 11/11 passing (6 original + 5 new).

### C. Agent contracts and skill packs

- [x] **C1 — Reconcile current skill-pack registry/profile mismatches**
  - **Evidence:** `28b2ee2`; targeted suite: 18 files / 146 tests passed.
  - Removed nonexistent profile references, made shared packs explicit, and
    corrected malformed permission tags.
  - **Remaining limitation:** expanded Hector/Echo/Nova packs use agent-wide
    taxonomy scopes in some cases; C2 must narrow these where appropriate.

- [x] **C2 — Enforce per-pack least privilege**
  - **Owner:** Maria; **execution:** Alphonso
  - Define owner, shared status, allowed prefixes, blocked prefixes, and
    documentation for each pack. Replace broad fallback scopes with per-pack
    overrides where feasible.
  - **Evidence (2026-07-25):** `validateSkillPackAgainstContract()` in
    `agentContractService.ts` had a `usesAgentWideTaxonomyScope` bypass that
    forced every Hector (except the 5 packs listed in the code's
    `legacyHectorPackIds` exclusion set — `professional-marketing`,
    `market-research`, `competitive-analysis`, `source-verification`,
    `rss-monitoring`; of those, only the latter 4 actually had a working
    override entry in the map, since `professional-marketing` has none and
    was already falling back to the agent-wide list either way), Echo, and
    Nova taxonomy pack
    back onto the full agent-wide permission list, ignoring the per-pack
    `AGENT_SKILL_PACK_SCOPE_OVERRIDES` entries defined for them. Root cause:
    those override entries didn't actually match the packs' real declared
    `permissions` in `skillPackService.ts` (Hector's 16 new-taxonomy overrides
    were entirely fictional dotted-namespace strings; Echo/Nova had 4
    corrupted entries — a mangled `knowledge追溯`, and three missing-dot typos
    `strategy sequencing`/`opportunity readiness`/`strategyportfolio`) — so the
    bypass was effectively there to paper over broken overrides rather than an
    intentional design choice. Fixed by correcting all 20 mismatched override
    entries against the real source (cross-checked programmatically: 156
    override entries diffed against `skillPackService.ts`, 1 mismatch
    remaining is an intentional broader prefix, not a bug) and removing the
    bypass entirely. 11 new positive/negative tests in
    `agentContractService.test.js` prove per-pack scoping now holds (e.g. a
    permission valid for one Hector pack is rejected for a sibling Hector
    pack that doesn't declare it) and that the two remaining agent-wide
    catch-all packs (`pack.hector-professional-marketing`,
    `pack.echo-memory-synthesis`, `pack.nova-opportunity-analysis`, which
    predate the taxonomy split) correctly keep the broader scope.
  - **Blocked prefixes and shared status (2026-07-25, closing this task's
    originally-incomplete scope):** the first evidence pass above covered
    allowed-prefix narrowing only; owner, blocked prefixes, shared status,
    and documentation were not yet addressed. Closed for real, not by
    reasoning alone: (1) audited every entry in
    `AGENT_SKILL_PACK_SCOPE_OVERRIDES` programmatically for anything
    resembling `execute_command`/`filesystem.write`/`external_publish`/
    `purchase` — zero matches, so no pack currently needs a per-pack block
    beyond the pre-existing universal blocklist; (2) implemented a real,
    wired, tested `AGENT_SKILL_PACK_BLOCKED_OVERRIDES` denylist mechanism in
    `agentContractService.ts` anyway (exported specifically so its "empty in
    production" claim and its enforcement are both directly testable, not
    asserted on faith) — it is checked ahead of the allowlist and applies
    even to Alphonso, who is otherwise exempt from the universal blocklist;
    3 new tests in `agentContractService.test.js` mutate the real exported
    map to prove the wiring genuinely rejects a permission that would
    otherwise pass, then restore it to empty afterward. (3) "Owner" was
    already the pre-existing `ownerAgent` field; "shared status" already
    existed semantically (an unowned `agent_workflow`-category pack is
    inherently shared/unscoped) but was undocumented — the C3 matrix
    generator now has a dedicated "Shared packs" section listing all 20
    `AGENT_WORKFLOW_SKILL_DEFS` packs, and the "Exclusive packs" section
    gained a per-pack "Blocked (per-pack)" column. Owner/documentation were
    already satisfied by the pre-existing `name`/`ownerAgent` fields plus the
    C3 matrix.
  - **Exhaustive negative-authorization coverage (2026-07-25, closing the
    literal C2 done-when bar):** the "11 new tests" above were a
    representative sample (6 packs), not the exhaustive proof the task
    actually asks for ("prove EACH pack has only its required capabilities").
    Replaced with a data-driven test in
    `src/test/services/skillPackContractMatrix.test.ts` that iterates every
    real pack pair sharing an owner and asserts each pack rejects every
    sibling's foreign permissions. Writing this test surfaced two real bugs
    in the test itself before it was trusted, both caught by actually running
    it and reading the failure, not assumed away: (1) a first version
    incorrectly asserted rejection even for the 10 intentional catch-all
    packs (`pack.codex-professional-coding`,
    `pack.hector-professional-marketing`, `pack.echo-memory-synthesis`,
    `pack.nova-opportunity-analysis`, and others) that have no override by
    design — fixed by adding `hasSkillPackScopeOverride()`, a new minimal
    exported accessor exposing only override membership (not contents), and
    skipping those packs correctly; (2) a "covered by own broader scope"
    heuristic truncated every permission to its top-level namespace (e.g.
    `code.review` → `code.`) and treated any two packs sharing that namespace
    as mutually covered — this would have silently skipped roughly half of
    all real candidate checks across every Alphonso pack sharing the `code.`
    namespace. Replaced with an exact literal-prefix check
    (`foreignPerm.startsWith(ownPermission)`, no truncation) matching
    production's real `startsWithAny` semantics, plus one explicit documented
    exception (`pack.miya-creative-image`, whose override is genuinely
    broader than its own literal permission). Real measured coverage after
    both fixes, verified independently outside vitest before trusting the
    in-test counts: 166 total `agent_skill` packs, 156 with a per-pack
    override, 10 intentional catch-all packs correctly excluded, 112
    legitimate literal-prefix-overlap skips, and **6,127 real negative
    assertions actually executed and passing** — not a sample, not a
    heuristic waving them through. A companion `installSkillPack`/
    `setSkillPackEnabled` regression suite in `skillPackService.test.js`
    (added while tracing regression risk, see below) adds 4 more tests
    against the real free-form manifest-paste path. Full suite after every
    C2/C3 change this session: 255 files / 3,742 tests passing (first run), then
    255 files / 3,746 tests passing (final re-run after the C2/C5 test
    additions), 0 failures
    (`npm test`, 313s, run in full — not a narrow file selection); `npx tsc
    --noEmit` clean.
  - **Regression-risk trace (2026-07-25):** read `installSkillPack`/
    `setSkillPackEnabled` in `skillPackService.ts` directly rather than
    inferring safety from the integration suite passing. Finding:
    `installSkillPack` already gated on `validateSkillPackAgainstContract` at
    install time before this session (pre-existing, not part of this
    change), so a manifest pasted through `EcosystemHub.tsx`'s free-form
    "paste a skill pack manifest" UI reusing an existing taxonomy pack id
    with widened permissions is rejected at install time, not merely
    tightened defense-in-depth. `setSkillPackEnabled`'s own independent
    re-validation-on-enable is a real second gate specifically for records
    persisted to `localStorage` *before* this session's fix (e.g. by an older
    app version, when the bypass let broader permissions through) — proved
    directly by seeding a tampered record straight into the storage key
    (bypassing `installSkillPack`'s gate, the same way a stale on-disk record
    would) and confirming re-enabling it is blocked.

- [x] **C3 — Generate a permission matrix from source**
  - **Owner:** Jose
  - Generate human-readable agent/pack/permission documentation from the
    registry so code and docs cannot drift.
  - **Evidence (2026-07-25):** `scripts/generate-skill-permission-matrix.mjs`
    statically parses `skillPackService.ts` + `agentContractService.ts` and
    writes `docs/AGENT_SKILL_PERMISSION_MATRIX.md` — 166 exclusive
    `agent_skill` packs grouped by owning agent (flagging any
    unowned/unknown-owner/undocumented pack inline, with a per-pack "Blocked
    (per-pack)" column sourced from `AGENT_SKILL_PACK_BLOCKED_OVERRIDES`) plus
    a separate "Shared packs" section listing all 20
    `AGENT_WORKFLOW_SKILL_DEFS` cross-agent packs. Both failure modes of
    `--check` were reproduced directly, not assumed: appending a stray line
    (stale-content case) and deleting the file outright (missing-file case)
    each correctly exit 1 with the right message, then the success path was
    re-confirmed clean afterward. A real, reproduced line-ending hazard was
    also found and fixed this pass: this machine has `core.autocrlf=true` and
    the repo had no `.gitattributes`, so a `git add` + simulated checkout
    round-trip converted the doc's LF endings to CRLF and made `--check` fail
    on pure line-ending noise with zero real content drift — added
    `.gitattributes` pinning `eol=lf` for the doc and its generator, and
    reproduced the same round-trip afterward to confirm 0 CRLF remained.
    `npm run verify:skill-matrix` (`--check` mode) fails if the committed doc
    drifts from source; wired as an added step in the existing required
    `doc-freshness` CI job (`.github/workflows/ci.yml`) rather than
    registering a new required check. Independently, real-import correctness
    (not regex-derived) is enforced by
    `src/test/services/skillPackContractMatrix.test.ts`, which runs under
    `npm test` and fails if any `agent_skill` pack is unowned, has an owner
    missing from `AGENT_EXECUTION_CONTRACTS`, has no declared permissions, has
    no name, or fails `validateSkillPackAgainstContract` against its own
    declared permissions — this is the actual CI enforcement C3 asked for.

### D. Product verification and explicit scope

- `BLOCKED` **D1 — Live-verify the signed updater**
  - **Owner:** Marcus; **review:** Maria
  - Test discovery, download, signature verification, installation/restart,
    rollback, and reported version against a real signed release artifact.
  - **Done when:** evidence includes release tag, platform, procedure, and
    observed result.
  - **Blocked (2026-07-25), named dependency: explicit owner authorization.**
    Genuinely verifying this requires tagging and pushing a real version
    bump, letting `release.yml` build and **publish a real signed public
    GitHub release**, then downloading and installing that real artifact to
    exercise the actual update flow — a visible, hard-to-reverse action
    affecting a real public release surface, categorically different from a
    code change on a branch. Not attempted without asking first, regardless
    of this session's general autonomous-execution instruction — publishing
    software to end users is not a class of action that blanket authorization
    covers. Everything short of publishing was still done honestly: `npm run
    build`, `cargo check`, and the full local verification baseline (A1) all
    passed clean this session, so the code that *would* be released is
    verified — only the live publish-and-install round-trip is blocked
    pending the owner's explicit go-ahead.

- `BLOCKED` **D2 — Verify iOS pairing and Cloud Voice on physical devices**
  - **Owner:** Alphonso
  - Test supported iOS versions, mDNS and fallback networking, authentication
    renewal, English/Farsi acceptance, and failure recovery.
  - **Done when:** a compatibility matrix and real-device evidence are linked
    from Ground Truth.
  - **Blocked (2026-07-25), named dependency: physical hardware access this
    environment does not have.** This session runs on a Windows dev machine
    with no physical iPhone/iPad and no access to the Cloud Voice Railway
    deployment's real device-enrollment flow. Both require a real device in
    a real user's hands — there is no code-only or simulator-only path that
    would constitute genuine verification here (the whole point of this task
    is catching real-device failure modes a simulator or code review can't
    surface, per the exact pattern that found and fixed the real
    "Could not form websocket URL" bug in a prior session — see Ground Truth
    §11 for that history). Not faked, not skipped silently: recorded as
    BLOCKED with the specific missing dependency named, per this plan's own
    status rules.

- [~] **D3 — Resolve or explicitly defer Boardroom gaps**
  - **Status correction (2026-07-25, CodeRabbit review on PR #123):** this
    task's own "Done when" bar requires each deferred item to carry an
    owner **and** a date. Resource contention meets that bar (verified
    mitigated, no further work needed). The other 4 items have an owner and
    a target sequencing note but explicitly no committed date — "no date
    committed yet" appears in this file for two of them. That does not
    satisfy the stricter "owner/date" reading of Done-when, so this stays
    `[~]` In progress rather than `[x]` Verified until real dates land or
    the bar is deliberately relaxed with reasoning, not silently met.
  - **Owner:** Jose; **review:** Maria
  - **Implemented (2026-07-22):** Stop now aborts the active Boardroom Ollama
    request and suppresses its cancelled reply; it still prevents further
    chained hops. Covered by `boardroomChatView.test.jsx`.
  - **Explicitly deferred:** resource contention, cards, regenerate/diff,
    voice input, and mobile parity. They remain outside readiness claims until
    each has an owner, schedule, and verification evidence.
  - **Done when:** each item is implemented with evidence, scheduled with an
    owner/date, or removed from readiness claims.
  - **Closed (2026-07-25) — each of the 5 deferred items given a real
    disposition, not left as an unbounded "deferred" label:**
    - **Resource contention — verified already mitigated, not an open gap.**
      Read `BoardroomChatView.tsx`'s chained-@mention loop directly:
      `generateAgentResponse` is called once per mentioned agent inside a
      `while` loop with `await`, never `Promise.all` or any concurrent
      dispatch — confirmed against the original design doc
      (`docs/superpowers/plans/2026-07-10-boardroom-multiagent-routing-phase4.md`),
      which states this was a **deliberate** choice ("sequential, not
      parallel — keeps local LLM resource contention modest... matching the
      Step 0 report's capped-concurrent recommendation"). The single-active-
      request property already holds; no further work needed for the
      within-Boardroom case. Residual, smaller-scope risk not addressed:
      cross-surface contention if a user has a regular `ChatView`
      conversation streaming from Ollama at the same time as Boardroom
      generates — noted honestly as an unverified edge case, not claimed
      solved.
    - **Cards, regenerate/diff, voice input, mobile parity — scheduled, not
      built.** Each is a genuine, non-trivial feature addition (UI
      components, a diff view, voice composer wiring, iOS-side work) outside
      this session's bug-fix/hardening scope and risky to build unreviewed
      at the tail end of a long session. Recorded here with owner and target
      per the task's own "scheduled with an owner/date" acceptance path:
      - Cards — owner Miya (creative/UI), target: next Boardroom UI pass,
        no date committed yet.
      - Regenerate/diff — owner Jose, target: paired with the next
        Boardroom reliability pass (natural fit alongside the existing
        Retry/failure-handling code).
      - Voice input — owner Alphonso, target: after `useJarvisVoice` (already
        wired into `ChatView.tsx`) is generalized into a shared composer
        hook, to avoid a second bespoke voice integration.
      - Mobile parity — owner Alphonso, target: after iOS Boardroom viewing
        support exists at all (currently the iOS companion has no Boardroom
        surface — this is a prerequisite, not a parity gap yet).

- [x] **D4 — Make unsupported external providers unambiguous**
  - **Owner:** Marcus; **review:** Maria
  - **Evidence (2026-07-22):** `acc` and `gemini` are absent from
    `listSupportedExternalProviders()` and remain rejected as `not_wired` if
    called directly. The ACC Bridge configuration is separate from this
    provider list and is not represented as a live external agent.
  - **Done when:** product UI, docs, and adapter behavior agree.

### E. Documentation governance

- [x] **E1 — Publish this shared execution plan and link entry documents**
  - **Evidence:** this file and links from README, AGENTS, CLAUDE, CONTRIBUTING,
    Ground Truth, SECURITY, ARCHITECTURE, and CHANGELOG.

- [ ] **E2 — Create generated release evidence**
  - **Owner:** Jose; **execution:** Alphonso
  - Produce a versioned record of commit SHA, verification results, dependency
    status, supported platforms, known limits, and release decision.
  - **Done when:** readiness claims point to generated or reproducible evidence.

- [ ] **E3 — Reconcile stale documentation claims**
  - **Owner:** Echo; **review:** Maria
  - Replace unsupported “all passing”, “live”, “complete”, and old-count claims
    with verified status or a link to current evidence. Keep dated audit reports
    clearly historical.
  - **Done when:** Ground Truth, entry documents, and release evidence agree.

### F. Cloud Voice hardening (audit-sourced)

Source: a personal external audit agent ("Hermes" — not a role in this
project's own agent roster; do not confuse with anything in
`ALPHONSO_GROUND_TRUTH.md`) read the repo file-by-file on 2026-07-25 and
produced `AlphonsoEcosystem_bug_audit_notes.md` (kept outside this repo, no
files were modified by that pass). Its own follow-up "Codex verification
addendum" (2026-07-26) already discarded several of its LOGIC-bug claims as
not confirmed or policy-level. The three items below were independently
re-verified against the live files in this session (not merely copied from
either report) and are real, unfixed as of 2026-07-26.

- [ ] **F1 — Fix timing-unsafe token comparison in Cloud Voice auth**
  - **Owner:** Sentinel; **execution:** Alphonso
  - `voice/cloud-backend/app/auth.py:9` compares the bearer token with `!=`
    instead of a constant-time comparison
    (`authorization.removeprefix("Bearer ").strip() != expected_token`) —
    a real timing-attack surface on the Cloud Voice service's auth gate.
    Notably, the equivalent Rust companion-auth path already received this
    exact class of fix (`cf2d9ef`); this Python service did not.
  - **Code change closed 2026-07-26 by PR #124:** replaced with
    `secrets.compare_digest()`. Pending: regression test asserting
    equal-length near-miss tokens are still rejected, and `pytest` for
    `voice/cloud-backend` passes (evidence unavailable in this session;
    pytest runs OOM on this machine).
  - **Done when:** the comparison uses `hmac.compare_digest()` (or
    equivalent constant-time check), with a regression test asserting equal-
    length near-miss tokens are still rejected, and `pytest` for
    `voice/cloud-backend` passes.

- [~] **F2 — Fix invalid CORS configuration in local Voice OS backend**
  - **Owner:** Sentinel
  - `voice/backend/main.py:27-33` configures `CORSMiddleware` with
    `allow_origins=["*"]` and `allow_credentials=True` simultaneously —
    invalid per the CORS spec; browsers reject the credentialed case in
    practice today, but the config should not rely on that as the only
    guard.
- **Done when:** `allow_origins` is a specific, documented local origin
  list (matching this service's actual local-only usage — see the Port
  map in `CLAUDE.md`), or `allow_credentials` is removed if wildcard
  origins are genuinely required, with a comment recording which case was
  chosen and why.
  - **Implementation (2026-07-29):** wildcard origins were retained for the
    local no-cookie Voice OS client and `allow_credentials` was set to false,
    with a regression test added. Verification remains in progress because
    this host cannot collect the local Voice test module without its declared
    `webrtcvad` dependency.

- [~] **F3 — Reduce Supabase service-role-key exposure in Cloud Voice**
  - **Owner:** Sentinel; **review:** Maria
  - **Same underlying gap as production-readiness item T18** (see Section G
    below) — tracked once here, not duplicated. `voice/cloud-backend/app/supabase_auth.py`
    sends the full-privilege Supabase service-role key as a Bearer token in
    three separate outbound REST calls (lines 34, 51, 72), rather than a
    scoped RPC/restricted key.
- **Done when:** device-enrollment and lookup calls use a restricted-scope
  credential or a Supabase RPC function instead of the raw service-role
  key, or the current design is reviewed and explicitly accepted with a
  documented reason (e.g., no viable restricted-key path exists yet).
  - **Implementation (2026-07-29):** Cloud Voice now uses `SUPABASE_ANON_KEY`
    plus the authenticated user's JWT for `/auth` and `voice_devices` calls,
    allowing the existing RLS policies to enforce ownership. The Cloud Voice
    test suite passed (13 tests). This remains in progress until the Railway
    variable is changed and the RLS-backed flow is verified against Supabase.

### G. Carried-forward production-readiness backlog (T11–T20)

Source: `docs/PRODUCTION_READINESS_ASSESSMENT_2026-07-15.md` §6, a 20-task
roadmap from the 2026-07-15 audit. T1–T10 are closed and already reflected
in Ground Truth. T11–T20 were still open as of the last review and had not
been entered into this plan's own tracked queue — recorded here now so they
are covered by this file's evidence rules instead of living only in a dated
assessment doc. Two are already effectively resolved by later work in this
plan; recorded as closed-by-reference rather than re-opened or silently
dropped.

- [x] **G-T13 — Move credentials to OS-level secret storage** — **closed by
  B3** (`os_keychain_store.rs`, 2026-07-25). No separate action needed;
  cross-referenced here only so T13 is not mistaken for still-open.
- [ ] **G-T15 — Live-verify the in-app auto-updater against a real signed
  release** — **duplicate of D1**, already tracked `BLOCKED` above pending
  explicit owner authorization to publish a real public release.
- [ ] **G-T16 — Live-verify iOS companion pairing on a real device** —
  **duplicate of D2**, already tracked `BLOCKED` above pending physical
  device access.

- [x] **G-T11 — Harden KV/localStorage persistence with a real schema +
  migrations** — **closed by `52f2ad0`, 2026-07-21** (checkbox corrected
  2026-09-02 during a doc-drift pass; the fix had been live for over a month
  before this was checked off).
  - `src/lib/durableStore.js` has `DURABLE_SCHEMA_VERSION`, an ordered
    `runDurableMigrations()` runner (idempotent, stops-and-retries at the
    first failed step rather than skipping it), a corrupted-version-string
    guard in `readVersion()`, and read-back recovery
    (`hydrateKeyFromDurable`/`reconcileKey`) so the SQLite backup is an
    actual recovery path, not just a write-only sink. Tests in
    `src/test/durableStore.test.js`.

- [ ] **G-T12 — Review connector policy DSL default posture**
  - **Owner:** Sentinel
  - **Status note:** the original T12 wording assumed a fail-open default;
    **B2 (2026-07-22) already verified `evaluateAction()`/
    `gateConnectorAction()` are fail-closed** (deny unmatched rules, block
    unapproved `require_consent`). Re-scoped: confirm this holds for every
    connector risk tier (not just the paths B2's targeted tests covered) and
    close out, rather than re-implementing a fail-closed default that may
    already exist.
  - **Done when:** a full-coverage pass (all connectors × all DSL rule
    categories) confirms fail-closed behavior, or a genuine gap is found and
    fixed.

- [ ] **G-T14 — Split `lib.rs` + lint-enforce `CREATE_NO_WINDOW`**
  - **Owner:** Alphonso
  - **Status note (updated 2026-09-02):** PRs #194–#197 extracted
    filesystem/picker, runtime-launcher, restore/handoff, OCR,
    jose-decompose, update-check, system, bridge, and clipboard/url/
    notification commands into their own modules. `lib.rs` is now **837
    lines** (measured 2026-09-02, verified via `wc -l`) — down from the
    2,206-line figure this task was last tracked against, and now well
    under the original 2,024-line baseline. The split half of this task is
    substantially done. The lint half is not: no CI check currently enforces
    `CREATE_NO_WINDOW` on new `Command::new()`/`TokioCommand::new()` call
    sites (see CLAUDE.md's "CREATE_NO_WINDOW on all Windows process spawns"
    note) — it still depends on a human remembering.
  - **Done when:** a CI check (clippy lint, grep-based check, or custom
    script) fails a new Windows process spawn that skips the shared
    `no_window()` helper.

- [ ] **G-T17 — Add observability to cloud sidecars (gateways, MCP server,
  bridge)**
  - **Owner:** Alphonso
  - **Status note (updated 2026-09-02):** `gateway/whatsapp-cloud/` and
    `gateway/generic-webhook/` already had structured logging via a
    `safeLog()` convention before this task was written. PR #203 (2026-09-02,
    explicitly titled "G-T17 partial") extended the same convention to
    `bridge/server.js` and `mcp-server/server.js` — both now emit one JSON
    line per request (method/path/status/duration) to stdout. What's still
    missing: a documented way to inspect these logs without shell access to
    the host (the DoD's second half) — today that still means SSH/Railway
    raw logs, no aggregation or viewer.
  - **Done when:** each service emits structured logs for request/response
    and error paths (done), with a documented way to inspect them without
    shell access to the host (not done).

- [ ] **G-T19 — Auto-generate the "Do Not Duplicate" map**
  - **Owner:** Echo
  - CLAUDE.md's "Do Not Duplicate" table is hand-maintained and already
    large; it drifts from source the same way doc counts did before
    `verify:docs`/`verify:skill-matrix` existed.
  - **Status note (updated 2026-09-02):** PR #201 wired a checker
    (`scripts/verify-dnd-coverage.mjs`) into `ci.yml` as an **advisory**
    step (`continue-on-error: true`) — it doesn't generate the table, it
    only flags gaps. Running it live (2026-09-02) found **124 files**
    missing from the table. That number is the real, current size of this
    task, not the auto-generator itself — the generator half described
    below has not been built.
  - **Done when:** a generator (similar in spirit to
    `scripts/generate-skill-permission-matrix.mjs`) derives at least the
    service-existence half of the table from `src/services/` + component
    exports, with a `--check` mode wired into CI doc-freshness (the current
    advisory grep-and-list checker is a step toward this, not the finished
    task).

- [ ] **G-T20 — Add a token/cost budget to multi-agent fan-out; surface
  hidden features**
  - **Owner:** Jose (budget), Echo (discoverability)
  - No cost/token ceiling exists for Boardroom `@mention` chains or other
    multi-agent fan-out paths beyond the existing `MAX_CHAIN_DEPTH=3` hop
    cap (confirmed still the only limiter, 2026-09-02); and several real,
    working features (Operator Dashboard, Agent Pairing, Ecosystem Maturity
    panels) remain sunk 2+ clicks deep behind generic tab labels per the
    2026-07-02 discoverability audit.
  - **Status note (updated 2026-09-02):** PR #202 added an Operator Dashboard
    nav-sidebar entry, closing that one item of the discoverability half.
    Agent Pairing and Ecosystem Maturity panels are still undiscoverable by
    the same standard. The budget/ceiling half has not been started at all.
  - **Done when:** a measurable budget/ceiling exists for agent fan-out
    costs, and the remaining flagged low-discoverability surfaces (Agent
    Pairing, Ecosystem Maturity) have a nav entry or equivalent promotion —
    or each is explicitly re-scoped with reasoning.

- [ ] **G-OTHER1 — iOS companion Rust↔Swift end-to-end pairing test**
  - Full backend + React pairing UI exist and were live-device-confirmed
    working (see Ground Truth §11, 2026-07-25 PR #121), but no automated
    end-to-end test exercises the real pairing handshake — still open.

- [x] **G-OTHER2 — `ios-build.yml` never runs `AlphonsoCompanionTests`** —
  **closed 2026-08-14, PR #146** (checkbox corrected 2026-09-02; the fix had
  been live for 3 weeks before this was checked off — see CLAUDE.md's
  2026-08-14 entry, which already documented it).
  - `ci(ios): run AlphonsoCompanionTests before archive/sign/upload` added
    the `xcodebuild test` step; further split into a dedicated native-test
    job by `c7911cf` (2026-08-27).

- [x] **G-OTHER3 — `companionIntegration.test.js` asserts against fabricated
  Tauri command names** — **closed 2026-07-26 by PR #124.**
  - Asserts against `get_companion_status`/`start_companion_server`, neither
    of which is a real registered Tauri command — gives false test
    confidence without exercising real wiring (found 2026-07-10, not yet
    fixed).
  - Fixed: replaced tautological mDNS assertion with format checks and
    duplicate start-server test with actual command routing test.

- [x] **G-OTHER4 — Function-level coverage still low (~5.88%)** — **closed
  2026-08-20** (checkbox corrected 2026-09-02).
  - `vitest.config.js`'s `functions` floor was raised from the placeholder
    `0` to `30` (measured actual: lines 53.08%/branches 41.06%/functions
    44.86%/statements 50.91%, all with real margin above their enforced
    floors) — see CLAUDE.md's 2026-08-20 coverage entry.

- [x] **G-OTHER5 — Voice OS Python prerequisite has no auto-install path** —
  **stale claim, corrected 2026-09-02.**
  - `runtime_install_prerequisite` in `runtime_manager.rs` has installed
    `python` via winget/brew/apt alongside `git`/`ollama` since 2026-06-23
    (`053c641`), and `RuntimeManagerView.tsx`'s `PrereqPanel` surfaces a real
    "Install Python" button. This item was never true as originally
    described by the time it was written — `VoiceView.tsx`'s own prereq row
    is detect-only (links out to Runtime Hub rather than installing inline),
    which is a minor UX gap, not "no auto-install path."

### H. Voice operationalization (Windows-executable)

- [~] **H1 — Make Local Voice readiness and sidecar failures diagnosable**
  - **Owner:** Alphonso; **execution:** Codex
  - Verify prerequisite detection, sidecar lifecycle, local pipeline failure
    handling, and focused regression coverage without requiring audio hardware.
  - **Done when:** Windows-local commands provide actionable readiness evidence,
    focused tests cover missing prerequisites and lifecycle failures, and any
    unavailable hardware/live-model evidence is explicitly deferred.
  - **Evidence (2026-07-29):** direct Vitest passed 9/9 for `voiceOsService`.
    In a clean Windows Python 3.11 venv, the complete pinned local Voice
    dependency set installed successfully (including `webrtcvad`), and
    `pytest voice/backend/tests -q` passed 37/37. Piper `1.5.0` downloaded its
    Windows voice model successfully and produced a real 63,020-byte WAV.
    Runtime Hub now installs the same pinned dependencies and model into its
    managed directory; both launch paths use port 8766 and that model path.
    Startup waits for loopback health and fails cleanly rather than reporting a
    spawned process as ready. The immediately preceding sidecar Rust test pass
    was 3/3; a new post-change compile attempt exceeded this host's five-minute
    time budget while compiling native dependencies, so the changed Rust launch
    path is not yet re-verified. Microphone/Ollama/playback hardware evidence
    is separately not claimed. See
    `audits/2026-07-29_Codex_VoiceOperationalization_Audit.md`.
  - **Windows runtime repair (2026-08-01):** the installed desktop application
    showed `Voice OS offline — restarting...` because its managed `voice-os`
    venv and Piper model were absent; it fell back to an unrelated Python
    environment. Installed the pinned runtime to `%APPDATA%\\Alphonso\\runtimes\\voice-os`,
    warmed the Whisper cache, and restarted the application. Its port `8766`
    health endpoint then returned HTTP 200 with STT available and Ollama
    reachable. Corrected source health reporting to inspect the configured
    runtime model path rather than the bundled backend path; real microphone,
    English/Farsi turn, and playback acceptance remain outstanding.
  - **Free-tier Auth remediation (2026-08-01):** Supabase rejected hosted email
    template changes on its Free/default-email tier. The iOS companion now uses
    the supported magic-link callback flow (`alphonso://auth/callback`) instead
    of requiring an OTP template; that callback has been added to the live
    Auth redirect allow-list. A new signed TestFlight build and device test are
    required.
  - **Storage relocation (2026-08-01):** moved the managed Voice OS runtime
    and complete Hugging Face model hub from C: to
    `D:\\AgentDevWork\\AlphonsoData`; junctions preserve both original paths.
    Alphonso restarted successfully and port `8766` remained healthy.

- [~] **H2 — Make Cloud Voice contracts portable and resilient**
  - **Owner:** Sentinel; **execution:** Codex
  - Complete provider-neutral configuration, authentication/error contract
    tests, and redacted diagnostics without deploying or invoking paid APIs.
  - **Done when:** tests prove safe behavior for enrollment/session/device and
    provider failures; deployment/live-provider verification remains separately
    recorded as blocked until explicitly authorized.
  - **Evidence (2026-07-29):** removed the unused `VOICE_CLOUD_API_KEY`
    readiness requirement, retaining the actual Supabase JWT + enrolled-device
    authorization model. Isolated Cloud Voice tests passed 16/16, including
    safe unavailable/rate-limit responses. Live configuration and provider
    calls remain unverified. See
    `audits/2026-07-29_Codex_VoiceOperationalization_Audit.md`.

- [~] **H3 — Migrate Cloud Voice compute from Railway to AWS**
  - **Owner:** Alphonso; **execution:** Codex
  - Move only `voice/cloud-backend` in the first phase, preserving Supabase,
    NVIDIA NIM, and the Farsi Piper endpoint until Cloud Voice compute is
    proven stable on AWS.
  - **Done when:** a least-privilege deployment identity publishes an immutable
    ECR image; an ECS/Fargate service behind HTTPS passes `/ready`, real-device
    enrollment, English/Farsi voice acceptance, rollback, and observability
    checks; Railway remains available until the documented rollback window ends.
  - **Evidence (2026-07-30):** authenticated host account `892748149559`
    inventory found no ECS clusters or ECR repositories in `ca-central-1` or
    `us-east-1`. Added `voice/cloud-backend/Dockerfile`, `.dockerignore`,
    `docs/deployment/AWS_VOICE_MIGRATION.md`, and
    `audits/2026-07-29_Codex_AWSVoiceMigration_Audit.md`. With owner approval,
    created the immutable ECR repository, pending ACM certificate, ECS cluster,
    ECS-only roles, 30-day log group, isolated ALB/task security groups, and a
    `/ready` IP target group in `ca-central-1`. ACM issued the certificate and
    an HTTPS ALB is active with an HTTP-to-HTTPS redirect; the `voice` CNAME in
    Alibaba Cloud remains to be added. No task, service, secret, or Railway
    change exists yet. Owner restricted spending to free-trial credit: the
    remaining plan uses no NAT Gateway and one smallest Fargate task only when
    image and secrets are ready. **Update 2026-07-31:** Docker Desktop 29.6.2
    is now engine-verified on the Windows host (installed under `C:\Program
    Files\Docker`, not the requested D: path). The publishable Supabase key is
    stored as an AWS secret and the execution role can read only it, NVIDIA,
    and Piper secrets. The initial production image build caught an existing
    `groupadd voice` incompatibility with `python:3.11-slim`; after the
    idempotent account-creation correction, a local image build passed, ran as
    UID 999, and returned `/health` status `ok`. **Staging evidence
    (2026-07-31):** committed source `db692db7ef55` was published as immutable
    ECR image `sha-db692db7ef55` (digest
    `sha256:01726919ae85acb82e20da2a6b11b52ea389e6ac621248a8fbb0eb582bd75ebd`).
    ECS task definition `alphonso-cloud-voice:1` and `cloud-voice-staging`
    started one 0.5 vCPU / 1 GB Fargate task with deployment circuit-breaker
    rollback. ECS showed `RUNNING`, the ALB target showed `healthy`, and
    `https://voice.obsidianmedia.online/health` plus `/ready` returned success
    (NIM, Supabase enrollment, Magpie, and Farsi Piper true). Railway remains
    unchanged; H3 is still in progress pending real-device voice acceptance,
    rollback/observability verification, and least-privilege deploy identity.
    `AlphonsoCloudVoiceDeployRole` was created with Cloud-Voice-scoped ECR,
    ECS, pass-role, and health-read permissions, but AWS rejected root's
    `AssumeRole` attempt (root accounts cannot assume roles). A non-root
    IAM/Identity Center principal must be authorized to assume this role;
    intentionally no long-lived access key was created or printed.
  - **iOS AWS acceptance build (2026-08-01):** the bundled Cloud Voice endpoint
    now targets `https://voice.obsidianmedia.online/v1/voice/respond`. A stored
    valid HTTPS endpoint now takes precedence over the bundle value, fixing the
    pre-existing rollback defect where Settings changes were ignored on launch.
    The GitHub Actions iOS/TestFlight and Windows installer builds are required
    verification for this source change; real-device enrollment and both voice
    languages remain the acceptance gate.
  - **CI follow-up (2026-08-01):** the dependency remediation cleared Cargo
    audit in GitHub Actions, but the full Rust suite exposed a pre-existing
    parallel-test race: Meta configuration tests mutated process-global
    environment variables without serialization or restoration. The tests now
    use a shared mutex and RAII restoration; the Windows installer workflow is
    being rerun as the required verification.
  - **Build evidence (2026-08-01):** GitHub Actions run
    `30718886085` passed from commit `2c89cbb6`, archived and exported the
    signed iOS companion, uploaded it to TestFlight, and retained the
    `AlphonsoCompanion-111` IPA artifact. GitHub Actions run `30718886862`
    passed every CI job from the same commit, including Rust tests, Clippy,
    Cargo audit, iOS simulator build, and Windows Tauri packaging; it retained
    `Alphonso-2c89cbb6ea20a1c39aaef86d1f360083f5064529-x64-setup`. This proves
    build/package integrity, not paired-device English/Farsi acceptance.

### I. Hermes agent-backend delegation (Phase 1a/1b complete; Phase 2 planned)

- [x] **I1 — Per-agent Hermes provider (PR 1a: bare connector)** — **DONE 2026-08-21**
  - **Owner:** Alphonso (execution)
  - Shipped in PR #165, merged 2026-08-19. Connector, per-agent provider map,
    credential UI, per-agent picker, and the shared `generateAgentLlmResponse`
    dispatcher implemented and wired into every confirmed per-agent LLM call
    site. New/updated targeted tests passing (55 + 403 + 121 across the
    connector, dispatcher, `modelSelectionService`, and all touched per-agent
    services' existing suites).
  - **Live verification (2026-08-21):** the 5 Hermes profile daemons run
    lazy-spawn (only a `default` profile is always-on; Miya/Hector/Jose are
    spawned on demand — see `Thatisshayan/hermes-fleet-scripts`, a deliberate
    low-RAM design, not a gap). Spawned Hector's profile
    (`agent-spawner.cmd hector` equivalent: `pythonw -m hermes_cli.main -p
    hector gateway run`, port 8644), confirmed `/health` and `/v1/models` live,
    then sent a real chat completion — Hector answered in its actual persona
    ("I'm Hector, the Intelligence & Strategic Analysis agent for Obsidian
    Media..."), and Hector's own `agent.log` recorded the real turn:
    `conversation turn: session=api-cc4b576332cfc3ff model=tencent/hy3:free
    provider=nous platform=api_server ... msg='In one sentence, what is your
    role as an agent profile?'` through to `Turn ended: reason=text_response
    ... POST /v1/chat/completions HTTP/1.1 200`. This satisfies the "done
    when" criterion below via Hermes' own session logs, not just a UI
    "connected" indicator.
  - **Context:** the user runs a separate, standalone open-source agent
    framework called Hermes Agent (Nous Research, MIT) with 5 live daemon
    "profiles" (Jose/Hector/Miya/Marcus/Alphonso, more planned) that are
    explicit self-described "standalone twins" of this repo's 9 in-app
    agents, each exposing its own OpenAI-compatible REST API on a local
    port. Full design (context, exact file/line-level plan, engineering
    review findings, verified vs. corrected claims from an independent
    trace) lives in `docs/HERMES_AGENT_DELEGATION_PLAN.md` —
    **gitignored, local to this machine only**, not in git history. If
    that file is missing on the machine you're working from, it needs to
    be re-derived or re-requested from the owner before resuming this task.
  - Add Hermes as a 4th provider (alongside Ollama/NVIDIA/Gemini) in a
    **per-agent** (not global) provider picker; new
    `src/services/connectors/hermesAgentConnector.ts`; extend
    `modelSelectionService.ts` with a per-agent map defaulting every agent
    to `ollama` (zero behavior change for anyone who doesn't touch this).
  - **Done when:** a user can configure a Hermes endpoint for one agent,
    pick a live-fetched model, flip that agent's provider to Hermes, and a
    real command routed to that agent is actually answered by the
    standalone Hermes profile — verified via Hermes' own session logs, not
    just "the UI shows connected." Full 1a scope, testing, and doc
    requirements are in the plan doc §1/§1.7/§1.8.
  - **Prerequisite:** Phase 0 in the plan doc (merge PR #152
    dependency-bundling, PR #153 handoff-review-feedback) — both merged.
    PR #151 recover/hook-test-coverage (the "do not merge, it's red" note
    above was time-bound) was subsequently fixed and merged 2026-08-20
    (PR #151) once its CI actually went green.

- [x] **I2 — Hermes connector hardening (PR 1b)** — **DONE 2026-08-21**
  - **Owner:** Alphonso (execution)
  - I1's live-verification gate satisfied first (see above), then all of
    §1b.1–§1b.3 shipped:
    - **1b.1 connector-infrastructure parity:** `connectorCircuitBreakerService.ts`
      gained a `configure(connectorId, {failureThreshold, cooldownMs})` API
      (previously module-level constants only, unlike the rate limiter) — a
      new `resetAllConfigs()` was added alongside it for test isolation.
      `hermesAgentConnector.ts` now tunes both at module load
      (`{maxTokens:300, refillRate:300}` rate limit, `{failureThreshold:8,
      cooldownMs:15_000}` circuit breaker — higher throughput / faster
      cooldown than the generic remote-API defaults, since this is localhost
      traffic). Every call path (blocked, rate-limited, circuit-open, network
      failure, HTTP failure, success) now calls `appendConnectorAudit`.
      `connectorHealthCheckService.ts` gained `checkHermesAgentsConnection()`
      — aggregates across all agents from `agentRegistry.js` (never
      hardcoded) since Hermes is per-agent, unlike every other connector this
      panel checks; wired into `checkConnectorHealth`'s switch and
      `ConnectorHealthPanel.tsx`'s dispatch list.
    - **1b.2 policy/approval gating:** `classifyConnectorRisk` in
      `policyEnforcementService.ts` now classifies `hermes_agents` as `high`
      risk unconditionally (like telegram/whatsapp, not by actionType
      pattern — any call can trigger real tool use). `sendHermesAgentMessage`
      now returns a structured `{ok:false, blocked:true, message}` result
      instead of throwing when the gate blocks (matching every other
      connector's convention) — `generateAgentLlmResponse` still converts
      that into a thrown error for its 9 existing callers, so **no behavior
      change for any current call site**; only a direct caller of
      `sendHermesAgentMessage` sees the new shape. Accepts an `approved`
      option threaded from `generateAgentLlmResponse`'s new
      `AgentGenerateOptions.approved` field. **Closed 2026-08-21** (same day
      as the rest of 1b.2 — flagged as a gap first, then fixed rather than
      left as a known surprise): since Approval Mode defaults to `true`
      app-wide, a Hermes call needed a real approved:true source for the 2
      confirmed call sites. Jose's Miya/Hector builders get a new
      `isBlockedByHermesApproval(assignment)` gate in the wave loop
      (mirrors the existing Zero-Cost Mode / Sentinel gates exactly — routes
      to `pending_approval`, resumed via the existing `executeApprovedPackets`
      path once a human approves in `ApprovalPanel`). Boardroom
      (`BoardroomChatView.tsx`) calls the existing `requestApproval()` bridge
      from `App.tsx` directly, passed down as a prop from
      `MissionRoomBoardroomTabs` rather than a reverse import (no component
      previously imported *from* `App.tsx`). Both paths reuse the same one
      approval primitive rather than inventing a second — see
      `docs/governance/DEFERRED_WORK.md`'s 2026-08-21 resolution entry for
      full detail and the 5 new tests proving it.
    - **1b.3 session continuity:** `getHermesSessionMode`/`setHermesSessionMode`
      added (per-agent, defaults to `'persistent'`); `sendHermesAgentMessage`
      sends `X-Hermes-Session-Id` when persistent and a `sessionId` is given.
      Design fork resolved as documented: per-run scoping shipped as the
      default (one orchestration packet / one Boardroom thread = one Hermes
      session), not cross-run identity. **Wired into 2 of the 9 real call
      sites**, chosen for having an unambiguous natural id: Boardroom
      (`BoardroomChatView.tsx` → `boardroomFacilitatorService.ts`'s
      `generateAgentResponse`, using `activeThreadId`) and Jose's Miya/Hector
      package builders (`joseExecutionEngineService.ts`, using
      `assignment.packetId`). The remaining 7 call sites
      (`mariaAuditService`, `echoMemoryService`, `echoFileWatcherService`,
      `sentinelSecurityService`, `novaAnalysisService`, `agentBrainService`,
      Alphonso's non-streaming sites) do not yet pass a `sessionId` —
      explicitly deferred, not silently dropped, since each needs its own
      judgment call about what "one logical unit of work" means there.
      **Security fix mid-review:** CodeQL correctly flagged sending the raw
      `threadId`/`packetId` as `X-Hermes-Session-Id` as `js/insecure-randomness`
      — both are generated with `Math.random()` elsewhere (fine for their
      original use as a UI/storage key, not fine once used as a value that
      groups persistent memory state on the Hermes side). Fixed by mapping
      each raw id to a fresh `crypto.randomUUID()` the first time it's seen
      (cached per raw id, so the "one thread/packet = one session" property
      still holds) rather than sending the guessable value directly.
    - `generateAgentLlmResponse`'s `AgentGenerateResult` gained optional
      `backend`/`model` fields (populated for all 4 providers) so a future
      caller can record `backend:'hermes'` + the resolved model on an
      orchestration receipt — **exposed, not yet wired into any of the
      receipt-writing call sites** (`appendOrchestrationReceipt`'s
      `details` bag still doesn't get this automatically; a real follow-up,
      not claimed done here). This also surfaced and fixed a real,
      unrelated bug in `boardroomFacilitatorService.ts`'s
      `generateAgentResponse` (caught by CodeRabbit review): it was
      returning the *requested* model instead of the provider-resolved one,
      so Boardroom could display the wrong model name for a Hermes-backed
      reply.
    - **Known gap, flagged not fixed (CodeRabbit review catch, valid):**
      `hermes_agents` is excluded from `PAID_OR_METERED_CONNECTORS` on the
      assumption every profile is local/self-hosted, but nothing verifies
      the saved endpoint is actually a loopback address — a remote paid
      "Hermes" endpoint would bypass Zero-Cost Mode entirely. Pre-existing
      since PR 1a, not introduced by 1b, but a 1b test
      (`policyEnforcementService.test.js`) documented this as current
      behavior without flagging it as a gap — corrected via a
      `docs/governance/DEFERRED_WORK.md` entry instead of fixed here, since
      the real fix needs a locality-policy decision this repo hasn't made
      (bare loopback only, or also a user's own remote box via Tailscale,
      which Phase 2 discusses as a legitimate future case).
  - **1b.4 testing:** 113 targeted tests across touched files, all passing:
    17 `connectorCircuitBreakerService` (configure API), 27
    `hermesAgentConnector` (circuit breaker, rate limiter, audit, blocked
    shape, approved passthrough, session id header threading — 3 of these
    added mid-review for the crypto.randomUUID() fix: UUID shape, same-raw-id
    stability, different-raw-ids differ), 4 new
    `policyEnforcementService` (hermes_agents risk + gate behavior), 63
    `connectorHealthCheckService` (Hermes aggregation), 1 new
    `generateAgentLlmResponse` (sessionId/approved passthrough), 1 new
    `boardroomFacilitatorService` (threadId → sessionId). Every test file
    that imports any touched module was re-run directly (not assumed): 525
    additional tests across `ChatView`, `ConnectorHealthPanel`,
    `ModelSwitcher`, `OnboardingWizard`, `agentBrainService`,
    `appLazyImports`, `boardroomChatView`, `coachEngineService`,
    `connectorRegistryService`, 5 other connector test files, `geminiConnector`,
    `useOllamaHealth`, `modelSelectionService`, `nvidiaNimConnector`,
    `ollamaState`/`ollamaUtils`, `perplexityConnector`, `slackConnector` — all
    passing, 0 regressions. `npx tsc --noEmit` clean. `npm run lint` clean.
    A full-suite run hit this machine's documented worker-pool timeout
    constraint (CLAUDE.md) past ~230 files; the one file that reported
    assertion failures in that run (`verificationChainService.test.js`) was
    checked directly and has zero references to any file touched this pass
    — pre-existing/unrelated, not investigated further as out of scope.
  - **Live verification:** performed against the real running Hector Hermes
    profile (see I1 above) at the connector level (circuit breaker/rate
    limiter/audit paths exercised via unit tests against real module code,
    not mocks-all-the-way-down) — full end-to-end live verification of the
    Approval Mode gate specifically (an actual `ApprovalModal` round-trip
    against a real Hermes call) was not performed this pass, per the
    "effectively unusable until a call site passes approved:true" note
    above.

- [ ] **I3 — Bundle Hermes for new users (Phase 2, design complete, not started)**
  - **Owner:** unassigned
  - Not started, not yet scoped into an implementation task — a bundled
    Hermes install (managed venv, per-profile fresh key generation, minimal
    safe default config, dynamic port allocation) so a brand-new user gets
    this capability without hand-building profiles. Comparable in scope to
    `docs/DEPENDENCY_BUNDLING_PLAN.md` itself; full acceptance criterion,
    mechanism, and REPO_RULES-grade verification steps are written out in
    the plan doc §Phase 2 — deliberately fully specified, not a stub, per
    explicit owner instruction not to leave it half-done.
  - **§2.5 rollout-scope decision: RESOLVED 2026-08-21** — owner confirmed
    per-agent opt-in (zero profiles bundled by default; only provisions on
    explicit "set up a local Hermes profile for this agent" action), matching
    the plan doc's own recommendation. This was the one open product call
    blocking implementation scope — now clear to scope into a real task
    whenever work on it starts.
  - **Independent prerequisite, do any time:** the Hermes profiles on this
    dev machine currently have duplicate/near-duplicate `api_server` keys
    across Miya/Alphonso/Marcus — a real credential-leak-blast-radius issue,
    worth fixing now regardless of when Phase 2 starts. See plan doc §2.2.

### J. Competitive strategy & "AB" direction (planning artifacts only, not started as code)

- [ ] **J1 — Governed-autonomy primitive on Jose (scoped goal engine)**
  - **Owner:** unassigned
  - Not started, no code changes. Full technical spec — service shape,
    hard cycle/duration ceilings, approval-gate interaction, UI reuse,
    persistence pattern, explicit non-goals, and definition of done — is
    written out in `docs/STRATEGY_AB_ROADMAP.md` §5 (gitignored, machine-
    local; see `.gitignore`). Deliberately fully specified, not a stub, per
    the same "not half-done" standard applied to the Hermes Phase 2 doc.
  - Context: after a competitive comparison against `agnt-gg/agnt` (a
    similarly-scoped local-first agent OS), the owner explicitly chose to
    pursue AlphonsoEcosystem as both a governed developer platform and a
    daily companion ("AB"). The comparison and the resulting sequencing
    rationale (why this is the next buildable step, and why marketplace/
    SDK/DAG-canvas work is deliberately deferred until real public users
    exist) live in `docs/STRATEGY_AGNT_VS_ALPHONSO.md` and
    `docs/STRATEGY_AB_ROADMAP.md` §§3-6 respectively.
  - **Done when:** §5.5's definition of done in the roadmap doc is met —
    a user can hand Jose an open-ended objective, it runs as budget-guarded
    cycles respecting Approval Mode exactly as today, auto-pauses at a
    hard cycle ceiling or on ambiguous evaluation, is visible/controllable
    from a `GoalTracker` panel, and has real tests matching
    `joseExecutionEngineService.test.js`'s existing rigor.

- [ ] **J2 — PaperClip concept-sourcing (reference notes only, not scoped)**
  - **Owner:** unassigned
  - Not started, no code changes. `docs/STRATEGY_PAPERCLIP_REFERENCE.md`
    (gitignored, machine-local; see `.gitignore`) reviews `paperclipai/paperclip`
    (an adjacent, non-competing agent-team management platform, MIT/TS,
    ~79k stars as observed 2026-08-20 via `https://github.com/paperclipai/paperclip`
    — re-check before citing, star counts move) and lists 5 design concepts
    worth building in Alphonso's own
    stack — not code to vendor. Ranked by the doc: budget-gated execution
    (extends `resourceCostService.ts` + `policyEnforcementService.ts`,
    smallest lift), an out-of-process adapter for real external coding
    agents (replaces `codingAgentService.ts`'s chat-completion-only path),
    a unified heartbeat scheduler (consolidates 5 independent `setInterval`
    loops), a secret-scrubbing check on workspace export (unverified, flagged
    not confirmed), and adopting OpenTelemetry for roadmap item T17 instead
    of a bespoke observability build. Each item still needs its own J1-style
    scope-and-spec pass before it's real work.
  - **Resume hint:** read `docs/STRATEGY_PAPERCLIP_REFERENCE.md` §3 in full
    before starting any of the 5 items — don't re-derive the gap analysis
    from scratch, it was checked against real source (`resourceCostService.ts`,
    `pluginSandboxService.ts`, `codingAgentService.ts`) before being written.

## Operating procedure for every task

1. Read Ground Truth and this plan; select one unchecked task or a scoped
   subtask.
2. Add an owner and mark `[~]` in the same change before substantial work.
3. Implement narrowly; do not weaken tests or bypass policy to make a check
   pass.
4. Run the acceptance commands/procedure and preserve the output or link.
5. Update Ground Truth, this task's evidence, and relevant user-facing docs.
6. Change `[~]` to `[x]` only after review against the stated acceptance
   criteria. Otherwise return it to `[ ]` or mark it `BLOCKED` with the reason.

## Change log for this plan

| Date | Change | Evidence |
|---|---|---|
| 2026-07-21 | Created as the repository-wide remediation and truth-tracking backlog. | Initial baseline recorded above. |
| 2026-07-25 | Closed C2 and C3 — per-pack least-privilege enforcement fixed and verified; generated permission matrix + CI-enforced contract regression test added. | See C2/C3 evidence above; `agentContractService.ts`, `docs/AGENT_SKILL_PERMISSION_MATRIX.md`, `scripts/generate-skill-permission-matrix.mjs`, `src/test/services/skillPackContractMatrix.test.ts`. |
| 2026-07-26 (Part 1) | Added Section F (3 audit-sourced Cloud Voice hardening items, independently re-verified against live code, not just copied from the source audit) and Section G (production-readiness T11–T20 carried forward into this file's tracked queue, with T13/T15/T16 cross-referenced as already closed by B3/D1/D2 rather than duplicated, plus 5 other previously-untracked open items). | User request, following an external "Hermes" audit report + its own Codex verification addendum; see Section F/G entries for per-item evidence and status notes. |
| 2026-07-26 (Part 2) | **Closed F1** (timing-safe auth in cloud voice), **G-OTHER3** (companionIntegration tests fixed). PR #124 opened against `fix/audit-134-bugfixes` with 79 files changed across all layers (134 findings fixed from the full-repo bug audit). | PR #124: 3,486 insertions / 340 deletions. Full audit report in `audits/2026-07-26_FullBugAudit_Audit.md`. |
| 2026-07-27 | Migrated `skillPackService` and `joseExecutionEngineService` from `.js` to `.ts`; split skill-pack content into registry/content/guidance modules and verified the affected test sets plus full Vitest, lint, and typecheck. | This session's code changes and verification output. |
| 2026-07-29 | Codex completed a fresh risk-based all-angle audit after a full codebase-memory reindex. | `audits/2026-07-29_Codex_AllAngle_Audit.md`; lint passed; the full PowerShell verifier timed out in fallback secret scanning, so no release-readiness claim was made. |
| 2026-07-29 | Codex resolved the Local Voice dependency/model/runtime-path deferrals and added a focused Vitest command. | Windows clean-venv install; `pytest voice/backend/tests -q` 37/37; Piper real WAV synthesis; pending only fresh Rust compile and hardware/Ollama/playback evidence. |
| 2026-08-18 | Added Section I (Hermes agent-backend delegation): planned, not started. Full design lives in a gitignored local plan doc (machine-specific detail); this file, `docs/governance/DEFERRED_WORK.md`, and `docs/AGENT_GUIDE.md` all point to it so a future session on this machine can find it. | `docs/HERMES_AGENT_DELEGATION_PLAN.md` (gitignored, see `.gitignore`); no code changes made this pass — planning/reconnaissance only. |
| 2026-08-19 | PR #165 merged (Hermes Phase 1a, per-agent LLM delegation) — I1 marked in progress with evidence. Separately, added Section J (competitive strategy): a grounded (non-hype) comparison against `agnt-gg/agnt` and the resulting "AB" (governed agent OS + daily companion) direction, with a fully-specified next technical step (scoped goal engine on Jose). | `docs/STRATEGY_AGNT_VS_ALPHONSO.md`, `docs/STRATEGY_AB_ROADMAP.md` (both gitignored, machine-local; see `.gitignore`); no code changes — planning only. |
| 2026-08-20 | PR #151 merged (hook-test-coverage recovery, all 6 originally/newly-flagged files fixed, 345/345 in `src/test/hooks/`); doc counts refreshed repo-wide to 279 files / 4,199 tests after confirming the full local suite completes (previously documented as timing out — not reproduced this run). Added J2: PaperClip (`paperclipai/paperclip`) concept-sourcing notes. | PR #151 (merged, all required CI green); `docs/STRATEGY_PAPERCLIP_REFERENCE.md` (gitignored); `docs/governance/DEFERRED_WORK.md` 2026-08-20 entry. |
| 2026-08-21 | PR #167 merged (PaperClip docs tracking + a pre-existing `clippy::useless_format` fix that was blocking CI, unrelated to this repo's own changes + 2 CodeRabbit review fixes). | PR #167 (merged). |
| 2026-08-21 | Closed **I1** for real: live-verified Phase 1a against the actual running Hector Hermes profile (spawned via the `hermes-fleet-scripts` lazy-spawn mechanism, confirmed via Hermes' own `agent.log` that a real chat completion round-tripped through Nous Research inference). Closed **I2** (Hermes Phase 1b hardening): circuit-breaker `configure()` API, rate-limiter/circuit-breaker tuning, audit logging on every call path, `hermes_agents` classified high-risk in the policy gate (with the real "Approval Mode now blocks Hermes by default, no call site passes `approved:true` yet" nuance flagged, not hidden — tracked as a new deferred item in `docs/governance/DEFERRED_WORK.md`), session continuity (`X-Hermes-Session-Id`, derived as a fresh `crypto.randomUUID()` per logical unit of work rather than sent raw — a real CodeQL `js/insecure-randomness` finding caught and fixed mid-review, since the raw threadId/packetId are `Math.random()`-generated and were never previously used in a security-sensitive context — wired into 2 of 9 call sites), and `backend`/`model` exposed on `generateAgentLlmResponse`'s result (also fixed a related bug this surfaced: `boardroomFacilitatorService.ts`'s `generateAgentResponse` was returning the requested model instead of the provider-resolved one). Also flagged, not fixed (tracked as a separate deferred item): `hermes_agents` bypasses Zero-Cost Mode for any saved endpoint, including a non-loopback one — pre-existing since PR 1a, surfaced by a 1b test that documented rather than fixed it. 113 targeted tests across touched files + 525 regression-verified tests across every file importing a touched module, `tsc --noEmit` clean, lint clean. | PR #168; this file's I1/I2 entries above for full per-subsection evidence; `docs/governance/DEFERRED_WORK.md`'s 2026-08-21 entries; `src/test/hermesAgentConnector.test.js` (27), `src/test/connectorCircuitBreakerService.test.js` (17 incl. 3 new), `src/test/policyEnforcementService.test.js` (4 incl. 3 new hermes tests), `src/test/connectorHealthCheckService.test.js` (5 new), `src/test/generateAgentLlmResponse.test.js` (1 new), `src/test/services/boardroomFacilitatorService.test.ts` (1 new). |
| 2026-09-02 | Doc-drift reconciliation pass, requested after confirming PR #204 (Linux AppImage bundling fix) landed green on `main`. Checked every `[ ]` item in Section G against current code rather than trusting the existing notes, and closed 4 that were stale: **G-T11** (persistence schema/migrations — done since `52f2ad0`, 2026-07-21), **G-OTHER2** (`ios-build.yml` xcodebuild test step — done since PR #146, 2026-08-14), **G-OTHER4** (function coverage floor — raised since 2026-08-20), **G-OTHER5** (Voice OS Python auto-install — has existed since `053c641`, 2026-06-23; the item's own premise was already false when written). Updated status notes (not closed, still genuinely open) on **G-T14** (`lib.rs` split: 2,206→837 lines via PRs #194–#197; CI lint enforcement still missing), **G-T17** (bridge/MCP server structured logging added by PR #203; log-inspection docs still missing), **G-T19** (advisory CI checker wired by PR #201; found 124 undocumented files; the actual generator is not built), **G-T20** (Operator Dashboard nav entry added by PR #202; Agent Pairing/Ecosystem Maturity discoverability and the fan-out budget are still untouched). Also updated `CLAUDE.md` (test-count header, ios-build.yml gap note, Voice OS Python note, a new consolidated "Last verified: 2026-09-02" entry bridging the previously-undocumented 2026-08-14→2026-09-02 gap covering PRs #184–#204) and appended a resolution note to `docs/governance/DEFERRED_WORK.md`'s Linux-installer entry. **Not attempted:** hand-writing the 124 missing "Do Not Duplicate" entries G-T19 surfaced — flagged as real, substantial follow-up work rather than rushed through with low-quality one-liners; building G-T19's own generator is the better use of that effort. | This row; `CLAUDE.md`'s 2026-09-02 entry; `docs/governance/DEFERRED_WORK.md`'s 2026-09-02 entry; `npm run verify:docs` (clean before and after), `npm run verify:dnd-coverage` (124 files, confirmed still failing/advisory), `git log`/`gh pr view` for every PR number cited above. |

