# Hermes gateway — design

Date: 2026-10-30. Phase 4 of the four phases after QA batch 1 (resource manager, OpenRouter and outside tools through MCP are built). Status: for the owner's approval.

## Why

Hermes Agent (Nous Research, MIT) runs standing agent "profiles", each a twin of one of Alphonso's agents with its own memory and tools. Since August 2026 Alphonso can use a profile as an agent's model (Phase 1a/1b, `hermesAgentConnector.ts`), but only through its chat endpoint, only for profiles the user installed and runs by hand (the owner uses `hermes-fleet-scripts` to start and stop them), and with no control over what the profile does with its own tools.

This phase makes Alphonso the one place Hermes is run from and reached through:

1. **Alphonso runs the profiles.** A new user can switch on a Hermes profile for an agent and Alphonso installs and runs it; a user who already runs Hermes connects their profiles and Alphonso starts and stops them (replacing the fleet scripts).
2. **Alphonso is the front door.** Work reaches a Hermes agent through Jose, with Alphonso's approvals, progress and Stop, from Chat and from Telegram.

## Decisions (owner, 2026-10-30)

| Question | Answer |
|---|---|
| Who it serves | Both: new users opt in per agent and Alphonso installs and runs the profile; users with their own Hermes connect their profiles and Alphonso starts, stops and watches them. |
| Hermes's own tool use | Asks through Alphonso: work runs as Hermes "runs" with live progress and Stop; Hermes's approval requests come to Alphonso's board and Telegram. |
| What runs without asking | Reading only (search, reading pages and files, its own memory). Commands, file changes, sends, cron jobs and handing work to sub-agents always ask. |
| How that rule is kept | Profiles Alphonso installs get reading tools only. When the Hermes agent wants to change files, run code or send, it hands that to Alphonso's own steps (Alphonso's code step, Marcus's sends), which already ask with the exact change. For the user's own profiles Alphonso forwards Hermes's requests and warns about tools that act without asking. |
| Front door | Telegram only for now. Not WhatsApp, not the phone companion. |
| How a message reaches Hermes | Through Jose, as now: a step for an agent whose provider is Hermes runs on that agent's profile. No direct "@agent" addressing. |
| What a profile thinks with | The same model that agent uses in Alphonso (the Ollama model, or an OpenRouter free model). No new account. Zero-Cost Mode still applies. |
| A user's profile with its own Telegram on | Warn, don't change. |
| Install method | A pinned Hermes version installed into its own Python folder in Runtime Hub's location, like ComfyUI and Kokoro. No remote install scripts, nothing installed system-wide. |
| Resource manager | Hermes profiles are managed by it like any other tool: started when needed, memory counted, stopped when idle (only the ones Alphonso started). Owner, 2026-10-30. |
| Profiles set up by default | None (decided 2026-08-21, `docs/HERMES_AGENT_DELEGATION_PLAN.md` §2.5). |

## Goals

- A new user gets a working Hermes profile for one agent from Settings, with no file editing, no terminal and no key to copy.
- Hermes profiles are part of the resource manager (section B): a profile is a tool (`hermes:<agent>`) that starts when a step needs it, has its memory measured and counted before a step is let in, shows in Runtime Hub's Memory section, and stops after it sits idle if Alphonso started it. Today they are treated as a cloud provider and none of this happens.
- A user who runs Hermes no longer needs the fleet scripts: the resource manager does what they do (start on demand, track last use, stop when idle).
- Every Hermes step shows progress on the board and in Chat, and Stop stops it.
- Nothing a Hermes agent does changes anything without the user saying yes, except reading.
- Telegram requests reach Hermes agents with the same approvals as everything else.

## Non-goals

- WhatsApp or the phone companion as a front door; messaging an agent by name.
- Setting up a profile for every agent at once.
- Editing or migrating the user's own profiles' config files.
- Hermes's own messaging platforms, cron, kanban or MCP servers in profiles Alphonso installs.
- macOS and Linux installs beyond what Runtime Hub already supports for Python tools (the same Python path works there; not separately verified in this phase).

