# Release-Confidence Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore a Node 22-based, blocking E2E release pipeline whose documentation and policy-coverage evidence are demonstrably current.

**Architecture:** One runtime contract is declared in package metadata, local tooling, CI, and contributor docs. E2E is repaired from its shared Playwright harness outward, then made blocking only after green results. A release verification script executes each available layer in order and writes a factual evidence record; connector dispatch coverage is asserted by tests and documented separately from the DSL’s narrower supplemental scope.

**Tech Stack:** Node 22 LTS, npm, Vite 8, Vitest, Playwright, GitHub Actions, Rust/Cargo, React/Tauri.

---

### Task 1: Establish the Node 22 runtime contract

**Files:**
- Modify: `package.json`
- Modify: `.nvmrc`
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`
- Modify: `CONTRIBUTING.md`

- [ ] **Step 1: Write a runtime-contract regression test**

Create `scripts/test-runtime-contract.mjs` that reads `package.json`, `.nvmrc`, and
`.github/workflows/ci.yml`, then rejects divergent major versions:

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const nvm = readFileSync('.nvmrc', 'utf8').trim();
const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
assert.equal(pkg.engines.node, '22.x');
assert.equal(nvm, '22');
assert.equal((ci.match(/node-version: 22/g) || []).length, 5);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node scripts/test-runtime-contract.mjs`

Expected: failure because the repository currently has no `engines.node` and
uses Node 20 in CI / `.nvmrc`.

- [ ] **Step 3: Implement the runtime contract**

Add the following package metadata:

```json
"engines": { "node": "22.x" }
```

Replace `.nvmrc` with `22`. Replace every `node-version: 20` occurrence in
`.github/workflows/ci.yml` with `node-version: 22`. Update the prerequisite
sections of the README and contributing guide to say **Node 22 LTS**.

- [ ] **Step 4: Run contract and dependency verification**

Run: `node scripts/test-runtime-contract.mjs && npm ci`

Expected: runtime contract passes; dependency installation exits 0.

- [ ] **Step 5: Commit**

```bash
git add package.json .nvmrc .github/workflows/ci.yml README.md CONTRIBUTING.md scripts/test-runtime-contract.mjs
git commit -m "ci: pin supported Node runtime to 22"
```

### Task 2: Reconcile current documentation facts

**Files:**
- Modify: `docs/ALPHONSO_GROUND_TRUTH.md`
- Modify: `AGENTS.md`
- Modify: `ARCHITECTURE.md`
- Modify: `README.md`
- Modify: `CONTRIBUTING.md`
- Modify: `scripts/verify-doc-counts.mjs`
- Test: `scripts/test-runtime-contract.mjs`

- [ ] **Step 1: Add failing assertions for known truth defects**

Extend `scripts/test-runtime-contract.mjs` to require the authoritative docs to
contain `Vite 8`, to reject the phrase `0 subdirectory `.jsx``, and to reject
the ground-truth table row `| Version | 2.5.0 |`.

- [ ] **Step 2: Run the assertions to verify they fail**

Run: `node scripts/test-runtime-contract.mjs`

Expected: failure naming the stale Vite, JSX, and version claims.

- [ ] **Step 3: Reconcile prose to source**

Set the authoritative version to 2.6.0 and Vite to 8. Replace the completed
TypeScript-migration claim with an exact current statement: production UI has
`.tsx` components plus legacy `.jsx` contexts/content-catalyst files, while new
components must be `.tsx`. Update test/service counts only by using the existing
counter functions, not manually guessed numbers. Update the architecture policy
description to say the DSL is default-deny and supplemental to the primary gate.

- [ ] **Step 4: Extend the existing doc verifier**

Add checks to `scripts/verify-doc-counts.mjs` that compare its computed Vite
major version and production `.jsx` count against the exact generated markers in
ground truth. Keep old historical claims in dated history documents only.

- [ ] **Step 5: Verify documentation**

Run: `node scripts/test-runtime-contract.mjs && npm run verify:docs`

Expected: both commands exit 0.

- [ ] **Step 6: Commit**

