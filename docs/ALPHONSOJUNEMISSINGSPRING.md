# ALPHONSO — June Missing Spring
**Prepared:** 2026-06-27  
**Version at time of writing:** v2.3.3  
**Purpose:** Exhaustive backlog of everything that is incomplete, cut, untested, or deferred across the entire codebase. Nothing softened. Use this as the task board for the next sprint.

---

## HOW TO USE THIS FILE

Each item has:
- **Status** — `cut` (was promised, not done), `untested` (code exists, never verified in desktop), `missing` (feature gap, nothing implemented), `partial` (half-built)
- **Effort** — S / M / L / XL
- **Blocking** — what breaks if this stays unresolved
- **File** — where to look

---

## SECTION 1 — Voice OS (Highest Priority)

### 1.1 Voice OS install never verified end-to-end
- **Status:** untested  
- **Effort:** S (test only)  
- **What to do:** Open Alphonso desktop → Runtimes → Voice OS → Install. Confirm venv is created, all 7 pip packages install (`faster-whisper`, `piper-tts`, `webrtcvad`, `fastapi`, `uvicorn[standard]`, `websockets`, `numpy`), progress bar completes.  
- **Blocking:** The entire Jarvis voice pipeline. If this doesn't work, mic button in Chat is dead.  
- **File:** `src-tauri/src/runtime_manager.rs:162–181`  
- **Notes:** Fixed the logic bug this session (removed wrong `requirements_file`). But logic fix ≠ it actually works. Must test in desktop app with Python installed.

### 1.2 Voice OS start — dev mode vs production path divergence
- **Status:** partial  
- **Effort:** S  
- **What to do:** In `tauri dev` mode, `app.path().resource_dir()` returns the source tree root, not `dist/`. The `voice/backend/` directory IS in the source tree so it may work — but needs a test to confirm. Behavior in production installer (where resources are extracted to `%APPDATA%`) must also be verified.  
- **Blocking:** Voice in `tauri dev` testing.  
- **File:** `src-tauri/src/runtime_manager.rs:988–1004`

### 1.3 Voice OS has no health check
- **Status:** cut  
- **Effort:** S  
- **What to do:** `health_path: None` means "running" is detected only by PID, not by actually hitting port 8765. If the Python process crashes silently (bad model, OOM), the UI shows "running" forever. Fix: add a health endpoint to `voice/backend/main.py` at `/health` and set `health_path: Some("/health")` in Rust.  
- **File:** `voice/backend/main.py`, `src-tauri/src/runtime_manager.rs:177`

### 1.4 Piper TTS model not downloaded automatically
- **Status:** missing  
- **Effort:** M  
- **What to do:** `piper-tts` installs the Python package but doesn't download a voice model. The TTS pipeline in `voice/backend/tts.py` will fail silently or crash with a missing model error on first run. Need to either: (a) add a model download step to the Voice OS install flow, or (b) handle missing model gracefully with a fallback (text-only response).  
- **Blocking:** Text-to-speech in Jarvis voice responses.  
- **File:** `voice/backend/tts.py`, `src-tauri/src/runtime_manager.rs`

### 1.5 Jarvis WebSocket URL is hardcoded
- **Status:** cut  
- **Effort:** S  
- **What to do:** `useJarvisVoice.ts` connects to `ws://127.0.0.1:8765`. If the user changes the Voice OS port, nothing updates. Should read from Settings or env.  
- **File:** `src/hooks/useJarvisVoice.ts`

---

## SECTION 2 — Runtime Manager

### 2.1 No tool installs verified in desktop app
- **Status:** untested  
- **Effort:** M (test session)  
- **What to do:** Test at least ComfyUI, Whisper, and Voice OS installs from Runtime Hub in the actual desktop app. Document which work and which error.  
- **Blocking:** Everything in the "AI Runtimes" pitch.  
- **File:** `src-tauri/src/runtime_manager.rs`

