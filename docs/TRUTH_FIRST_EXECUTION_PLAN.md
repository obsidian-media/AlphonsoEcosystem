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
  - **Evidence (2026-07-25, commit `873e4c5`, Windows `x86_64-pc-windows-msvc`,
    Node v25.9.0):** every command below was run in full this pass, not
    inferred from an older result:
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

- [ ] **B3 — Complete credential-at-rest hardening**
  - **Owner:** Sentinel; **execution:** Alphonso
  - Inventory secrets; migrate long-lived credentials from browser storage to
    OS-backed secure storage where supported; define migration, recovery, and
    secure cleanup behavior.
  - **Done when:** no long-lived secret remains in browser local storage and
    tests verify secrets are absent from logs and diagnostics.

- [ ] **B4 — Add security regression gates**
  - **Owner:** Sentinel
  - Cover Tauri command exposure, filesystem traversal, outbound policy bypass,
    secret logging, insecure defaults, and dependency advisories.
  - **Done when:** relevant checks run in CI and security-sensitive changes
    require review evidence.

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
    `permissions` in `skillPackService.js` (Hector's 16 new-taxonomy overrides
    were entirely fictional dotted-namespace strings; Echo/Nova had 4
    corrupted entries — a mangled `knowledge追溯`, and three missing-dot typos
    `strategy sequencing`/`opportunity readiness`/`strategyportfolio`) — so the
    bypass was effectively there to paper over broken overrides rather than an
    intentional design choice. Fixed by correcting all 20 mismatched override
    entries against the real source (cross-checked programmatically: 156
    override entries diffed against `skillPackService.js`, 1 mismatch
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
    `setSkillPackEnabled` in `skillPackService.js` directly rather than
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
    statically parses `skillPackService.js` + `agentContractService.ts` and
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

- [ ] **D1 — Live-verify the signed updater**
  - **Owner:** Marcus; **review:** Maria
  - Test discovery, download, signature verification, installation/restart,
    rollback, and reported version against a real signed release artifact.
  - **Done when:** evidence includes release tag, platform, procedure, and
    observed result.

- [ ] **D2 — Verify iOS pairing and Cloud Voice on physical devices**
  - **Owner:** Alphonso
  - Test supported iOS versions, mDNS and fallback networking, authentication
    renewal, English/Farsi acceptance, and failure recovery.
  - **Done when:** a compatibility matrix and real-device evidence are linked
    from Ground Truth.

- [PARTIAL] **D3 — Resolve or explicitly defer Boardroom gaps**
  - **Owner:** Jose; **review:** Maria
  - **Implemented (2026-07-22):** Stop now aborts the active Boardroom Ollama
    request and suppresses its cancelled reply; it still prevents further
    chained hops. Covered by `boardroomChatView.test.jsx`.
  - **Explicitly deferred:** resource contention, cards, regenerate/diff,
    voice input, and mobile parity. They remain outside readiness claims until
    each has an owner, schedule, and verification evidence.
  - **Done when:** each item is implemented with evidence, scheduled with an
    owner/date, or removed from readiness claims.

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
