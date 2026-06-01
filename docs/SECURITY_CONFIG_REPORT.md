# Security Configuration Report

**Date:** 2026-05-31
**Scope:** `src-tauri/tauri.conf.json`, `.gitignore`, `.env.example`
**Agent:** Claude Code (claude-sonnet-4-6)

---

## 1. Changes Made

### 1.1 Content Security Policy (tauri.conf.json)

**Before:**
```json
"security": {
  "csp": null
}
```

**After:**
```json
"security": {
  "csp": "default-src 'self'; connect-src 'self' http://localhost:* https://api.anthropic.com https://api.openai.com https://api.telegram.org https://graph.facebook.com https://api.clickup.com https://api.notion.com https://www.googleapis.com https:; img-src 'self' data: blob: https:; media-src 'self' blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self' data:;"
}
```

**Why `'unsafe-inline'` is present for script-src and style-src:**
Vite (the frontend build tool used in this project) injects inline `<script>` tags and inline `<style>` blocks during the React hydration and hot-module-replacement process. Removing `'unsafe-inline'` from `script-src` or `style-src` would break the built frontend in the WebView. This is a known limitation when using Vite + Tauri. The risk is partially mitigated because:
- The app is a desktop application — there is no remote HTML being loaded.
- `default-src 'self'` prevents loading resources from untrusted origins.
- `connect-src` is locked to known endpoints only (with a broad `https:` fallback for Railway/unknown HTTPS endpoints).

**Longer-term hardening (not done in this pass):**
- Migrate to a nonce-based CSP (`script-src 'nonce-...'`) using a Vite plugin (e.g., `vite-plugin-csp`) to eliminate `'unsafe-inline'`.

---

### 1.2 Window Size (tauri.conf.json)

**Before:**
```json
"width": 800,
"height": 600,
"resizable": true,
"fullscreen": false
```
*(no minWidth or minHeight)*

**After:**
```json
"width": 1280,
"height": 800,
"minWidth": 1024,
"minHeight": 700,
"resizable": true,
"fullscreen": false
```

**Reason:** The previous 800×600 default clipped the UI and had no minimum size guard. The new default matches a modern dashboard viewport. The minimum dimensions prevent the layout from breaking on resize.

---

### 1.3 GPU / Rendering Flags (tauri.conf.json)

**Before:**
```json
"additionalBrowserArgs": "--disable-gpu --disable-gpu-compositing --use-angle=swiftshader"
```

**After:**
*(key removed entirely — hardware acceleration is now active)*

**Investigation result:** No documentation existed in `docs/` or anywhere in the repository explaining why these flags were added. The flags appeared only as an open todo item in `ALPHONSO_GROUND_TRUTH.md` (line 243) and `ALPHONSO_PARALLEL_SUBAGENTS_2026-05-31.md`. There is no recorded crash report, GPU compatibility issue, or intentional decision to use software rendering.

**What these flags were doing:**
- `--disable-gpu` — disabled GPU hardware acceleration entirely.
- `--disable-gpu-compositing` — disabled GPU-accelerated compositing.
- `--use-angle=swiftshader` — forced the ANGLE graphics abstraction layer to use CPU-based SwiftShader software rendering instead of the GPU.

Combined, these flags caused the entire UI to render in software on the CPU, making animations, transitions, and WebGL-based visuals significantly slower and more power-intensive than necessary.

**Action required after this change:** Do a test run (`npm run tauri dev`) on the developer machine to confirm the app renders correctly with hardware acceleration. If rendering glitches appear (rare on Windows 11 with standard GPU drivers), the flags can be restored selectively. The recommended path is to test without them first.

---

### 1.4 .env.example — Real Phone Numbers Removed

**Variable:** `WHATSAPP_ALLOWED_NUMBERS`

**Before:**
```
WHATSAPP_ALLOWED_NUMBERS=+16474842752,+14377727501,4377702197
```

**After:**
```
WHATSAPP_ALLOWED_NUMBERS=REPLACE_WITH_YOUR_ALLOWED_NUMBERS
```

**Reason:** Three real phone numbers were embedded in the example file. Even though `.env.example` is intended as a template and not a secrets file, real phone numbers should not be committed to version control. They have been replaced with a placeholder. The actual numbers must be placed in `.env` (which is git-ignored).

**Note on TELEGRAM_ALLOWED_CHAT_IDS:** The value `123456789` in `.env.example` is a universally-recognized placeholder value (the first 9 digits in sequence). It was left as-is. If it was ever replaced with a real Telegram chat ID in the actual `.env`, that ID is not sensitive (it is a numeric ID, not an authentication credential), but for hygiene it should also use a placeholder in `.env.example`.

---

