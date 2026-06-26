# ALPHONSO — OPENCODE AUTONOMOUS SPRINT
**Agent:** OpenCode
**Branch:** `opencode-sprint`
**Orchestrator:** Claude Code (reviews and merges after completion)
**Baseline:** v2.3.3 — `D:\AgentDevWork\repos\AlphonsoEcosystem`

---

## READ FIRST — MANDATORY

Before touching any file:
1. `docs/ALPHONSO_GROUND_TRUTH.md` — single source of truth
2. `CLAUDE.md` — do-not-duplicate list, build commands, architecture rules
3. `ALPHONSOAUDIT25.06.2026.md` — P0/P1 audit that generated these tasks
4. `AlphonsoJuneComplitionSprint.md` — full sprint context

---

## YOUR MISSION

You own the **Bug & Gap Closure** workstream. Your job is to fix everything that is broken, silently failing, or unreachable in the current codebase. Source material: `ALPHONSOJUNEMISSINGSPRING.md` + Phase 1 Security tasks from `AlphonsoJuneComplitionSprint.md`.

**No new architecture. No TS migration. No coverage work.** Other agents handle those. Your job is surgical fixes and security hardening.

---

## YOUR BRANCH

```bash
git checkout -b opencode-sprint
git push -u origin opencode-sprint
```

Work exclusively on `opencode-sprint`. Never push to `main`.

---

## FILE OWNERSHIP (you OWN these — other agents do NOT touch them)

**Rust / backend:**
- `src-tauri/src/runtime_manager.rs`
- `src-tauri/src/lib.rs` (IPC rate limiting only)
- `voice/backend/main.py`
- `voice/backend/tts.py`
- `gateway/whatsapp-cloud/` (all files)
- `bridge/server.js`
- `mcp-server/server.js`

**JavaScript / React (existing .jsx files — bug fixes only, do NOT migrate to .tsx):**
- `src/components/ConnectorSetupPanel.jsx`
- `src/components/ConnectorHealthPanel.jsx`
- `src/components/ModelSwitcher.jsx`
- `src/components/agentWorkshop/` (all files — mount them)
- `src/features/content-catalyst/services/contentCatalystService.js`
- `src/services/workspaceRootService.js`
- `src/lib/durableStore.js`
- `src/services/joseSchedulerService.js` (cron validation fix ONLY — see task S-16)

**Tests you add:**
- `src/test/ecosystemHub.test.jsx`
- `src/test/agentPairingView.test.jsx`
- `src/test/policyEnforcementService.test.js`
- `src/test/agentContractService.test.ts`

**Do NOT touch:**
- Any `.tsx` component files (RightPanel.tsx, SettingsView.tsx, ChatView.tsx, etc.) — except SettingsView.tsx for mount-point additions only
- Any `src/services/` files not listed above
- Any file owned by `cline-sprint` or `claudecode-sprint`

---

## HOW TO OPERATE

**You are fully autonomous.** Create subagents when tasks are independent. Execute directly when tasks must be sequential. Do not stop for questions — make the call and keep going. Only stop for: destructive git ops, secret rotation, paid API calls, pushing to main.

After ALL tasks are complete:
1. Update `docs/ALPHONSO_GROUND_TRUTH.md`, `CLAUDE.md`, `docs/CHANGELOG.md` to reflect your changes
2. Commit everything to `opencode-sprint`
3. Push `opencode-sprint`
4. Post completion summary (what changed, what test counts are, any blockers)

**Verification after every task:**
- Rust changes: `cargo check` + `cargo clippy -- -D warnings` from `src-tauri/`
- JS changes: `npm run lint` + `npm run test`
- Full verification at end: `npm run verify:app`

---

## TASKS

### SECTION A — VOICE OS (Critical Path)

**S-01** Fix Voice OS install verification
- File: `src-tauri/src/runtime_manager.rs` lines 162–181
- The `requirements_file` logic bug was fixed but never tested in the actual desktop app. Add a health check after install: verify the venv exists at the expected path and that `faster-whisper`, `piper-tts`, `webrtcvad`, `fastapi`, `uvicorn`, `websockets`, `numpy` are all importable from the venv.
- If any package is missing post-install, emit a `runtime://install_error` event with the missing package name.
- Validation: `cargo check` passes; logic is traceable in code review

