# Memory Graph Phase 4 Local Acceptance Audit

> **Status (2026-10-25):** a dated record, kept as written. Today: 2.10.0 on `main` (not tagged; latest release 2.9.0), 9 agents, 33 connectors, 285 services, 546 test files / 6,777 tests, 189 Tauri commands, 50 Rust modules; current facts are in `docs/ALPHONSO_GROUND_TRUTH.md`.

Date: 2026-10-20  
Branch: `agent/Codex-priority-hardening`  
Scope: Phase 4 governance pruning and migration behavior

## Command and result

Command:

```text
cargo test memory_graph --lib
```

Result: finished in 16m37s; **43 passed, 0 failed, 0 ignored** (156 tests
filtered out).

## Covered behavior

The passing filtered tests cover the Phase 4 pruning rules, old-schema
migration, the 50% deletion safety guard, dry-run non-deletion, idempotent
second runs, orphan handling, inferred-edge `last_seen_at` refresh, and
cycle-safe graph traversal.

## Remaining acceptance gap

This is local Rust acceptance only. A real Preview against a populated desktop
database and the corresponding UI interaction remain unverified. The focused
frontend tests could not run on this host because the incomplete Node 25
installation is missing `@vitest/utils/dist/constants.js`.