```bash
git add docs/ALPHONSO_GROUND_TRUTH.md AGENTS.md ARCHITECTURE.md README.md CONTRIBUTING.md scripts/verify-doc-counts.mjs scripts/test-runtime-contract.mjs
git commit -m "docs: reconcile runtime and migration facts"
```

### Task 3: Repair Playwright harness before individual specifications

**Files:**
- Modify: `playwright.config.js`
- Modify: `e2e/tauri-mock.js`
- Modify: affected files in `e2e/*.spec.js`
- Create: `docs/E2E_RECOVERY_2026-07-18.md`

- [ ] **Step 1: Capture the current failure ledger**

Run: `npx playwright test --reporter=line`

Record each spec/test name, failure category, and current UI contract in
`docs/E2E_RECOVERY_2026-07-18.md`. Do not classify a timeout as a product bug
until the dev-server and Tauri mock are known to be ready.

- [ ] **Step 2: Add a harness readiness test**

In `e2e/boot.spec.js`, add a test that waits for
`window.__ALPHONSO_BOOT_READY__` and asserts the visible app shell exists before
any page-specific interaction:

```js
await page.waitForFunction(() => window.__ALPHONSO_BOOT_READY__ === true);
await expect(page.locator('#root')).not.toBeEmpty();
```

- [ ] **Step 3: Run the focused test to verify its initial state**

Run: `npx playwright test e2e/boot.spec.js --reporter=list`

Expected: either pass, or a deterministic boot/harness failure captured in the
recovery ledger.

- [ ] **Step 4: Repair the shared harness**

Make `e2e/tauri-mock.js` expose only real commands and asynchronous responses
used by the current app. Set `window.__PLAYWRIGHT__` before page scripts run
through `addInitScript`; ensure the Playwright web server uses the supported
Node 22 `npm run dev` command and a startup timeout appropriate for Vite 8.

- [ ] **Step 5: Repair individual specs from the ledger**

For each stale assertion, replace brittle text/position selectors with an
accessible role, a stable `data-testid`, or an existing visible label. For
obsolete workflows, replace the removed interaction with an assertion of the
current supported behavior. Preserve one meaningful success-path assertion per
feature; do not delete a failing spec without its ledger entry and replacement.

- [ ] **Step 6: Verify E2E locally**

Run: `npm run test:e2e`

Expected: all collected Playwright tests pass with no skipped stale failures.

- [ ] **Step 7: Commit**

```bash
git add playwright.config.js e2e docs/E2E_RECOVERY_2026-07-18.md
git commit -m "test(e2e): restore current UI smoke coverage"
```

### Task 4: Make green E2E a blocking CI requirement

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `docs/PRODUCTION_READINESS_ASSESSMENT_2026-07-15.md`
- Modify: `docs/ALPHONSO_GROUND_TRUTH.md`

- [ ] **Step 1: Add a CI configuration assertion**

Extend `scripts/test-runtime-contract.mjs` to reject an E2E job containing
`continue-on-error: true`.

- [ ] **Step 2: Run the assertion to prove it fails before the CI change**

Run: `node scripts/test-runtime-contract.mjs`

Expected: failure identifying the advisory E2E setting.

- [ ] **Step 3: Remove advisory E2E status**

Delete `continue-on-error: true` and its temporary-advisory comments from the
`e2e` job. Retain `needs: [test]`, Node 22 setup, browser installation, and the
list reporter. Update readiness documents to mark T10 complete only after the
GitHub Actions run for this commit succeeds.

- [ ] **Step 4: Verify configuration and CI**

Run: `node scripts/test-runtime-contract.mjs && npm run test:e2e`

