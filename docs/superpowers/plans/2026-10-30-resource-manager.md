# Resource Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Measure RAM and graphics memory, hold back or make room for steps that wouldn't fit, start installed tools on demand and stop idle ones, and show it all in Runtime Hub and the top bar.

**Architecture:** A Rust `resource_snapshot` command measures; a pure TypeScript decision function (`decideAdmission`) says run / free idle first / wait / too big; small services around it estimate needs, free memory, start tools and stop idle ones. The Jose engine asks the gate before each step, and `joseQueue.ts` admits a request by memory instead of one at a time.

**Tech Stack:** Tauri 2 (Rust, `sysinfo`, `tokio`), React + TypeScript, Vitest, WebdriverIO desktop E2E.

**Spec:** `docs/superpowers/specs/2026-10-30-resource-manager-design.md`

## Global Constraints

- No hardcoding: sizes come from the models (Ollama, `VIDEO_MODELS`, checkpoint files) or learned readings; idle times are user-changeable defaults; no new fixed ports.
- "Alphonso started it" comes only from `RuntimeManager.spawned` (one shared `RuntimeManager`).
- Never close a program the user started; for those only unload models (Ollama `keep_alive: 0`, ComfyUI `POST /free`).
- Never free anything a running step uses; never stop a running step to free memory.
- Every new Windows spawn uses `crate::utils::no_window()` / `no_window_async()`.
- Local servers are read through backend commands, never a window `fetch`.
- The manager runs only in the main window, never the Coach window.
- Tests first; plain UI words; no em dashes in new UI text.
- Docs in the same commits as the code; run `node scripts/verify-doc-counts.mjs` and `npm run generate:dnd-map` when files or Rust tests/commands are added.
- Values: safety margin 1024 MB RAM, 512 MB graphics; measure every 3 s while a step runs, 30 s otherwise; long-wait notice after 10 min; learned readings: last 5 per step kind and model; idle defaults: `comfyui` 15 min, every other tool Never (Ollama's process is never stopped by the timer).

## Review Focus

- A computer with no NVIDIA card and ComfyUI not running: graphics memory is unknown; decisions use RAM only and the screen says "Graphics memory unknown on this computer." (Task 4 test `unknown graphics memory decides on RAM`.)
- Two requests admitted a moment apart: the second must count the first's reservation, not today's free memory. (Task 4 test `counts reservations not yet measured`.)
- The user's own ComfyUI or Ollama: may be asked to unload models, never stopped, even when idle past its time. (Task 6 test `never stops a tool the user started`.)
- A step whose estimate is bigger than the computer's total: fails at once with the reason, doesn't queue forever. (Task 4 test `too big for this computer`.)
- A request stopped while waiting for memory: leaves the wait at once and releases nothing it never reserved. (Task 8 test `stop while waiting for memory`.)

---

### Task 1: Measure memory in the backend

**Files:**
- Create: `src-tauri/src/resources.rs`
- Modify: `src-tauri/src/lib.rs` (module + command registration), `src-tauri/src/ollama.rs` (new `ollama_loaded_models`), `src-tauri/src/comfyui_proxy.rs:28-40` (allow `POST /free`)
- Test: unit tests in `resources.rs`, `ollama.rs`, `comfyui_proxy.rs`

**Interfaces:**
- Produces: `#[tauri::command] resource_snapshot(state: State<RuntimeManager>) -> ResourceSnapshot` serialized camelCase as `{ ramTotalMb: u64, ramFreeMb: u64, gpu: Option<{ totalMb: u64, freeMb: u64, source: "nvidia" }>, processes: Vec<{ tool: String, pid: u32, memMb: u64 }> }` (processes = every tool in `RuntimeManager.spawned` still alive, memory from `sysinfo`).
- Produces: `pub(crate) fn parse_gpu_usage(output: &str) -> Option<(u64, u64)>` (total, free MiB) for `nvidia-smi --query-gpu=memory.total,memory.free --format=csv,noheader,nounits`; first GPU line.
- Produces: `#[tauri::command] ollama_loaded_models(endpoint: Option<String>) -> Vec<{ name: String, sizeMb: u64, vramMb: u64 }>` from `/api/ps` (`size`, `size_vram`), loopback endpoints only, as `ollama_unload_models` does.

- [ ] **Step 1: Write the failing tests** — `parse_gpu_usage("8192, 6000\n")` = `Some((8192, 6000))`; `parse_gpu_usage("")` = `None`; `parse_gpu_usage("N/A, N/A")` = `None`; `allowed_path("POST", "/free")` is true and `allowed_path("GET", "/free")` false; `/api/ps` JSON `{"models":[{"name":"llama3.2:3b","size":3221225472,"size_vram":2147483648}]}` parses to `sizeMb 3072, vramMb 2048`.
- [ ] **Step 2: Run** `cd src-tauri && cargo check --tests` — Expected: errors for the missing functions. (Local Rust test binaries are blocked by Smart App Control on the dev machine; `cargo test` runs in CI.)
- [ ] **Step 3: Implement** the three items; `nvidia-smi` through `tokio::process::Command` with `no_window_async`, 5 s timeout, `None` on any failure.
- [ ] **Step 4: Run** `cargo fmt --all -- --check && cargo clippy --all-targets -- -D warnings && node ../scripts/verify-no-window-coverage.mjs` — Expected: clean.
- [ ] **Step 5: Update doc counts** (`node scripts/verify-doc-counts.mjs` from the repo root, fix the numbers it names) **and commit** `feat(resources): measure RAM, graphics memory and loaded models`.

### Task 2: One reading of what is running

**Files:**
- Create: `src/services/resources/resourceState.ts`
- Test: `src/test/services/resources/resourceState.test.ts`

**Interfaces:**
- Consumes: Task 1's commands; `getAllStatus()` / `ToolStatus` from `runtimeManagerService.ts`; `comfyRequest()` from `connectorImageGenerators.js` for `/system_stats`; `getConfiguredOllamaEndpoint()`.
- Produces:
  ```ts
  export type GpuSource = 'nvidia' | 'comfyui' | 'unknown';
  export interface LoadedThing { kind: 'tool' | 'model'; name: string; label: string; memMb: number | null; startedBy: 'alphonso' | 'you'; lastUsedAtMs: number | null; inUse: boolean }
  export interface ResourceState { atMs: number; ramTotalMb: number; ramFreeMb: number; gpuTotalMb: number | null; gpuFreeMb: number | null; gpuSource: GpuSource; loaded: LoadedThing[] }
  export interface UsageRecord { lastUsedAt(key: string): number | null; isInUse(key: string): boolean }
  export async function readResources(usage?: UsageRecord): Promise<ResourceState>
  export const GPU_UNKNOWN = 'Graphics memory unknown on this computer.';
  ```
  Graphics: NVIDIA reading first, else ComfyUI `/system_stats` `devices[0].vram_total/vram_free` (bytes → MB), else `unknown`. Apple Silicon: `unknown` graphics, RAM covers it. `startedBy` is `'alphonso'` for tools in the snapshot's `processes`, `'you'` for a running tool not in it. `lastUsedAtMs` and `inUse` come from an optional `UsageRecord` argument (`lastUsedAt(key)`, `isInUse(key)`; tools by name, models as `model:<name>`), defaulting to never used; Task 6 passes its `toolUse` store, and the gate (Task 8) marks the step's model in use as `model:<name>` beside its tools.

- [ ] **Step 1: Write the failing tests** (mock `invoke` and `comfyRequest`): NVIDIA present → `gpuSource 'nvidia'`; no NVIDIA, ComfyUI answers `vram_total 4294967296` → `gpuTotalMb 4096, gpuSource 'comfyui'`; neither → `gpuFreeMb null, gpuSource 'unknown'`; a running ComfyUI not in `processes` → `startedBy 'you'`; each Ollama model is a `LoadedThing` of kind `'model'` with `memMb` = its `vramMb || sizeMb`.
- [ ] **Step 2: Run** `npx vitest run src/test/services/resources/resourceState.test.ts` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `readResources()`; any failed source degrades to `null`/`unknown`, never throws.
- [ ] **Step 4: Run** the test — Expected: PASS.
- [ ] **Step 5: Commit** `feat(resources): one reading of RAM, graphics and what is loaded`.

### Task 3: What a step needs

**Files:**
- Create: `src/services/resources/stepNeeds.ts`
- Test: `src/test/services/resources/stepNeeds.test.ts`

**Interfaces:**
- Consumes: `getAgentProvider()` (`modelSelectionService.ts`), `getAgentModelOverride()` / `getConfiguredOllamaModel()` (`src/lib/ollama.ts`), `effectiveVideoModel()` (`videoModelService.ts`), `projectEngines()` (`engineChoice.ts`), `durableGet`/`durableSet`.
- Produces:
  ```ts
  export type NeededTool = 'ollama' | 'comfyui' | 'kokoro' | 'audiocraft' | 'whisper' | 'ffmpeg';
  export interface StepNeed { key: string; tools: NeededTool[]; ramMb: number; gpuMb: number; gpuSpillsToRam: boolean; modelKey?: string; learned: boolean; known: boolean }
  export function toolsForStep(assignment: { agent: string; actionType: string; model?: string; contentStep?: unknown }): NeededTool[]
  export async function estimateNeed(assignment: …same…): Promise<StepNeed>
  export function recordStepUse(key: string, used: { ramMb: number; gpuMb: number }): void   // key `alphonso_resource_usage_v1`, last 5 per key
  ```
  The table (spec §7): an agent model step → `['ollama']` unless the step's model is `claude:`/`chatgpt:` or the agent's provider is `nvidia_nim`/`gemini`/`hermes` (→ `[]`); `creative_scenes`, `creative_thumbnails`, `creative_carousel`, `creative_video_clips`, `creative_character_train`, character/motion steps → `['comfyui']` unless the project's engine for that step is Higgsfield or Runway; `creative_voice` → `['kokoro']` unless ElevenLabs; `creative_music` → `['audiocraft']`; `creative_assemble_video`, `creative_shorts` → `['ffmpeg']` (+ `'whisper'` when installed and used for captions); anything not in the table → `['ollama']` (fail safe). `key` = `${actionType}|${model or engine}`. Need = average of the learned readings when present, else the known size (Ollama model size via `ollama_loaded_models`/`/api/tags`, video model's listed size from `listVideoModels()`), plus 20 % for working memory **(the 20 % is this plan's call)**.

  **Built (2026-10-30), calls made while building:** picture steps (`creative_scenes`, `creative_thumbnails`, `creative_carousel`) use the agent's model then ComfyUI, so they list both and need the larger of the two, not the sum (the model finishes writing before the pictures start); `creative_character_train` and `creative_higgsfield` run on Higgsfield, so `[]`; `creative_shorts` makes pictures, a voice and a cut, so `[model, comfyui, kokoro, ffmpeg]`; `research_broll` only downloads, so `[]`. `gpuSpillsToRam` is true only for an Ollama model on its own (Ollama runs what doesn't fit on the card from RAM; ComfyUI's video models don't), so Task 4 can let such a step run when RAM covers the overflow. A size not known here (a picture checkpoint, Kokoro, AudioCraft, ffmpeg) is 0 with `known: false` until a run teaches it; `modelKey` (`model:<name>`) is the `UsageRecord` key for Task 2. Model sizes come from `ollama_list_models` (`/api/tags`, which already carries each model's size).

- [ ] **Step 1: Write the failing tests**: `toolsForStep({agent:'hector', actionType:'research_report'})` with Ollama provider → `['ollama']`; same with provider `nvidia_nim` → `[]`; `{agent:'miya', actionType:'creative_voice', contentStep:{}}` with ElevenLabs engine → `[]`; unknown action type → `['ollama']`; after three `recordStepUse(k, {ramMb:1000,gpuMb:3000})`, `estimateNeed` returns `gpuMb 3000, learned true`; six readings keep only the last 5.
- [ ] **Step 2: Run** `npx vitest run src/test/services/resources/stepNeeds.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(resources): what each kind of step needs, learned from use`.

### Task 4: The decision

**Files:**
- Create: `src/services/resources/admission.ts`
- Test: `src/test/services/resources/admission.test.ts`

**Interfaces:**
- Consumes: `ResourceState`, `LoadedThing` (Task 2), `StepNeed` (Task 3).
- Produces:
  ```ts
  export const MARGIN = { ramMb: 1024, gpuMb: 512 } as const;
  export type Admission =
    | { kind: 'run' }
    | { kind: 'free_first'; free: LoadedThing[] }
    | { kind: 'wait'; reason: string }
    | { kind: 'too_big'; reason: string };
  export function decideAdmission(need: StepNeed, state: ResourceState, reservedMb: { ramMb: number; gpuMb: number }): Admission
  export function memoryWaitLine(holders: string[]): string   // "Waiting for memory: ComfyUI is busy." / "Waiting for memory to free up."
  export function tooBigLine(kind: 'RAM' | 'graphics memory', needMb: number, haveMb: number): string
  // "This step needs about 8 GB of graphics memory; this computer has 4 GB." (GB rounded to one decimal, trailing .0 dropped)
  ```
  Rules: too big when need > total (RAM, or graphics when known); fits when need ≤ free − reserved − margin (each kind; graphics skipped when unknown); else candidates = loaded things not `inUse` (models of any starter, tools only `startedBy 'alphonso'`), largest first; if freeing them covers the gap → `free_first` with just enough of them; else `wait` naming the in-use or user-held things.

  **Built (2026-10-30), calls made while building:** the user's ComfyUI is a candidate (design §5: it may unload through `POST /free`, never be stopped); its size isn't measured, so it is offered last and only when the known candidates don't cover the gap, and the caller reads again and decides again. The Ollama program itself is never a candidate (its models are). A model freed counts as graphics memory when that is known, else RAM; a tool's measured memory counts as RAM. A step whose Ollama model is bigger than the card is too big only when it is bigger than card and RAM together. A computer that couldn't be measured (no RAM total) never holds a step back. `wait` names what is in use and the other tools you started.

- [ ] **Step 1: Write the failing tests**: `fits with room`; `free_first picks idle Alphonso tools largest first and only as many as needed`; `never frees in-use things`; `a tool the user started is never in free list, its idle model is`; `wait names what holds memory` (reason `Waiting for memory: ComfyUI is busy.`); `too big for this computer` (need gpu 8192, total 4096 → `This step needs about 8 GB of graphics memory; this computer has 4 GB.`); `unknown graphics memory decides on RAM`; `counts reservations not yet measured`.
- [ ] **Step 2: Run** `npx vitest run src/test/services/resources/admission.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** (pure; no I/O).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(resources): decide run, make room, wait or too big`.

### Task 5: Making room

**Files:**
- Create: `src/services/resources/freeMemory.ts`
- Test: `src/test/services/resources/freeMemory.test.ts`

**Interfaces:**
- Consumes: `freeOllamaGpuMemory()` (all models; add an optional `models?: string[]` parameter to unload only those, passed through to `ollama_unload_models`), `comfyRequest('POST', '/free', { unload_models: true, free_memory: true })`, `stopTool()`.
- Produces: `export async function freeThings(things: LoadedThing[]): Promise<{ freed: string[]; failed: string[] }>` — model → unload; ComfyUI started by the user → `/free`; tool started by Alphonso → `stopTool(name)`. Never throws.

  **Built (2026-10-30), calls made while building:** `ollama_unload_models` gained an optional `models` argument (`names_to_unload()`, with a Rust test); without it nothing changes for the existing callers. Models are unloaded in one call; a model missing from Ollama's report with no error was already gone and counts as freed. `freeThings()` checks the never-touch rules itself (anything in use, the Ollama program, any tool you started other than ComfyUI), so a wrong list can't stop your tools. Results come back in the order asked; a stop the backend refuses (`ok: false`) counts as failed.

- [ ] **Step 1: Write the failing tests**: a user-started ComfyUI gets `/free`, never `stopTool`; an Alphonso-started ComfyUI gets `stopTool('comfyui')`; an Ollama model gets unloaded by name; one failure is listed in `failed` and the rest still run.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(resources): free idle models and tools`.

### Task 6: Last use, idle times and the idle stop

**Files:**
- Create: `src/services/resources/toolUse.ts`, `src/services/resources/idleStop.ts`
- Test: `src/test/services/resources/toolUse.test.ts`, `src/test/services/resources/idleStop.test.ts`

**Interfaces:**
- Produces (`toolUse.ts`): `markUsed(tool: string, nowMs?: number)`, `beginUse(tool: string, stepId: string)`, `endUse(tool: string, stepId: string)`, `isInUse(tool: string): boolean`, `lastUsedAt(tool: string): number | null` (in memory plus `alphonso_tool_last_used_v1`).
- Produces (`idleStop.ts`): `export const DEFAULT_IDLE_MINUTES: Record<string, number | null> = { comfyui: 15 }` (missing = Never); `getIdleMinutes(tool): number | null`, `setIdleMinutes(tool, minutes: number | null)` (key `alphonso_tool_idle_v1`); `idleTick(state: ResourceState, nowMs: number): Promise<string[]>` (stops and returns tools that are `startedBy 'alphonso'`, not in use, idle past their minutes; never `ollama`); `startResourceWatcher(): () => void` (main window only; reads every 3 s while any `isInUse`, else 30 s; runs `idleTick`; publishes the latest `ResourceState` through `onResources(listener)` / `latestResources()`).

- [ ] **Step 1: Write the failing tests**: `beginUse`/`endUse` nesting for two steps; `idleTick` stops an Alphonso ComfyUI idle 16 min with default 15; keeps it at 14 min; `never stops a tool the user started`; never stops `ollama`; a tool set to `null` is never stopped; the watcher polls at 3 s while in use and 30 s otherwise (fake timers).
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**; call `startResourceWatcher()` from `App.tsx` next to `startPostScheduler()` (same not-in-Coach guard).
- [ ] **Step 4: Run** the tests plus `npx vitest run src/test/appLazyImports.test.js` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(resources): last use, per-tool idle times and the idle stop`.

### Task 7: Start a tool when a step needs it

**Files:**
- Create: `src/services/resources/ensureTools.ts`
- Test: `src/test/services/resources/ensureTools.test.ts`

**Interfaces:**
- Consumes: `getAllStatus()`, `startTool()`, `waitForTool(name, 60_000)`; for ComfyUI the found-install path `resolveComfyuiDirectory()`/`launch_comfyui` already used by Runtime Hub's ComfyUI card (call the same function that card calls; don't add a third path).
- Produces: `export async function ensureTools(tools: NeededTool[]): Promise<{ ok: true } | { ok: false; reason: string }>` — `ffmpeg`, `kokoro`, `audiocraft`, `whisper` are per-call: only checked installed (`media_tools_status`), never started. Not installed → `` `${displayName} isn't installed. Install it in Runtime Hub.` `` Didn't answer in 60 s → `` `${displayName} didn't start. Open Runtime Hub to see its log.` ``

- [ ] **Step 1: Write the failing tests**: a stopped installed ComfyUI is started and awaited; a running one isn't started again; not installed → the reason above; per-call tools are never started.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(resources): start installed tools when a step needs them`.

