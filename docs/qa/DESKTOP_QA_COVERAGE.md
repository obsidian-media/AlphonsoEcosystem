# Desktop QA coverage

The working checklist for testing the real desktop app end to end: every
page, tab, Settings section, connector and workflow, with what tests it today
and what is still open. Update a row in the same commit as the test or fix
that changes it.

- **Suite:** `e2e-desktop/` (WebdriverIO + `tauri-driver`, real built app,
  isolated test data). How to run it: `CLAUDE.md`, "Desktop E2E suite" row.
- **Started:** 2026-10-21, before tagging v2.10.0. The owner asked for every
  part of the app to go through E2E before the next release.
- **Machine:** Windows 11, i5-11400F, 24 GB RAM, RTX 2060 6 GB, Ollama
  0.40.7 with models on `D:\AgentDevWork\Apps\Ollama\Models`.
- **Lowest priority (owner, 2026-10-21):** phone pairing, CALL-E, Runway.

## The rule: what it should do, not just what it does

A feature passes only when its **result** matches what it is **supposed** to
do (owner's rule, 2026-10-21). Opening without errors, a status turning green,
or a button doing *something* is not a pass.

For every row, before testing:

1. **Intended.** Write down what the feature is supposed to do, from the
   owner, `docs/USER_MANUAL.md`, the feature's design doc, or its
   `CLAUDE.md` row. If those disagree or say nothing, ask the owner; do not
   guess. A disagreement between docs is itself a finding.
2. **Observed.** Run it in the real app and record what actually happened,
   including what the user sees and what really changed (a file written, a
   message actually delivered, a model actually answering, data actually
   saved).
3. **Verdict.** Pass only if Observed matches Intended. Close-but-different
   (wrong agent, wrong count, a template instead of a model reply, "done"
   with nothing produced, success shown after a failure) is a bug.

Things that always count as bugs:

- A silent fallback: stock text, cached data or a default shown as if it
  were the real result. A fallback must say so on screen.
- A success message, green dot or "executed" state with no real effect
  behind it.
- A status that doesn't match reality (for example "Connected" with no
  credentials).
- An error swallowed without telling the user.

Specs assert the outcome, not the presence of an element: check the reply
text came from the model, the file exists with the right content, the
message reached the test channel, the count matches the items.

Each feature's Intended / Observed / Verdict goes under **Checks** at the
end of this file.

## Owner decisions (what features are supposed to do)

Answers from the owner, 2026-10-21. These are the **Intended** for the
matching rows. Where the code or `docs/USER_MANUAL.md` says otherwise, that is
a finding.

