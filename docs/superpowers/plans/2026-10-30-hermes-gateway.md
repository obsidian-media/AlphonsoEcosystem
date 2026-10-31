# Hermes Gateway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alphonso installs, runs and manages Hermes profiles (its own and the user's), runs every Hermes step as a Hermes run with progress, Stop and approvals through Alphonso, and reaches Hermes agents from Telegram through Jose.

**Architecture:** A new backend module (`hermes_profiles.rs`) provisions and starts profiles and streams Hermes runs to the window as Tauri events; a new app folder (`src/services/hermes/`) holds profile management, the run client and the warnings. The resource manager gains `hermes:<agent>` tools; the engine turns Hermes approval requests into waiting steps that reuse the existing approval, board and Telegram paths.

**Tech Stack:** Rust (Tauri 2, reqwest, rand, serde_yaml), TypeScript (React, Vitest), WebdriverIO desktop E2E.

**Spec:** `docs/superpowers/specs/2026-10-30-hermes-gateway-design.md`

## Global Constraints

- Hermes pinned to PyPI `hermes-agent==0.19.0` (author Nous Research), wheel `hermes_agent-0.19.0-py3-none-any.whl`, SHA-256 `bd0bac012aee38a60894781f4597dc29ee7bedb3448540249921f10d3bef327f`, 10,144,439 bytes. `requires-python = ">=3.11,<3.14"`.
- No remote install script; nothing installed system-wide; install into `tool_dir("hermes-agent")`.
- Profiles Alphonso sets up live in `<runtimes>/hermes-profiles/<agent>/` (`HERMES_HOME`); the user's own Hermes folder is never written.
- Keys: 32 random bytes from the OS, base64url, made in the backend, keychain under `hermes_agents` (`HERMES_<AGENT>_URL` / `_KEY`), never returned to the window or logged. Two profiles never share a key.
- Ports from one constant `HERMES_PORT_RANGE` (Task 2 picks it clear of CLAUDE.md's port map and adds it there).
- Reading toolsets only, from one list `READING_TOOLSETS = ['web', 'vision', 'memory', 'session_search', 'todo', 'clarify']`; `approvals.deny: ["*"]`; no messaging platforms, cron, kanban or MCP servers.
- Approvals sent to Hermes are only `once` or `deny`.
- Default idle stop for profiles Alphonso started: 30 minutes. A profile the user started is never stopped.
- Telegram is the only front door; no `@agent` addressing.
- Plain words on screen: "Hermes profile", "Set up by Alphonso", "Yours"; never "gateway", "daemon" or "toolset".
- No hardcoded ports, paths, profile names, model ids or toolset lists outside the one constant each.
- `no_window()` on every spawn; no shell; arguments as a list.
- Docs (CLAUDE.md rows, GROUND_TRUTH, counts) in the same commit as the code they describe.

## Review Focus

1. A user's profile folder holding a profile whose `config.yaml` is missing, unreadable or YAML-broken: listed with "Can't read this profile's settings.", never crashes the list. (Task 4)
2. A port in `HERMES_PORT_RANGE` taken by something else between setup and start: the next free one is chosen and saved, the address in the keychain updated. (Task 2)
3. A Hermes run whose events stream drops mid-run (Hermes crashed or the profile was stopped): the step fails with "Hector's Hermes profile stopped answering." rather than hanging. (Task 5)
4. Two steps on the same agent's profile at once: both run as separate runs; Stop on one stops only its run. (Task 5)
5. An approval answered after Hermes's own timeout passed: the board answer is refused with "Hermes stopped waiting for your answer." and the step shows that, not a silent success. (Task 6)

---

### Task 1: Install Hermes from Runtime Hub

**Files:**
- Modify: `src-tauri/src/runtime_manager.rs` (new `ToolDef` `hermes-agent`; wheel download through `download_verified()`; Python version check)
- Modify: `src/services/runtimeManagerService.ts` (`TOOL_META['hermes-agent']`: `usedBy` "Agents whose provider is a Hermes profile", `difference`, `webUi: false`)
- Test: `src-tauri/src/runtime_manager.rs` (tests module), `src/test/services/runtimeManagerService.test.ts`

**Interfaces:**
- Produces: tool name `hermes-agent`; `pub(crate) fn hermes_python() -> Option<PathBuf>` (the venv's python, `None` when not installed); `HERMES_WHEEL` const (`name`, `url`, `sha256`, `size`).

- [ ] **Step 1: Write the failing Rust tests**
  - `hermes_wheel_is_pinned`: `HERMES_WHEEL.sha256 == "bd0bac01…327f"` and `HERMES_WHEEL.size == 10_144_439`, url on `files.pythonhosted.org`.
  - `hermes_python_range`: `hermes_python_ok("3.10.12") == false`, `("3.11.9") == true`, `("3.13.1") == true`, `("3.14.0") == false`.
- [ ] **Step 2: Run** `cargo test hermes_ -- --nocapture` (from `src-tauri/`). Expected: FAIL, items not defined.
- [ ] **Step 3: Implement** the ToolDef (`pip_packages: &[]`, `port: None`, `exe: "python"`), `hermes_python_ok(version: &str) -> bool`, and the install path: `find_python()` result checked by `hermes_python_ok` (refuse with "Hermes needs Python 3.11 to 3.13. Install one in Runtime Hub's prerequisites."), venv, `download_verified()` of the wheel into the tool folder, `pip install <wheel path>` (dependencies from PyPI as pip resolves them).
- [ ] **Step 4: Run** `cargo test hermes_` → PASS; `cargo clippy -- -D warnings` → clean.
- [ ] **Step 5: TOOL_META test** in `runtimeManagerService.test.ts`: `TOOL_META['hermes-agent'].webUi === false` and `usedBy` mentions Hermes. Run `npx vitest run src/test/services/runtimeManagerService.test.ts` → FAIL, then add the entry → PASS.
- [ ] **Step 6: Commit** `feat(hermes): install a pinned Hermes from Runtime Hub` (with the CLAUDE.md runtime-manager row note).

### Task 2: Set up a profile (backend)

**Files:**
- Create: `src-tauri/src/hermes_profiles.rs` (register in `lib.rs`)
- Test: same file's tests module

**Interfaces:**
- Consumes: `hermes_python()`, `tool_dir()`, `runtimes_dir()`, `no_window()`, keychain save used by `connectorAuth` (`secure_credential_set`).
- Produces (Tauri commands):
  - `hermes_profile_setup({ agent: String, model: HermesModel }) -> Result<ProfileInfo, String>` where `HermesModel = { kind: "ollama", endpoint, model } | { kind: "openrouter", model }` and `ProfileInfo = { agent, port, url, folder, running: bool }`. Writes the key to the keychain itself; never returns it.
  - `hermes_profile_set_model({ agent, model: HermesModel }) -> Result<(), String>`
  - `hermes_profile_remove({ agent }) -> Result<(), String>`
  - `hermes_profile_start({ agent }) -> Result<ProfileInfo, String>` (records the pid as `hermes:<agent>`)
  - `hermes_profile_stop({ agent }) -> Result<(), String>`
  - `hermes_profiles_list() -> Vec<ProfileInfo>`
  - consts `HERMES_PORT_RANGE: RangeInclusive<u16>`, `READING_TOOLSETS: &[&str]`.

- [ ] **Step 1: Write the failing tests**
  - `keys_differ_and_are_43_chars`: two `new_key()` values differ, each 43 chars of `[A-Za-z0-9_-]`.
  - `agent_name_checked`: `valid_agent("hector") == true`; `"../x"`, `"Hector"`, `""`, 65 chars → false.
  - `config_has_only_reading`: `profile_config(port, &model)` parsed as YAML has `platforms` keys exactly `["api_server"]`, `api_server.host == "127.0.0.1"`, toolsets equal `READING_TOOLSETS`, `approvals.deny == ["*"]`, `approvals.timeout == 1800`, no `mcp_servers`, no `cron`.
  - `key_not_in_config`: the config text does not contain the key (the key goes to the profile's env file as `API_SERVER_KEY`, checked by `env_file()` test containing it and nothing else secret).
  - `persona_has_handoff`: `profile_persona(agent, owns, never, action_line)` (the app passes `describeResponsibility(agent)` and `ACTION_INSTRUCTION` into `hermes_profile_setup` as `persona: { owns, never, actionLine }`) is written to the profile's `SOUL.md` and contains all three strings.
  - `next_free_port_skips_taken`: with a listener bound on the range start, `next_free_port(&HERMES_PORT_RANGE)` returns a later port.
  - `start_command_has_no_shell`: `start_command(agent)` program is the venv python, args `["-m","hermes_cli.main","-p",agent,"gateway","run"]`, env `HERMES_HOME` = the profile folder.
- [ ] **Step 2: Run** `cargo test hermes_profiles` → FAIL.
- [ ] **Step 3: Implement.** Check every config key name against Hermes 0.19.0's `hermes_cli/config.py` (`platforms.api_server`, `toolsets`, `approvals.mode`/`deny`/`timeout`, model provider, env-file name) and use those; if the API server key can only live in `config.yaml`, keep the file readable by this user only and rule it in the ledger. `OPENROUTER_API_KEY` for an OpenRouter profile goes in the env file, read from the keychain in the backend. Port: pick at setup, re-check at start, move and update the saved URL if taken.
- [ ] **Step 4: Run** `cargo test hermes_profiles` → PASS; clippy clean; `npm run verify:no-window-coverage` → pass.
- [ ] **Step 5: Commit** `feat(hermes): set up, start and stop a Hermes profile` with CLAUDE.md's port map row for `HERMES_PORT_RANGE`.

### Task 3: Profiles in the app

**Files:**
- Create: `src/services/hermes/hermesProfiles.ts`
- Test: `src/test/services/hermes/hermesProfiles.test.ts`

**Interfaces:**
- Consumes: Task 2 commands; `setAgentProvider()` / `getAgentProvider()` (`modelSelectionService.ts`); `getConfiguredOllamaEndpoint()`, `getConfiguredOllamaModel()`; `isPaidModelId()`; `getRuntimePolicySettings()`.
- Produces: `setUpProfile(agent: string, opts?: { useNow?: boolean; model?: ProfileModel }): Promise<{ ok: true; profile: ProfileInfo } | { ok: false; reason: string }>`; `removeProfile(agent)`; `listOwnProfiles(): Promise<ProfileInfo[]>`; `setProfileModel(agent, model: ProfileModel)`; `type ProfileModel = { kind: 'ollama'; model: string } | { kind: 'openrouter'; model: string }`; `profileModelChoices(agent): Promise<ProfileModel[]>`.

- [ ] **Step 1: Failing tests**
  - `setUpProfile('hector')` with no model given calls `hermes_profile_setup` with `{ kind: 'ollama', endpoint: <Settings endpoint>, model: <configured model> }` and switches Hector's provider to `hermes`; with `useNow: false` the provider stays as it was.
  - Zero-Cost Mode on and an OpenRouter model not ending `:free` (and not the router) → `{ ok: false, reason: 'That model is paid and Zero-Cost Mode is on.' }`, no backend call.
  - `removeProfile('hector')` calls `hermes_profile_remove` and restores the provider saved before setup.
  - Outside the desktop app → `{ ok: false, reason: NOT_DESKTOP }`.
- [ ] **Step 2: Run** `npx vitest run src/test/services/hermes/hermesProfiles.test.ts` → FAIL.
- [ ] **Step 3: Implement**; the previous provider is saved per agent under `alphonso_hermes_previous_provider_v1`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(hermes): set up and remove a profile for an agent`.

### Task 4: The user's own profiles and their warnings

**Files:**
- Modify: `src-tauri/src/hermes_profiles.rs` (`hermes_find_user_profiles() -> Vec<UserProfile>`, read-only)
- Create: `src/services/hermes/userProfiles.ts`
- Test: Rust tests module; `src/test/services/hermes/userProfiles.test.ts`

**Interfaces:**
- Produces: `UserProfile = { name, folder, apiServer: { on: bool, port?: u16 }, platformsOn: string[], toolsetsOn: string[], approvalsMode?: string, readable: bool }`; app side `findUserProfiles(): Promise<UserProfileView[]>` (adds `answering: boolean` from `/health` and `warnings: string[]`), `connectUserProfile(name, agent, key)`, `profileWarnings(p: UserProfile): string[]`, constants `OWN_MESSAGING_WARNING = 'Messages to this profile\'s own <Platform> skip Alphonso\'s approvals.'` (one per platform) and `ACTS_WITHOUT_ASKING = 'This profile can change things without asking.'`.

- [ ] **Step 1: Failing tests**
  - Rust `finds_profiles_read_only`: a temp `HERMES_HOME` with `profiles/a/config.yaml` (api_server on, port 9100, telegram on) and `profiles/b/config.yaml` broken → two entries, `b.readable == false`, files unchanged (mtime same).
  - Rust `home_from_env_else_default`: `HERMES_HOME` set → used; unset → `dirs::data_local_dir()/hermes` (no literal user path).
  - TS `profileWarnings`: telegram on → the Telegram line; `terminal` with `approvalsMode: 'smart'` → `ACTS_WITHOUT_ASKING`; `file` on → `ACTS_WITHOUT_ASKING`; only `web`,`memory` with no platforms → `[]`.
  - TS: an unreadable profile shows `"Can't read this profile's settings."` in its warnings and is not connectable.
- [ ] **Step 2: Run** both → FAIL.
- [ ] **Step 3: Implement**; `connectUserProfile` saves address and key through `saveHermesAgentEndpoint()` and records the profile name for starting (`alphonso_hermes_user_profiles_v1`: agent → { name, folder }).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(hermes): find your own Hermes profiles and warn about risky settings`.

### Task 5: Hermes runs: progress and Stop

**Files:**
- Modify: `src-tauri/src/hermes_profiles.rs` (commands `hermes_run_start`, `hermes_run_stop`, `hermes_run_answer`; events `hermes://run_event`)
- Create: `src/services/hermes/hermesRun.ts`
- Modify: `src/lib/ollama.ts` (the `hermes` branch of `generateAgentLlmResponse` uses `runHermesStep()`; chat endpoint only as fallback)
- Test: Rust tests module; `src/test/services/hermes/hermesRun.test.ts`

**Interfaces:**
- Consumes: `getHermesAgentEndpoint()`, `resolveSecureSessionId()`, `getAgentSignal()`.
- Produces:
  - Rust: `hermes_run_start({ agent, input, instructions?, sessionId? }) -> { runId }` (POST `/v1/runs`; then reads `/v1/runs/{id}/events` in a task and emits `hermes://run_event` `{ runId, event, data }`; on stream end without `run.completed`/`run.failed`/`run.cancelled` emits `{ event: 'run.lost' }`), `hermes_run_stop({ agent, runId })`, `hermes_run_answer({ agent, runId, choice: "once" | "deny" })` (any other choice refused).
  - TS: `runHermesStep(agent: string, input: string, opts: { instructions?: string; sessionId?: string; signal?: AbortSignal; onProgress?: (line: string) => void; onApproval?: (req: HermesApprovalRequest) => Promise<'once' | 'deny'> }): Promise<{ ok: true; text: string } | { ok: false; reason: string; stopped?: boolean }>`; `HermesApprovalRequest = { runId, agent, command?: string, description: string }`; `progressLine(agent, event): string | null`; `HERMES_LOST(agentName)` = "<Agent>'s Hermes profile stopped answering."; `RUNS_NOT_SUPPORTED` note.

- [ ] **Step 1: Failing tests**
  - Rust `parses_sse_events`: `"event: x\ndata: {\"event\":\"tool.started\",\"tool\":\"web_search\"}\n\n: keepalive\n\n"` → one event `tool.started`; keepalive ignored.
  - Rust `answer_choice_checked`: `"session"` and `"always"` refused.
  - TS: events `run.started`, `tool.started{tool:'web_search'}`, `message.delta{delta:'Hi '}`, `message.delta{delta:'there'}`, `run.completed` → `{ ok: true, text: 'Hi there' }`, `onProgress` called with `"Hector: searching the web"`.
  - TS: aborting the signal calls `hermes_run_stop` and resolves `{ ok: false, stopped: true, reason: STOPPED_LINE }`.
  - TS: `run.lost` → `{ ok: false, reason: "Hector's Hermes profile stopped answering." }`.
  - TS: two concurrent runs on one agent get separate run ids; aborting one stops only that `runId`.
  - TS: `/v1/runs` answering 404 → falls back to `sendHermesAgentMessage` and `onProgress(RUNS_NOT_SUPPORTED)`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**; tool names map to plain progress words in one table (`web_search` → "searching the web", `web_extract` → "reading a page", `memory` → "checking its memory", else "using <tool>"). Hermes answers and tool text pass through `redactText()` before reaching progress or output.
- [ ] **Step 4: Run** → PASS; `generateAgentLlmResponse` tests for the hermes provider still pass.
- [ ] **Step 5: Commit** `feat(hermes): run Hermes steps as runs with progress and Stop`.

### Task 6: Hermes approvals through Alphonso

**Files:**
- Modify: `src/services/joseExecutionEngineService.ts` (wire `onApproval` for a Hermes step: save `hermesApproval` on the request step, set it `waiting_approval`, resolve when answered)
- Create: `src/services/hermes/hermesApprovals.ts`
- Modify: `src/services/jose/joseTelegram.ts` (wording for a step with `hermesApproval`), `src/components/jose/JoseRequestsBoard.tsx` (Approve / Reject call `answerHermesApproval`)
- Test: `src/test/services/hermes/hermesApprovals.test.ts`, `src/test/services/jose/joseTelegram.test.ts`

**Interfaces:**
- Consumes: `runHermesStep` `onApproval`; `updateJoseStep()`; `collectJoseNotifications()`; `handleJoseButton()`.
- Produces: `waitForHermesApproval(requestId, stepId, req: HermesApprovalRequest): Promise<'once' | 'deny'>`; `answerHermesApproval(requestId, stepId, yes: boolean): Promise<{ ok: boolean; summary: string }>`; `describeHermesApproval(req): string` = `"<Agent>'s Hermes profile wants to run: <command>"` (or `"… wants to: <description>"`); `HERMES_TIMED_OUT = 'Hermes stopped waiting for your answer.'`.

- [ ] **Step 1: Failing tests**
  - An approval request makes the step `waiting_approval` with `hermesApproval` and note `describeHermesApproval(req)`; `answerHermesApproval(r, s, true)` resolves the wait with `'once'` and the run continues; `false` → `'deny'`.
  - A request whose run already ended (`run.failed` with Hermes's timeout) → `answerHermesApproval` returns `{ ok: false, summary: HERMES_TIMED_OUT }` and the step shows it.
  - A second answer → `{ ok: false, summary: 'Already done.' }`.
  - `collectJoseNotifications` for a step with `hermesApproval` sends the described line with Approve / Reject buttons; the press routes to `answerHermesApproval`.
  - Stop on the request while waiting sends `deny` then stops the run.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Approval is per use: never cached for the session.
- [ ] **Step 4: Run** → PASS; `npx vitest run src/test/services/jose` → PASS.
- [ ] **Step 5: Commit** `feat(hermes): Hermes approval requests wait on the board and Telegram`.

### Task 7: The resource manager runs profiles

**Files:**
- Modify: `src/services/resources/stepNeeds.ts`, `src/services/jose/joseQueue.ts` (Hermes with a loopback address is not cloud), `src/services/resources/ensureTools.ts`, `src/services/resources/idleStop.ts`, `src/services/resources/freeMemory.ts`, `src/components/resources/MemorySection.tsx`
- Test: `src/test/services/resources/stepNeeds.test.ts`, `ensureTools.test.ts`, `idleStop.test.ts`

**Interfaces:**
- Consumes: Task 2 `hermes_profile_start`/`stop`; Task 4 `alphonso_hermes_user_profiles_v1`; `isLoopbackHermesUrl()` (export it from `hermesAgentConnector.ts`).
- Produces: `NeededTool` gains `` `hermes:${string}` ``; `hermesToolFor(agent): string | null`; `DEFAULT_IDLE_MINUTES` gains `hermes: 30` (looked up for any `hermes:*` tool).

- [ ] **Step 1: Failing tests**
  - `toolsForStep` for an agent whose provider is Hermes at `http://127.0.0.1:9100` → `['hermes:hector', 'ollama']` when the profile thinks with Ollama; at `https://box.example` → `[]` (cloud).
  - `usesLocalModel` is true for a loopback Hermes step.
  - `ensureTools(['hermes:hector'])` with the profile not answering calls `hermes_profile_start({ agent: 'hector' })` for a profile Alphonso set up, and for a connected user profile starts it with the user's Hermes (`hermes_profile_start` with `{ agent, user: true }`); not answering within 60 s → `"Hector's Hermes profile didn't start. Open Runtime Hub to see its log."`.
  - `idleTick` stops `hermes:hector` started by Alphonso after 30 idle minutes; never one started by the user.
  - `freeThings` never stops a Hermes profile in use.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**; `hermes_profile_start` gains an optional `user: bool` that starts the user's profile with the user's Hermes Python (found next to the profiles folder, else refused with "Your Hermes install wasn't found.").
- [ ] **Step 4: Run** `npx vitest run src/test/services/resources` → PASS.
- [ ] **Step 5: Commit** `feat(hermes): the resource manager starts, counts and stops Hermes profiles`.

### Task 8: Screens

**Files:**
- Create: `src/components/hermes/HermesProfilesSection.tsx` (in `AgentProvidersSection` of `SettingsView.tsx`)
- Modify: `src/components/RuntimeManagerView.tsx` (the tool card), `src/components/jose/JosePlanMap.tsx` ("Hermes profile" tag), `src/components/ConnectorSetupPanel.tsx` (Telegram warning when a connected profile has its own Telegram)
- Test: `src/test/components/hermes/HermesProfilesSection.test.tsx`

**Interfaces:**
- Consumes: Tasks 3, 4, 7.
- Produces: test ids `hermes-setup-<agent>`, `hermes-state-<agent>`, `hermes-model-<agent>`, `hermes-remove-<agent>`, `hermes-find`, `hermes-user-<name>`, `hermes-warning-<name>`.

- [ ] **Step 1: Failing tests**: the row shows "Set up a Hermes profile for Hector"; after setup, state "Running" / "Stopped" and the model picker with `SmallModelNotice`; Remove asks first; "Find my Hermes profiles" lists a found profile with its warnings; no text matches `/gateway|daemon|toolset/i`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; `npm run lint`, `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit** `feat(hermes): Hermes profiles in Settings, Runtime Hub and the board`.

### Task 9: Desktop check and docs

**Files:**
- Create: `e2e-desktop/fixtures/hermesStandIn.mjs` (`/health`, `/v1/models`, `/v1/runs`, its events with a scripted `approval.request`, `/stop`, `/approval`; records calls), `e2e-desktop/specs/hermes.e2e.mjs`
- Modify: CLAUDE.md (rows for `src/services/hermes/`, `hermes_profiles.rs`, the port map; the resource manager and Hermes connector rows), `docs/ALPHONSO_GROUND_TRUTH.md` (§11.59), `docs/governance/DEFERRED_WORK.md` (phase 4 status), `docs/AGENT_GUIDE.md`, doc counts.

- [ ] **Step 1: Spec**: with the stand-in connected as Hector's profile, a research request shows Hermes progress on Chat's live line; the stand-in's approval request waits on the board (`jose-step-…` with the described line); Approve → stand-in recorded `choice: "once"` and the step finishes; a second request Rejected → `deny` recorded; a third Stopped → `/stop` recorded and the request `stopped`; Settings → "Find my Hermes profiles" with a seeded test `HERMES_HOME` shows the Telegram warning.
- [ ] **Step 2: Run** with CI's debug app (`ALPHONSO_E2E_APP`) → PASS.
- [ ] **Step 3: Docs and counts**: `node scripts/verify-doc-counts.mjs`, `npm run generate:dnd-map && npm run verify:dnd-map` → pass.
- [ ] **Step 4: Commit** `test(hermes): desktop check with a stand-in Hermes; docs`.
- [ ] **Step 5: Live checks by hand** (spec "Testing"): set up a profile on a test profile, connect one of the owner's profiles and see it stop after idle, a Telegram request with an approval answered on Telegram. Record results in GROUND_TRUTH §11.59.