### Task 8: The gate in the engine and a memory-aware queue

**Files:**
- Create: `src/services/resources/resourceGate.ts`
- Modify: `src/services/jose/joseQueue.ts`, `src/services/joseExecutionEngineService.ts:1502-1506` and the wave loop just before each `executeAssignmentWithRetries` call, `src/services/jose/joseRequestStore.ts` (step field `waitingFor?: string`)
- Test: `src/test/services/resources/resourceGate.test.ts`, `src/test/services/jose/joseQueue.test.ts`

**Interfaces:**
- Consumes: Tasks 2–7.
- Produces: `export async function admitStep(requestId: string, stepId: string, assignment, signal?: AbortSignal): Promise<{ ok: true; release: () => void } | { ok: false; reason: string }>` — loops: `estimateNeed` → `decideAdmission(need, latestResources() ?? await readResources(), reservedTotal())` → `run`: reserve, `ensureTools`, `beginUse` each tool, return `release` (records `recordStepUse` from the drop in free memory seen while running, `endUse`, unreserve); `free_first`: `freeThings`, re-read, decide again; `wait`: set the request step's `waitingFor` to the reason, wait for the next reading (or `signal` abort → `{ ok:false, reason: STOPPED_LINE }`), decide again; `too_big` → `{ ok:false, reason }`. Also `waitingSinceMs` on the step for Task 9.
- Modifies `joseQueue.ts`: fix `CLOUD_PROVIDERS` to `new Set(['nvidia_nim', 'gemini'])` (and treat `hermes` as not local); `takeTurn(requestId, firstNeed?: StepNeed)` admits while others run when `decideAdmission(firstNeed, …)` is `run`, otherwise queues FIFO (only the head of the queue is considered, so nothing jumps ahead); `current` becomes a `Set<string>`; `giveBackTurn`, `leaveQueue`, `queuePosition`, `requeueAtStart`, `QUEUED_LINE` keep their meaning.
- Engine: a step whose `admitStep` returns not ok is `failed` with that reason (too big) or stopped (abort); a waiting step shows `waitingFor` on the board.

