# Resource manager — design

Date: 2026-10-30. Owner-approved choices are marked **(owner)**; choices left to the builder or made by Claude are marked **(Claude's call)**.

## 1. Intent

Alphonso can now have several agents, ComfyUI, Kokoro, AudioCraft, Whisper, Voice OS and (later) Hermes profiles all wanting memory at once. On an ordinary computer (the owner's own fleet scripts were written for an 8 GB machine) that ends with a frozen computer or a step dying halfway. The app is going public, so it has to behave on machines much smaller than the dev machine.

The owner's `hermes-fleet-scripts` (`github.com/Thatisshayan/hermes-fleet-scripts`) do three things for Hermes profiles: start one only when it is asked for (lazy spawn, checked by whether its port is listening), record when it was last used (`.last_used`), and stop it after it sits idle (`agent-idle-killer.cmd`, default 30 minutes). This phase builds that logic into Alphonso for its own tools, and adds what the scripts never had: measuring memory and holding back work that would not fit.

All three outcomes matter equally **(owner)**:
1. **Nothing crashes when memory is full.** Work is held back or memory is freed first.
2. **Tools appear when needed and go away when idle.** The user never starts ComfyUI or Voice OS by hand to make a step work.
3. **The user can see what is using what**, and why something waits.

## 2. Goals

- Measure free RAM and graphics memory while the app runs.
- Before a step starts, estimate the memory it needs; run it, free idle tools first, or hold it back with a plain reason.
- Start an installed tool when a step needs it; stop tools Alphonso started after each tool's own idle time.
- Let the local-model queue run more than one request when memory allows.
- One place to see running tools, loaded models, their memory, idle time, and what is waiting.

## 3. Non-goals

- **Hermes profiles.** Leave to the Hermes phase **(owner)**. The manager must let a Hermes profile plug in later as one more tool (start command, port, health check, idle time) without redesign.
- **Installing anything.** Starting on demand covers installed tools only; installing stays the user's choice in Runtime Hub.
- **OpenRouter, MCP** (later phases).
- **Code-signing ffmpeg** (owner, 2026-10-30: not now). The plain warning for a blocked ffmpeg (`windows_block()` / `FFMPEG_BLOCKED` in `media_tools.rs`, already committed on this branch) ships in this phase's PR.

## 4. Anti-goals (a failure even if it technically works)

- Closing a program the user started themselves.
- Stopping or unloading something a running step is using.
- A request waiting forever without saying why.
- A plain question becoming slow or queued.
- Memory numbers that look precise but are guesses, shown without saying so.

## 5. Decisions

### 5.1 When a step needs more memory than is free **(owner)**
Free idle tools **that Alphonso started**, then run the step. If that is still not enough, the step waits in the queue with a plain reason, e.g. "Waiting for memory: ComfyUI is busy." Nothing a running step uses is ever freed.

### 5.2 Tools the user started **(owner)**
Never closed. Alphonso may only ask them to drop loaded models (they reload on next use), as it already does before a picture (`freeOllamaGpuMemory()` → `ollama_unload_models`). For ComfyUI the builder should use ComfyUI's own unload endpoint if it has one (`POST /free` in current ComfyUI; confirm against the installed version) through `comfyui_proxy.rs` (it is a narrow allowlist: add only that path). Runtime Hub already stops only PIDs it spawned (`RuntimeManager.spawned`); keep that the single source of "Alphonso started it".

### 5.3 Idle stop **(owner)**
Per tool, editable in Runtime Hub, each with a default, "Never" one of the choices. Defaults **(Claude's call)**: ComfyUI 15 min, Voice OS never, n8n never, ChromaDB never, Open WebUI / other standalone web UIs never (the user opened them to use them), Ollama's own model unloading left as it is (its `keep_alive`, default 5 min) with the Ollama process itself never stopped by the timer. A future Hermes profile: 30 min (the scripts' default). "Idle" = no step using it and no request to it from Alphonso for that long; record `lastUsedAtMs` whenever a step uses the tool.

### 5.4 Estimating a step's need **(owner)**
Known sizes first, then learn. Known: an Ollama model's size (`/api/ps` reports loaded models with `size` and `size_vram`; `/api/show` / `/api/tags` the file size), the video models' listed needs (`VIDEO_MODELS`, `CHARACTER_REFERENCE_MODEL`, `LOCAL_MOTION_MODEL` in `comfyui_video_models.rs`), the ComfyUI checkpoint size. Learn: after each step, record what that kind of step actually used (peak drop in free memory over the step, per step kind and model), keep the last few, and prefer that over the known size once there is one. Estimates are shown as estimates.

### 5.5 The queue **(owner)**
Let memory decide. `joseQueue.ts` today lets one local-model request run at a time. It becomes memory-aware: a request may start while another runs when the memory its next steps need fits; otherwise it queues as today (first come, first served, `QUEUED_LINE`). Plain answers never queue. Keep the queue's existing contracts: `takeTurn` / `giveBackTurn` / `leaveQueue`, stop while waiting, `requeueAtStart`, a request that waits for the user gives its turn back. The check happens per step too (a running request's next step may wait for memory), not only at request start.

**Bug found while designing, fix in this phase:** `usesLocalModel()` compares the provider with `'nvidia'`, but the provider id is `'nvidia_nim'` (`modelSelectionService.ts`, `nvidiaNimConnector.ts`), so a request whose agents all use NVIDIA is treated as local and queues for nothing. Test first.

### 5.6 What the user sees **(owner)**
- **Runtime Hub → "Memory" section at the top** (`RuntimeManagerView.tsx`): free/total RAM and graphics memory; each running tool and loaded model with its memory (measured or "estimated"), who started it ("Alphonso" / "you"), idle time, its idle setting, and Stop (only for tools Alphonso started; "Unload" for models); what is waiting and why.
- **A small RAM / graphics meter in the top bar** (`TopBar.tsx`) that opens that section.
- **Waiting steps say so** on the board (`JoseRequestsBoard.tsx` status line) and in Chat's live line: "Waiting for memory: <what holds it>".

### 5.7 Behaviour confirmed in playback **(owner confirmed Claude's proposals)**
- Memory is measured every few seconds while something runs (slower when idle) **(Claude's call: 3 s / 30 s)**.
- Graphics memory: NVIDIA through `nvidia-smi` (already used by `gpu_memory_gb()` / `parse_gpu_memory_mib()`); otherwise ask ComfyUI (`/system_stats` reports `vram_total` / `vram_free` for any card it supports) and Ollama (`/api/ps` `size_vram`); with no reading at all, work from RAM only and say so on screen ("Graphics memory unknown on this computer"). Apple Silicon has one shared memory: treat it as RAM.
- A running step is never stopped to free memory.
- A step waiting a long time tells the user what holds it, on the board and on Telegram (`collectJoseNotifications()` gains this kind) **(Claude's call: after 10 minutes)**.
- A step whose estimate exceeds what the computer has in total fails at once with the reason (e.g. "This video model needs 8 GB of graphics memory; this computer has 4 GB."), instead of queuing forever. Whether that step can be handed to a cloud engine is the existing logic's business (e.g. Higgsfield/Runway choices), not this phase's.

### 5.8 Starting on demand **(owner, scope: installed tools)**
When a step needs a tool that is installed but not running (ComfyUI for a picture or clip, Voice OS for voice), the manager starts it through Runtime Hub (`runtime_start_tool`, or `launch_comfyui` for a found ComfyUI install — use one path, `comfyuiSettingsService.ts` already resolves which), waits for its health check, then runs the step. Not installed → the step says what to install, as today (`setup_required`). Ollama: if Alphonso can start it (bundled or found), start it as the boot autostart already does.

Per-call tools (Kokoro, Whisper, AudioCraft, ffmpeg) are processes started by a step and gone when it ends; the manager counts their memory as the step's need and never "keeps them running".

## 6. Constraints

- **No hardcoding** (owner rule): no fixed memory sizes per model in source beyond what is already pinned with its model (`VIDEO_MODELS` etc.); no fixed ports beyond the documented port map; idle times are defaults the user can change.
- **One process registry.** `RuntimeManager` stays one shared instance (CLAUDE.md); "Alphonso started it" comes only from its `spawned` map.
- **Every new Windows spawn uses `no_window()` / `no_window_async()`** (CI-enforced by `verify-no-window-coverage.mjs`).
- **Don't duplicate:** extend `joseQueue.ts`, `runtimeManagerService.ts`, `RuntimeManagerView.tsx`, `TopBar.tsx`; reuse `freeOllamaGpuMemory()`, `gpu_memory_gb()`, `sysinfo` (already a dependency). `memoryMonitorService.ts` measures browser storage only; leave it alone or rename-clarify, don't overload it. Register any new service or component in CLAUDE.md's Do Not Duplicate table and run `npm run generate:dnd-map`.
- **Desktop window origin:** local servers refuse the window (`http://tauri.localhost`); read Ollama/ComfyUI status through backend commands, never a window `fetch`.
- **Tests first** (repo rule), plain UI words, no em dashes in new UI text.
- **Docs in the same commits** as the code (Ground Truth section, CHANGELOG, DEFERRED_WORK, CLAUDE.md rows, doc counts).

## 7. Settled during the builder read-through (Claude's calls)

- **What a step needs comes from one table**, keyed by action type and the step's model: an agent's model step needs Ollama plus that model (nothing for a paid or cloud model); content steps by action type: scenes, thumbnails, carousel, clips, characters and motion → ComfyUI plus the chosen checkpoint or video model (nothing when the step's engine is Higgsfield or Runway); voice → Kokoro (nothing for ElevenLabs); music → AudioCraft; assemble and Shorts → ffmpeg, plus Whisper when captions use it. A task type not in the table falls back to "the agent's model" (fail safe: it is counted, never treated as free).
- **Admitted work reserves its estimate** until the step ends, so two requests admitted a moment apart can't both count the same free memory. Free memory for the next decision = measured free − reservations not yet visible in the measurement − safety margin.
- **Runs only in the main window**, never in the Coach window (same rule as the scheduler and the queue's `requeueAtStart`).
- **Closing the app** keeps today's behaviour for tools Alphonso started; the idle timer only runs while the app is open.

## 8. Left to the builder

- Where the admission logic lives (a new `src/services/resources/` folder is the natural home) and its exact API.
- How "peak use during a step" is measured (sampling free memory vs. Ollama/ComfyUI's own reports) and how many past readings to keep.
- The Rust side: one `resource_snapshot` command (RAM via `sysinfo`, graphics via the chain in 5.7, per-process memory for PIDs in `spawned`) is the expected shape.
- Safety margin kept free for the OS **(Claude's call: about 1 GB RAM / 0.5 GB graphics, adjustable later)**.
- The desktop E2E spec: a fresh profile shows the Memory section with real numbers; with ComfyUI installed and stopped, a picture step starts it and it stops after its idle time (shortened for the test).
