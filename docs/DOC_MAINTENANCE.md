# Doc Maintenance Policy

## Purpose

Prevent doc rot — stale counts in AGENTS.md, CLAUDE.md, README.md, ARCHITECTURE.md, and other docs erode trust and mislead new contributors.

## The Rule

**Every PR that changes file counts (new/removed services, tests, components, Rust modules) MUST update the corresponding claims in the same PR.** No separate "doc update" PRs.

## CI Enforcement

```yaml
npm run verify:docs   # Part of CI: doc-freshness job
```

This script (`scripts/verify-doc-counts.mjs`):
- Computes actual repo counts (services, tests, components, lib.rs lines, etc.)
- Matches them against numeric claims in AGENTS.md, README.md, ARCHITECTURE.md
- Exits 1 on any mismatch — fails CI

If CI fails, run locally, fix the stale lines, and re-push.

## How to Verify Locally

```bash
npm run verify:docs
```

If it reports stale counts, update the identified lines and re-run until clean.

## Auto-Generated Artifacts

```bash
npm run export:ground-truth   # Generates ALPHONSO_GROUND_TRUTH.generated.md + snapshot.json
npm run export:ground-truth -- --fail-on-drift  # Same, but exits 1 on drift (for CI)
```

These are informational / machine-readable. The hand-edited source of truth is `docs/ALPHONSO_GROUND_TRUTH.md`.

## Shared Counting Logic

Both `verify-doc-counts.mjs` and `export-ground-truth.mjs` use the same counting module:
`scripts/shared/counters.mjs`

If you add new file categories to count, update `getAllCounts()` in `counters.mjs`, then update the claims array in `verify-doc-counts.mjs` and any doc files that mention the new count.

## What We Track

| Category | Source |
|---|---|
| Services (src/services) | Count of `.js`, `.jsx`, `.ts`, `.tsx` files |
| Test files (src/test) | Count of `.js`, `.jsx`, `.ts` files |
| Components (src/components) | Count of `.jsx`, `.tsx` files |
| lib.rs lines | Non-empty lines in `src-tauri/src/lib.rs` |
| Tauri commands | Count of `#[tauri::command]` across all `.rs` files |
| Rust source files | Count of `.rs` files in `src-tauri/src/` |
| Rust unit tests | Count of `#[test]` across all `.rs` files |