## Anti-goals (failure even if it works)

- A Hermes profile that writes files, runs commands or sends messages without asking, in a profile Alphonso set up.
- A key that is shared between profiles, derived from anything predictable, or visible in a log, a screen or a file in the repo.
- Stopping a profile the user started themselves.
- A remote install script run on the user's computer.
- Telegram messages reaching a Hermes agent in a way that skips Alphonso's approvals, without the user being told.
- Any port, path, profile name, model id or toolset list written as a fixed value where it can be read or chosen.

## What exists (checked 2026-10-30)

- `src/services/connectors/hermesAgentConnector.ts`: per-agent address and key (`HERMES_<AGENT>_URL` / `_KEY` / `_SESSION_MODE` under `hermes_agents`), `/v1/models`, `/health`, `/v1/chat/completions`, circuit breaker, rate limiter, audit, session id header, loopback-only rule for Zero-Cost Mode, calls through the backend's native HTTP.
- `generateAgentLlmResponse` routes an agent whose provider is `hermes` there. `HermesAgentsSection` in `ConnectorSetupPanel.tsx` has one row per agent.
- The resource manager treats `hermes` as a cloud provider (`CLOUD` in `stepNeeds.ts`, `CLOUD_PROVIDERS` in `joseQueue.ts`): no memory counted, nothing started or stopped.
- Jose's hand-off lines (`joseHandoff.ts`: `ACTION: send …`, `ACTION: code …`) already let any step ask Marcus or Alphonso to act, and every planned step is told about them.
- Hermes 0.19.0 (installed on the dev machine) has: `/v1/runs` (start), `/v1/runs/{id}/events` (server-sent events: `run.started`, `message.delta`, `tool.started`, `tool.completed`, `approval.request`, `run.completed`, `run.failed`, `run.cancelled`), `/v1/runs/{id}/stop`, `/v1/runs/{id}/approval` (choice `once`, `session`, `always` or `deny`), `/v1/capabilities`, `/v1/toolsets`, `/health/detailed`. Its approvals cover terminal commands it judges dangerous (`approvals.mode: smart`); file writes, sends and cron jobs do not ask. Approvals time out after `approvals.timeout` (300 s by default) and fail closed. A profile is started with `python -m hermes_cli.main -p <profile> gateway run` with `HERMES_HOME` set; its API server is `platforms.api_server` in the profile's `config.yaml`.
- Hermes's toolsets that only read: `web` (web_search, web_extract), `search`, `vision`, `memory`, `session_search`, `todo`, `clarify`. The `file` toolset holds `read_file` and `write_file` together; `skills` holds `skill_manage`, which writes.

## Design

### A. Profiles

There are two kinds, shown together in one list.

**Profiles Alphonso set up ("Set up by Alphonso").** From an agent's row in Settings → Connectors → Agent Providers, "Set up a Hermes profile for <Agent>":