### 2.2 ComfyUI install: no venv isolation
- **Status:** cut  
- **Effort:** M  
- **What to do:** ComfyUI has `repo_url` so it gets git-cloned, but it also has its own `requirements.txt` with many deps. The install does not create a venv for ComfyUI — it runs `pip install -r requirements.txt` in the system Python. This pollutes the user's global Python env. Fix: ensure venv creation runs for all tools with `requirements_file`, not just those with `exe == "python"`.  
- **File:** `src-tauri/src/runtime_manager.rs:906–911`

### 2.3 runtime_start_tool: no timeout, no retry
- **Status:** cut  
- **Effort:** S  
- **What to do:** After spawning a process, the UI says "allow a few seconds." If the process fails immediately (missing dep, port conflict), there's no feedback. Add a 3s health check after spawn and emit an error event if the process is already dead.  
- **File:** `src-tauri/src/runtime_manager.rs:965–1012`

### 2.4 n8n requires Docker — no Docker check
- **Status:** missing  
- **Effort:** S  
- **What to do:** n8n ToolDef uses Docker (`exe: "docker"`). If Docker is not installed, the error message is cryptic. Add `find_docker()` to prerequisite detection and show it in the PrereqPanel like Python and Git.  
- **File:** `src-tauri/src/runtime_manager.rs`

### 2.5 OpenHands requires Docker — same as above
- **Status:** missing  
- **Effort:** S  
- **File:** `src-tauri/src/runtime_manager.rs`

### 2.6 ChromaDB requires Docker — same issue
- **Status:** missing  
- **Effort:** S  
- **File:** `src-tauri/src/runtime_manager.rs`

### 2.7 AudioCraft (fooocus) may have Python version constraints
- **Status:** untested  
- **Effort:** S  
- **What to do:** AudioCraft requires Python 3.9–3.11. `find_python()` may return Python 3.12+ which is incompatible. No version check exists.  
- **File:** `src-tauri/src/runtime_manager.rs`

---

## SECTION 3 — Unmounted Components

These components are fully implemented and tested but have no navigation entry point. A user cannot reach them.

### 3.1 CompanionPairingPanel.jsx
- **Status:** missing mount  
- **Effort:** S  
- **What to do:** Mount in SettingsView under an "Agents" or "Companions" section, or add as a tab in EcosystemHub alongside AgentPairingView.  
- **File:** `src/components/CompanionPairingPanel.jsx`

### 3.2 AgentMetricsPanel.jsx
- **Status:** missing mount  
- **Effort:** S  
- **What to do:** Mount in EcosystemHub "Advanced" tab, or in RightPanel Agents section as a collapsible.  
- **File:** `src/components/AgentMetricsPanel.jsx`

### 3.3 agentWorkshop/ directory
- **Status:** missing mount  
- **Effort:** M  
- **What to do:** Audit all files in `src/components/agentWorkshop/`. Wire the entry component into the EcosystemHub "Advanced" tab or give it a dedicated nav item.  
- **File:** `src/components/agentWorkshop/`

### 3.4 MeetingTranscriptionPanel  
- **Status:** partial  
- **Effort:** S  
- **What to do:** Exists in SettingsView (confirmed per GROUND_TRUTH), uses `pick_file` Tauri command + `whisperTranscriptionService`. Whisper tool must be installed in Runtimes for it to work — no warning shown if Whisper is not installed.  
- **File:** `src/components/SettingsView.tsx`, `src/services/whisperTranscriptionService.js`

---

## SECTION 4 — Connector Page & Composio

### 4.1 "Connected" label is semantically wrong
- **Status:** cut  
- **Effort:** S  
- **What to do:** The label says "Connected" when it means "credentials saved." A user who connected GitHub will assume the agents can browse repos directly — they cannot (everything runs through local Ollama). Label should say "Credentials saved" or "Ready". The explanation banner helps but the label still misleads.  
- **File:** `src/components/ConnectorHealthPanel.tsx`, `src/services/connectorRegistryService.js`