**S-02** Fix Voice OS start — dev mode vs production path
- File: `src-tauri/src/runtime_manager.rs` lines 988–1004
- Verify the `resource_dir()` path resolution works in both `tauri dev` mode (source tree root) and production (APPDATA extracted). If the voice backend path is wrong in either mode, fix it with a conditional: in debug builds use the source tree, in release builds use `resource_dir`.
- Validation: `cargo check` passes; path construction logic is correct for both modes

**S-03** Add `/health` endpoint to Voice OS backend
- File: `voice/backend/main.py`
- Add `GET /health` route that returns `{"status": "ok", "stt": true, "tts": true}`. The `tts` field should check whether the piper model file exists on disk.
- File: `src-tauri/src/runtime_manager.rs` line 177
- Set `health_path: Some("/health".to_string())` for the Voice OS tool definition so the runtime checks actual HTTP health instead of PID-only.
- Validation: `cargo check` passes

**S-04** Add Piper TTS model download step
- File: `voice/backend/tts.py`
- If the piper voice model file does not exist at the expected path, log a clear error: "Piper voice model not found. Run: python -c \"import piper; piper.download_model('en_US-lessac-medium')\"" 
- Return a graceful fallback: TTS responses become empty string (no audio) rather than crashing the pipeline.
- File: `src-tauri/src/runtime_manager.rs`
- Add a post-install step for Voice OS: after pip install, download the piper model file `en_US-lessac-medium.onnx` using `python -m piper --download-model en_US-lessac-medium` and store it in the Voice OS workspace directory. Emit progress via `runtime://log`.
- Validation: `cargo check` passes; tts.py handles missing model gracefully

**S-05** Fix Jarvis WebSocket URL — read from settings
- File: `src/hooks/useJarvisVoice.ts`
- Replace hardcoded `ws://127.0.0.1:8765` with a value read from localStorage key `alphonso_voice_ws_url` (default: `ws://127.0.0.1:8765`)
- File: `src/components/SettingsView.tsx`
- Add a "Voice OS WebSocket Port" input field in the Voice OS section that writes to `alphonso_voice_ws_url`
- Validation: `npm run test` passes; field visible in SettingsView

---

### SECTION B — RUNTIME MANAGER (Rust)

**S-06** Add Docker prerequisite detection
- File: `src-tauri/src/runtime_manager.rs`
- Add `find_docker()` function parallel to `find_python()` and `find_git()`
- Wire it into the prerequisite detection Tauri command `runtime_check_prerequisites`
- n8n ToolDef, OpenHands ToolDef, and ChromaDB ToolDef: set `prereqs: vec!["docker"]`
- The PrereqPanel in RuntimeManagerView already shows prereq status — Docker will appear automatically once added to detection
- Validation: `cargo check` + `cargo clippy -- -D warnings`

**S-07** Add `find_node()` prerequisite detection
- File: `src-tauri/src/runtime_manager.rs`
- Add `find_node()` function; wire into prereq detection
- MCP Server ToolDef: set `prereqs: vec!["node"]`
- Validation: `cargo check` + `cargo clippy -- -D warnings`

**S-08** Add AudioCraft Python version check
- File: `src-tauri/src/runtime_manager.rs`
- In `find_python()`, also capture the Python version string. Expose it in the prereq result.
- AudioCraft ToolDef: add a version constraint check — if Python version is ≥ 3.12, emit a warning event: "AudioCraft requires Python 3.9–3.11. Found Python X.Y"
- Validation: `cargo check` + `cargo clippy -- -D warnings`

**S-09** Fix ComfyUI install — venv isolation
- File: `src-tauri/src/runtime_manager.rs` lines 906–911
- ComfyUI runs `pip install -r requirements.txt` against system Python. Fix: create a venv for ComfyUI during install (same venv logic as Voice OS), run pip inside the venv, and launch ComfyUI using the venv Python.
- Validation: `cargo check` + `cargo clippy -- -D warnings`

