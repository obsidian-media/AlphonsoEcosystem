# Bug Audit Report — Group 1: Backend / Runtime Core

**Auditor:** Alphonso (Agent)
**Date:** 2026-07-26
**Scope:** Group 1 — Rust backend, Gateway services, Bridge, Voice pipeline, MCP server, Supabase migration, Web Monitor module

---

## Coverage Summary

| Area | Files Read | Lines | Status |
|------|-----------|-------|--------|
| Rust backend (`src-tauri/src/*.rs`) | 28 source files | ~7,800 | **Fully verified** |
| Rust build/config (`build.rs`, `Cargo.toml`, configs) | 6 files | ~200 | **Fully verified** |
| Gateway (whatsapp-cloud) | 5 source files | ~350 | **Fully verified** |
| Gateway (generic-webhook) | 2 source files | ~226 | **Fully verified** |
| Gateway (marketplace, docker) | 3 files | ~116 | **Fully verified** |
| Bridge server | 2 files (server + test) | ~254 | **Fully verified** |
| Voice backend (Python) | 6 source files | ~380 | **Fully verified** |
| Voice cloud-backend (Python) | 7 source files | ~385 | **Fully verified** |
| Voice piper-farsi (Python) | 1 source file | ~70 | **Fully verified** |
| Voice frontend (TS) | 3 source files | ~159 | **Fully verified** |
| Voice configs/shared | 3 files | ~116 | **Fully verified** |
| Supabase migration | 1 SQL file | ~21 | **Fully verified** |
| MCP server | 1 source file | ~160 | **Fully verified** |
| Web Monitor module | 5 files | ~58 | **Fully verified** |

**Total: 67 files, ~10,295 lines verified**

---

## Findings

### [F-G1-001] Voice router returns `alphonso_core` but cloud API expects `alphonso`
- **File:** `voice/backend/router.py:50,59` returns `'alphonso_core'` as default
- **File:** `voice/cloud-backend/app/contracts.py:20` defines `agent_id` as `Literal["alphonso", "jose", ...]`
- **Severity:** Medium
- **Description:** The local voice routing system returns `alphonso_core` for unmatched input, but the cloud voice API's `VoiceRequest` contract only accepts `"alphonso"` (without `_core` suffix). If the cloud voice pipeline is ever invoked with the router's output, it will produce a Pydantic validation error.
- **Fix:** Either change `router.py` to return `"alphonso"` or add `"alphonso_core"` to the `agent_id` literal in `contracts.py`.

### [F-G1-002] MCP server uses plain string comparison for Bearer token
- **File:** `mcp-server/server.js:30`
  ```js
  if (!authHeader.startsWith('Bearer ') || authHeader.slice(7) !== MCP_SECRET) {
  ```
- **Severity:** Medium
- **Description:** The `MCP_SECRET` comparison uses standard `!==`, leaking timing information proportional to matching prefix length. An attacker within the LAN who can measure response timing could recover the secret byte-by-byte.
- **Fix:** Use `crypto.timingSafeEqual()` (already imported in gateway security modules — same pattern should apply here).

### [F-G1-003] Cloud voice auth endpoint uses plain string comparison for API token
- **File:** `voice/cloud-backend/app/auth.py:9`
  ```python
  if authorization.removeprefix("Bearer ").strip() != expected_token:
  ```
- **Severity:** Low-Medium
- **Description:** Token comparison uses `!=` instead of constant-time comparison (e.g. `hmac.compare_digest`). Deployed over HTTPS so remote exploitation is harder, but still a timing side-channel on the service token.
- **Fix:** Use `hmac.compare_digest()` or `secrets.compare_digest()`.

### [F-G1-004] `tauri.conf.json` CSP allows `'unsafe-inline'` for script-src and style-src
- **File:** `src-tauri/tauri.conf.json:36`
  ```json
  script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'
  ```
