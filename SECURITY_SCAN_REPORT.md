# AlphonsoEcosystem Security Scan Report

**Repository:** `D:\AgentDevWork\repos\AlphonsoEcosystem`  
**Scope:** Source code only (excludes docs, `.md`, READMEs, test files, `.json`)  
**Files Scanned:** ~544 source files across `src/`, `src-tauri/src/`, `gateway/`, `bridge/`, `mcp-server/`

---

## 1. Hardcoded Secrets
**Finding: No real issues found in non-test source code.**

- All hardcoded `apiKey`, `password`, `secret`, `token`, and `Bearer` patterns were found **exclusively in `.test.js` files** (mock/test data).
- No actual hardcoded secrets exist in production source code.
- The `.env.example` file contains only placeholder values (e.g., `YOUR_TELEGRAM_BOT_TOKEN_HERE`), which is safe.
- The `.env` file at the root is present but was blocked by the scanner as a sensitive file (expected behavior).

---

## 2. SQL Injection
**Finding: No real issues found.**

- All SQL queries in Rust (`src-tauri/src/`) use **parameterized queries** with `?1` placeholders or `params![]` macros.
- No dynamic SQL string concatenation or interpolation was found in JS/TS/Rust source.
- Verified files: `kv_store.rs`, `memory_store.rs`, `connector_commands.rs`.

---

## 3. Command Injection
**Finding: 2 real issues, 1 CRITICAL and 1 MEDIUM.**

### CRITICAL — Shell Command Injection in `save_image_to_folder` (Linux/macOS)
- **File:** `src-tauri/src/lib.rs`
- **Lines:** 1537–1540
- **Snippet:**
  ```rust
  let script = format!("printf '%s' '{}' | base64 -d > '{}'", raw, path_str);
  Command::new("sh")
    .args(["-c", &script])
    .output()
  ```
- **Analysis:** `path_str` is derived from user-controlled `folder` and `filename` parameters. Neither is sanitized for shell metacharacters. A single quote (`'`) in the filename breaks out of the shell-quoted string, allowing arbitrary command execution.
- **Example payload:** `filename = "test'; rm -rf /; '.png"` would execute `rm -rf /` after the base64 decode.
- **Note:** The Windows PowerShell path (lines 1518–1527) is safe because it uses a .NET method call with proper single-quote escaping, and `raw` is base64-only characters. The Linux/macOS path is vulnerable.
- **Status:** Real vulnerability.

### MEDIUM — Arbitrary Executable Execution in `launch_comfyui`
- **File:** `src-tauri/src/lib.rs`
- **Lines:** 1478–1481
- **Snippet:**
  ```rust
  Command::new(&py)
    .arg("main.py")
    .current_dir(&dir)
    .spawn()
  ```
- **Analysis:** `py` is derived from user-controlled `python_exe` parameter. Unlike `execute_command_verified` (line 443), this function does **not** call `allowed_program()` to validate the executable. An attacker who can influence the frontend (e.g., via XSS, compromised settings, or malicious plugin) can set `python_exe` to any executable (e.g., `/bin/sh`, `cmd.exe`, or a malicious binary) and have it spawned with `main.py` as the first argument.
- **Status:** Real vulnerability (missing policy gate).

### SAFE Patterns (documented for completeness)
- `execute_command_verified` (lib.rs:436) — validates `program` via `allowed_program()` before execution.
- `plugin_runtime.rs` (line 464) — validates `tool.program` via `allowed_program()`.
- `runtime_manager.rs` — uses `resolve_exe()` which returns known paths from a whitelist, or hardcoded system commands (`tasklist`, `kill`, `python`).
- `open_url` (lib.rs:1190) — validates URL starts with `http://` or `https://` before passing to `cmd`/`open`/`xdg-open`. Arguments are passed via `args()` array, not shell string.

---

## 4. XSS (Cross-Site Scripting)
**Finding: No real issues found.**

- No `innerHTML =`, `document.write(`, or `dangerouslySetInnerHTML` patterns were found in non-test source code.
- All `JSON.parse` calls in the frontend operate on data from localStorage, SQLite, or trusted websocket messages (not untrusted external HTML).

---

## 5. Insecure Deserialization
**Finding: No real issues found.**

- No `pickle.`, `yaml.load(`, or `eval()` found in production source.
- `JSON.parse` is used extensively but only on trusted or size-limited inputs:
  - localStorage data (same-origin)
  - Verified WhatsApp webhook body (after HMAC signature verification)
  - Ollama streaming response lines
- No `eval()` found in JS/TS source.

---

## 6. CORS Wildcard
**Finding: No real issues found.**

- No `origin: "*"` or `Access-Control-Allow-Origin: *` patterns found in `bridge/`, `mcp-server/`, or `gateway/whatsapp-cloud/`.
- `bridge/server.js` binds to `127.0.0.1` with no CORS middleware.
- `mcp-server/server.js` binds to `127.0.0.1` with auth middleware.
- `gateway/whatsapp-cloud/src/server.js` uses raw `node:http` without CORS headers.

---