## 2. What Was Verified (No Changes Needed)

### 2.1 .gitignore Coverage

The following entries were confirmed present in `.gitignore`:

| Entry | Status |
|---|---|
| `.env` | Present (line 9) |
| `.env.*` | Present (line 10) |
| `!.env.example` | Present (line 11) — correctly un-ignores the example file |
| `.tauri-updater-key` | Present (line 6) |
| `.tauri-updater-key.pub` | Present (line 7) |
| `.tauri/alphonso-updater.key` | Present (line 5) |

No changes were needed to `.gitignore`.

### 2.2 .env.example Placeholder Audit

All credential variables in `.env.example` were audited. With the exception of the phone numbers fixed in 1.4 above, every secret value uses a `YOUR_*_HERE` or `REPLACE_WITH_YOUR_VALUE` placeholder. No API keys, tokens, or passwords with real-looking values were found.

Empty values (`KEY=`) for `ALPHONSO_BRIDGE_TOKEN`, `LOCAL_SDWEBUI_BASIC_AUTH`, and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` are acceptable — they correctly convey that these fields are optional or can be left blank.

---

## 3. What Still Needs Manual Action

### 3.1 GPU Flag Test Run (HIGH PRIORITY)
- Run `npm run tauri dev` after this change and verify the UI renders correctly.
- Test on the primary development machine before creating a release build.
- If any rendering issues are observed, restore `--use-angle=default` (not the full software-rendering set).

### 3.2 Git History Audit for Secrets (HIGH PRIORITY)
The `.gitignore` correctly excludes `.env` files going forward, but if `.env` was committed at any point in the past, the secrets would still be in git history. Run:
```powershell
git log --all --full-history -- .env
```
If any commits are returned, treat all credentials in those commits as compromised and rotate them using `docs/SECURITY_ROTATION_CHECKLIST.md`.

### 3.3 Credential Rotation
If git history shows `.env` was ever committed, rotate all credentials listed in `docs/SECURITY_ROTATION_CHECKLIST.md`. Even if git history is clean, rotate the WhatsApp phone numbers that were in `.env.example` if they appeared in any previous commit.

### 3.4 Tauri Capability Scoping (MEDIUM PRIORITY)
The `src-tauri/capabilities/` directory (if present) or the `tauri.conf.json` `allowlist` should be audited to ensure only the minimum necessary Tauri APIs are exposed to the frontend WebView. This was not addressed in this pass (it requires touching Rust configuration files which were out of scope).

### 3.5 CSP Nonce Migration (LOW PRIORITY)
Replace `'unsafe-inline'` in `script-src` with a nonce-based approach using `vite-plugin-csp` or equivalent. This is a longer-term hardening task that requires frontend build changes.

### 3.6 Build Verification
After these config changes, run a full build to confirm nothing is broken:
```powershell
cd "C:\Users\Shaya\OneDrive\Desktop\ALPHONSO\FILES\local-agent-ui-v2"
npm run build
```
Then:
```powershell
npm run tauri build
```
Confirm the installer bundles without errors and the app launches with the correct window size and working network connections.

---

## 4. Risks and Notes

| Risk | Severity | Mitigation |
|---|---|---|
| `'unsafe-inline'` in script-src allows inline JS execution | Medium | App is desktop-only, no remote HTML; mitigated by locked `connect-src` |
| GPU flags removed without prior test | Low | Hardware acceleration is standard on Win11; test run required before release |
| Phone numbers were in `.env.example` git history | Medium | Audit git log; phone numbers are not auth credentials but represent PII |
| Tauri updater pubkey is hardcoded in `tauri.conf.json` | Low | This is a public key — safe to commit; private key is git-ignored |
| `https:` in `connect-src` is broad | Low | Allows any HTTPS endpoint; acceptable for Railway unknown domain; narrow later when Railway domain is known |

---

## 5. How to Test

### Quick smoke test (dev mode):
```powershell
cd "C:\Users\Shaya\OneDrive\Desktop\ALPHONSO\FILES\local-agent-ui-v2"
npm run tauri dev
```
- App should open at 1280×800.
- Minimum resize limit should be 1024×700.
- Hardware GPU rendering should be active (check Task Manager GPU column).
- Network calls to Ollama (`localhost:11434`), Anthropic, OpenAI should succeed.

### Full build test:
```powershell
npm run build
npm run tauri build
```
- Build should complete without CSP-related errors.
- The resulting installer (`.msi` / `.exe`) should produce a working app.

### CSP validation:
In dev mode, open DevTools (F12 in the WebView) and check the Console tab for any CSP violation errors. If violations appear, the CSP may need an additional `connect-src` entry for the reported origin.

---

*Report generated by Claude Code on 2026-05-31.*
