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
| Q7 | Thinking models | The user chooses whether to see a model's thinking |
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
| Work | Creative (Miya Studio) | E2E (package) | `creative.e2e.mjs` | Miya Studio's own image and video buttons |
| Research | Research Desk (Hector) | E2E | `research.e2e.mjs` | raw CSS in snippets (Bug 3), export Markdown/PDF/PowerPoint, re-synthesize, depth toggle, bookmarks |
| Boardroom | Boardroom | E2E | `boardroom.e2e.mjs` | chained mentions, Stop, Retry, Acknowledge, Confirm-to-reveal, speaker name (Bug 7) |
| System | Orchestrator | Visit | `smoke` | Command, Packets, Monitor tabs; WhatsApp status (Bug 8) |
| System | All Agents (Ecosystem Hub) | Visit | `smoke` | Overview, Queue, Skills, Workflows, Pairings, Workshop, Advanced tabs |
| System | Agent Pairing | — | not in `smoke`'s list | everything; `smoke`'s SPACES list is missing this page |
| System | Maturity | — | not in `smoke`'s list | everything; `smoke`'s SPACES list is missing this page |
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
| ollama | — (chat specs use it) | local, available |
| telegram | — | owner has a bot token |
| whatsapp | — | — |
| youtube | — | — |
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
| Chat → Jose → approval → execution | E2E for the approval states (`jose-approval.e2e.mjs`) | what an executed packet produces (Bug 4) |
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
| 5 | Project Execution heading counts approved gates; gates show "unknown" | Owner field fixed (PR 305); heading not checked |
| 6 | Voice page says Voice OS "Installed" with only Python present | Open |
| 7 | Boardroom names the wrong agent as thinking | Fixed in code (PR 304); live check pending |
| 8 | Orchestrator says "WhatsApp inbound: Connected" with no credentials | Open |
| 9 | Content Studio brief step falls back silently | Open |
| 11 | Runtime start guard is check-then-spawn | Fixed in code (`starting` set); live check pending |
| 14 | Models chosen in the Ollama app's Settings are invisible to an Ollama Alphonso starts | Fixed in code (PR 307); live check pending |
| 15 | `smoke.e2e.mjs` page list misses Agent Pairing and Maturity | Open |
| 16 | `cargo clippy --all-targets` fails on test code in `lib.rs`, `companion_router.rs`, `connector_commands.rs` (CI runs without `--all-targets`) | Open |
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
| 29 | `content.e2e.mjs` timed out once in a full suite run (after `content-image`) although every model call took under 4 s and every image about 4 s; it then passed 3 times alone and twice paired with `content-image` | Intermittent, not reproduced; the spec now reports the job's status, last log lines and screen text when it times out |
| 28 | Content Studio accepted any JSON reply as a model-written draft: a reply with no hook or caption showed as a finished draft with "—" and no notice; and `llama3.2:3b` often failed the brief's JSON | Fixed in code: drafts need a hook and a caption or they are labelled as the template with the reason; brief and draft ask Ollama for JSON (`format: "json"`, new optional argument on `ollama_generate`, 1 Rust test); real-app re-check pending |

## Checks

One block per feature as it is tested: **Intended** (with its source),
**Observed** (real app, date, build), **Verdict**, and the spec that now
guards it.

### Content Studio — image gets the GPU (fix batch 2, 2026-10-21, debug build)
- **Intended:** before an image job, Ollama gives up its GPU memory so the image is fast (owner, Q16).
- **Observed:** with `qwen2.5-coder:7b` pre-loaded in Ollama, `content-image.e2e.mjs` ran a job: brief and draft from `llama3.2:3b` (2–3 s each), then the app called `/api/ps` and unloaded the model (`keep_alive: 0`, 9 ms), and ComfyUI made the image in 4.4 s. Afterwards `/api/ps` listed no loaded model. Before the fix the first image took 445 s.
- **Verdict:** Pass. **Guarded by:** `connectorImageGenerators.desktop.test.js` — "frees Ollama GPU memory before queueing the image"; `content-image.e2e.mjs`.

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
