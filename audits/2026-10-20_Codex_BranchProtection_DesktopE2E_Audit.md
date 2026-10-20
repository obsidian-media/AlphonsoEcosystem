# Desktop E2E Branch-Protection Audit

Date: 2026-10-20  
Branch: `agent/Codex-priority-hardening`  
Scope: current `main` required checks and desktop E2E recommendation

## Read-only evidence

GitHub's branch-protection API returned these required contexts:

- `Test & Build`
- `Rust Tests & Clippy`
- `Secrets Scan (TruffleHog)`
- `Doc Count Freshness`
- `gate (secret-scan, doc-freshness, build, test, deploy-dry)`
- `Playwright E2E Smoke Test`

`desktop-e2e` is not currently required. No protection setting was changed.

## Recommendation

Continue observing the pinned `windows-2022` desktop job. After five
successful runs, review startup stability, duration, and model-dependent skip
rates, then request owner approval to add the exact `desktop-e2e` job context to
required checks. Until then, making it required would turn an uncharacterized
platform gate into an avoidable merge blocker.