**S-10** Add runtime_start_tool post-spawn health check
- File: `src-tauri/src/runtime_manager.rs` lines 965–1012
- After spawning a process, wait 3 seconds, then check if the process is still alive (PID check). If the process died, emit `runtime://tool_start_failed` with the tool name and last stderr line.
- Validation: `cargo check` + `cargo clippy -- -D warnings`

---

### SECTION C — SECURITY HARDENING

**S-11** Add IPC rate limiting for external commands
- File: `src-tauri/src/lib.rs`
- Add a `Mutex<HashMap<String, (u32, std::time::Instant)>>` to Tauri state for rate limiting
- For these 4 commands: `telegram_send_message`, `whatsapp_send_message`, `youtube_upload_video`, `meta_publish_media` — add a token bucket: max 10 calls per minute per command
- Return `Err("rate_limited".to_string())` when exceeded
- Validation: `cargo check` + `cargo clippy -- -D warnings`

**S-12** Add HMAC-SHA256 webhook verification to WhatsApp gateway
- File: `gateway/whatsapp-cloud/index.js` (read the file first to find the entry point)
- On every incoming POST, verify the `X-Hub-Signature-256` header using `WHATSAPP_APP_SECRET` from `process.env`
- Use Node's built-in `crypto.createHmac('sha256', secret).update(rawBody).digest('hex')`
- Return `res.sendStatus(403)` on mismatch; log the attempt to stderr
- Install `express` raw body parser before JSON parser to capture raw body for HMAC
- Validation: `npm test` in gateway/ if tests exist; otherwise manual verification documented

**S-13** Add body size limit to bridge server
- File: `bridge/server.js`
- Add `express.json({ limit: '1mb' })` middleware before all routes
- Validation: server starts; large body returns 413

**S-14** Add auth middleware to MCP server
- File: `mcp-server/server.js`
- Read `process.env.MCP_SECRET`; if set, require `Authorization: Bearer <MCP_SECRET>` on all tool call routes
- If `MCP_SECRET` is not set, restrict to `127.0.0.1` connections only (check `req.ip`)
- Return 401 on auth failure
- Validation: server starts; unauthorized request returns 401

**S-15** Verify no credentials in git history
- Run: `git log --all --full-history -- .tauri-updater-key` and `git log --all --full-history -- .env` and `git log -S "API_KEY" --oneline -- "*.js"` and `git log -S "token" --oneline -- "*.js"`
- If clean: document result in a one-line comment at bottom of `ALPHONSOAUDIT25.06.2026.md`
- If found: DO NOT PROCEED — stop and report to Orchestrator. This is a destructive action (git filter-repo) that requires human approval.

---

### SECTION D — CONNECTOR UX FIXES

**S-16** Rename "Connected" label to "Credentials saved"
- File: `src/components/ConnectorHealthPanel.jsx`
- Find the "Connected" status label for connectors; change to "Credentials saved"
- Find the CSS/class that styles it as green; keep the color, change the text
- Also update `src/services/connectorRegistryService.js` if the status string is generated there
- Validation: `npm run test` passes; label text changed

**S-17** Implement real "Test Connection" for GitHub connector
- File: `src/components/ConnectorSetupPanel.jsx`
- The "Test" button for GitHub currently shows a success toast without making an API call
- Replace: call `GET https://api.github.com/user` with the saved token
- On 200: toast "Connection verified — authenticated as @username"
- On 401/403: toast error "Invalid GitHub token"
- On network error: toast "Could not reach GitHub API"
- Same fix for Slack connector: call `https://slack.com/api/auth.test`
- Validation: `npm run test` passes; manual test with valid/invalid token

**S-18** Add Runway credential section to ConnectorSetupPanel
- File: `src/components/ConnectorSetupPanel.jsx`
- Add a "Runway Gen-3" section with: API key input, save button, note: "Runway Gen-3 is a paid service. Requires an active Runway subscription."
- Save via `saveConnectorCredential('runway', { apiKey })`
- Validation: section renders; credential saves to KV store

**S-19** Fix Hector briefing card — empty sources fallback
- File: `src/components/ChatView.tsx`
- When `hectorBriefing.sources` is empty or length 0, show: "No external sources — configure Brave Search or Perplexity in Connectors for real citations."
- Validation: `npm run test` passes