1. **Install Hermes once.** A new Runtime Hub tool `hermes-agent`: Hermes's source at a pinned release (tag and commit, with the archive's SHA-256 checked, the same pattern as the ComfyUI starter model and Kokoro), installed with `pip` into its own virtual environment under `tool_dir("hermes-agent")`, using `find_python()` (Hermes needs Python 3.11 or newer; check this against its `pyproject.toml` at the pinned version and refuse below it with a plain reason). Optional extras only as needed for the API server and the reading toolsets. No Node, Git or ffmpeg installs. `TOOL_META`: used by the agents whose provider is Hermes.
2. **Make the profile.** A profile folder under Runtime Hub's location (`<runtimes>/hermes-profiles/<agent>/`, used as `HERMES_HOME`), never inside the user's own `%LOCALAPPDATA%\hermes`. Alphonso writes its `config.yaml`:
   - `platforms.api_server` enabled on `127.0.0.1` with a port Alphonso picked and a key Alphonso generated. No other platform.
   - Toolsets: only the reading ones (`web`, `vision`, `memory`, `session_search`, `todo`, `clarify`), read from a list kept in one place in the code. `file` only if the pinned Hermes can switch off `write_file` and `patch` on their own (check at the pinned version); otherwise left out. No `terminal`, `code_execution`, `delegation`, `cronjob`, `kanban`, `browser`, `computer_use`, `image_gen`, `video_gen`, `homeassistant` or messaging toolsets. No MCP servers. No cron.
   - `approvals.mode` at Hermes's strictest setting and `approvals.deny: ["*"]` as a backstop, so even if a toolset that runs commands were enabled by mistake, nothing would run. Check the setting names at the pinned version.
   - The model: see section D.
   - A short persona line naming the agent (its `owns` and `never` sentences from `agentPermissionTable.ts`) and the hand-off rule: to change files, run code or send, end with Alphonso's `ACTION:` line instead (the same text as `ACTION_INSTRUCTION`).
3. **Key and port.** The key is 32 random bytes from the operating system's random source, base64url, made in the backend, saved to the keychain (`saveConnectorCredential` under `hermes_agents`, the same names Phase 1 reads), and written into the profile's config. It is never shown, logged or returned to the window. Two profiles never share a key (a test asserts it). The port is the first free one from a range kept in one place (`HERMES_PORT_RANGE`, the builder picks a range clear of the documented port map and adds it to CLAUDE.md's port map), checked free at the moment of setup and again at each start; if it is taken at start, the next free one is chosen and saved.
4. **Connect it.** The agent's Hermes address and key are filled in for the user, and the agent's provider is switched to Hermes only if the user ticks "Use it for <Agent> now" (default on).

"Remove this profile" stops it, deletes its folder and its keychain entry, and switches the agent back to its previous provider. It asks first.

**The user's own profiles ("Yours").** "Find my Hermes profiles" looks in Hermes's own profiles folder (from `HERMES_HOME` if set, else Hermes's documented default under the user's local app data; never a path written in the code). For each profile it shows the name, whether its API server is on, its port and whether it is answering. The user picks which agent it serves. Alphonso reads the profile's address from its config (read-only) and asks for the key once (or reads it from the profile's own env file only if the user says so, read-only). Nothing in the user's folder is ever written.

For each of the user's profiles Alphonso shows a warning, not a block, when:
- a messaging platform is on (Telegram, WhatsApp, Discord, Slack, …): "Messages to this profile's own Telegram skip Alphonso's approvals.";
- a toolset that acts without asking is on (`file` with writes, `terminal` with `approvals.mode` other than the strictest, `code_execution`, `delegation`, `cronjob`, `browser`, `computer_use`): "This profile can change things without asking."

### B. Starting and stopping (resource manager)

A Hermes profile becomes a tool the resource manager knows, `hermes:<agent>`:

- `stepNeeds.ts`: a step whose agent's provider is Hermes with a local address needs `hermes:<agent>` plus whatever its model needs (the Ollama model counts as it does now). It is no longer treated as cloud. A Hermes address that isn't on this computer stays cloud.
- `ensureTools()` starts a stopped profile: a "Set up by Alphonso" profile with its own Python and `HERMES_HOME`; one of the user's own profiles with the user's Hermes and that profile's folder, exactly as the fleet scripts do (`-p <profile> gateway run`). It waits up to 60 s for `/health`. A process Alphonso starts is recorded with `record_pid` so it is "Started by Alphonso".
- Idle stop: `DEFAULT_IDLE_MINUTES` gets `hermes: 30`, for every profile Alphonso started. A profile the user started is never stopped (it shows as "Started by you").
- Memory: the profile process's own memory is measured like any tool; no separate size estimate.
- Runtime Hub's Memory section lists running profiles with their idle time and Stop.
- Starting goes through the backend with no shell (`no_window()`), arguments as a list.

### C. Runs: progress, Stop and approvals

