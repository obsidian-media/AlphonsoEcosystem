# Release Verification Evidence — 2026-07-22

**Commit verified:** `431a2e0`  
**Overall status:** PARTIAL — application verification passes on the supported
Windows target; Rust dependency audit remains a release blocker.

## Verified checks

| Check | Result | Evidence |
|---|---|---|
| Node dependency audit | PASS | Fresh-worktree `npm ci` completed with 0 vulnerabilities. |
| Frontend lint | PASS | `npm run lint` passed. |
| Full Vitest suite | PASS | Fresh worktree, 249 files / 3,516 tests, 303.28s. |
| Web build | PASS | `npm run build` passed. |
| Documentation verifier | PASS | `npm run verify:docs` passed. |
| Windows Rust compile | PASS | `cargo check --target x86_64-pc-windows-msvc` passed. |
| Windows Rust tests | PASS | `cargo test --target x86_64-pc-windows-msvc`: 108 passed, 0 failed. |
| Windows Rust Clippy | PASS | `cargo clippy --target x86_64-pc-windows-msvc -- -D warnings` passed. |
| Playwright E2E | PASS | 26 tests / 7 specs passed in 17.4s with retries disabled. |

## Release blockers

| Check | Result | Required resolution |
|---|---|---|
| `cargo audit --deny warnings` | FAIL — 17 denied warnings | Resolve through upstream-compatible Tauri/Wry dependency updates or approve narrowly scoped, time-bounded platform exceptions after security review. Do not suppress globally. |

The denied Rust findings include the Linux GTK3/WebKit dependency chain and
`glib` 0.18.5 unsoundness (`RUSTSEC-2024-0429`), plus unmaintained transitive
packages. The Windows target does not include this GTK/WebKit graph, but the
repository retains it in `Cargo.lock`; it must remain tracked until a reviewed
cross-platform disposition is made.

## Environment note

The fresh verification used Node 25.9.0 because that was the available local
runtime. The repository declares Node 22.x; `npm ci` emitted an engine warning.
Repeat this baseline under Node 22 before cutting a public release.