### 4.2 Composio config section in Settings not verified
- **Status:** untested  
- **Effort:** S  
- **What to do:** The callout card added to ConnectorHealthPanel says "go to Settings → Connectors → External Tools." Verify that path actually shows a Composio API key input and that `setComposioConfig` saves it correctly.  
- **File:** `src/components/SettingsView.tsx`, `src/components/ConnectorSetupPanel.jsx`

### 4.3 GitHub connector "uses Ollama" explanation needs to reach SettingsView
- **Status:** cut  
- **Effort:** S  
- **What to do:** The explanation banner is only in ConnectorHealthPanel (Connectors page). SettingsView connector section shows credentials but no explanation of the local-only model. Add a one-line note there too.  
- **File:** `src/components/SettingsView.tsx`

---

## SECTION 5 — Content Generation Pipeline

### 5.1 ComfyUI image generation not verified
- **Status:** untested  
- **Effort:** M  
- **What to do:** `contentCatalystService.js` calls `generateComfyUiImage`. This requires ComfyUI running on port 8188. Test: install ComfyUI from Runtimes, start it, run a content generation from Content Studio, confirm image appears.  
- **Blocking:** Creative content pipeline.  
- **File:** `src/features/content-catalyst/services/contentCatalystService.js`

### 5.2 Runway video generation requires paid API key
- **Status:** missing (docs)  
- **Effort:** S  
- **What to do:** Users have no way to know Runway requires an API key and costs money. No UI prompt, no connector setup section for Runway in ConnectorSetupPanel. At minimum, add a Runway credential section.  
- **File:** `src/components/ConnectorSetupPanel.jsx`

### 5.3 Content pipeline error states not surfaced to user
- **Status:** cut  
- **Effort:** M  
- **What to do:** `contentCatalystService.js` degrades gracefully — if ComfyUI is down, it skips images and continues. But the user sees a content piece with no image and no explanation. Should surface a warning toast: "Image generation skipped — ComfyUI not running."  
- **File:** `src/features/content-catalyst/services/contentCatalystService.js`

---

## SECTION 6 — Settings & Persistence

### 6.1 Root directory setting not actually used everywhere
- **Status:** partial  
- **Effort:** M  
- **What to do:** `settings.workspaceRoot` is now saved correctly. But not every service that needs a workspace path actually reads from `useSettings()`. Audit all services that use hardcoded paths or `process.cwd()` and have them read the workspace root from settings.  
- **File:** `src/services/workspaceRootService.js`, all services that use file paths

### 6.2 `durableStore` SQLite writes are fire-and-forget
- **Status:** cut  
- **Effort:** S  
- **What to do:** `durableStore.js` writes to localStorage immediately and fire-and-forgets to Tauri `kv_set`. If the desktop app restarts and localStorage is cleared (browser profile reset, private mode), the SQLite backup would restore data — but only for the 3 services that use durableStore. The other ~40 services using raw `localStorage` have no backup. No plan to migrate them.  
- **File:** `src/lib/durableStore.js`

---

## SECTION 7 — Test Coverage

### 7.1 Coverage stuck at ~38%, target 40% never met
- **Status:** cut  
- **Effort:** M  
- **What to do:** `npm run test:coverage` — identify which service files have 0% coverage. Focus on connectors (`githubConnector.ts`, `slackConnector.ts`, `n8nConnector.js`) and newer services.  
- **File:** `src/test/`

### 7.2 EcosystemHub has no tests
- **Status:** missing  
- **Effort:** S  
- **What to do:** The EcosystemHub tab layout (including new Pairings tab) has no test coverage. At minimum, test that all 6 tabs render without crashing.  
- **File:** `src/test/` (new file needed)

### 7.3 AgentPairingView has no tests
- **Status:** missing  
- **Effort:** S  
- **What to do:** Test create pair, duplicate detection, delete pair.  
- **File:** `src/test/` (new file needed)