A Hermes step runs as a Hermes run instead of a chat completion:

- Start with `POST /v1/runs` (the same message the step sends today, the session id, the model). Read `/v1/runs/{id}/events` until it ends. The events stream goes through the backend, the same way Phase 1's calls do.
- Progress: `tool.started` / `tool.completed` become progress lines ("Hector: reading 3 pages") on Chat's live line and the board; `message.delta` builds the answer. The answer is the step's output as before, so reviews, hand-offs and the closing summary work unchanged.
- Stop: Jose's stop signal (`stopSignal()`) sends `POST /v1/runs/{id}/stop`; the step ends `stopped` as any other.
- **Approvals.** On `approval.request` the step waits (`waiting_approval`) with what Hermes wants to do, worded plainly ("Hector's Hermes profile wants to run: `<command>`", with its description). It shows on the board with Approve / Reject and on Telegram with buttons, exactly like other waiting steps. Approve sends `choice: "once"`, Reject sends `deny`. Alphonso never sends `session` or `always`: every use asks. Hermes's command text is already redacted by Hermes; it is shown as received and never logged with keys (run it through `redactText()` too).
- Timeouts: Alphonso sets `approvals.timeout` to `JOSE_LIMITS` normal request time (30 min) in profiles it set up. For the user's own profiles it can't; if Hermes's own timeout passes first, the run ends denied and the step fails with "Hermes stopped waiting for your answer after N minutes." (N read from the profile when it can be, else said without a number).
- A run cut off when the app closes is "interrupted" like any step; Carry on starts a new run with the same session id.
- A profile without `/v1/runs` (older Hermes) falls back to today's chat endpoint, with a note on the board that progress and Stop are not available for it.

### D. What a profile thinks with

A profile Alphonso set up uses the model that agent would use in Alphonso if its provider weren't Hermes:

- Settings shows "Hermes profile thinks with" on that agent's row, defaulting to the configured Ollama model (`getConfiguredOllamaModel()`), with the choices Alphonso already offers for that agent: an installed Ollama chat model (`isChatModel()`), or an OpenRouter free model when OpenRouter is set up.
- Ollama: the profile's model points at the Settings Ollama address (`getConfiguredOllamaEndpoint()`) through Hermes's OpenAI-compatible provider setting. OpenRouter: Hermes's OpenRouter setting with the user's key.
- Keys a profile needs (OpenRouter's) are written only into that profile's own env file in its folder, never into `config.yaml`, never into a log; the folder is in Runtime Hub's location for that user only. Changing or removing the OpenRouter key in Settings rewrites or removes it there. (Builder: confirm Hermes reads the provider key from the profile's env file at the pinned version.)
- Zero-Cost Mode: a profile set to a paid model is refused under Zero-Cost Mode, as any paid model is. OpenRouter's free models are not paid.
- Changing the choice rewrites the profile's model setting and restarts the profile if it is running and idle; if a step is using it, the change applies after that step.
- A small local model is likely to use Hermes's tools poorly; the Settings row shows `SmallModelNotice` as elsewhere.

### E. Telegram (the front door)

No new routing. A Telegram message goes to `answerOrPlan()` as today; Jose plans; a step for an agent whose provider is Hermes runs as section C. Hermes's approval requests reach Telegram through the existing Jose notifications (`collectJoseNotifications()`), with the same buttons and the same paired-chat-only rule. The new parts are the wording for a Hermes approval and that a Hermes step's progress lines are not sent to Telegram (only waiting, finished, failed, as for other steps).

The warning from section A about a profile's own Telegram is also shown once in Settings → Connectors → Telegram when any connected profile has its own Telegram on.

### F. Screens