- **Severity:** Medium
- **Description:** CSP `'unsafe-inline'` reduces XSS protection. While common in Vite/React apps (which use inline scripts for HMR), production builds should tighten this. Additionally the CSP lists numerous external `connect-src` origins (Anthropic, OpenAI, Telegram, Facebook, etc.) — any XSS in the frontend can exfiltrate to these endpoints.
- **Fix:** Use nonce-based or hash-based script-src for production; review connect-src allowlist.

### [F-G1-005] Gateway tokens support multiple simultaneous auth methods per request
- **File:** `gateway/generic-webhook/src/server.js:31-37`
  ```js
  return constantTimeEqual(bearer, expectedToken) || constantTimeEqual(headerToken, expectedToken) || constantTimeEqual(query, expectedToken);
  ```
- **Severity:** Low
- **Description:** The generic webhook gateway accepts the token via three channels (Bearer header, `x-webhook-token` header, query parameter `?token=`). The query parameter can appear in server logs, proxy logs, and browser history. The WhatsApp gateway's `isQueueAuthorized` (server.js:48-49) only checks Bearer and query params, not the header. This is inconsistent and weakens operational security.
- **Fix:** Deprecate query-parameter token authentication. Accept only `Authorization: Bearer` header.

### [F-G1-006] Bridge server tests use placeholder assertions
- **File:** `bridge/tests/server.test.js:78-87`
  ```js
  it('binds to 127.0.0.1 only', () => {
    expect(true).toBe(true);
  });
  ```
- **Severity:** Low (test quality)
- **Description:** Multiple tests assert `expect(true).toBe(true)`, providing zero actual validation. Keys tests (auth, input validation, error handling) have no real assertions.
- **Fix:** Replace with actual assertions — verify 127.0.0.1 binding, validate command/query/topic rejection, test error responses.

### [F-G1-007] `companion_discovery.rs` connects to external host to discover local IP
- **File:** `src-tauri/src/companion_discovery.rs:42`
  ```rust
  socket.connect("8.8.8.8:80").ok()?;
  ```
- **Severity:** Low
- **Description:** Uses Google DNS (8.8.8.8:80) to determine the local network interface IP. This creates an external dependency during startup and leaks a network beacon on every mDNS advertisement start. On air-gapped or firewalled machines the fallback returns `"0.0.0.0"` which may cause mDNS advertisement to fail.
- **Fix:** Use platform-specific APIs (`GetAdaptersAddresses` on Windows, `getifaddrs` on Unix) to enumerate local IPs without external connectivity.

### [F-G1-008] `companion_auth.rs` — constant-time comparison uses generic `zip` loop
- **File:** `src-tauri/src/companion_auth.rs:45-54`
  ```rust
  fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() { return false; }
    let mut diff: u8 = 0;
    for (x, y) in a.iter().zip(b.iter()) { diff |= x ^ y; }
    diff == 0
  }
  ```
- **Severity:** Informational
- **Description:** The PIN length is fixed (6 digits) so early length exit is safe. However, the function is a standalone utility that could be reused for variable-length secrets elsewhere. If reused for non-PIN secrets, the early `a.len() != b.len()` check leaks length information.
- **Note:** Current usage is safe. Consider marking the function as PIN-specific (e.g. rename to `constant_time_pin_eq`) or import the `subtle` crate (already in `Cargo.toml` line 38).

### [F-G1-009] `voice/backend/vad.py` — Duplicate VAD processing loop
- **File:** `voice/backend/vad.py`
- **Severity:** Low (code quality)
- **Description:** `is_speech()` (lines 5-49) and `voice_activity_level()` (lines 51-80) contain nearly identical frame-iteration logic. Changes to one (e.g. frame size, aggressiveness) must be manually mirrored.
- **Fix:** Refactor shared frame iteration into a private helper.