| # | Topic | Decision |
|---|---|---|
| Q1 | Projects (Project Execution) | Real agents doing real work and producing real output, each within its own responsibility. Today it is mostly a simulated planner (`CLAUDE.md`, Agent Workshop row), so this is a gap to build, not a test to pass. Per-agent details to be asked as they come up |
| Q3 | Governance and risk review | Maria. `docs/USER_MANUAL.md` §7 says Marcus does security audits; that is wrong |
| Q4 | Result of an approved Jose research task | Both: a file in the workspace, and a report in the Research Desk. It must be actual research: real sources read, cross-checked and cited in a written synthesis, not a list of search-result links |
| Q5 | Content publishing | Approval before posting (per post or batch: open, see Q5b). No platform is set up yet; the publishing infrastructure must exist for social platforms |
| Q6 | Image and video generation | Local ComfyUI for both. Higgsfield and ElevenLabs connectors are planned (not built yet). Other built-in media integrations (SD WebUI, Fooocus, InvokeAI, AudioCraft, Runway) are to be checked too |
| Q7 | Thinking models | The user chooses whether to see a model's thinking. Built 2026-10-22 (batch 20): shown folded as "Thinking" above the answer, hidden by Settings → Ollama Runtime → "Show model thinking" (owner's choice). Verified in the real app with qwen3:0.6b |
| Q11 | Agent Performance | Real numbers only |
| Q12 | Operator | Meant for ordinary users; it became power-user-only unintentionally |
| Q13 | Simple mode | Meant for non-power users who don't want to be overwhelmed; currently too basic |
| Q14 | Default model | Bundled starter stays `llama3.2:3b` (low requirements). The owner's machine may switch after QA |
| Q15 | Which model the app picks automatically | The model the user picked last; else the starter model. Replaces `PREFERRED_MODEL = qwen2.5-coder:7b` (Bug 20) |
| Q16 | Chat and images sharing the GPU | Free Ollama's GPU memory before an image job; wait longer for the first image; show an image that finishes late (Bug 23) |
| Q2 | "Boardroom" naming | The sidebar Boardroom stays the multi-agent group chat. The goal runner (`ProjectBatchPanel` / `batchOrchestratorService`, today only a card in Operator, called "Boardroom" in `docs/USER_MANUAL.md` §7) gets its own name and a proper place, joined with the real-agents Projects work (Q1) |
| Q5b | Publishing approval | Both: per-post approval by default, plus a batch screen that shows every post in full, lets single posts be removed, then "Approve all" |
| Q8 | Dashboard | A "Today" page: what needs the user now (approvals, failures, broken connectors), what agents are doing, latest results as clickable files and reports, plus a small status line (Ollama, ComfyUI, runtimes, connectors) |
| Q9 | Agent Pairing | A visual map of which agent handed what to whom, with the per-route controls (automatic or approval, risk) inside it, in plain language |
| Q10 | Maturity | Split it: user-relevant parts (operator modes, approvals) move to where users look; the rest goes under Advanced |
| Q11b | Empty Agent Performance | Real numbers only; an empty state says what will fill it ("Run any task and its success rate appears here") |
| Q12b | Operator | A basic view on by default (what is running, start/stop, recent proof); power tools behind an "Advanced" switch |
| Q13b | Simple mode | Plain chat where agents can actually do things behind an approval prompt, plus a few big task buttons ("Research something", "Make an image", "Write a post") |
| Q17 | Boardroom Distribute | Two choices: "review only" (Marcus prepares it, nothing is sent), or post to a Slack channel after an approval prompt. Owner agreed 2026-10-22 |
| Q18 | Backups and exports | Never contain secrets (credentials, API keys, license token, signing keypair); keep keys in a password manager. Owner agreed 2026-10-22 |
| Q19 | Boardroom Conclude | Marks the thread concluded; Conclude is not offered again on it. Owner agreed 2026-10-22 |
| Q21 | Runtime Hub tools | Agents make images with ComfyUI only. Automatic1111, Fooocus, InvokeAI, AudioCraft, Open WebUI and OpenHands stay as standalone tools, and every card says who uses it and how it differs from the others (owner, 2026-10-22) |
| Q22 | Setup's image choice | Install ComfyUI, not Fooocus, with Stable Diffusion 1.5 (about 2 GB) as the starter image model (owner, 2026-10-22) |
| Q24 | Choosing the image model | There must be a place to choose it, like the chat model (owner, 2026-10-22). Settings → Runtime → ComfyUI → Image model |
| Q23 | Video and audio from chat | Say plainly it isn't available yet; plan to wire it properly (owner, 2026-10-22) |
| Q25 | Where Runtime Hub installs tools | The user is asked (before the first install, in Runtime Hub and in Setup); a suggestion is offered (the drive with the most free space); nothing is hardcoded. The owner will pick `D:\AgentDevWork\Programs` (owner, 2026-10-22) |
| Q26 | Finding a ComfyUI that is not running or in a usual place | A "Search this computer" button, on request only (owner, 2026-10-22) |
| Q27 | What Coach Mode is | Intended as a bridge to SessionGuard (github.com/Thatisshayan/sessionguard): Alphonso coaches the player during a live gambling session. It drifted (the 2026-07-23 plan forbade any SessionGuard link) into coaching how the user runs AI agents. Owner, 2026-10-22: the player is coached (1a); Alphonso connects to SessionGuard's live feed (2a); SessionGuard detects patterns and an Alphonso agent words the coaching (3c); shown in a floating window over the game (4); Coach Mode appears only when SessionGuard is installed and connected, and Alphonso works fully without it (7) |
| Q28 | Coach hard stop | Pause 60 s: a cooldown over the game that can't be dismissed early; End session: ends the session in SessionGuard and shows a summary; Continue anyway: recorded so later coaching knows a warning was overridden (owner answered "A", 2026-10-22; confirm the last part) |
| Q29 | The current agent-operations coach | Kept as its own feature, renamed and without the gambling leftovers (owner, 2026-10-22) |
| Q30 | Bridges to the owner's other apps | A "Bridges" section in Settings lists SessionGuard and ACC (Agent Command Center, github.com/Thatisshayan/ACC) with found/connected status, setup and Test; a bridge's features appear only when it is connected. The SessionGuard bridge is a new addition; ACC's bridge exists on both sides and needs an end-to-end audit (owner, 2026-10-22). Open: how Alphonso signs in to SessionGuard (its live feed needs a SessionGuard user login) |
| Q37 | Who is the Operator Dashboard for? | Its Release Preflight runs `npm run verify:desktop` (the repository's developer check), which cannot work on an installed copy, and `ollama list` (read-only) is rated "85 HIGH RISK" and needs approval. Ask the owner whether the dashboard is a developer tool to hide from users, and whether read-only commands should need approval. **Answered 2026-10-22:** developer tool, behind a Developer mode switch in Settings; read-only commands rated low and run without asking; no fixed rating (Bugs 86-89) |
| Q36 | Miya Studio's tabs | Script Studio, Scene Builder, Thumbnail Studio and Campaign Studio all show the same package view. Ask the owner: should each become its own tool, or merge into one tab? |
| Q35 | SessionGuard bridge and Coach Mode as the gambling coach | Deferred by the owner (2026-10-22): too large, and it would pull the QA pass away from Alphonso. Findings (SessionGuard's live feed sends nothing) and the open questions are in the bridges spec and `DEFERRED_WORK.md` |
| Q34 | Start button for the bridges | Yes (owner, 2026-10-22): an ACC on this computer can be started and stopped from Settings → Bridges; built in batch 14 and verified in the real app (Start → ACC answered; Stop → port free, no process left) |
| Q33 | ACC and SessionGuard in Runtime Hub? | No (owner, 2026-10-22): they are the owner's own apps, so they stay in Bridges |
| Q32 | SessionGuard sign-in | Sign in once from Alphonso (owner, 2026-10-22); full design in `docs/superpowers/specs/2026-10-22-bridges-sessionguard-acc-design.md` |
| Q31 | Cloud model choice | Claude and ChatGPT models are chosen by the user from the provider's live model list; Haiku 5.5 and gpt-6-luna are only preselected when nothing is chosen (owner, 2026-10-22) |
| Q20 | Maria when the model's reply can't be read | Fall back to her rule-based check and say so ("rule-based"), rather than fail. Owner agreed 2026-10-22 |

## Status key

| Mark | Meaning |
|---|---|
| E2E | A desktop spec checks it against the real app. Specs written before 2026-10-21 may check only that something happened; each is re-checked against the rule above |
| Visit | The smoke spec opens it and checks it renders without errors; nothing on it is clicked |
| Manual | Checked by hand in the real app; no spec yet |
| — | Not tested in the real app |
| Bug n | Open finding, listed under Findings below |

## Pages (sidebar)

| Space | Page | Today | Spec | Still to test |
|---|---|---|---|---|
| — | Chat (top-level) | E2E | `chat.e2e.mjs` | provider tabs (NVIDIA, Gemini, Hermes), model Pull box, attachments, voice button, Nova/Hector cards, offline save |
| Home | Dashboard | Visit | `smoke` | quick-launch cards, attention items, dismiss |
| Home | Session History | Visit | `smoke` | search, filter, expand |
| Work | Projects (Project Execution) | E2E | `project-execution.e2e.mjs` | Setup/Agents/Execution tabs; Bug 5 (heading count, "unknown" owner) |
| Work | Content (Content Studio) | E2E | `content.e2e.mjs`, `content-image.e2e.mjs` | video step (Runway: low priority), publish step, brief fallback label (Bug 9) |
| Work | Automation | E2E (Builder) | `workflow-builder.e2e.mjs` | Overview, Schedules, Dead Letter tabs; toggling operations |
| Work | Creative (Miya Studio) | E2E (package; the finished video since content factory phase 2a: `content-video.e2e.mjs` runs Voice, Stock clips and Music in the real app (each says what it needs when Kokoro, AudioCraft or a stock key is missing) and a real Finished video with the bundled ffmpeg: both MP4s at the voice's length, the captions file, and both videos loading in the Scene Builder's players) | `creative.e2e.mjs`, `content-video.e2e.mjs`, `content-calendar.e2e.mjs` (phase 3b: two brands' posts and a Content Studio draft show on the month, the draft is dragged to another day, the side panel moves an Instagram post and its send, then cancels both; nothing is posted), `content-publish.e2e.mjs` (phase 3a: the Posts list is made from the finished video and campaign, a time is changed, "Approve and schedule" runs Publish with one approval and hands the Instagram Reel to Marcus's runner, cancelling cancels its send; nothing is posted), `content-clips.e2e.mjs` (phase 2b: the Main moment switch and AI clip settings are saved; the AI clips step makes a real clip with the installed local video model and it plays in the Scene Builder, or says what to set up; Runtime Hub's ComfyUI card shows the video models and the card's memory) | Miya Studio's own image and video buttons; a real Kokoro voice-over, MusicGen music and stock clips with keys (each needs an install or a key the test profile does not have) |
| Research | Research Desk (Hector) | E2E | `research.e2e.mjs` | raw CSS in snippets (Bug 3), export Markdown/PDF/PowerPoint, re-synthesize, depth toggle, bookmarks |
| Boardroom | Boardroom | E2E | `boardroom.e2e.mjs` | chained mentions, Stop, Retry, Acknowledge, Confirm-to-reveal, speaker name (Bug 7) |
| System | Orchestrator | Visit | `smoke` | Command, Packets, Monitor tabs; WhatsApp status (Bug 8) |
| System | All Agents (Ecosystem Hub) | Visit | `smoke` | Overview, Queue, Skills, Workflows, Pairings, Workshop, Advanced tabs |
| System | Agent Pairing | Visit | `smoke` | everything past opening; to be redesigned as a visual map (Q9) |
| System | Maturity | Visit | `smoke` | everything past opening; to be split (Q10) |
| System | Agent Performance | Visit | `smoke` | numbers after real runs |
| System | Runtimes (Runtime Hub) | E2E (Ollama stop/start) | `runtime-hub.e2e.mjs` | install a tool, Activity tab, Modules tab, live log, autostart prefs, prerequisite install |
| System | Voice | Visit | `smoke` | Start/Stop Voice OS; "Installed" label (Bug 6) |
| System | Connectors | Visit | `smoke` | see Connectors below |
| System | Operator | Visit | `smoke` | Enable gate and the dashboard behind it |

## Shell and global controls

| Control | Today | Still to test |
|---|---|---|
| First-run Setup | E2E up to the recommendation screen (`setup-flow.e2e.mjs`) | install queue, activation sequence, Custom path (agent grid), models folder on another drive |
| Top bar: Digest, theme, shortcuts, notifications | — | each opens, closes, and does what it says |
| Coach window | E2E (`coach.e2e.mjs`) | interventions, settings toggles, history |
| Simple mode (Companion Mode) | — | agent switching, chat, switch back to Advanced |
| Keyboard shortcuts (Ctrl+J/B/R, Ctrl+P, Ctrl+?) | — | each one |
| Memory search (Ctrl+P) | — | search and open a result |
| Update banner | — | needs a newer published release; checked after v2.10.0 |
| Backend command policy | E2E (`command-policy.e2e.mjs`) | — |
| Data persistence across restart | E2E (`persistence.e2e.mjs`) | — |
| Test isolation | E2E (`isolation.e2e.mjs`) | — |

## Settings sections

| Section | Today | Still to test |
|---|---|---|
| General | — | every toggle saves and survives a restart; endpoint field |
| Appearance | — | themes, accent colour |
| Agents | — | per-agent provider rows, avatars |
| Connectors | — | see Connectors below; Agent Providers; CALL-E panels (low priority) |
| Runtime | — | |
| Memory | — | Echo timeline, graph viewer (compact and full), cleanup Preview / Clean up |
| Knowledge | — | Files view |
| Plugins | — | marketplace panel, enable/disable |
| Coach | — | master toggle, narrative toggle, snooze, per-trigger toggles, history |
| Backup | — | export, import |
| Logs | — | crash log list, Clear |

## Connectors

Each connector is tested for: the credential form saves, **Test** gives a
truthful answer with no or wrong credentials, the status dot matches, and the
policy gate blocks paid/high-risk actions as documented. A real-account test
needs the owner's account and is marked separately.

| Connector | No-credentials behaviour | Real account |
|---|---|---|
| (all 26) | Probed 2026-10-21: every Test and Validate clicked on a fresh profile; results and findings 32–37 above | — |
| ollama | — (chat specs use it) | local, available |
| telegram | — | owner has a bot token |
| whatsapp | — | — |
| youtube | unit tests (scheduled upload, thumbnail, read-back of a channel kept private) | a real upload with the owner's channel |
| meta (phase 3a) | unit tests (local Reels, Facebook schedule window, Meta's status) | a real Reel and a scheduled Facebook post with the owner's Page |
| mobile_bridge | — | low priority (phone) |
| chatgpt | — | — |
| claude | — | — |
| qwen | — | — |
| notion | — | — |
| clickup | — | — |
| sd_webui | — | — |
| comfyui_video | — | local ComfyUI available |
| runway | — | low priority |
| github | — | — |
| slack | — | — |
| discord | — | — |
| calle | — | low priority |
| generic_webhook | — | — |
| brave_search | — | — |
| runway (AI clips, content factory phase 2b) | unit tests (estimate, the monthly limit, approval per run, a timeout) | a live clip with a real key and price |
| pexels / pixabay / coverr (content factory phase 2a) | unit tests (search and download with the backend mocked; Rust tests for the hosts and the requests) | a live search and download with a real key |
| perplexity | — | no key yet |
| tavily | — | — |
| deepseek | — | — |
| nvidia_nim | — | — |
| gemini | — | — |
| hermes_agents | — | — |
| n8n (credential UI; not in `DEFAULT_CONNECTORS`) | — | — |

## Workflows across pages

| Flow | Today | Still to test |
|---|---|---|
| Chat → Jose → approval → execution | E2E for the approval states (`jose-approval.e2e.mjs`, since phase 6a: Orchestrator Command → a saved request opened on the Requests tab → its step approved on the board → done) Jose's planner (`jose-planner.e2e.mjs`: direct answer, planned research, "Plan this fresh") the plan board (`jose-board.e2e.mjs`: plan card, edit on the board, run, Never) plans that change (`jose-loops.e2e.mjs`: the live board link, waiting steps approved on the board until done, review verdicts and a revision round) a Miya Studio project as one request (`content-project.e2e.mjs`, phase 6b: Run project to the review stop, Approve in Miya Studio carries it on to Scenes, a content video from Chat opens in Miya Studio), every caller through Jose (`jose-callers.e2e.mjs`, phase 6a: a schedule's Run now runs without showing its plan and without a paid model; Boardroom's Creative brief is a one-step request) and away from the app (`jose-away.e2e.mjs`: Carry on after a restart, expiry; `jose-telegram-live.e2e.mjs`, by hand with your own bot: save in Settings, pair with /start, Approve in Telegram carries the request on — passed 2026-10-23); unit tests for step graphs, approval by effect, Settings → Approvals, review loops, help requests, model escalation, resume and paid models (2026-10-23) | what an executed packet produces (Bug 4); a plan that falls back to the simple plan; a real help request; a real paid-model call (`jose-paid-live.e2e.mjs` is written, phase 6a; it runs when a paid key and prices are given, not yet run) |
| Workflow Builder: create, add steps, save, run | E2E | schedules firing; dead-letter retry |
| Content Studio job: draft → image → publish | E2E up to image | publish (needs accounts) |
| Hector research → report → export | E2E up to report | export formats |
| Pull a new model from the app | — | the Pull box in the model picker |

## Findings

Open findings from the 2026-10-12 pass (`docs/governance/DEFERRED_WORK.md`,
2026-10-12 entry) and from this pass. "Fixed in code" means a fix merged but
nobody has seen it work in the real app yet.

| # | Finding | State |
|---|---|---|
| 1 | Chat with an Ollama the user started is refused (403) | Fixed in code (PR 305 `ollama_chat` fallback); live check pending |
| 2 | First model call right after launch sometimes fails | Fixed in code (PR 304 retry); live check pending |
| 3 | Hector snippets contain raw page CSS | Fixed in code (`strip_html_tags` tests); live check pending |
| 4 | Executed Jose packet: output never checked | Open |
| 5 | Project Execution heading counts approved gates; gates show "unknown" | Fixed: real app shows "All gates resolved. See Results for the full packet." once every gate is approved; `project-execution.e2e.mjs` checks it and no longer flakes on a re-rendered button (batch 4). Owner field fixed in PR 305 |
| 6 | Voice page says Voice OS "Installed" with only Python present | Fixed (PR 304, `voice_runtime_installed` checks the pip packages); real app: Runtime Hub reports `voice-os: installed=false` on a profile without them. The same "PATH counts as installed" rule remained for Docker tools: Bug 30 |
| 7 | Boardroom names the wrong agent as thinking | Fixed in code (PR 304); live check pending |
| 8 | Orchestrator says "WhatsApp inbound: Connected" with no credentials | Fixed (batch 4): the card says "Configured" only with the access token, the gateway drain URL and the connector on, otherwise says what is missing; it never says "Connected" (nothing checks a live connection). `orchestratorViewSmoke.test.jsx` checks both cases |
| 9 | Content Studio brief step falls back silently | Fixed: the real app shows "This brief used the built-in fallback, not a model response: <reason>" (seen in the 2026-10-21 baseline) |
| 11 | Runtime start guard is check-then-spawn | Fixed in code (`starting` set); live check pending |
| 14 | Models chosen in the Ollama app's Settings are invisible to an Ollama Alphonso starts | Fixed in code (PR 307); live check pending |
| 15 | `smoke.e2e.mjs` page list misses Agent Pairing and Maturity | Fixed (batch 3): both added and pass in the real app; `src/test/desktopSmokeCoverage.test.js` fails if the sidebar gains a page the smoke spec does not visit |
| 16 | `cargo clippy --all-targets` fails on test code in `lib.rs`, `companion_router.rs`, `connector_commands.rs` (CI runs without `--all-targets`) | Fixed (batch 3): test modules moved to the end of `lib.rs` and `companion_router.rs`, redundant `-> ()` removed; `cargo clippy --all-targets -- -D warnings` is clean |
| 17 | Settings' suggested model list (`SUGGESTED_MODELS`) names old models (`phi3.5`, `codellama`) | Open |
| 18 | A backend command that fails returns a plain string, and callers that only read `Error.message` drop it: Content Studio showed "The local model could not be reached" when the real reason was `invalid args \`model\` … expected a string` | Fixed in code (batch 1: backend rejections keep their reason); real-app re-check pending |
| 19 | Content Studio freezes the model when the job is created (`job.settings.selectedModel`). A job created before a model is chosen sends no model, so every model step fails for that job | Fixed in code (batch 1: model read when the step runs); real-app re-check pending |
| 20 | The app picks `qwen2.5-coder:7b` (a 5.1 GB coding model, `PREFERRED_MODEL`) as the chat default whenever it is installed, ahead of Setup's starter `llama3.2:3b` | Fixed in code (batch 1: `PREFERRED_MODEL` is the starter, test-checked against `STARTER_MODEL_TAG`) |
| 21 | On a fresh profile with a user-started Ollama, choosing a model takes about 20 s (the window's request fails, then the backend path is used) | Open; measure |
| 22 | Harness: the first spec can start before `tauri-driver` is listening ("Unable to connect to 127.0.0.1:4455") | Fixed (batch 1: `wdio.conf.mjs` waits for the port and for the old driver to exit) |
| 23 | The first ComfyUI image took 445 s while Ollama held 4.2 GB of the 6 GB GPU; the app gave up and marked the image failed, and the picture that finished later is not picked up | Fixed in code (batch 2): every ComfyUI image first asks Ollama to unload its models (`ollama_unload_models`, `freeOllamaGpuMemory()`), the wait is 15 min (`COMFYUI_IMAGE_TIMEOUT_MS`), and Content Studio keeps the ComfyUI job id so retrying the image step picks up a late image (`checkComfyUiImage`). Real-app check passed for the GPU hand-off (see Checks); the late-image pickup is covered by unit tests only |
| 25 | Nova, Sentinel, Echo (memory and file watcher), Maria, Hector, Miya (in Jose) and the goal runner asked for the hardcoded `PREFERRED_MODEL` (`qwen2.5-coder:7b`) instead of the user's model; Nova, Sentinel and the Echo file watcher also used the default endpoint. On a fresh install (starter model only) their AI step failed and they silently used their rule-based fallback. Their unit tests never mocked the model call, so this was never caught | Fixed in code (batch 1: all use `getConfiguredOllamaModel()`/`getConfiguredOllamaEndpoint()`; Nova and Sentinel tests now check the call) |
| 26 | Project Execution's audit step is Marcus (`MarcusAuditPanel`, `marcusAuditService.js`); per the owner, governance and risk review is Maria's (Q3) | Open; fix with the Projects rebuild (Q1) |
| 24 | Chat's first reply on a cold model did not arrive within the spec's 150 s; passes in 14 s once the model is loaded | Cause found: on the owner's machine the models live on D:, an external USB hard drive (WD My Passport, ~68 MB/s); cold loads took 1 min 24 s to 2 min 30 s (Ollama log). Not an app bug. Specs now load the model first (`warmSelectedModel()` in `helpers.mjs`). App follow-up still open: say "loading the model" during a long first call instead of looking stuck |
| 27 | Each Content Studio job stores its generated image inside `localStorage` (`alphonso_content_catalyst_jobs_v1` went from 7 KB to 620 KB after one job). WebView storage is about 5 MB, so a handful of jobs could fill it (the 2026-10-12 "job disappears" bug class) | Open; measure how many jobs fit, then store images as files |
| 30 | Runtime Hub reported n8n, ChromaDB and OpenHands as installed whenever Docker was on PATH (Docker was not even running, no image pulled), and their Install button did nothing but report success | Fixed (batch 4): Install runs `docker pull <image>` and checks the image is there; installed means `docker image inspect <image>` succeeds; 1 Rust test. Real-app install not run yet (needs Docker running) |
| 31 | Runtime Hub shows a ComfyUI installed outside Alphonso as not installed (it counted only Alphonso's own copy), offering a second copy; Settings searched a few fixed folders from one developer's machine; Launch looked for Python only in `<folder>\.venv`, so other layouts fell back to a bare `python` without ComfyUI's packages; Setup would install a second ComfyUI beside a working one | Fixed (batch 11): a backend finder (`comfyui_find_installs`) lists installs that are running, chosen in Settings, Alphonso's own, or in usual places, with each one's Python (its `.venv`/`venv`, a `venv` beside it, or `python_embeded`), and nothing machine-specific; Settings → Runtime → ComfyUI has a ComfyUI install picker; Runtime Hub's card says "Using your ComfyUI: <folder>", Start launches it, and installing a separate copy is the secondary option; Setup counts an existing ComfyUI that has a model and a Python |
| 32 | **Credentials saved in the app are ignored by the older outbound connector paths.** `connectorOutbound.js` blocks WhatsApp, ChatGPT, Claude, Qwen, Notion, ClickUp, YouTube, GitHub and Slack sends unless the key is a process environment variable (`check_env_vars_presence`), with messages like "API key missing — configure OPENAI_API_KEY in settings"; the Rust commands behind them (`connector_github_action`, the ChatGPT command, …) also read only `std::env::var`. Keys saved in Settings live in the OS keychain (since 2026-07-25), so these paths never see them. Callers: ConnectorSetupPanel's own send tests, `marcusPublishService.ts` (WhatsApp/Notion/ClickUp/YouTube), `providerAdapterService.js` (ChatGPT/Claude/Qwen), `notionSyncService.js`, `packetExecutionService.ts` | Fixed in code (batch 5): `secretPresence()` in `connectorOutbound.js` counts a key saved in Settings or set in the environment; saved keys are passed to the backend, and `secret_or_env()` (`utils.rs`) makes `connector_github_action`, `connector_slack_send`, `connector_send_whatsapp`, `connector_send_notion`, `connector_send_clickup`, `connector_send_qwen`, `connector_upload_youtube` and `search_brave_sources` use them, falling back to the environment. Tests: Rust `secret_or_env…`; `clickupConnector.test.js` "uses a key saved in Settings when the environment has none" (fails on the old code). Not changed: Meta publishing (no credential fields in Settings, so environment only) and Runway resume (lowest priority) |
| 33 | Health Monitor's **Validate** checks only process environment variables (so a key saved in Settings shows "Missing"), and answers "No credential validation required" for GitHub, Slack, Discord, Brave, Perplexity, Tavily, DeepSeek, n8n and others; **Test** for Qwen, NVIDIA NIM and Gemini only checks a key is present and then shows "verified" / "TEST OK" without calling the service | Fixed (batch 6): results carry `checked: live|key_only`; the card says "Live check passed" only for live checks and shows each key as saved / environment only / missing; NVIDIA and Gemini get live checks; Ollama and ComfyUI are tested through the backend; Validate counts saved and environment keys. Real app: Ollama and ComfyUI "Live check passed" |
| 34 | Health Monitor shows internal text to users: "Public deploy note: this app auto-deploys from GitHub main to Railway…", and ChatGPT/Claude as "PLACEHOLDER … not part of the active cloud lane" although both connectors work | Fixed (batch 6): note removed; the label reads "Not set up" with a hint to add the key. Real app: neither text is shown |
| 35 | WhatsApp's listed required fields are `WHATSAPP_PROVIDER` and `WHATSAPP_ALLOWED_NUMBERS` ("Cloud API or Twilio"); the real setup needs the access token, phone number id and gateway drain URL | Fixed (batch 6): requires the access token and phone number id; Twilio removed from the registry, the UI and the Rust commands (owner: Cloud API only) |
| 36 | The phone-pairing panel is rendered twice in Settings (Agents → "Agent Companions" and Runtime → "Remote Access"); the Mobile Bridge hint says "Pair from Settings → Companion", which does not exist | Fixed (batch 6): shown only in Settings → Runtime → Remote Access (owner); the hint points there |
| 37 | Test isolation: a fresh desktop test profile showed GitHub and Slack tokens as saved (neither is in the environment), so the test profile can read credentials saved by the real app | Fixed (batch 6). Cause: not the keychain (that is isolated). The repo `.env` holds `GITHUB_TOKEN` and `SLACK_BOT_TOKEN`; the app loaded it with `dotenvy` at startup in every build, and the WebdriverIO CLI loads it too (`import "dotenv/config"`) and passed its whole environment to the test app, together with the user-level NVIDIA/Gemini/DashScope keys. Now: `.env` loads only in plain debug runs (`should_load_dotenv`, 1 Rust test), `testAppEnv()` drops secret-named variables, and `isolation.e2e.mjs` fails on a leak (passes in the real app) |
| 38 | Dashboard says "Start Ollama — Local AI is not running" for every Ollama state except connected, including while the first check is still running (seen at 1 s, gone at 21 s with Ollama running), and sends the user to Settings although Ollama is started from Runtimes. Creative shows "Model not connected" during the same check | Fixed (batch 7): "Start Ollama" only for not_running/disconnected and it opens Runtimes; "Choose a model" for no_models/model_missing; "Ollama is not answering" for cors/timeout/error; nothing while checking. Creative says "checking…" while checking. Real app (batch 7 build): confirmed. Guarded by `MissionControlHome.test.tsx` (3 tests) |
| 39 | Automation lists 16 registered operations, all "Active", on a fresh install; "Active" means enabled (available to Jose), nothing runs until started | Fixed (batch 7): the button reads "Enabled". Real app (batch 7 build): confirmed. |
| 40 | Dead Letter says "Everything is running smoothly" when nothing has run | Fixed (batch 7): "Nothing has failed. Failed tasks land here so you can retry them." Real app (batch 7 build): confirmed. |
| 41 | Agent titles contradict the agents' roles: Projects and Agent Pairing show Maria as "Product Manager", Marcus as "Audit Manager / Quality Gatekeeper" (owner: Maria does governance and risk, Marcus distribution), Jose as "Master Orchestrator / Hermes", and Echo, Sentinel, Nova as just "Agent" | Fixed (batch 7): Maria "Governance & Risk Lead" (role `governance`), Marcus "Distribution & Release Manager" (role `distribution`), Jose "Master Orchestrator"; Echo, Sentinel and Nova get roles `memory`, `security`, `opportunity`; `docs/MARCUS_SKILLS.md` corrected. Real app (batch 7 build): confirmed. |
| 42 | Projects and All Agents → Workshop show "VERIFICATION healthy" on a fresh install where nothing has been verified | Fixed (batch 7): "not checked yet" until something has been verified; "healthy" needs a verified trace. Real app (batch 7 build): confirmed. Guarded by `systemHealthService.test.js` (2 tests) |
| 44 | Boardroom → Mission Room labels Nova "DESIGN" with a "frontend design" role (Nova is the opportunity analyst), and mentions "Kite" ("Commander: Kite", "Kite review") | Nova fixed (batch 7: "Opportunity analysis…", lane `opportunity`). "Hermes" there means an external Hermes Agent worker, which is legitimate. "Kite" was a planned external Hermes agent that never existed (owner); removed from the brief and the board subtitle |
| 45 | Boardroom still has a "Boardroom Legacy" tab (the old session UI) next to the group chat (owner Q2: Boardroom is the group chat). It is the only place with Conclude (Maria's audit and risk score, saved to memory), Distribute (via Marcus) and Creative brief (to Miya); its agent "discussion" is mostly scripted | Fixed (batch 8, owner approved): Conclude, Distribute and Creative brief are thread actions in the group chat; the tab is removed and its source archived. Not carried over (untrue): the random "Maria risk score" and the "sent via Marcus" toast when nothing was sent. `migrateLegacySessions()` imported old sessions only on its first run; it now imports every session not yet imported |
| 46 | Runtimes says "All tools auto-start with Alphonso. Install once, run forever." Auto-start is a per-tool setting | Fixed (batch 7): "Install local AI tools once. Turn on Auto-start on a tool to have it start with Alphonso." Real app (batch 7 build): confirmed. |
| 47 | Voice says the Voice OS service is "Not listening" while Runtime Hub says Voice OS is running (a Voice OS started elsewhere answers on port 8766) | Fixed (batch 7): the Voice page also uses Runtime Hub's port check and says "Listening at … (started outside this window)". Real app (batch 7 build): confirmed. Guarded by `voiceView.test.jsx` |
| 48 | Agent Performance's empty state says only "No performance data yet" (owner Q11b: say what fills it) | Fixed (batch 7): "Run a command, a workflow or a research task, and each agent's success rate and speed appear here." Real app (batch 7 build): confirmed. |
| 49 | Maria's governance review reported "Maria audit failed to parse — manual review required" as her model review (found running Boardroom Conclude in the real app). The model's reply was not valid JSON; the parse-failure placeholder passed the "summary is long enough" check, so the rule-based audit never ran, and the result was labelled as a model review | Fixed (batch 8): Maria asks the model for JSON (`format: 'json'`, passed through `generateAgentLlmResponse` to Ollama); an unreadable reply now falls through to her rule-based audit; Boardroom says which one produced the verdict ("Maria's rule-based check" / badge "(rule-based)") |
| 92 | CodeQL on PR 332: the content factory's answer checks looked up the task type as a plain object key, so a type such as `constructor` found JavaScript's built-in method and the answer passed; project and brand ids used `Math.random()` | Fixed: own-key lookups (`hasOwnKey`) and ids from `crypto.getRandomValues` (`secureId`), both available in macOS 10.15's web view, unlike `Object.hasOwn` and `randomUUID` |
| 91 | Miya Studio's Script, Scene, Thumbnail and Campaign tabs showed one identical view (the owner: "that is meant to be one of the main features") | Built (content factory phase 1, owner-approved design 2026-10-22): each tab has its own tool, run through Jose (Hector and Nova research, Miya's script, a Nova and Maria review, scene pictures, 3 finished thumbnails, the campaign, Maria's quality gate), with brands, a folder per brand and project, versions, out-of-date marks, live progress and approvals. Unit-tested; the real-app run is listed under Task 12 of the plan |
| 90 | Batch 22's fix let a client connected to Voice OS choose the Ollama address Voice OS sends requests to (server-side request forgery, flagged by CodeQL on PR 329; only the app holds the connection token, so the practical risk was small) | Fixed (batch 23): the address comes only from `voice_start` (Settings), checked to be http(s) with a host; the connection can set the model only. Rust tests for the checks added; they could not run locally (Windows Application Control), CI runs them |
| 89 | Release Preflight asked for approval twice (once for itself, again for the command it runs), and "runtime repair checks" (which only check whether Ollama answers and its process runs) asked as high risk | Fixed (batch 23): Release Preflight asks once, with the command's own rating; the repair checks run without asking |
| 88 | Every command, read-only or not, was sent as "high risk" and the approval window turned "high" into a fixed score of 85 ("medium" 55, "low" 20), so `ollama list` showed "85 HIGH RISK" | Fixed (batch 23): `assessCommandRisk()` in `commandApprovalService.ts` rates a command from what it does (only reads → low, runs without asking; changes files/packages/models or contacts the internet → medium; runs project code, deletes, or is an unknown program → high) and gives the reasons, which the window lists under "Why this rating". A number appears only when one was measured (Maria's risk score). `policy_gate.rs` still decides what may run at all |
| 87 | AI-planned workspace commands were always shown as high risk with no reason | Fixed (batch 23): the same rating and reasons |
| 86 | The Operator Dashboard (a developer tool: the repository's release checks, raw commands, proofs) was in every user's sidebar and on the Home page | Fixed (batch 23, owner's decision): shown only with Settings → Desktop & UI → Developer mode (the old Operator Mode setting, `alphonso_operator_mode_v1`, off by default). Not yet checked in a local build (Windows Application Control blocked the build); the desktop E2E smoke spec turns developer mode on and opens the page |
| 85 | A build made on a developer's PC copied `voice/backend/venv` (about 355 MB, git-ignored but on disk), the tests and `__pycache__` into the installer, because `tauri.conf.json` bundled the whole `voice/backend` folder | Fixed (batch 22): only `voice/backend/*.py` and `requirements.txt` are bundled. CI builds from a clean checkout, so published installers were very likely unaffected. Not yet checked in a local build (Windows Application Control blocked the build script) |
| 84 | The voice hook never showed the agent Voice OS picked (it read `name`, Voice OS sends `value`), and each new answer was appended to the previous ones | Fixed (batch 22) |
| 83 | Voice OS used a fixed model (`llama3.2`, which a fresh install with `llama3.2:3b` may not have), a fixed Ollama address, a fixed speech-recognition model and English only, ignoring the user's choices | Fixed (batch 22): the app sends a `config` message with the model when it connects, and (batch 23, Bug 90) the Ollama address is passed when Voice OS starts; `VOICE_STT_MODEL` / `VOICE_STT_LANGUAGE` set speech recognition (defaults `tiny.en`, English) |
| 82 | Local Voice OS never answered: the stream was cut every 1.5 s and each piece answered on its own (one sentence became four half-questions), and each new piece, silence included, cancelled the previous answer, so the silence after a question cancelled its answer | Fixed (batch 22): `UtteranceCollector` (in `vad.py`) collects speech until a 0.7 s pause (15 s at most), and only finished utterances start an answer. Verified against the owner's Voice OS install: one spoken sentence → one transcript → "The answer is 5." → spoken WAV back. The app's Voice page not yet checked (build blocked) |
| 81 | A thinking model's reasoning was dropped (Chat ignored Ollama's `message.thinking`), and with older Ollama versions it would have appeared inside the answer as `<think>...</think>`; there was no way to see or hide it (Q7) | Fixed (batch 20): kept apart from the answer through the stream and the backend route (`ollama_chat` now returns `thinking`), shown folded, hidden by a setting. Verified in the real app |
| 80 | The Operator Dashboard's section headers didn't say whether a section was open or collapsed (no `aria-expanded`) | Fixed (batch 19). The dashboard was tested in the real app the same day: Verify Ollama, Verify Audit Chain (2/2), Check PID, Enable Notifications and Create Restore Point work; Run Verified Command and Release Preflight ask for approval first |
| 79 | Simple mode's quick starts that are the start of a sentence ("Find sources on...", "Research the latest trends in...") were sent unfinished, so the agent had to ask what was meant | Fixed (batch 18): a quick start ending in "..." goes into the message box to finish; complete ones are still sent. Verified in the real app. The rest of Simple mode was tested in the real app the same day and works: replies from Alphonso (8 s) and Hector (4 s), each agent keeps its own conversation, Settings opens |
| 78 | `generateAgentLlmResponse()` used `localhost:11434` whenever a caller passed no address, so Companion Mode (Simple mode) and any other caller without one ignored an Ollama set elsewhere in Settings | Fixed (batch 17): it falls back to the address in Settings. Unit-tested; not checked in the real app (Windows Application Control blocked the new build) |
| 77 | The Voice OS watchdog started at every launch and treated "not started" as "crashed": everyone who doesn't use voice got "Voice OS offline — restarting..." five times in the first minutes while it tried to start Python, and a deliberate Stop would also have been undone | Fixed (batch 16): it restarts Voice OS only after seeing it running, never after Stop |
| 76 | Miya Studio asked Chat's model, ignoring Miya's own choice in Settings → Agent Providers | Fixed (batch 16): `generateAgentLlmResponse('miya', …)` |
| 75 | Miya's brand kit was saved but never used (not in the prompt), never loaded back (empty on every visit), and Save gave no sign it worked | Fixed (batch 16): in the prompt, loaded back, "Saved" shown |
| 74 | Miya's package showed raw JSON (`{ "text": … }`, `[ { "scene_id": 1, … } ]`) whenever the model returned nested values, plus the model's whole reply as one more panel; the field labels weren't linked to their inputs | Fixed (batch 16): readable text (bullets for lists), the full reply folded away, labels linked |
| 73 | Chat's model picker said "Ollama offline" ("start it to switch models") for an Ollama the user started, so no model could be chosen, while chat itself worked through the backend; pulling a model from the picker (and `pullOllamaModel()`) also goes from the window only | Model list fixed (batch 15): the picker uses `fetchOllamaModels()`, which falls back to the backend. Verified in the real app: all 5 local models listed. Pulling a model fixed in batch 21: `pullOllamaModel()` goes through the backend's new `ollama_pull_model` (progress as `ollama://pull_progress` events) in the desktop app, used by the picker and Setup; verified in the real app ("pulling manifest" → "Download complete") |
| 72 | A banner says "It's been 999 days since the last code generation" on a profile that never generated code (999 stands for "never") | Fixed (batch 17): no banner when code was never generated. Verified in the real app |
| 71 | The sidebar's Sentinel quick scan scans empty text (`scanForThreats('', {})`), so it always reports all clear | Fixed (batch 17): `scanRecentActivity(7)` scans the last week's receipts and activity, and the panel says how much it scanned, or that there was nothing to scan. Verified in the real app: "No threats found in the last 7 days of agent activity (11 items)" |
| 70 | Hector's news feeds never loaded in the desktop app: they were fetched from the window, which the feed sites refuse and the CSP doesn't allow, so the RSS fallback and the morning briefing always came back empty | Fixed (batch 15): fetched through the backend (`fetch_rss_feed`). Verified in the real app: real headlines |
| 69 | A failed Jose step was reported as "No agent report received yet" under "Jose … is waiting for agent reports", so failures looked like pending work | Fixed (batch 15): "N of M assignment(s) failed", and the step shows "Failed: <reason>" |
| 68 | A request no specialist agent matched ("Write a two-sentence note…") produced nothing in Chat, schedules or the phone app: Jose returned "completed orchestration review" without asking any model, and the card said "1 executed" | Fixed (batch 15): Jose answers it with his model, or says nothing was produced. Verified in the real app in Chat and as a schedule: the note was written |
| 67 | Scheduled tasks ran nothing: a due command only showed "Executing: …", Run now sent an event nothing listened for, four of the five built-in jobs (Nova, Sentinel, Echo, Maria) called functions that don't exist (the error was swallowed), `*/n` times gave an invalid date, the list mixed what to run with how often, and no result was kept | Fixed (batch 15): commands run like a typed one (Approval Mode applies), built-in jobs call the real agents, a proper time calculator, separate What / How often, and each card shows its last result. Verified in the real app: Run now for a command and all five jobs, and a schedule left to its own timer (ran within the minute, with a notification) |
| 66 | ACC accepts a packet of any made-up kind (e.g. "nonsense") and records it, instead of refusing kinds outside its own list | **ACC's side** (`github.com/Thatisshayan/ACC`), not changed here; reported to the owner |
| 65 | The ACC box in Settings (under Backup) saved the address and token but never turned the bridge on, so every send stopped with "not configured". It also called the token "optional" (ACC refuses every request without it) | Fixed (batch 14): Settings → Bridges, with an On switch and a required token. Verified in the real app against a running ACC |
| 64 | Alphonso's backend ACC commands read only environment variables, so a bridge set up in Settings failed there and only worked through the window fallback. "Configured" also only meant the fields weren't empty | Fixed (batch 14): the backend uses the saved Settings first, and Test asks ACC itself. Verified in the real app against a running ACC: wrong token, right token, sending (ACC recorded it), and a wrong address each gave the right message; ACC accepted all five packet kinds |
| 63 | Claude and ChatGPT defaults: `claude-3-haiku-20240307` was retired on 2026-04-20 and `claude-3-5-sonnet-latest` (backend) on 2025-10-28, so every Claude call failed; `gpt-4o-mini` and `gpt-4.1-mini` are deprecated (removal 2027-01-14). No way to choose a model except an environment variable | Fixed (batch 13): defaults `claude-haiku-5-5` and `gpt-6-luna` (OpenAI's named replacement); a Model dropdown in Connectors filled from each provider's live model list (owner Q31). Not tested against the real APIs: no keys yet |
| 62 | ComfyUI's address was fixed at `127.0.0.1:8188` in six places (Jose x3, Health Monitor x2, connector registry); the code read a saved address but nothing could set it | Fixed (batch 13): one `comfyUiEndpoint.js`, a "ComfyUI address" field in Settings → Runtime → ComfyUI, used everywhere |
| 61 | Coach's message rewriting used a fixed `llama3.2:3b` and the default Ollama address, ignoring the user's choices | Fixed (batch 13): it uses the model and address chosen in Settings |
| 60 | Runtime Hub installs every tool under `%APPDATA%` on C:, with no choice of drive; ComfyUI alone is about 8 GB plus pip's download cache (also on C:). The owner's C: had 13 GB free | Fixed (batch 12): Runtime Hub and Setup ask where to install before the first install, suggesting the drive with the most free space; tools go in `<chosen>\Alphonso-runtimes`, pip's cache beside them; tools installed in the old place keep working; Runtime Hub shows "Tools install to: … · N GB free · Change…"; Setup's disk check measures the chosen drive |
| 59 | Runtime Hub used the first `python` on the PATH whatever its version. On the owner's machine that was 3.9, so every Python tool install failed (no PyTorch for 3.9), although 3.10 to 3.14 were installed. Found by a real ComfyUI install from Runtime Hub | Fixed (batch 11): `find_python()` collects the PATH names, the Windows `py` launcher's versions and the usual folders, and picks 3.12, then 3.13, 3.11, 3.10, 3.14 last; nothing older than 3.10 |
| 58 | No way to choose the image model: the image generator read a saved choice (`alphonso_comfyui_checkpoint_v1`) that nothing in the app could set | Fixed (batch 10): Settings → Runtime → ComfyUI has an Image model list read from ComfyUI itself, with Automatic (the starter model when present), and says when ComfyUI isn't running, has no models, or no longer has the chosen one |
| 57 | When Jose stopped before doing anything ("ComfyUI is not running", video not available), chat dropped his reason and said "Jose processed the command." | Fixed (batch 10): chat shows Jose's reason, with the Runtime Hub button when a tool needs starting. Found in the real app |
| 56 | Setup offers "Chat + Images" by installing Fooocus (15 GB), which nothing in the app uses; and Runtime Hub's ComfyUI install has no image model and gets CPU-only PyTorch on Windows, so swapping it in would not work either | Fixed (batch 11): ComfyUI's install picks the PyTorch build that matches the NVIDIA driver (CPU build with a "slow" note otherwise) and downloads the SD 1.5 starter model (checked by size and SHA-256) when none is present; Setup's "Chat + Images", "Full Power" and Miya's tile now install ComfyUI (about 8 GB) instead of Fooocus (15 GB). A full install run in the real app is still to do (it downloads several GB) |
| 55 | Jose's creative router: images went to Automatic1111's address when Fooocus or InvokeAI was the running tool (they are not API-compatible, so it failed); video and audio found a tool (one, `moneyprinter`, doesn't exist; Whisper transcribes, it doesn't make audio) then did nothing; and "short", "track", "voice", "sound" made ordinary requests ("create a short summary", "make a tracker") into video or audio jobs that Jose refused | Fixed (batch 10): images go to ComfyUI only, with "ComfyUI is not running" when it isn't; video and audio say they aren't available from chat yet and nothing starts; the trigger words are narrowed |
| 54 | Runtime Hub cards said nothing about which tools the agents use; "Open UI" was shown for background services with no page (Ollama, ChromaDB, MCP Server) | Fixed (batch 10): each card says who uses it (or "Standalone") and how it differs; Open is shown only for tools with a web page |
| 53 | Five links did nothing when clicked in the desktop window (bare `target="_blank"`): Runtime Hub's Open UI, docs and repo links, Settings' Composio sign-up link, and the result card's link | Fixed (batch 10): they open through the backend (`openExternalUrl`) |
| 51 | Settings → Backup: the backup copied a fixed list of 19 storage keys; one (`alphonso_settings_v1`) is never written, so a backup had no app settings, and it skipped about 160 of the app's 184 keys (Boardroom threads, Coach, agent model choices, Hector reports, schedules). It also called a backend command, `kv_list_keys`, that did not exist, so the stored records were silently left out while the page said "includes ... SQLite records". Workspace Export, on the same page, wrote every key including the plugin-signing private key | Fixed (batch 9): both exports write every app key except secrets (credentials, API key, license token, signing keypair) and strip secret-named fields; import and restore never write a secret key; `kv_list_keys` added; the page says what a backup holds. Found by exporting a backup in the real app: the file was 118 bytes |
| 50 | Settings → Coach: the engine, narrative and per-trigger toggles were icon-only buttons with no name and no on/off state, so a screen reader announced only "button" and could not say whether a trigger was on | Fixed (batch 9): each is a named `role="switch"` with `aria-checked`, like the General toggles |
| 29 | `content.e2e.mjs` (and on 2026-10-21 again `content-image.e2e.mjs`) timed out once in a full suite run (after `content-image`) although every model call took under 4 s and every image about 4 s; it then passed 3 times alone and twice paired with `content-image`; the image spec passed twice more in full-suite order | Intermittent, not reproduced in 9 runs; both Content specs now report the job's status, last log lines and screen text when it times out |
| 28 | Content Studio accepted any JSON reply as a model-written draft: a reply with no hook or caption showed as a finished draft with "—" and no notice; and `llama3.2:3b` often failed the brief's JSON | Fixed in code: drafts need a hook and a caption or they are labelled as the template with the reason; brief and draft ask Ollama for JSON (`format: "json"`, new optional argument on `ollama_generate`, 1 Rust test); real-app re-check pending |

## Checks

One block per feature as it is tested: **Intended** (with its source),
**Observed** (real app, date, build), **Verdict**, and the spec that now
guards it.

### Runtime Hub → ComfyUI — a new user's install (batch 11, 2026-10-22, debug build)
- **Intended:** Install ends with a ComfyUI that makes an image on the user's GPU.
- **Checked:** a real install from Runtime Hub on an isolated test profile (install folder and pip cache moved to D:, since C: had 13 GB free).
- **Result:** first run failed after a minute (Bug 59: Python 3.9 picked). After the fix it installed in 16 minutes: Python 3.12.10, PyTorch 2.14.1+cu130 with CUDA available on the RTX 2060, and the SD 1.5 starter model downloaded and verified (2,132,696,762 bytes, SHA-256). Started, it served ComfyUI 0.42.0 and made a 512x512 image of a red apple in 6 seconds.
- **Not verified:** started from Runtime Hub inside the test app, the first start did not answer within 9 minutes. Started the same way from outside (hidden, output discarded) it answered in 15 seconds (a warm start); the manual first start took about 4 minutes. Watch the first start on a fresh install.

### Settings → Backup — export writes a file (batch 9, 2026-10-21, debug build)
- **Intended:** Export Backup saves a file you can restore the whole app from, and nothing secret.
- **Checked:** clicked Export in the real app; the file `alphonso-backup-<date>.json` landed in Downloads (browser-style downloads work in the desktop window, so Hector, chat and diagnostics exports save the same way).
- **Result before the fix:** 118 bytes; no settings and no stored records (Bug 51).

### Settings — survive an app restart (batch 9, 2026-10-21, debug build)
- **Intended:** a setting you change is still set after you close and reopen the app.
- **Checked:** changed all nine General switches, two Coach toggles and the theme, then relaunched the real app.
- **Result:** the nine General switches survived. Coach toggles and the theme did not, but neither did an unrelated test value, so the cause is the test driver: every relaunch gets a fresh WebView profile, which wipes browser storage. General survives because the backend also saves it.
- **Not verified:** Coach, Appearance and other settings stored only in the browser. On a real install the WebView profile is kept, so they should persist. That needs a manual check (change Coach and theme, quit, reopen), or a harness that relaunches with the same profile.

### Connectors — backend uses a key passed from Settings (fix batch 5, 2026-10-21, debug build)
- **Intended:** a key saved in Settings is the one connector calls use; an environment variable is only a fallback (QA Bug 32).
- **Observed:** in the real app, `search_brave_sources` with no key says "Brave Search API key is not set: add it in Settings → Connectors"; with a dummy key passed in, the request reaches Brave and Brave answers HTTP 422. Before the fix the command read only `BRAVE_SEARCH_API_KEY` from the environment.
- **Verdict:** Pass for the backend half. The app half (saved key counted and passed on) is covered by unit tests; a real send with a real account is still to do.

### Content Studio — image gets the GPU (fix batch 2, 2026-10-21, debug build)
- **Intended:** before an image job, Ollama gives up its GPU memory so the image is fast (owner, Q16).
- **Observed:** with `qwen2.5-coder:7b` pre-loaded in Ollama, `content-image.e2e.mjs` ran a job: brief and draft from `llama3.2:3b` (2–3 s each), then the app called `/api/ps` and unloaded the model (`keep_alive: 0`, 9 ms), and ComfyUI made the image in 4.4 s. Afterwards `/api/ps` listed no loaded model. Before the fix the first image took 445 s.
- **Verdict:** Pass. **Guarded by:** `connectorImageGenerators.desktop.test.js` — "frees Ollama GPU memory before queueing the image"; `content-image.e2e.mjs`.

### Page sweep — 2026-10-21 (debug build of batch 6)
- **What ran:** every sidebar page, every tab on it (40 tabs) and all 11 Settings sections were opened in the real app; the screen text, app errors and crash markers were recorded.
- **Result:** no crash and no app error anywhere. The screen text was then read against the owner's decisions and the code; findings 38–48 above. Settings → Coach looked wrong in the first pass but was the probe clicking the sidebar's Coach button; re-checked and fine.

### After fix batch 1 — 2026-10-21, branch `qa/fix-batch-1`, debug build
- **Result:** full suite 15 of 16 spec files passed (baseline 12). The one failure was `content.e2e.mjs` (Bug 29, intermittent).
- **Content Studio draft (Intended: copy written by the model, or clearly labelled as the template with the true reason).** Observed: with no model saved in settings the job reached the starter model and produced a draft; a reply without copy is now labelled. Verdict: Pass, guarded by `content.e2e.mjs` and `contentCatalystService.test.js`.

### Baseline run — 2026-10-21, branch `fix/ollama-models-location` (main + PR 307), debug build
- **Setup:** Ollama 0.40.7 started by the owner (tray app, so it refuses the app window: 403), ComfyUI on 8188, WebView2 155.
- **Result:** 12 of 16 spec files passed, 4 failed: `boardroom` (Bug 22, harness), `chat` (Bug 24), `content` (Bugs 18, 19), `content-image` (Bug 23).
- **Confirmed working in the real app:** the backend `ollama_chat` command answers in 225 ms when the window is refused (Finding 1's fallback path); the backend model list works.
- **Content Studio labels its fallback text honestly** ("This copy is the built-in template, not written by a model"), so the 2026-10-12 silent-fallback fix holds; the stated reason is wrong (Bug 18).

<!-- Template:
### <Page> — <feature>
- **Intended:** … (source: …)
- **Observed (YYYY-MM-DD, <commit>):** …
- **Verdict:** Pass / Bug n
- **Guarded by:** e2e-desktop/specs/<file> — "<test name>"
-->