- Settings → Connectors → Agent Providers: each agent's row gets "Set up a Hermes profile" (or, once set up, its state: installing / running / stopped / not answering, with Start, Stop, "Hermes profile thinks with", and Remove). A "Your Hermes profiles" section with "Find my Hermes profiles", each found profile's state, the agent it serves, and its warnings.
- Runtime Hub: the `hermes-agent` tool card (install, version, location), and running profiles in the Memory section.
- The board: Hermes steps show their run progress, a Hermes approval as a waiting step with Approve / Reject, and "Hermes profile" next to the agent's name on the step.
- Plain words throughout ("Hermes profile", "Set up by Alphonso", "Yours"); no "gateway", "daemon" or "toolset" on screen.

### G. Security

- All network calls to profiles go through the backend, loopback only for profiles Alphonso set up; a user's profile on another computer stays a remote, paid-unless-loopback connection as today.
- Keys: generated in the backend, kept in the keychain, written only into the profile's own config or env file, never returned to the window or logged; the existing test that no key reaches a log or export covers the new names.
- Starting a profile: a fixed program (the profile's Python or the user's Hermes Python), fixed arguments, no shell; the profile name checked against `[a-z0-9_-]{1,64}`.
- Reading the user's profile folder: read-only, inside Hermes's profiles folder only, path checked.
- Hermes's answers and tool results are untrusted text: fenced in the next agent's input like any page text (`fenced()`), and a hand-off line in a Hermes answer is treated exactly as from any other step (it asks).
- `addSecurityChecks()` already puts Sentinel before every Marcus send and after every Alphonso code step, including those a Hermes step hands off.

## Testing

- Unit: key generation (two profiles, different keys; length and alphabet), port choice (taken ports skipped, the range from one constant), the written `config.yaml` (only the API server platform; only the reading toolsets; strictest approvals with deny-all; no MCP, cron or messaging), warnings for a user's profile (each risky platform and toolset), `stepNeeds` for local vs remote Hermes, idle stop never touching a user-started profile, run events to progress lines, approval request → waiting step → `once` / `deny`, Stop → `/stop`, the older-Hermes fallback, Zero-Cost Mode refusing a paid model.
- Rust: install pinning (wrong hash refused), profile start command built with no shell, profile name check, the events stream reader, path checks on the user's profile folder.
- Desktop E2E (`e2e-desktop/specs/hermes.e2e.mjs`): with a stand-in Hermes server on this computer (like the MCP stand-in, implementing `/health`, `/v1/models`, `/v1/runs`, its events, `/stop` and `/approval`), a Hermes step shows progress, an approval request waits on the board and runs after Approve, Reject ends it, Stop stops it; Settings lists a found profile with its warning. The real install is not run in CI (size and time); it is checked by hand.
- Live checks by hand on the dev machine: (1) set up a profile for one agent on a clean test profile from Settings, confirm no file edits, distinct keys, only the reading toolsets, and that it answers a research step with the local model; (2) connect one of the owner's own profiles, start it from a step, see it stop after idle; (3) a Telegram request whose step runs on a Hermes profile, with an approval answered on Telegram (an owner profile with the terminal on, so Hermes raises one).

## Left to the builder

- The pinned Hermes release and its hash; the minimum Python version from its `pyproject.toml`.
- The exact config keys for toolsets, per-tool switches, approval mode, the model provider and the env file at the pinned version.
- `HERMES_PORT_RANGE` and its entry in the port map.
- Whether `file` can be enabled read-only.
- Names of new files and functions, following the existing patterns (`src/services/hermes/`, `src-tauri/src/hermes_profiles.rs`).
- How the events stream is passed from the backend to the app (Tauri events, as `ollama://pull_progress` does, is the pattern to follow).

## Calls I made (not asked)

- Profiles Alphonso set up live in Runtime Hub's location, not in the user's own Hermes folder, so the two kinds never mix.
- Default idle time 30 minutes for profiles Alphonso starts.
- Approvals always `once`, never `session` or `always`.
- Approval timeout 30 minutes in profiles Alphonso set up.
- Progress lines are not sent to Telegram.
- An older Hermes without runs falls back to the chat endpoint with a note.
- The real install is checked by hand, not in CI.