- [ ] **Step 1: Write the failing tests**: queue — `an NVIDIA-only plan is not local` (`usesLocalModel` with provider `nvidia_nim` → false); `two requests run together when both fit`; `the second queues when it doesn't fit` and starts when the first gives back its turn; existing queue tests still pass. Gate — `run reserves and releases`; `free_first then run`; `wait sets waitingFor then runs when memory frees`; `too big fails with the reason`; `stop while waiting for memory`.
- [ ] **Step 2: Run** `npx vitest run src/test/services/resources src/test/services/jose/joseQueue.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** the gate, the queue change and the two engine call sites.
- [ ] **Step 4: Run** those plus `npx vitest run src/test/services/jose src/test/joseExecutionEngineService*` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(resources): steps wait for memory; requests share it when it fits`.

### Task 9: Telling the user about a long wait

**Files:**
- Modify: `src/services/jose/joseTelegram.ts` (`collectJoseNotifications`), `src/services/jose/joseSummary.ts` (the waiting line)
- Test: `src/test/services/jose/joseTelegram.test.ts`, `src/test/services/jose/joseSummary.test.ts`

**Interfaces:**
- Produces: a notification kind for a step with `waitingFor` and `waitingSinceMs` older than 10 min, sent once per step (sent-log key `memwait:<requestId>:<stepId>`), text `` `${agentName(step.agent)}'s step has waited ${minutes} minutes. ${step.waitingFor}` ``, no buttons; `closingSummary` shows `waiting for memory (…)` for such a step.