**S-20** Fix Nova insight threshold — make configurable
- File: `src/components/ChatView.tsx`
- Replace hardcoded `score > 65` with `score > novaThreshold` where `novaThreshold` is read from localStorage key `alphonso_nova_threshold` (default: 65)
- File: `src/components/SettingsView.tsx`
- Add a "Nova Insight Threshold" number input (range 0–100, default 65) in the Nova section that writes to `alphonso_nova_threshold`
- Validation: `npm run test` passes

**S-21** Fix Ollama model picker — show pull button for unloaded models
- File: `src/components/ModelSwitcher.jsx`
- When a model is selected that is not in the pulled models list, show a "Pull model" button instead of silently failing
- On click: call Ollama `/api/pull` with `stream: true` and show download progress in a toast or inline progress bar
- On completion: refresh the model list
- Validation: `npm run test` passes

---

### SECTION E — CONTENT PIPELINE & SETTINGS

**S-22** Surface content pipeline errors to user
- File: `src/features/content-catalyst/services/contentCatalystService.js`
- When `generateComfyUiImage` is skipped (ComfyUI not running), emit: `window.dispatchEvent(new CustomEvent('alphonso:toast', { detail: { type: 'warning', message: 'Image generation skipped — ComfyUI not running. Start it in Runtimes.' } }))`
- Same for Runway video generation: if API key not configured, emit a warning toast
- Validation: `npm run test` passes; content generation test covers error surfacing

**S-23** Audit workspace root usage across services
- File: `src/services/workspaceRootService.js`
- Read the current implementation
- Search for hardcoded paths (`process.cwd()`, `'./workspace'`, `'C:\\Users'`) in `src/services/` files
- For each found: replace with `getWorkspaceRoot()` from workspaceRootService
- Validation: grep confirms no hardcoded paths remain; `npm run test` passes

**S-24** Persist notification center across reloads
- File: `src/components/NotificationCenter.tsx`
- On mount: load notifications from localStorage key `alphonso_notifications_v1` (parse JSON, restore array)
- On state change: save to localStorage (debounced 500ms)
- On "Clear all": also clear localStorage
- Validation: `npm run test` passes; notifications persist across reload

**S-25** Gate Sentinel auto-refresh on panel visibility
- File: `src/components/RightPanel.tsx`
- The 10-minute `setInterval` calling `runQuickScan()` runs unconditionally
- Wrap in: only run if the Security section is currently visible (check `activeTab === 'system'` or equivalent)
- On tab switch away from Security: clear the interval; on switch back: restart it
- Validation: `npm run test` passes

---

### SECTION F — MOUNT UNMOUNTED COMPONENTS

**S-26** Mount CompanionPairingPanel in SettingsView
- File: `src/components/SettingsView.tsx`
- Add an "Agent Companions" section in SettingsView (after the Agents/Echo section)
- Import `CompanionPairingPanel` from `src/components/CompanionPairingPanel.jsx`
- Render it in the new section
- Validation: section renders without crashing; `npm run test` passes

**S-27** Mount AgentMetricsPanel in SettingsView
- File: `src/components/SettingsView.tsx`
- Add an "Agent Metrics" section in SettingsView (under Agent Companions)
- Import `AgentMetricsPanel` from `src/components/AgentMetricsPanel.jsx`
- Render it in the new section
- Validation: section renders without crashing; `npm run test` passes

**S-28** Audit and mount agentWorkshop components
- File: `src/components/agentWorkshop/` — read all files
- Identify the entry component (likely `AgentWorkshop.jsx` or similar)
- Add an "Agent Workshop" tab to EcosystemHub (alongside existing tabs) or add as a nav item in Sidebar
- Validation: workshop is reachable via UI; renders without crashing; `npm run test` passes

**S-29** Add Whisper prereq warning in MeetingTranscriptionPanel
- File: `src/components/SettingsView.tsx` (MeetingTranscriptionPanel section)
- On mount of the transcription panel, check if Whisper tool is installed via `runtimeManagerService`
- If not installed: show a banner "Whisper not installed. Install it in Runtimes → Whisper to enable transcription."
- Validation: renders correctly with and without Whisper installed

---

### SECTION G — MCP SERVER & BRIDGE