### 7.4 E2E test covers only golden path
- **Status:** cut  
- **Effort:** L  
- **What to do:** `e2e/smoke.spec.js` tests one happy path. No edge cases, no connector flows, no voice flow, no Runtimes page. Requires Ollama running — CI does not have Ollama.  
- **File:** `e2e/smoke.spec.js`

---

## SECTION 8 — Security & Ops

### 8.1 Branch protection on `main` — never done
- **Status:** missing  
- **Effort:** S (manual GitHub UI)  
- **What to do:** Go to GitHub → Settings → Branches → Add rule for `main`. Require: 1 PR review, CI pass before merge. This is a manual step — MCP doesn't expose the branch protection API.  
- **Blocking:** Nothing functionally, but it means direct pushes to main are allowed.

### 8.2 `npm audit` — unreviewed vulnerabilities
- **Status:** untested  
- **Effort:** S  
- **What to do:** Run `npm audit`. CI runs `npm audit` but does not fail on moderate/low. Review the report, fix any high/critical if present.

### 8.3 `.env`, signing keys in `.gitignore` but not verified
- **Status:** untested  
- **Effort:** S  
- **What to do:** Run `git log --all --full-history -- .tauri-updater-key` to confirm the signing key was never accidentally committed. Run `git log --all --full-history -- .env`.

### 8.4 Updater endpoint is GitHub Releases — no fallback
- **Status:** cut  
- **Effort:** M  
- **What to do:** If the GitHub release is deleted or the URL changes, auto-update silently fails. No user notification beyond the UpdaterNotification banner timeout.

---

## SECTION 9 — TypeScript Migration

### 9.1 53 `.jsx` component files not migrated to TypeScript
- **Status:** cut  
- **Effort:** XL  
- **What to do:** 10 components are `.tsx`, 63 remain `.jsx`. No type safety on props. This is a long-tail item but matters for catching regressions during refactors.  
- **Priority:** Low — not blocking anything today.

---

## SECTION 10 — UX / Visual Debt

### 10.1 Connector credential "test connection" buttons are fake
- **Status:** cut  
- **Effort:** M  
- **What to do:** Most connector setup panels have a "Test" button that just shows a success toast without making a real API call. GitHub connector, for example, should `GET /user` with the saved token to confirm it's valid.  
- **File:** `src/components/ConnectorSetupPanel.jsx`

### 10.2 Ollama model picker shows no download progress
- **Status:** cut  
- **Effort:** M  
- **What to do:** `ModelSwitcher.jsx` lets you pick a model but if the model isn't pulled yet, it silently fails when Jose tries to use it. Should show "pull" button + streaming progress for models not yet on disk.  
- **File:** `src/components/ModelSwitcher.jsx`

### 10.3 Hector briefing card shows "top 3 sources" but sources are often empty
- **Status:** cut  
- **Effort:** S  
- **What to do:** When Hector uses only Ollama (no Brave/Perplexity/RSS configured), the sources array is empty. The card renders with no sources and looks broken. Add a fallback message: "No external sources — configure Brave Search or Perplexity in Connectors for real citations."  
- **File:** `src/components/ChatView.tsx`

### 10.4 Nova insight card fires for scores > 65 but threshold is arbitrary
- **Status:** cut  
- **Effort:** S  
- **What to do:** The 65 threshold was chosen without basis. User should be able to configure it in Settings. Currently hardcoded.  
- **File:** `src/components/ChatView.tsx`

### 10.5 Notification center has no persistence
- **Status:** cut  
- **Effort:** S  
- **What to do:** Notifications are in-memory (React state). On reload, all notifications are gone. Should persist to localStorage and restore on mount. Useful for "Jose completed your task" notifications that appear while the user is away.  
- **File:** `src/components/NotificationCenter.tsx`

### 10.6 RightPanel auto-refresh runs Sentinel scan every 10 minutes
- **Status:** cut  
- **Effort:** S  
- **What to do:** The 10-minute Sentinel scan is unconditional — it runs even when the user is not on the Security section, burning CPU every 10 min. Should be gated on the RightPanel being open and the Security section being visible.  
- **File:** `src/components/RightPanel.tsx`

