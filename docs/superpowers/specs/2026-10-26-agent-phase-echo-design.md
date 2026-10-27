# Agent phase 7: Echo remembers the ecosystem's decisions, and every agent can ask him

> **Status (2026-10-26):** design, written with the owner after the Echo inspection of 2026-10-26 (code reading, the memory graph, every memory writer and reader, and six live requests in the real app). Built 2026-10-26 on `feat/agent-phase-echo` (plan `docs/superpowers/plans/2026-10-26-agent-phase-echo.md`). Builds on agent roles Part A (`buildStepInput()`, one owner per kind of work), Part B (skills), agent phase 4 (`redactText()`: no key reaches memory) and agent phase 6 (`ALPHONSO_ANSWER_PROMPT`, `requestForCommand()`).

## Why

The owner's goal: Echo is the brain of the whole ecosystem. He remembers every decision, wherever it was made (Chat, Telegram, WhatsApp, the phone, schedules, Boardroom, Miya Studio, Project Execution), and every agent can get previous decisions from him.

What the inspection found:

- **Every Echo step saves a note, whatever was asked.** `executeEchoAssignment()` always runs `runEchoPreservation()`: "what did we decide about the launch?" (`memory_recall`) and "clean up my memory" (`knowledge_curation`) both add a note. Recall and cleanup were never built, though his three skills describe them.
- **What you tell him is not saved.** Live: "Remember that our launch is on Friday the 14th and the price is $29." got "Got it." from Alphonso's direct answer; nothing reached memory. "Remember that I prefer short emails without emojis" was not saved either, and the email to Sam then said "the launch event on [date/time]".
- **He invents decisions.** Live: a recall through Jose answered "the exact details aren't specified", and Echo then saved *"We decided on the launch date and price, but specific details were not provided. The decision was made based on project priorities and available resources."*, filed as a preference. "Clean up my memory" saved a note called "Desktop Bridge Connection Verified".
- **A silent fallback.** When his model fails or answers badly, a keyword-built note (`buildEchoFallbackEntry()`) or a fake "Workflow output preserved." is saved as if he wrote it. Category and retention come from regex keywords (`RETENTION_RULES`, `classifyMemoryCategory()`). `normalizeMemoryConfidence()` is called and its result thrown away.
- **Decisions don't last.** Expiry comes from the category (`TTL_CONFIG`), never from his "retention": a decision filed as `timeline_memory` is deleted after 14 days, `orchestration_memory` after 7, even when he chose "permanent". The shared store keeps the newest 1,000 items and 18 places write to it, so decisions are pushed out by step notes.
- **Memory is mostly noise.** Live: 15 of 18 items were "Untitled memory: Ollama check: Connected" (`useOllamaHealth.js` writes one per check).
- **Other agents barely get past decisions.** Each request gets the top 3 notes by substring word overlap (`retrieveRelevantContext()`), and only from `content` when it is a string; Echo's notes keep their text in an object, so they match on the title alone. Nobody can ask Echo: the HELP line never goes to him, and his `read_memory` tool shows his own notes as empty. Telegram's `/memory` and the nightly "consolidation" print object content as "[object Object]"; the consolidation adds a note and removes nothing.
- **The memory graph is not his.** It holds ids and links only (receipt → packet, Maria's review → packet, Hector's report → sources, Boardroom replies), no text and no decisions, and no agent reads it: only the 3D viewer and the link-suggesting job do.
- **His model overrides Jose's step model** (`model: options.model || getConfiguredOllamaModel()`), as Nova's did before phase 2.

## Owner decisions (2026-10-26)

1. **What counts:** when any request finishes, wherever it came from, Echo's model writes down what was decided and why. Also your approvals and rejections, review verdicts, and anything you say to remember. Step chatter and health checks are not decisions.
2. **Lifetime:** decisions never expire. When a new one changes an old one, the old one is marked replaced and kept for history. Ordinary notes expire and are capped as now.
3. **Agents read:** every step gets the past decisions that matter to it in its input. Any agent can also ask Echo (HELP line or a recall tool), and you can ask him in Chat or Telegram.
4. **Finding them:** a text search over the decision records (no model call per step), plus ChromaDB's meaning-based search when it is installed.
5. **Saving:** Echo saves on his own and says so ("Echo remembered: …") on the board and in Chat, with Forget and Edit. Memory needs no approval.
6. **Cleanup:** on request or weekly, Echo proposes merges and replacements; nothing changes until you approve.
7. **The graph** becomes the map of decisions: each decision links to its request, the steps and sources it came from, and the decision it replaced.
8. **Failure:** say so and save nothing made up. No keyword fallback.
9. **Preferences** ("I prefer short emails without emojis") are standing decisions every agent doing that kind of work follows until you change or forget them.
10. **Noise:** health checks and status pings never go to memory; the old ones are cleared once.
11. **Old memory** stays as notes (expiring as now); the first cleanup may propose turning real decisions among them into decision records, with your approval.
12. **Nothing hardcoded:** Echo's model decides what is a decision and what it replaces; limits live in one constant; no keyword triggers decide what he does.