**S-30** Add find_node() to Runtime prerequisite detection
- (Already covered in S-07)

**S-31** Fix Alphonso Bridge port conflict documentation
- File: `bridge/server.js`
- Read `PORT` from `process.env.ALPHONSO_BRIDGE_PORT` with fallback to `4444`
- Add a comment: `// Default port 4444. Set ALPHONSO_BRIDGE_PORT env var if conflict with other tools (e.g., Metasploit).`
- Update `mcp-server/server.js` to use env var too: `process.env.MCP_SERVER_PORT || 3333`
- Validation: servers start; `npm run test` passes if tests exist

---

### SECTION H — RELEASE INFRASTRUCTURE

**S-32** Verify signing keys in GitHub Secrets (documentation task)
- Do NOT push the signing key. Do NOT rotate it.
- Check: does `src-tauri/tauri.conf.json` reference `TAURI_PRIVATE_KEY` and `TAURI_KEY_PASSWORD`?
- Document in `docs/RELEASE_CHECKLIST.md` (create if not exists): "Before tagging a release, verify TAURI_PRIVATE_KEY and TAURI_KEY_PASSWORD are set in GitHub → Settings → Secrets → Actions."
- Validation: file exists; no actual secrets touched

**S-33** Verify latest.json updater manifest generation
- File: `.github/workflows/release.yml`
- Read the workflow. Confirm the `npm run release:updater` step generates and uploads `latest.json` to the GitHub release
- If missing: add the step. If present: add a verification step that checks the manifest JSON has non-empty `signature` and `url` fields
- Validation: workflow step is present and syntactically valid YAML

---

### SECTION I — TESTS

**S-34** Add EcosystemHub tests
- File: `src/test/ecosystemHub.test.jsx` (create)
- Test: all tabs render without crashing (including new Pairings tab)
- Target: 6 tests minimum
- Validation: `npm run test` all pass

**S-35** Add AgentPairingView tests
- File: `src/test/agentPairingView.test.jsx` (create)
- Test: create pair, duplicate detection, delete pair
- Target: 6 tests minimum
- Validation: `npm run test` all pass

**S-36** Add policyEnforcementService fail-closed tests
- File: `src/test/policyEnforcementService.test.js` (create or extend)
- Test: missing credentials → `blocked: true`; ambiguous action → blocked; zero-cost mode → blocks paid; approval mode → requires approval; valid low-risk → passes
- Target: 8 tests minimum
- Validation: `npm run test` all pass

**S-37** Add agentContractService boundary tests
- File: `src/test/agentContractService.test.ts` (create or extend)
- For each of 9 agents: test 1 blocked action + 1 allowed action
- Target: 18 tests minimum
- Validation: `npm run test` all pass

---

## COMPLETION CHECKLIST

Before pushing `opencode-sprint`, verify:

- [ ] `cargo check` — clean
- [ ] `cargo clippy -- -D warnings` — zero warnings
- [ ] `npm run test` — all 1983+ pass (plus your new tests)
- [ ] `npm run lint` — clean
- [ ] Voice OS health endpoint exists at `/health`
- [ ] Docker prereq check added (n8n, OpenHands, ChromaDB)
- [ ] Node prereq check added (MCP server)
- [ ] Rate limiting on 4 IPC commands
- [ ] WhatsApp gateway HMAC verification
- [ ] Bridge body limit
- [ ] MCP server auth
- [ ] Git history verified clean (or stop reported)
- [ ] CompanionPairingPanel mounted
- [ ] AgentMetricsPanel mounted
- [ ] agentWorkshop mounted
- [ ] "Connected" label renamed
- [ ] 4 new test files added
- [ ] `docs/ALPHONSO_GROUND_TRUTH.md` updated
- [ ] `CLAUDE.md` updated
- [ ] `docs/CHANGELOG.md` updated with your changes
- [ ] All committed and pushed to `opencode-sprint`

---

## RETURN MESSAGE TO ORCHESTRATOR

When done, report:
1. All tasks completed / any blockers
2. New test count (should be 1983 + your additions)
3. Any merge conflicts you anticipate with `main`
4. The branch is pushed and ready for Orchestrator review

**Branch:** `opencode-sprint` → Orchestrator will review and merge.