---

## SECTION 11 — iOS Companion Branch (Separate Work Stream)

### 11.1 iOS companion branch incomplete
- **Status:** cut / in-progress  
- **Effort:** XL  
- **What to do:** Branch `feat/ios-companion` was referenced in memory as in-progress. No work done in these sessions. Nothing in the main branch reflects iOS work.  
- **Notes:** Separate work stream — needs its own sprint.

---

## SECTION 12 — Release Infrastructure

### 12.1 Tag v2.3.3 not yet created
- **Status:** pending user approval  
- **Effort:** S  
- **What to do:** After user approves, run `git tag v2.3.3 && git push origin v2.3.3`. This triggers `release.yml` CI which builds + signs the NSIS installer and publishes it to GitHub Releases.  
- **Note:** The current local build (`npm run tauri build`) is for testing only — the signed release build happens via CI on tag push.

### 12.2 `release.yml` signing key must be in GitHub Secrets
- **Status:** untested (assumed correct)  
- **Effort:** S  
- **What to do:** Verify `TAURI_PRIVATE_KEY` and `TAURI_KEY_PASSWORD` are set in GitHub → Settings → Secrets → Actions. If missing, the CI release will fail with a signing error.

### 12.3 MSI target not in `tauri.conf.json`
- **Status:** cut  
- **Effort:** S  
- **What to do:** `targets: ["nsis"]` only. MSI installer is not being built. Some enterprise environments prefer MSI. Add `"msi"` to targets if needed.  
- **File:** `src-tauri/tauri.conf.json:42`

### 12.4 No `latest.json` updater manifest published separately
- **Status:** untested  
- **Effort:** S  
- **What to do:** The updater checks `releases/latest/download/latest.json`. This file is auto-generated by `release.yml` via `npm run release:updater`. Verify the manifest was published for v2.2.x and will be for v2.3.3. If missing, auto-update silently fails for all installed users.

---

## SECTION 13 — MCP Server & Bridge

### 13.1 MCP server runs on port 3333 — not auto-started
- **Status:** cut  
- **Effort:** S  
- **What to do:** `mcp-server/server.js` is listed as a Runtime Hub tool but requires Node.js (not Python). `find_node()` prerequisite check does not exist. If Node is not in PATH, install silently fails.  
- **File:** `src-tauri/src/runtime_manager.rs`

### 13.2 Alphonso Bridge port 4444 conflicts with common dev tools
- **Status:** cut  
- **Effort:** S  
- **What to do:** Port 4444 is used by some dev tools (e.g., Metasploit auxiliary). Should be configurable, or document the conflict.

---

## Priority Stack (suggested order)

| # | Item | Effort | Why now |
|---|------|--------|---------|
| 1 | Voice OS install verified in desktop | S | Core feature, just fixed, must confirm |
| 2 | Piper TTS model download step | M | Voice is silent without it |
| 3 | Connector "Connected" label rename | S | Actively misleads users |
| 4 | Composio config path verified | S | Users can't find it |
| 5 | Docker prerequisite checks (n8n, OpenHands, Chroma) | S | Clean errors instead of cryptic failures |
| 6 | CompanionPairingPanel + AgentMetricsPanel mounted | S | Already built, just needs a mount point |
| 7 | Voice OS health endpoint | S | Prevents zombie "running" state |
| 8 | Branch protection on main | S | Ops hygiene |
| 9 | Runway credential section in ConnectorSetupPanel | S | Users don't know they need an API key |
| 10 | Content pipeline error surfacing | M | Silent failures look like bugs |
| 11 | Test coverage to 40% | M | CI threshold |
| 12 | EcosystemHub + AgentPairingView tests | S | Just mounted, no tests |
| 13 | Tag v2.3.3 + signed release (after build verified) | S | Ship it |

---

*Generated 2026-06-27. Update this file at the start of each sprint and close items as they are verified — not just coded.*