Expected: both commands exit 0. Then inspect the resulting GitHub Actions run;
expected E2E conclusion is `success`, not `neutral` or `cancelled`.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml docs/PRODUCTION_READINESS_ASSESSMENT_2026-07-15.md docs/ALPHONSO_GROUND_TRUTH.md scripts/test-runtime-contract.mjs
git commit -m "ci: require passing Playwright E2E"
```

### Task 5: Add connector-policy coverage proof and matrix

**Files:**
- Create: `src/test/connectorPolicyCoverage.test.ts`
- Create: `docs/CONNECTOR_POLICY_COVERAGE.md`
- Modify: `src/services/connectors/connectorRegistry.js` only if coverage finds
  an ungated implemented dispatch
- Modify: direct connector modules only if coverage finds an ungated dispatch

- [ ] **Step 1: Write the failing policy coverage test**

Build an explicit array of implemented outbound operations from the current
connector modules and require every function to return a blocked result before
its Tauri `invoke` is called when `evaluatePolicyGate` denies. Mock
`evaluatePolicyGate` as `{ ok: false, blocked: true, reason: 'test block' }`
and mock `invoke`; assert `invoke` has no calls for each operation.

- [ ] **Step 2: Run the focused coverage test**

Run: `npx vitest run src/test/connectorPolicyCoverage.test.ts --pool=forks`

Expected: failure listing each operation that has no tested policy traversal.

- [ ] **Step 3: Make discovered dispatch gaps fail closed**

Route any uncovered outbound implementation through its existing primary gate
before payload construction or `invoke`. Preserve the DSL only for the registry
image path; do not expand DSL behavior in this milestone. Return the existing
blocked-result shape so callers keep their current error handling.

- [ ] **Step 4: Document the coverage matrix**

Document every implemented outbound operation, source module, primary-gate
entry point, DSL status, test name, and whether it invokes Rust or a direct HTTP
client. Mark unimplemented connectors as PLACEHOLDER rather than claiming gate
coverage for them.

- [ ] **Step 5: Verify**

Run: `npx vitest run src/test/connectorPolicyCoverage.test.ts src/test/policyEnforcementService.test.js src/test/connectorRegistryService.test.js --pool=forks`

Expected: all tests pass and no mocked blocked operation reaches `invoke`.

- [ ] **Step 6: Commit**

```bash
git add src/test/connectorPolicyCoverage.test.ts docs/CONNECTOR_POLICY_COVERAGE.md src/services
git commit -m "test(policy): prove outbound connector gate coverage"
```

### Task 6: Create and run the release matrix

**Files:**
- Create: `scripts/verify-release.mjs`
- Modify: `package.json`
- Create: `docs/RELEASE_MATRIX_2026-07-18.md`
- Modify: `README.md`
- Modify: `CONTRIBUTING.md`

- [ ] **Step 1: Write a script behavior test**

Create `scripts/test-verify-release.mjs` that starts `verify-release.mjs` with
`VERIFY_RELEASE_DRY_RUN=1`, asserts the command list is exactly lint, typecheck,
unit test, build, E2E, Rust test, and Clippy, and asserts the process exits
non-zero when a configured command exits non-zero.

- [ ] **Step 2: Run it to verify it fails**

Run: `node scripts/test-verify-release.mjs`

Expected: failure because `verify-release.mjs` does not exist yet.

- [ ] **Step 3: Implement the matrix runner**

Use `node:child_process.spawnSync` with `stdio: 'inherit'`. Print the Node
version, platform, command name, and elapsed time for each command. Stop at the
first command failure and emit `PARTIAL` rather than a false pass. In dry-run
mode print the command list without executing it. Add
`"verify:release": "node scripts/verify-release.mjs"` to `package.json`.

- [ ] **Step 4: Verify script semantics and run available matrix checks**

Run: `node scripts/test-verify-release.mjs && npm run verify:release`

Expected: script test passes. Record actual successes, failures, and external
network blockers in the release matrix document without changing a blocked
result to a pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/verify-release.mjs scripts/test-verify-release.mjs package.json docs/RELEASE_MATRIX_2026-07-18.md README.md CONTRIBUTING.md
git commit -m "build: add factual release matrix verification"
```

## Plan self-review

- Spec coverage: Task 1 covers runtime, Task 2 documents truth, Tasks 3–4
  restore blocking E2E, Task 5 proves policy coverage, and Task 6 records the
  complete release matrix.
- Scope: persistence, keychain, live-device work, observability, and major UI
  refactors remain explicitly deferred as required by the approved design.
- No placeholders: each task names exact files, commands, expected outcomes,
  and concrete implementation behavior.
