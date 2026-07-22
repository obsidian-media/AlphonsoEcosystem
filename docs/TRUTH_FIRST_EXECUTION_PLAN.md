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
| Playwright E2E | Blocked | Current inventory is 26 tests / 7 specs. The full run exceeded ten minutes without producing a result; per-spec isolation is next. |

## Work queue

### A. Verification and release truth

- [~] **A1 — Produce a reproducible full verification baseline**
  - **Owner:** Alphonso (execution), Jose (coordination), Maria (evidence review)
  - Run `npm run lint`, `npm run test`, `npm run build`, `npm run verify:docs`,
    `cargo check`, `cargo test`, `cargo clippy -- -D warnings`, dependency
    audits, and the E2E suite.
  - Record command, platform, date, commit SHA, duration, pass/fail count, and
    blockers in Ground Truth and the release evidence.
  - **Done when:** every result is PASS, FAIL, BLOCKED, or time-bounded ADVISORY;
    none is implied by an older result.

- [~] **A2 — Make the Vitest suite deterministic**
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

- [~] **A4 — Make E2E status honest and enforceable**
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

- [ ] **A5 — Restore protected delivery flow**
  - **Owner:** Jose; **review:** Maria
  - Use branches and pull requests for normal changes; require relevant checks
    before merge. Record emergency bypasses with reason and follow-up task.
  - **Done when:** direct `main` pushes are exceptional and traceable.

### B. Dependency and security hardening

- [~] **B1 — Triage and close dependency advisories**
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

- [ ] **C2 — Enforce per-pack least privilege**
  - **Owner:** Maria; **execution:** Alphonso
  - Define owner, shared status, allowed prefixes, blocked prefixes, and
    documentation for each pack. Replace broad fallback scopes with per-pack
    overrides where feasible.
  - **Done when:** positive and negative authorization tests prove each pack
    has only its required capabilities.

- [ ] **C3 — Generate a permission matrix from source**
  - **Owner:** Jose
  - Generate human-readable agent/pack/permission documentation from the
    registry so code and docs cannot drift.
  - **Done when:** CI fails if a pack is unowned, missing, malformed,
    undocumented, or outside its contract.

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

- [ ] **D3 — Resolve or explicitly defer Boardroom gaps**
  - **Owner:** Jose; **review:** Maria
  - Decide and document status for true in-flight cancellation, resource
    contention, cards, regenerate/diff, voice input, and mobile parity.
  - **Done when:** each item is implemented with evidence, scheduled with an
    owner/date, or removed from readiness claims.

- [ ] **D4 — Make unsupported external providers unambiguous**
  - **Owner:** Marcus; **review:** Maria
  - Keep `acc` and `gemini` labelled `NOT WIRED` until they have policy,
    contract, audit, and verification parity; otherwise remove user-facing
    availability signals.
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