- [ ] **Step 1: Write the failing tests**: 9 min → nothing; 11 min → one message with that text; a second collect → nothing more.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(resources): say when a step has waited long for memory`.

### Task 10: What the user sees

**Files:**
- Create: `src/components/resources/MemorySection.tsx`, `src/components/resources/MemoryMeter.tsx`
- Modify: `src/components/RuntimeManagerView.tsx` (section at the top), `src/components/TopBar.tsx` (meter that opens Runtime Hub's Memory section through the existing tab change), `src/components/jose/JoseRequestsBoard.tsx` (`statusLabel` and the step line show `waitingFor`), `src/components/ChatView.tsx` live line
- Test: `src/test/components/resources/MemorySection.test.tsx`, `src/test/components/resources/MemoryMeter.test.tsx`

**Interfaces:**
- Consumes: `onResources()` / `latestResources()` (Task 6), `getIdleMinutes`/`setIdleMinutes`, `freeThings`, `GPU_UNKNOWN`.
- Produces (`data-testid`s for the E2E spec): `memory-section`, `memory-ram`, `memory-gpu`, `memory-row-<name>`, `memory-idle-<tool>` (select: 5, 15, 30, 60 minutes, Never), `memory-stop-<tool>` (only `startedBy 'alphonso'`), `memory-unload-<model>`, `memory-waiting`; `memory-meter` in the top bar. Each row: label, memory (`"about"` before an estimate), "Started by Alphonso" / "Started by you", idle time. Graphics unknown → `GPU_UNKNOWN`.

- [ ] **Step 1: Write the failing tests**: rows render from a given state; Stop only on Alphonso's tools; changing the idle select calls `setIdleMinutes('comfyui', 30)`; unknown graphics shows the sentence; the meter shows RAM used of total and opens the section on click; the board's step line shows `Waiting for memory: ComfyUI is busy.`
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** with the `src/components/ui` kit.
- [ ] **Step 4: Run** the tests, `npm run lint`, `npm run typecheck` — Expected: PASS / clean.
- [ ] **Step 5: Commit** `feat(resources): Memory section, top-bar meter and waiting lines`.

### Task 11: Desktop check and the docs

**Files:**
- Create: `e2e-desktop/specs/resources.e2e.mjs`
- Modify: `docs/ALPHONSO_GROUND_TRUTH.md` (new section 11.56), `docs/CHANGELOG.md`, `docs/governance/DEFERRED_WORK.md` (mark the resource manager line, keep Hermes open), `CLAUDE.md` (Do Not Duplicate rows for `src/services/resources/` and the two components; the desktop E2E count), `README.md`/`AGENTS.md`/`ARCHITECTURE.md` counts, `docs/DO_NOT_DUPLICATE.generated.md`

- [ ] **Step 1: Write the spec**: a fresh profile opens Runtime Hub and sees `memory-section` with a RAM number above 0 and either a graphics number or `Graphics memory unknown on this computer.`; `memory-meter` is in the top bar; with ComfyUI installed and stopped (skip otherwise, saying why), its idle time set to 1 minute by a test-only `__ALPHONSO_E2E__` hook is not used — instead set the select to 5 and assert the saved value, and assert a picture step started by the spec starts ComfyUI (`memory-row-comfyui` appears with "Started by Alphonso").
- [ ] **Step 2: Run** `npm run test`, `npm run lint`, `npm run typecheck`, `node scripts/verify-doc-counts.mjs`, `npm run verify:dnd-map` — Expected: all pass.
- [ ] **Step 3: Update the docs** listed above, in the same commit.
- [ ] **Step 4: Commit** `test(resources): desktop check; docs for the resource manager`.
- [ ] **Step 5: Push** `feat/resource-manager`, open the PR (it also carries the ffmpeg-blocked warning and the four-phases write-up), merge when the required checks pass.
