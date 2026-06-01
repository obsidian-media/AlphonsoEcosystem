# ALPHONSO — Rust Performance & Quality Report
**Generated:** 2026-05-31  
**File scope:** `src-tauri/src/lib.rs` (~7,200 lines)

---

## 1. SQLite WAL Mode

**Where added:** `open_memory_db()` — the single centralized function called by all DB commands (`kv_set`, `kv_get`, `save_settings`, `load_settings`, `upsert_memory_records`, `list_memory_records`, `upsert_runtime_ledger_records`, `list_runtime_ledger_records`).

**Code added (lib.rs ~line 1003):**
```rust
conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;")
  .map_err(|error| format!("WAL pragma failed: {}", error))?;
```

**Why before `initialize_memory_schema`:** WAL is set immediately after connection open, before any DDL. This ensures WAL is active before any table creation or migration runs.

**Other DB open locations:** `Connection::open_in_memory()` is used only inside `#[cfg(test)]` — no WAL needed there (in-memory DBs ignore WAL and the pragma doesn't error).

**Expected effect:** Concurrent reads (e.g. `list_memory_records`) no longer block on writes (`upsert_memory_records`), eliminating UI freeze during agent memory flushes.

---

## 2. Shared reqwest::Client in Tauri State

**Where registered:** `run()` function, before `tauri::Builder::default()`.

```rust
let http_client = reqwest::Client::builder()
    .timeout(std::time::Duration::from_secs(30))
    .build()
    .expect("Failed to build shared HTTP client");
tauri::Builder::default()
    .manage(http_client)
    ...
```

**Commands updated to use shared client (4 total):**

| Command | Previous | After |
|---|---|---|
| `connector_poll_telegram` | `reqwest::Client::builder()...build()` per call | `http_client: tauri::State<'_, reqwest::Client>` |
| `connector_send_telegram` | `reqwest::Client::builder()...build()` per call | `http_client: tauri::State<'_, reqwest::Client>` |
| `connector_send_chatgpt` | `reqwest::Client::builder()...build()` per call | `http_client: tauri::State<'_, reqwest::Client>` |
| `connector_send_claude` | `reqwest::Client::builder()...build()` per call | `http_client: tauri::State<'_, reqwest::Client>` |

All four commands now call `http_client.inner()` to borrow the shared client.

**Remaining per-call clients (not updated):** ~16 other commands still build their own clients (YouTube upload, WhatsApp, Notion, ClickUp, webhook, Meta publish, SDWebUI, ComfyUI, Ollama, Brave search, research fetcher, etc.). These have specialized timeouts (15s–300s) or user-agent strings that differ meaningfully and were not changed in this pass. The shared client has a 30s default timeout which suits the high-frequency AI connector paths.

---

## 3. Rust Unit Tests Added

Tests were added to the existing `#[cfg(test)] mod tests` block (previously 1 test, now 14 tests across 6 function groups).

**Functions tested and what each group covers:**

### `allowed_program(program: &str) -> bool`
- `allowed_program_accepts_known_safe_programs` — verifies ollama, git, node, npm, npm.cmd, tasklist all return `true`
- `allowed_program_rejects_dangerous_programs` — verifies cmd, cmd.exe, powershell, bash, sh, rm return `false`
- `allowed_program_is_case_insensitive` — verifies uppercase OLLAMA/Git pass, uppercase CMD fails

### `plugin_blocked_token_present(value: &str) -> Option<&'static str>`
- `plugin_blocked_token_detects_shell_injection_tokens` — all 8 blocked tokens: `&&`, `||`, `;`, `|`, `>`, `<`, `$(`, backtick
- `plugin_blocked_token_allows_clean_args` — clean flag, path, plain string, and empty string all return `None`

### `validate_plugin_extra_args(extra_args: &[String]) -> Result<(), String>`
- `validate_plugin_extra_args_rejects_too_many_args` — 9 args exceeds limit of 8
- `validate_plugin_extra_args_rejects_oversized_arg` — 121-char arg exceeds 120-char limit
- `validate_plugin_extra_args_rejects_injection_token` — arg containing `&&` is rejected
- `validate_plugin_extra_args_accepts_clean_args` — 3 well-formed args pass

### `trim_trailing_slashes(raw: &str) -> String`
- `trim_trailing_slashes_removes_trailing_slashes` — single slash, triple slash, trailing whitespace
- `trim_trailing_slashes_leaves_clean_urls_unchanged` — already-clean URL and empty string

### WAL pragma SQL validity
- `wal_pragma_applies_on_in_memory_db` — confirms the SQL is valid by running it on an in-memory DB (WAL is a no-op there but must not error)

### `to_hex(bytes: &[u8]) -> String`
- `to_hex_produces_correct_lowercase_hex` — known byte sequences, empty slice, single byte

---

## 4. Unwrap Audit

**Total `.unwrap()` calls in non-test runtime code: 1**

The codebase uses `.unwrap_or_default()`, `.unwrap_or_else()`, `map_err(|e| ...)`, and `?` propagation almost everywhere. The one raw `.unwrap()` in runtime code was at approximately line 5859 inside `fetch_research_sources`.

**Fix applied:**
```rust
// Before:
let url = parsed.unwrap();

// After:
let url = match parsed {
    Ok(u) => u,
    Err(_) => continue, // defensive fallback; guard above already handles all Err cases
};
```

The guard before this line (`if parsed.as_ref().map(|url| url.scheme() != "http" ...).unwrap_or(true)`) already `continue`s on all parse errors, so the original `.unwrap()` was logically safe but stylistically wrong and would panic if ever the guard logic changed. The `match` is now correctly explicit.

**`.expect()` calls in runtime code (not changed):**

| Location | Text | Risk Assessment |
|---|---|---|
| `run()` line ~7060 | `"CommandOrControl+Shift+Space".parse().expect("fallback hotkey parse")` | Startup only — if both parses fail (impossible for a hardcoded string), crash is appropriate |
| `run()` end | `.expect("error while running tauri application")` | Tauri builder panic on startup — standard pattern, intentional |
| `run()` | `reqwest::Client::builder()...expect("Failed to build shared HTTP client")` | Added by this work — startup only, safe |

These were not changed because panicking at startup on configuration errors is the correct Tauri pattern.

---

## 5. cargo check Result

**Status: NOT RUN**

Shell tool access (`PowerShell` and `Bash`) was denied during this session. The user must run:

```powershell
cd "C:\Users\Shaya\OneDrive\Desktop\ALPHONSO\FILES\local-agent-ui-v2\src-tauri"
cargo check
```

**Expected result: PASS.** Reasoning:
- All four updated commands follow the exact same Tauri state injection pattern already used throughout the codebase
- `tauri::State<'_, reqwest::Client>` is a standard Tauri v2 pattern; `reqwest::Client` is `Clone + Send + Sync`
- The WAL pragma change uses `execute_batch` which is already used in 3+ places in the file with `map_err`
- The `.unwrap()` fix uses a `match` — no type changes
- All test functions call only pure functions with no external state

---

## 6. cargo test Result

**Status: NOT RUN** (same reason as above).

```powershell
cd "C:\Users\Shaya\OneDrive\Desktop\ALPHONSO\FILES\local-agent-ui-v2\src-tauri"
cargo test
```

**Expected result: PASS.** The pre-existing test (`initializes_memory_schema_with_migration_registry`) already passed before this work. The 13 new tests all call pure functions (`allowed_program`, `plugin_blocked_token_present`, `validate_plugin_extra_args`, `trim_trailing_slashes`, `to_hex`) or use an in-memory SQLite connection with no filesystem/network access.

---

## 7. What Was Not Done and Why

| Item | Reason deferred |
|---|---|
| Update remaining ~16 per-call `reqwest::Client::builder()` instances | Each has a distinct timeout (15s–300s) and user-agent tuned for its service. The shared 30s client is appropriate for AI connectors but not for 300s video upload or 10s health check paths. A `ClientPool` abstraction with named clients would be the right approach but is out of scope for this session. |
| Full module split (extract connectors, memory, plugins into separate `.rs` files) | The 7,200-line monolith is a separate refactor that requires updating `mod` declarations in `lib.rs` and coordinating with the frontend IPC surface. Not safe to do in one session. |
| WAL for a hypothetical second DB file | Only one DB file exists: `alphonso_memory.sqlite3`. All KV, settings, memory records, and ledger records share it through `open_memory_db`. No second DB path found. |
| Updating `connector_send_whatsapp`, `connector_send_notion`, `connector_send_clickup` | These have service-specific timeout requirements and were lower priority than the AI connector hot paths. |

---

## 8. Recommended Next Steps

1. **Grant shell tool access and run `cargo check` + `cargo test`** — verify everything compiles and all 14 tests pass before the next change.

2. **Extract connectors module** — move all `connector_*` functions (lines ~1300–3000) to `src-tauri/src/connectors.rs`. This is the highest-value module split given the size of that block.

3. **Named HTTP clients for long-running operations** — the video upload (`connector_upload_youtube`, 300s timeout) and image gen (`connector_generate_sdwebui_image`, 180s) should use a separate client. Consider:
   ```rust
   struct HttpClients {
       standard: reqwest::Client,   // 30s — AI connectors, messaging
       long_running: reqwest::Client, // 300s — uploads, image gen
   }
   ```

4. **WAL checkpoint tuning** — if the app runs for hours, add `PRAGMA wal_autocheckpoint=1000;` to `open_memory_db` to prevent the WAL from growing unbounded.

5. **Add integration test for `open_memory_db`** — add a test that opens a real temp-file DB and verifies `PRAGMA journal_mode` returns `wal`. This validates the WAL migration works on disk (not just in-memory).