## Design

### 1. Decision records (`src/services/echo/decisions.ts`)

One store for the whole ecosystem, `alphonso_echo_decisions_v1`, written through `durableStore` (localStorage plus the backend KV store, so it survives a cleared window). A record:

- `id`, `kind`: `decision` (something settled), `preference` (how you want things done), `instruction` (something you told an agent to remember), `rejection` (what you turned down, with the reason).
- `text`: one plain sentence ("The launch is on Friday 14 November at $29."), `why`: the reason when one was given, `topics`: a few words Echo's model chose for finding it again.
- `appliesTo` (preferences only): the kinds of work it applies to, as agent ids and task-type prefixes from the permission table (for example `alphonso` + `assistant_write` for emails), or `all`.
- `source`: `surface` (chat, telegram, whatsapp, phone, schedule, boardroom, miya, project_execution, settings), `requestId`, `stepIds`, `sources` (Hector's source links when the decision rests on them), `by` (`you` or an agent id).
- `atMs`, `status`: `active` / `replaced` / `forgotten`, `replaces` / `replacedBy`.

No expiry and no cap below `ECHO_LIMITS.maxDecisions` (5,000; past it Settings warns and asks for a cleanup, nothing is dropped). Every text goes through `redactText()` first, so a key never reaches memory. `addDecision()`, `replaceDecision()`, `forgetDecision()`, `editDecision()`, `listDecisions({ status, kind })`, `activePreferences()`.

### 2. Writing decisions

- **A finished request** (`saveRequestDecisions()` in `joseFinish.ts`, for every request that ends done, waiting or failed, from any surface): Echo's model reads the request, each step's hand-over, the change log (your approvals, rejections, plan edits and picks) and the active decisions a search finds on the same topics. It answers `{ decisions: [{ kind, text, why, topics, appliesTo?, replaces? }] }`; an empty list is a fine answer ("nothing was decided"). A `replaces` id must be one he was shown. One retry when unreadable, then the change log says "Echo couldn't save what was decided: …" and nothing is saved. The request's change log and Chat show "Echo remembered: …" for each one saved.
- **"Remember …" / "Forget …"**: a request to remember or forget becomes an Echo step (`memory_preservation`, `memory_forget`), never a direct answer. Jose's route decision (`decideJoseRoute()`) is told so, and the planner's `missingAsked()` sends back a plan without it. His step words exactly what you said as one record (a preference when it is about how you want things done) and says "Remembered: …". "Forget …" finds the matching active decisions and marks them forgotten, naming them; with several possible matches he lists them and the step waits for you to pick, as Alphonso's "Which project" does.
- **Outside requests:** a piece rejected in Miya Studio with a reason (`rejectPiece()`) and a performance lesson you keep (`keepLesson()`) are recorded directly (`surface: miya`), alongside the brand's own lessons. Boardroom's Conclude is already a request, so it is covered by the first point.
- **What is gone:** `runEchoPreservation()`'s note per request, `buildEchoFallbackEntry()`, `RETENTION_RULES`, `classifyMemoryCategory()`, `normalizeMemoryConfidence()`, `synthesizeSession()` and the nightly consolidation. Echo passes no model of his own, so Jose's step model wins.

### 3. Reading decisions

- **Every step** (`buildStepInput()`): `decisionsFor(stepText, request, { large })` in `src/services/echo/recall.ts` returns the active decisions that match (a ranked text search over `text`, `why` and `topics`, with word stems and no model call; merged with ChromaDB's results when `isChromaHealthy()`), plus every active preference whose `appliesTo` covers the step's agent or task type. They are shown in the step input as "Decided 26 Oct (Chat): The launch is on Friday 14 November at $29." within `ECHO_LIMITS.stepChars` (2,000; 6,000 for paid or cloud models). This replaces `retrieveRelevantContext()` over the noisy notes.
- **Chat's and channels' direct answers** (`answerOrPlan()`, Chat's answer through `ALPHONSO_ANSWER_PROMPT`) get the same block, so "What did we decide about the launch?" is answered from memory, not only from the conversation on screen.
- **Asking Echo** (`memory_recall`): his step searches the decisions (and follows the graph, §5), then his model answers only from what was found, each point with its date and where it was decided; nothing found → "I have nothing saved about …". Any agent can get this through the HELP line: `chooseHelper()` is told Echo answers questions about earlier decisions (`memory_recall`), and the rules send "decided / before / earlier / last time" help to him. His `read_memory` skill tool reads the decision records. Telegram's `/memory <words>` shows the matching decisions.

### 4. Cleanup (`memory_cleanup`, `src/services/echo/cleanup.ts`)

Echo's model reads the active decisions (and, the first time, the old notes) and proposes: merge these (one new text), this replaces that, these contradict (which one stands?), drop this, turn this note into a decision. The step waits with the proposals on the board, each with a tick; "Apply" changes only the ticked ones. Run by "Clean up my memory" or the weekly schedule "Echo: tidy memory" (Sunday 20:00, replacing the nightly consolidation; Telegram asks). Never removes anything without your approval.

### 5. The memory graph as the map of decisions

Each decision is a `decision` node with edges `decided_in` → its request (`jose_request` node), `from_step` → each step it came from, `cites` → each source it rests on (reusing Hector's `source` nodes), and `replaces` → the decision it changed. A recall follows `replaces` to tell the history ("first Thursday 13th, changed to Friday 14th on 26 Oct") and `cites` to give sources. The viewer colours decision nodes. Inference and retention leave decision nodes alone (they are permanent memory items for `memory_graph_prune`).

### 6. Screens

- **Chat and the board:** after a request, "Echo remembered: …" lines with Forget and Edit. The board shows a cleanup step's proposals with ticks and Apply.
- **Settings → Memory:** a Decisions list (active by default; replaced and forgotten on a switch), each with its date, where it was decided, Edit and Forget; preferences marked as such with what they apply to. It replaces the Echo timeline.
- **Telegram:** `/memory <words>` lists matching decisions; the weekly cleanup asks with Apply / Not now.

### 7. Noise

`useOllamaHealth.js` and `useAppShellState.js` stop writing checks to memory (the activity log keeps them). A one-time pass at start removes the "Ollama check:" notes already saved.

### 8. How Echo works with the others

- **Jose:** every request ends with Echo saving its decisions; plans with "remember / forget / what did we decide / clean up memory" get an Echo step.
- **Alphonso:** answers and writing follow your preferences (short emails, no emojis) and past decisions (the launch date in the email); his code steps get decisions about the project ("we use pnpm").
- **Hector:** gets past decisions about what was already researched; the sources a decision rests on are linked to it.
- **Nova:** her verdicts become decisions when you act on them; she gets earlier verdicts on the same options.
- **Maria and Sentinel:** their review verdicts and your approvals of them are recorded; they get earlier rulings ("we decided not to email all customers").
- **Marcus:** what was sent where is recorded; he gets your sending preferences ("never post on Sundays").
- **Miya:** rejected pieces and kept lessons are recorded for the whole ecosystem, not only her brand.
- **Any agent** can ask Echo with a HELP line.

### 9. Profile and skills

Echo's profile says what he does now: remember decisions, answer from them, propose cleanups. The three skills follow the new steps (`save-decisions`, `answer-from-memory`, `merge-and-clean-memory`), and a fourth, `forget`, for "Forget …".

## Not in this phase

- Memory shared between computers.
- A meaning-based search without ChromaDB.
- Echo deciding on his own to forget anything.

## Checks

- Unit tests for each part above, plus the routing set gaining "Remember …", "Forget …", "What did we decide about …?" and "Clean up my memory".
- A desktop spec (`e2e-desktop/specs/echo.e2e.mjs`), in the real app: "Remember that our launch is on Friday the 14th and the price is $29." is saved and shown with Forget; a new chat asking "What did we decide about the launch?" answers with the date and price; "Remember that I prefer short emails without emojis" then an email to Sam is short, has no emojis and has the date; a request's decision is saved when it ends; a changed date replaces the old one, and the recall says both; Forget removes it from the next answer; "Clean up my memory" proposes and changes nothing until Apply; no "Ollama check" note is saved.