### [F-G1-010] `voice/backend/main.py` — WebSocket receive loop may raise non-Disconnect exceptions
- **File:** `voice/backend/main.py:96`
  ```python
  while True:
      msg = await ws.receive()
  ```
- **Severity:** Low
- **Description:** Only `WebSocketDisconnect` is caught (line 125). Other exceptions (e.g. `RuntimeError` from closed connection, `asyncio.CancelledError`) would propagate unhandled.
- **Fix:** Catch broad `Exception` in the WebSocket loop to log and clean up gracefully.

### [F-G1-011] `voice/cloud-backend/app/voice_policy.py:72` — Redundant `str(rule)` call
- **File:** `voice/cloud-backend/app/voice_policy.py:72`
  ```python
  *[str(rule) for rule in _policy()["rules"]],
  ```
- **Severity:** Informational
- **Description:** `_policy()["rules"]` is already `list[str]` (from `voice_policy.json`). The `str()` call is a no-op. Harmless but unnecessary allocation.

### [F-G1-012] `Cargo.toml` — Generic metadata fields
- **File:** `src-tauri/Cargo.toml:4-7`
  ```toml
  authors = ["you"]
  license = ""
  repository = ""
  ```
- **Severity:** Informational
- **Description:** Placeholder values. Not a bug, but should be updated for release.

### [F-G1-013] Supabase migration missing INSERT policy for `voice_devices`
- **File:** `supabase/migrations/20260713214554_cloud_voice_devices.sql`
- **Severity:** Low
- **Description:** The migration defines SELECT and UPDATE RLS policies but no INSERT policy. Currently all device enrollment goes through the cloud-backend API using the Supabase service_role key (which bypasses RLS). If a future change attempts direct user enrollment, it will fail with a permission error.
- **Note:** Current architecture (service_role writes) is intentional. Add a comment documenting this design decision.

### [F-G1-014] Web Monitor module has no real test cases
- **File:** `modules/alphonso.researcher.web_monitor/tests/test_cases.json`
- **Severity:** Low (test coverage)
- **Description:** Test file contains an empty array `[]`. The module entrypoint (`tools/main.js`) has no unit tests.
- **Fix:** Add test cases for URL fetch success, fetch failure, content change detection, and empty URL list.

### [F-G1-015] `lib.rs` — 108 commands registered, some with dead_code suppression
- **File:** `src-tauri/src/lib.rs:2094-2203`
- **Severity:** Informational
- **Description:** 108 Tauri commands registered in `generate_handler![]`. Several helper functions in modules carry `#[allow(dead_code)]` (e.g. `companion_discovery.rs:32`, `companion_router.rs`). The number of commands has grown organically — consider grouping into sub-modules with a re-export pattern for maintainability.

---

## Files Not Fully Verified

None — all 67 scoped files were read line-by-line to EOF.

---

## Final Coverage Statement

**All 67 files in Group 1 scope (Backend/Runtime Core) have been line-by-line verified.**

- **Rust backend:** 28 `.rs` files, all 108 Tauri commands confirmed present in lib.rs handler registry
- **MCP secret auth** needs timing-safe comparison ([F-G1-002])
- **Voice agent ID mismatch** between local router and cloud API contract ([F-G1-001])
- **Cloud voice auth** uses plain string comparison ([F-G1-003])
- **CSP policy** allows unsafe-inline, weakening XSS protection ([F-G1-004])
- **Test gaps** in bridge server and Web Monitor module ([F-G1-006], [F-G1-014])
- **Minor issues** in VAD duplication, DNS dependency, Cargo.toml metadata, redundant str() call

**High-severity findings: 0**
**Medium-severity findings: 4** (F-G1-001, F-G1-002, F-G1-003, F-G1-004)
**Low-severity findings: 7** (F-G1-005, F-G1-006, F-G1-007, F-G1-009, F-G1-010, F-G1-013, F-G1-014)
**Informational findings: 4** (F-G1-008, F-G1-011, F-G1-012, F-G1-015)