## 7. Debug Mode Enabled
**Finding: No real issues found.**

- No `debug: true` or `DEBUG = true` patterns found in production source code.

---

## 8. Unsafe Rust (`unsafe`, `unwrap()`, `expect()`)
**Finding: No real issues found.**

- **No `unsafe` blocks** found in `src-tauri/src/`.
- `unwrap()` and `expect()` are present but are overwhelmingly in **test modules** (`#[cfg(test)]`).
- Production `expect()` calls are limited to **startup initialization** where failure is unrecoverable (e.g., building the HTTP client at lib.rs:1593, parsing a hotkey at lib.rs:1933, running the Tauri app at lib.rs:2109). These are standard practice and not exploitable.
- Runtime data paths use `map_err()` and proper `Result` handling.

---

## 9. LocalStorage for Credentials
**Finding: 2 MEDIUM issues.**

### MEDIUM — Connector Credentials Fallback to localStorage
- **File:** `src/services/connectors/connectorAuth.js`
- **Lines:** 25, 40, 84
- **Key:** `alphonso_connector_credentials_v1`
- **Snippet:**
  ```javascript
  const raw = localStorage.getItem(CREDS_KEY);  // line 25
  try { localStorage.setItem(CREDS_KEY, JSON.stringify(creds)); } catch { }  // line 40
  ```
- **Analysis:** The design intent is to use Tauri KV (SQLite) as the primary credential store. However, `writeAllCredentials` falls back to `localStorage.setItem` if `invoke('kv_set')` throws synchronously (e.g., in a browser). While `localStorage.removeItem` is called immediately after, this creates a race condition where credentials may persist in localStorage. Additionally, `readAllCredentials` reads from localStorage on every cold start. In a browser context or if Tauri KV is unavailable, connector credentials (API keys, tokens, secrets) are stored in localStorage, which is accessible to any XSS payload or same-origin JavaScript.
- **Status:** Real vulnerability (defense-in-depth failure).

### MEDIUM — Telegram Bot Token Stored in localStorage
- **File:** `src/components/OnboardingWizard.tsx`
- **Line:** 508
- **Snippet:**
  ```javascript
  localStorage.setItem('alphonso_telegram_bot_token_v1', token.trim());
  ```
- **Analysis:** The Telegram bot token is stored directly in localStorage without encryption or migration to the KV store. This makes it accessible to any XSS payload in the webview.
- **Status:** Real vulnerability.

---

## 10. WhatsApp Gateway — Webhook Signature Verification
**Finding: No real issues found.**

- **File:** `gateway/whatsapp-cloud/src/verify.js` and `gateway/whatsapp-cloud/src/server.js`
- **Verification:**
  - `verifyChallenge` (verify.js:3) — strict equality check against `WHATSAPP_VERIFY_TOKEN` env var.
  - `verifySignature` (verify.js:7) — computes HMAC-SHA256 and uses `crypto.timingSafeEqual()` for constant-time comparison.
  - Body size is limited (`MAX_WEBHOOK_BODY_BYTES = 1MB` by default).
  - Rate limiting is applied to webhook POSTs.
  - Sender number allowlist is enforced.
  - Secrets are redacted from logs via `redactGatewayDetails()`.
- **Status:** Properly implemented. No vulnerabilities.

---

## Summary Table

| Category | Severity | Count | Status |
|----------|----------|-------|--------|
| Hardcoded Secrets | — | 0 | No issues |
| SQL Injection | — | 0 | No issues |
| Command Injection | **Critical** | 1 | `save_image_to_folder` (sh path) |
| Command Injection | **Medium** | 1 | `launch_comfyui` missing policy gate |
| XSS | — | 0 | No issues |
| Insecure Deserialization | — | 0 | No issues |
| CORS Wildcard | — | 0 | No issues |
| Debug Mode | — | 0 | No issues |
| Unsafe Rust | — | 0 | No issues (no `unsafe` blocks) |
| LocalStorage Credentials | **Medium** | 2 | `connectorAuth.js`, `OnboardingWizard.tsx` |
| WhatsApp Gateway | — | 0 | Properly secured |

---

## Recommendations (in order of priority)

1. **CRITICAL:** Fix `save_image_to_folder` in `src-tauri/src/lib.rs` (non-Windows path). Use a pure Rust base64 decoder (e.g., `base64` crate) and `std::fs::write()` instead of shelling out to `sh -c`. Do not construct shell commands with user-controlled paths.
2. **MEDIUM:** Add `allowed_program(&py)` validation in `launch_comfyui` before spawning the process, consistent with `execute_command_verified`.
3. **MEDIUM:** Remove `localStorage` fallback for credentials. Ensure `connectorAuth.js` strictly uses the Tauri KV store and never writes connector credentials to `localStorage`. Migrate `OnboardingWizard.tsx` to use the KV store via `invoke('kv_set')` instead of `localStorage.setItem` for the Telegram bot token.
4. **LOW:** Add input validation/sanitization for `folder` and `filename` in `save_image_to_folder` to prevent path traversal (e.g., reject `../` sequences).
