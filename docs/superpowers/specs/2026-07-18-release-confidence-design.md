# Release-Confidence Recovery — Design

## Scope

This milestone restores trustworthy release signals without changing product
features. It covers documentation truth, the supported Node runtime, Playwright
E2E, release-matrix evidence, and connector-policy coverage. It intentionally
does not include the AppShell/ConnectorSetupPanel refactors, persistence
migrations, OS-keychain migration, physical-device testing, or production
observability; those are separate, higher-risk milestones.

## Goals

1. Make current runtime, version, and language-migration facts derive from the
   repository rather than stale prose.
2. Standardize on Node 22 LTS for local and CI JavaScript verification.
3. Repair all E2E failures, remove the advisory CI setting only when the suite
   is green, and keep the suite blocking thereafter.
4. Provide one repeatable release-matrix command and a dated evidence record.
5. Prove every implemented outbound connector dispatch is policy-gated, and
   document the distinction between the primary gate and the additional DSL.

## Architecture and data flow

### Runtime contract

`package.json` will declare Node 22 in `engines`; `.nvmrc` and every CI Node
setup step will use the same major version. Contributor documentation will name
Node 22 as the supported local runtime. This is a single contract, not a
best-effort recommendation.

### Documentation truth

The existing count-verification script will be extended only where counts can
be derived deterministically. Source-of-truth documents will state the actual
version and Vite generation, and will distinguish production `.jsx` remnants
from `.tsx` components. Historical migration claims will be marked historical,
not silently retained as current facts.

### E2E recovery

Each failing Playwright specification will be classified as one of:

- stale selector or workflow assertion: repair against the current UI;
- obsolete product behavior: remove the assertion and retain a current
  equivalent; or
- actual application defect: fix only when a minimal reproducible failure
  proves it.

The test harness (`tauri-mock`, dev-server boot, and `__PLAYWRIGHT__` behavior)
is repaired before individual specs. The CI job loses `continue-on-error` only
after all specs pass locally on Node 22 and in a CI run.

### Policy coverage

The primary `evaluatePolicyGate` remains the authoritative enforcement point.
`policyDslService` is a supplemental, default-deny rule layer currently used
by the connector-registry image dispatch path. A static/behavioral coverage
test will enumerate implemented outbound dispatch functions and prove their
policy-gate path. The coverage matrix will explicitly identify any dispatches
that use the primary gate directly versus both gates.

### Release matrix

`verify:release` will orchestrate frontend lint, typecheck, unit tests, build,
E2E, Rust test, and Clippy in a documented order. It must stop at the failed
command and preserve its output. The milestone record will include command,
runtime version, OS, result, date, and any external/hardware-only checks that
remain unverified; it will never claim a blocked local Rust dependency download
as a test failure.

## Error handling and safety

- No migration or credential data is touched in this milestone.
- E2E cleanup does not delete tests merely to make CI green; each removal needs
  a replacement assertion or a documented obsolete behavior.
- Policy coverage failures are fail-closed: an unclassified outbound dispatch
  fails the test.
- CI changes remain incremental: remove the advisory status in one focused
  change after verified green E2E results, rather than mixing it with unrelated
  workflow edits.

## Testing and acceptance criteria

1. `npm ci` under Node 22 succeeds and `npm run lint`, `npm run typecheck`,
   `npm test`, `npm run build`, and `npm run test:e2e` are green.
2. `cargo test` and `cargo clippy -- -D warnings` are executed and recorded
   where the Cargo registry is available; a network block is recorded exactly.
3. The E2E job is blocking and the successful CI run shows it green.
4. Coverage tests enumerate all implemented outbound connector sends and
   demonstrate policy traversal for each.
5. `npm run verify:docs` passes and the authoritative docs agree with actual
   package/runtime/file facts.
6. The release evidence document distinguishes verified desktop/CI results from
   deferred physical-device and cloud voice validation.

## Alternatives considered

1. **Make E2E required immediately.** Rejected: known red tests would block
   all work without improving confidence.
2. **Leave Node 20 because it is already in CI.** Rejected: the present
   dependency set runs Vite 8, and Node 22 gives a current LTS baseline while
   reducing the discrepancy with the local Node 25 warning.
3. **Require the DSL for every connector in this milestone.** Rejected: that is
   a behavior-changing policy redesign. This milestone first proves and
   documents coverage, then a later design can safely expand DSL enforcement.

## Deferred follow-on milestones

- AppShell and ConnectorSetupPanel decomposition with regression tests.
- Versioned persistence, migration, backup, and repair semantics.
- OS-keychain migration for credentials and licenses.
- Physical iPhone pairing and cloud voice acceptance testing.
- Structured sidecar health/error observability and alerting.
