# Alphonso Dependency Bundling — Zero-Prerequisite Install

**Status:** IN PROGRESS — v1 scope decided 2026-08-16; WIN1 and O1/O3
implemented and partially verified same-day (see "Implementation log" near
the end of this document for exactly what was and wasn't verified, and how).
O2/O4, all of PY, and all of X remain open.
**Owner:** unassigned
**Applies to:** the desktop Tauri build only (`src-tauri/`), not the cloud
gateways, MCP server, or bridge, which already run in managed containers with
their own dependency images.
**Canonical project facts:** [ALPHONSO_GROUND_TRUTH.md](ALPHONSO_GROUND_TRUTH.md)
**Active backlog:** [TRUTH_FIRST_EXECUTION_PLAN.md](TRUTH_FIRST_EXECUTION_PLAN.md)
— item `G-OTHER5` ("Voice OS Python prerequisite has no auto-install path")
is the existing open thread this document supersedes and expands. Reconcile
that item's status with this document in the same change once work starts.
**Governance:** [REPO_RULES.md](../REPO_RULES.md) R3/R16/R38 apply to every
checkbox in this document — no fake completions, no invented verification,
status separated into `done`/`partially done`/`deferred`/`blocked`/`untested`,
and every completion claim must name the verification command actually run.

## Why this is its own document

`TRUTH_FIRST_EXECUTION_PLAN.md` already tracks one narrow slice of this
problem (`G-OTHER5`: Voice OS needs Python and there's no auto-install path
for it). This document is broader and more expensive: it is the plan for
making the *entire* core app — not just Voice OS — launch and produce a
working chat session on a machine with nothing preinstalled and, ideally, no
network access after the installer download. That is a materially bigger
scope than one backlog line, with real installer-size and build-pipeline
consequences, so it gets its own acceptance criterion and task board rather
than being squeezed into a single checkbox.

Do not infer this is done from the presence of `runtime_manager.rs`'s
`find_python()`/`find_git()`/`find_ollama()` functions or the
`runtime_install_prerequisite`/`runtime_install_tool` Tauri commands. Those
are real and working, but they are a **detect-and-fetch** architecture, not a
bundling one — see "Current baseline" below. Prerequisite detection and
on-demand package-manager installs already exist; this document is about
removing the need for them in the first place for a defined "core session."

## Acceptance criterion

On a **Windows, macOS, and Linux VM with nothing preinstalled** — no Python,
no Git, no Ollama, no FFmpeg, no Node, no Visual C++ redistributables beyond
what the OS ships, no dev tools of any kind — installing the Alphonso
package and launching the app must result in a **fully working core
session**, defined precisely as:

1. The app launches without any "prerequisite missing" banner or crash.
2. The user can send a chat message and get a real local LLM response
   (Ollama running, a default model loaded) with **no internet access**
   required after the installer file itself was obtained.
3. Voice OS starts successfully if the user opts in from Settings, with STT
   and TTS working offline (no additional downloads at that point).
4. None of this requires the user to open a terminal, install anything via
   winget/brew/apt/pip, or read a troubleshooting doc.

**Two things this criterion does not yet resolve, and must not silently
contradict — both need the same owner-level decision as the scoping call
below, not an assumption baked into the wording:**

- **Resolved 2026-08-16 (see `WIN1`).** `tauri.conf.json`'s
  `bundle.windows.webviewInstallMode.type` is now `"offlineInstaller"`
  (changed from the original `"downloadBootstrapper"`, which fetched the
  Edge WebView2 runtime from Microsoft at install time whenever the target
  machine didn't already have it — a real gap on a genuinely clean VM).
  `offlineInstaller` embeds the runtime installer (+~127MB), verified
  against Tauri's own docs to be the only mode needing zero network
  regardless of Windows baseline. **Not yet verified**: an actual installer
  built with this setting, tested on a Windows VM without WebView2
  preinstalled and without network access — that remains `X1`'s job.
- **Resolved 2026-08-16:** the model-download question is settled — see
  "Scoping decision" below. The bundled default model ships in the
  installer (no first-run download required for criterion #2 to hold);
  larger models remain an optional, user-initiated `ollama pull` after the
  app is already working, not a precondition for it.

**Explicitly out of scope for this acceptance criterion** — see the scoping
decision below: the optional Runtime Manager AI-tool catalogue (ComfyUI,
AUTOMATIC1111, Fooocus, InvokeAI, AudioCraft, n8n, ChromaDB, OpenHands,
Open WebUI). Those remain the existing on-demand git-clone + venv + pip/docker
install flow. "Core session" means chat + agents + optional local voice, not
the full creative-tool ecosystem.

Do not mark this document's work complete based on the bundling code
existing — mark it complete based on the acceptance criterion above actually
passing on genuinely clean VMs for all three platforms, evidenced the way
`TRUTH_FIRST_EXECUTION_PLAN.md` requires (command/procedure, date, result,
remaining limitation — no "should work").

## Priority for v1 (decided 2026-08-16)

Not every dependency in this document sits on the golden path a brand-new,
non-technical user actually walks the first time they install Alphonso.
Splitting them by whether they block that path — rather than treating every
row in the baseline table as equally urgent — is what actually determines
what v1 needs to bundle.

**MUST — blocks a working session for a new user:**

- **Windows WebView2.** Not a feature dependency like the others — it's what
  renders the app's entire UI on Windows. If it's missing and the install
  can't reach the network, the app may not display at all. See `WIN1`.
- **Ollama + a bundled default model.** This is the core "it just chats"
  promise the acceptance criterion is built around. See domain `O`.
- **Python for Voice OS**, *if* Voice OS should also work zero-touch. Since
  Voice OS is opt-in from Settings (criterion #3), this is closer to
  "should bundle for a good first impression" than "blocks the app" — but
  it's still in scope for v1 rather than deferred, since shipping the chat
  path offline while the voice path silently needs a manual Python install
  would be a confusing half-measure. See domain `PY`.

**Deferred out of v1 — real dependencies, but none of them sit on a new
user's first session, confirmed by tracing what actually calls each one:**

- **Git** — only clones the optional Runtime Manager AI-tool catalogue
  (ComfyUI/AUTOMATIC1111/Fooocus/AudioCraft), and video generation is
  already out of scope (see the acceptance criterion above). See `G1`.
- **FFmpeg** — verified directly against `voice/backend/requirements.txt`:
  Voice OS's own STT stack (`faster-whisper`, `webrtcvad`, `numpy`) has
  **zero** FFmpeg dependency — it captures and processes raw audio itself,
  it doesn't decode arbitrary media files. FFmpeg is only pulled in by the
  separate, optional Meeting Transcription feature
  (`whisperTranscriptionService.ts` + the Runtime Manager's standalone
  Whisper tool), which a new user doesn't hit on first launch. See `FF1`.
- **Tesseract/OCR** — only reachable through Operator Dashboard's
  manual-path OCR adapter, an advanced/operator feature, not the golden
  path. See `OCR1`.
- **Image generation (ComfyUI / AUTOMATIC1111)** — scoped out with video
  generation; both require multi-GB checkpoints regardless of packaging.
  Not yet a resolved "which one, if either" decision — still genuinely
  open, tracked separately, not part of this v1 pass.

Deferred does not mean removed from this document — it means these stay on
today's existing detect-and-fetch path (manual install / on-demand
winget-brew-apt-pip / git-clone) for v1, and their task-board sections below
are marked out-of-scope-for-v1 rather than deleted, so the reasoning is
preserved if a future pass reopens one.

## Current baseline (verified 2026-08-16 against `main` at v2.6.2)

Alphonso today is a **detect-and-fetch** architecture, not a bundled one.
Nothing below is a guess — every line is a direct citation.

| Component | Bundled in installer? | Auto-installed via internet at runtime? | Manual install required? |
|---|---|---|---|
| Ollama binary | No | Yes — winget/brew/apt via `runtime_install_prerequisite` (`src-tauri/src/runtime_manager.rs:1009-1077`) | Yes, per the documented setup path (`docs/GETTING_STARTED.md:9,15-19`) |
| Ollama models | No | No — user runs `ollama pull` manually | Yes |
| Python interpreter | No | Yes — winget/brew/apt (`runtime_manager.rs:1009-1077`) | Yes, per docs (`docs/GETTING_STARTED.md:90`) |
| Voice OS Python deps (faster-whisper, piper-tts, fastapi, uvicorn, …) | No — only `.py` source is bundled as a plain resource (`src-tauri/tauri.conf.json:51-53`, `"../voice/backend": "voice/backend"`) | Yes — `pip install` into a per-tool venv at first run (`runtime_manager.rs:1204-1237`) | Requires Python first |
| Piper TTS voice model | No | Yes — `python -m piper.download_voices ...` (`runtime_manager.rs:1239-1262`) | Requires Python + network |
| Git | No | Yes — winget/brew/apt (`runtime_manager.rs:1009-1077`) | Yes, if not using Runtime Hub |
| FFmpeg | No | **No install/detect code path exists at all** — only allow-listed by name for the command policy gate (`src-tauri/src/policy_gate.rs:27,141,261-263`) and referenced as the `ffmpeg-python` pip wrapper for Whisper (`runtime_manager.rs:129`), which still needs a real FFmpeg binary already on PATH | Yes — must already be present |
| Tesseract / OCR | No | No — no install/detect-via-PATH code path exists (unlike Python/Git/Ollama) | Yes — the user must manually type a path to an already-installed engine binary into Settings/Operator Dashboard; `check_ocr_capability`/`run_ocr_adapter` (`src-tauri/src/lib.rs:868-965`) only verify a user-supplied path exists and shell out to it |
| Node.js (runtime) | No | No — detected only (`find_node()`, `runtime_manager.rs:610-653`) | Only if the user enables the optional MCP server/bridge tool |
| ComfyUI / AUTOMATIC1111 / Fooocus / AudioCraft | No | Yes — `git clone` + venv + `pip install -r requirements.txt` (`runtime_manager.rs:1170-1237`) | Requires Python + Git first |
| InvokeAI | No | Yes — `pip install invokeai` into its own venv | Requires Python first |
| Docker (n8n/ChromaDB/OpenHands) | No | No — detected only (`find_docker()`, `runtime_manager.rs:565-607`) | Yes |
| SQLite | **Yes** — compiled in via the `rusqlite` crate | N/A | N/A |

Key facts that shape every task below:

- `src-tauri/tauri.conf.json`'s `bundle` block has **no `externalBin` key** —
  Tauri's sidecar-binary mechanism is not used for any AI runtime today.
  `voice_sidecar.rs` "launches a sidecar process" in the informal sense (a
  companion process on port 8766), not in Tauri's formal bundled-binary
  sense. **Still true after O1's implementation** — Ollama turned out not to
  be a single self-contained executable (see O1 below), so it's bundled via
  `bundle.resources` (the same mechanism already used for `voice/backend`),
  not `externalBin`. `externalBin` remains genuinely unused in this repo.
- `voice_sidecar.rs`'s `resolve_voice_python()` falls back to a bare
  `python`/`python3` off PATH if no managed venv exists, which the code's own
  comments flag as a crash risk on first missing import
  (`voice_sidecar.rs:22-53`).
- Bundle targets are `nsis`, `dmg`, `app`, `appimage`, `deb`
  (`tauri.conf.json:42-48`); no `msi` target is configured today.

## Scoping decision (resolved 2026-08-16)

**Ollama: Option A, chosen.** Bundle the Ollama runtime (see O1's corrected
implementation note — it's a `bundle.resources` payload, not an `externalBin`
sidecar) *and* ship one small, lightweight default model file inside the
installer (a 1–3B-class quantized model, exact choice TBD in O2). This is
what makes the MUST-tier "it just chats, offline, on first launch" promise
true without asking a brand-new user to run anything first.

**Real cost, discovered and accepted 2026-08-16 (Option 1 of the follow-up
size discussion):** Ollama's official releases bundle CUDA acceleration by
default and publish no CPU-only variant — verified real download sizes:
Windows `ollama-windows-amd64.zip` 1,391 MB, Linux `ollama-linux-amd64.tar.zst`
1,355 MB, macOS `ollama-darwin.tgz` 146 MB (universal binary, much leaner —
Apple's GPU path doesn't carry the same CUDA weight). The owner explicitly
chose to accept this cost for full GPU support rather than strip CUDA out or
drop bundling the binary — see the Implementation log for the full
size/tradeoff writeup and the two alternatives that were turned down.

**Heavier models: unchanged, stays on the existing on-demand path.** Nothing
new needs building here — the app already supports `ollama pull` for
additional models; that flow is simply how a user upgrades from the bundled
lightweight default to a bigger model later, by choice, with a normal
"this will download N GB" prompt. This isn't Option B's *required* first-run
download — it's optional, user-initiated, and happens after the app is
already fully working.

**Voice OS's Python + pinned deps: bundle too (Option A's approach),** for
the reason in "Priority for v1" above — chat works offline while voice
silently needs a manual install would be a confusing half-measure, not a
real cost saving.

**FFmpeg, Tesseract, Git: excluded from v1 bundling entirely** — not
Option A, not Option B, just left on today's existing detect-and-fetch path,
per "Priority for v1" above. None of them sit on the golden path, so there's
no bundling decision to make for v1; `G1`/`FF1`/`OCR1` below are resolved as
out-of-scope rather than pending.

**Still open, not decided in this pass:** whether to bundle a basic image
generator (ComfyUI vs. AUTOMATIC1111 vs. neither) — see "Priority for v1."
Video generation stays fully out per the acceptance criterion.

- [x] **Decision recorded** — 2026-08-16, owner conversation (not yet an
  installer-size measurement — O1-O4/PY1-PY5 implementation and the real
  measured size per `X3` still need to happen before this can be marked done
  per this document's own evidence rules).

## Task board

### O — Ollama

- [x] **O1** — Done 2026-08-16, with a real architecture correction along the
  way: Ollama is **not** a single self-contained executable — it ships
  `ollama(.exe)` plus a companion `lib/ollama/` (or, on macOS, a flat
  directory) full of backend `.dll`/`.so`/`.dylib` files (`llama-server`,
  per-CPU-microarchitecture GGML variants, `cuda_v12`/`cuda_v13`
  subdirectories), which Tauri's single-file `externalBin` sidecar mechanism
  doesn't fit. Implemented via `bundle.resources` instead (`"vendor/ollama":
  "ollama"` in `tauri.conf.json`, mirroring the existing `voice/backend`
  entry) — no `externalBin` key was added, the "Key facts" note above still
  holds. `scripts/fetch-ollama-runtime.mjs` (new) downloads the pinned
  release (`v0.32.13`), verifies its published sha256, extracts it, and
  stages it into the gitignored `src-tauri/vendor/ollama/` for the bundler to
  pick up — wired into every CI job that runs `tauri build`
  (`.github/workflows/ci.yml`'s `desktop`/`desktop-macos`/`desktop-linux`,
  and `.github/workflows/release.yml`), each with the correct platform key.
  Full verification evidence, including what was and wasn't directly tested,
  is in the Implementation log near the end of this document — do not treat
  this checkbox as "VM-tested and shipped," only as "code + CI wiring done
  and the fetch mechanism proven for real against all three platforms."
- [ ] **O2** — Pick the specific lightweight default model (1–3B-class,
  quantized) per the resolved scoping decision, stage it into the bundle,
  and load it via `ollama create`/a local model path at first launch — no
  first-run download for the default model. Leave the existing `ollama pull`
  flow untouched for users who want a bigger model afterward.
- [x] **O3** — Done 2026-08-16. Added `bundled_ollama_path()` to
  `runtime_manager.rs`, checked first in `find_ollama()` before system-PATH
  detection. Resolved via `current_exe()`'s parent directory rather than
  Tauri's `resource_dir()` API, since `find_ollama()` is a plain function
  called from several sites without an `AppHandle` — this matches
  `resource_dir()`'s actual behavior on Windows (the only platform
  `release.yml`'s tag-triggered publish pipeline builds today), but has not
  been verified to match on macOS/Linux bundle layouts (dmg/appimage/deb
  resource placement can differ) — see the Implementation log.
- [ ] **O4** — Verify a full chat round-trip (send message → real model
  response) works with network disabled after install, not just that the
  Ollama process starts.
- [x] **O5** — Done 2026-08-21, in response to the real Windows/Linux
  installer-build break tracked in `docs/governance/DEFERRED_WORK.md`'s
  2026-08-21 entry (root cause: bundling both `cuda_v12` and `cuda_v13`
  pushed the NSIS installer past a `makensis` data-block limit).
  `scripts/fetch-ollama-runtime.mjs` now prunes `lib/ollama/cuda_v13` after
  staging, keeping `cuda_v12` (backward-compatible with newer drivers too,
  at a larger footprint than keeping only v13 would have been — the
  deliberate tradeoff, see the comment above `CUDA_VARIANT_TO_DROP` in that
  script). Verified for real: ran the fetch script end-to-end against the
  live `windows-amd64` v0.32.13 asset before and after the change —
  `cuda_v13` confirmed absent post-fetch, `cuda_v12` (~1.1GB) and the small
  `vulkan` fallback dir (~50MB) still present. **Verified against real CI
  2026-08-22** (manual `workflow_dispatch` run against the fix branch):
  Windows `Tauri Desktop Build` now succeeds, produced a real
  `Alphonso_2.6.2_x64-setup.exe` (~957MB). Merged via PR #172 (`96354f9`).
  **Linux `Tauri Desktop Build (Linux)` still fails** — different failure
  shape (fails in ~20s vs. the prior successful run's ~2 minutes, suggesting
  a possibly distinct root cause, not necessarily the same size issue) — not
  a blocker since that job is `continue-on-error: true`, but still open; see
  `docs/governance/DEFERRED_WORK.md`'s 2026-08-21/22 entry for the resume
  hint.

### PY — Python / Voice OS

- [ ] **PY1** — Source a standalone/embeddable Python build per platform
  (Windows: python.org embeddable zip; macOS/Linux: `python-build-standalone`
  or equivalent) and stage it in `src-tauri`'s resources.
- [ ] **PY2** — Pre-install Voice OS's pinned dependency set
  (`voice/backend/requirements.txt`) into the bundled interpreter's
  site-packages at build time, so no `pip install` happens on the user's
  machine at all. Several of these (`faster-whisper`'s `ctranslate2`,
  `webrtcvad`, `piper-tts`) are C-extension wheels that link native shared
  libraries (`.dll`/`.so`/`.dylib`) outside the standard Python distribution
  — identify and stage those alongside the interpreter per platform, not just
  the `.py`/`.whl` layer, or the bundled interpreter will import-error on a
  machine that happens to lack them.
- [ ] **PY3** — Update `resolve_voice_python()` (`voice_sidecar.rs:24-53`) to
  check the bundled interpreter first, before the Runtime Hub-managed venv,
  before bare system `python`/`python3`. Do not remove the existing
  fallbacks — reorder them.
- [ ] **PY4** — Bundle the Piper TTS voice model (~60 MB) rather than
  downloading it at first run, consistent with the resolved scoping
  decision — Voice OS is meant to work zero-touch once enabled, and this is
  small enough that there's no real size tradeoff to weigh.
- [ ] **PY5** — Reconcile `G-OTHER5` in `TRUTH_FIRST_EXECUTION_PLAN.md` once
  this lands — that item becomes closed or superseded by this document's
  evidence, not both left open independently.

### GIT — Git (out of scope for v1)

- [x] **G1** — Resolved 2026-08-16: **out of scope for v1.** Git today is
  only required for the optional Runtime Manager tool catalogue
  (ComfyUI/AUTOMATIC1111/Fooocus/AudioCraft), and video generation is
  already excluded from the acceptance criterion. Git stays on the existing
  detect/winget-brew-apt path — no bundling work for v1.
- [ ] **G2** — Deferred, not v1. If a future feature brings Git into the
  core path (or a chosen image-generator bundling decision needs it at
  build time rather than runtime), revisit bundling a portable Git
  distribution and updating `find_git()` (`runtime_manager.rs:471-506`).

### FF — FFmpeg (out of scope for v1)

- [x] **FF1** — Resolved 2026-08-16: **not load-bearing for the core
  session.** Verified directly against `voice/backend/requirements.txt` —
  Voice OS's STT stack (`faster-whisper`, `webrtcvad`, `numpy`) has no
  FFmpeg dependency; it processes raw audio it captures itself, it doesn't
  decode arbitrary media files. The only real consumer is the separate,
  optional Meeting Transcription feature
  (`whisperTranscriptionService.ts` + the standalone Whisper Runtime
  Manager tool's `ffmpeg-python` dependency) — an advanced feature, not the
  golden path. FFmpeg stays on the existing manual-install path for v1.
- [ ] **FF2/FF3/FF4** — Deferred, not v1. Revisit only if Meeting
  Transcription (or a future feature) is promoted into the core
  zero-prerequisite experience.

### OCR — Tesseract (out of scope for v1)

**Correction (2026-08-16):** an earlier draft of this document claimed OCR
didn't exist in the codebase at all. That was wrong — a first-pass grep
missed it. A real OCR adapter exists: `run_ocr_adapter`/`check_ocr_capability`
Tauri commands (`src-tauri/src/lib.rs:868-965`), wired through
`workspaceIntelligenceService.ts` (`checkOcrCapability`/`runOcrAdapter`) and
surfaced as an engine-path field with a `tesseract_cli` adapter option in
`OperatorDashboard.tsx`. It is **not bundled, not auto-installed, and not
even auto-detected via PATH** the way `find_python()`/`find_git()`/
`find_ollama()` work — the user must manually type the full path to an
already-installed Tesseract binary; the backend only verifies that path
exists and then shells out to it. Functionally this is the same gap as
FFmpeg, just with no PATH-search fallback at all.

- [x] **OCR1** — Resolved 2026-08-16: **out of scope for v1.** OCR is only
  reachable through Operator Dashboard's manual-path adapter — an
  advanced/operator feature, not the golden chat/voice path a new user hits.
  Stays on the existing manual-path model for v1.
- [ ] **OCR2/OCR3** — Deferred, not v1. Revisit only if OCR is promoted to a
  core, discoverable feature rather than an operator-only adapter.

### X — Cross-cutting

- [ ] **X1** — Real acceptance testing on genuinely clean VMs, covering every
  bundle target actually shipped (`tauri.conf.json:42-48`): fresh Windows (one
  VM with in-box WebView2, one without, per the WIN1 decision below), fresh
  macOS (`.dmg`), and Linux across **both** packaging paths since they behave
  differently — a `.deb` install on fresh Ubuntu/Debian, and the `.appimage`
  run directly on a non-Debian distro (e.g. Fedora) where no package manager
  is involved at all. Each with a firewall rule blocking outbound traffic
  after the installer is copied over, to prove the "no network needed" claim
  isn't accidentally relying on a cached download. This is the step
  SessionGuard's own retrospective calls out as previously skipped — do not
  repeat that mistake here.
- [ ] **X2** — CI integration: the release build pipeline (`.github/workflows/
  release.yml`) downloads and stages every bundled runtime at build time, not
  relying on a developer's machine already having them cached locally.
- [ ] **X3** — Publish the real, measured installer size per platform once
  the scoping decision is implemented — this is a user-facing tradeoff people
  will notice on first download, not an internal implementation detail.
- [ ] **X4** — Decide and document the update strategy for bundled runtimes
  (Ollama binary, Python, model file if bundled): full reinstall via the
  existing in-app auto-updater (`UpdaterNotification.tsx` +
  `@tauri-apps/plugin-updater`) vs. a separate delta/cache mechanism for the
  large binaries so every app update doesn't re-download gigabytes. Per the
  resolved scoping decision, keep the bundled Ollama model file and Piper
  voice model in a data/cache directory outside the versioned app bundle
  rather than inside it, so a routine app update re-downloads only the small
  application payload — not gigabytes of model weights that haven't
  actually changed.
- [ ] **X5** — Update `docs/GETTING_STARTED.md` once bundling lands — its
  current "Install Ollama from ollama.com" / "Install Python 3.10+" manual
  steps (`docs/GETTING_STARTED.md:9,15-19,90`) become optional/advanced-only
  instructions, not the primary path.
- [x] **WIN1** — Done 2026-08-16. Changed `tauri.conf.json`'s
  `bundle.windows.webviewInstallMode.type` from `"downloadBootstrapper"` to
  `"offlineInstaller"`. Verified against Tauri's real published docs (not
  assumed) — its own comparison table states plainly: `downloadBootstrapper`
  and `embedBootstrapper` both still require internet at install time
  (`embedBootstrapper` only skips downloading the ~1.8MB *bootstrapper*
  itself, not the ~127MB WebView2 *runtime* it then fetches if missing);
  only `offlineInstaller` (+~127MB, embeds the runtime installer) and the
  heavier `fixedVersion` (+~180MB, embeds a specific pinned runtime) need no
  network regardless of OS baseline. `offlineInstaller` is the minimal
  correct choice for this document's acceptance criterion.
  **Not yet verified**: an actual installer build with this setting, run on
  a Windows VM without WebView2 preinstalled and without network access —
  that's `X1`'s job, still open.

## Sequencing

With the scoping decision and G1/FF1/OCR1 resolved 2026-08-16, v1 is now:
**WIN1** (WebView2 — must-fix, do first, it can block the app from even
displaying) → **O** (Ollama binary + bundled default model) → **PY**
(Python + Voice OS's pinned deps) → **X1-X5** (cross-cutting verification,
throughout, not just at the end). **G, FF, OCR are not part of v1
execution** — their sections are resolved-as-out-of-scope, not pending;
nothing to sequence there unless a future pass reopens them. The still-open
image-generation decision (see "Priority for v1") is intentionally not
sequenced here either — it needs its own decision before it has a task
board at all.

**Progress as of 2026-08-16:** WIN1, O1, and O3 are implemented — see the
Implementation log below for exactly what was and wasn't verified before
trusting any of it. O2 (pick + stage the actual default model file), O4
(full offline chat verification), and all of PY and X remain open and
un-started.

## Implementation log (2026-08-16)

Per `REPO_RULES.md` R3/R38, this section states exactly what was verified,
how, and what wasn't — not a summary claiming things work.

**Round 2 — real bugs caught by real CI and review, not by more inspection:**

- **CI failure, real (`Rust Tests & Clippy` job, run `31962282938`):**
  `resource path 'vendor/ollama' doesn't exist`. `tauri-build`'s build script
  validates every `bundle.resources` path on **every** `cargo` invocation
  (`check`/`test`/`clippy`/`build`), not only when actually bundling via
  `tauri build` — a fully gitignored `src-tauri/vendor/ollama/` broke plain
  `cargo check` for every contributor and CI job that hasn't run the fetch
  script. Fixed by committing `src-tauri/vendor/ollama/.gitkeep` (tracked)
  while gitignoring everything else under that directory
  (`src-tauri/vendor/ollama/*` with a `!.gitkeep` negation) — confirmed
  locally afterward: `cargo check` now gets past the resource-path check and
  fails only at the same pre-existing, unrelated `libsqlite3-sys` toolchain
  issue as a clean checkout. The fetch script also re-touches `.gitkeep`
  after populating the directory (it wipes the directory first), so a
  contributor who fetches locally sees it as modified, not deleted — the
  first version of this fix didn't do that and would have shown `.gitkeep`
  as locally deleted, one `git add -A` away from breaking the repo for
  everyone else again.
- **Real functional bug, caught by CodeRabbit review, not by this session's
  own testing:** `launch_ollama()` in `src-tauri/src/lib.rs` — the Tauri
  command the primary chat UI actually calls to start Ollama — never called
  `find_ollama()` at all. It shelled out to a bare `ollama` command via
  `cmd /C start /B ollama serve` (Windows) / `sh -c "ollama serve &"`
  (Unix), relying entirely on PATH. O3 fixed *detection*
  (`find_ollama()`/`bundled_ollama_path()`) but the function that actually
  *launches* the process never used it — meaning a clean install with only
  the bundled binary (no system Ollama on PATH) would still fail to start
  chat, silently defeating the entire point of O1. Fixed: `launch_ollama()`
  now resolves the path via `find_ollama()` and spawns that binary directly
  (`Command::new(&ollama_path).arg("serve")`), dropping the `cmd`/`sh`
  wrapper entirely rather than trying to pass a resolved path through a
  shell string. This is exactly what `O4` ("verify a full chat round-trip
  works") was flagging as unverified — it wasn't just unverified, it would
  have failed outright.
- `scripts/fetch-ollama-runtime.mjs`'s checksum step now hashes the
  ~1.4GB archives as a stream (`createReadStream` piped into `createHash`)
  instead of buffering the whole file into memory first — a real CI
  memory-pressure concern caught by review, not by this session's testing.
  Re-verified end-to-end afterward (real download, real checksum match,
  real extraction) to confirm the streaming change didn't silently break
  verification.

**Round 1 — empirically verified (not assumed):**

- Ollama `v0.32.13`'s published sha256 checksums for `ollama-windows-amd64.zip`,
  `ollama-darwin.tgz`, and `ollama-linux-amd64.tar.zst` were fetched from the
  real `sha256sum.txt` release asset and hardcoded into
  `scripts/fetch-ollama-runtime.mjs`.
- `scripts/fetch-ollama-runtime.mjs` was run for real, end-to-end (download →
  checksum verify → extract → normalize into `src-tauri/vendor/ollama/`),
  against **all three** real release assets, on this Linux sandbox:
  - `darwin-universal`: succeeded. Archive layout is **flat** — no `bin/`/`lib`
    split, `ollama` (a real Mach-O universal x86_64+arm64 binary, confirmed
    via `file`) sits directly at the root alongside every backend
    `.dylib`/`.so`. This contradicted the script's first-draft assumption
    (based on the CI build workflow's intermediate `dist/<os>-<arch>/{bin,lib}`
    layout, which turned out to describe a pre-packaging directory, not the
    shipped archive) — caught by actually running it, not by inspection.
  - `linux-amd64`: succeeded, but only after installing the `zstd` CLI package
    — GNU tar's `--zstd`/`-a` flags shell out to a standalone `zstd` binary
    rather than decompressing it themselves, and failed with "Cannot exec"
    until it was installed. `ci.yml`'s `desktop-linux` job now installs
    `zstd` explicitly alongside its existing webkit2gtk/gtk3 packages — do
    not assume a runner has it. Archive layout: real `bin/`+`lib/` split,
    real ELF binary (confirmed via `file`), `cuda_v12`/`cuda_v13`
    subdirectories present, 2.1GB uncompressed.
  - `windows-amd64`: succeeded via the script's `unzip` fallback path (this
    sandbox's GNU tar cannot read `.zip` at all, unlike Windows' bundled
    bsdtar-based `tar.exe`, which is expected — not directly proven here — to
    take the primary `tar -xf` path instead). Real PE32+ Windows executable
    (confirmed via `file`), same `bin/`+`lib/` split as Linux,
    `cuda_v12`/`cuda_v13` present, 1.9GB uncompressed.
- `cargo fmt --all -- --check` passed clean on the `runtime_manager.rs`
  change (`bundled_ollama_path()` + the `find_ollama()` call site).
- Real download sizes for the three release assets (feeds `X3`, not a
  substitute for it): Windows 1,391 MB, Linux 1,355 MB, macOS 146 MB
  (compressed, as downloaded — uncompressed-staged sizes above are larger).

**Explicitly NOT verified — do not infer these work from the above:**

- `cargo check`/`cargo test`/`cargo clippy` could not be run to completion in
  this sandbox: `libsqlite3-sys`'s build script fails with
  `error[E0658]: use of unstable library feature 'cfg_select'` against this
  environment's Rust toolchain (`rustc 1.94.1`). **Confirmed pre-existing and
  unrelated to this change** — reproduced identically via `git stash` on a
  clean checkout, then restored. This is an environment limitation of this
  sandbox, not evidence this change compiles cleanly elsewhere; a real
  `cargo check` run (CI or a working local toolchain) is still owed before
  trusting the Rust change beyond "passes rustfmt and reads as correct."
- The Windows `.zip` extraction was verified only via the `unzip` fallback,
  never the primary `tar -xf` (bsdtar) path Windows CI will actually take —
  functionally equivalent output, but the exact code path is unconfirmed.
- No `tauri build` was run anywhere this pass (blocked by the same
  `cargo check` environment issue) — the installer has never actually been
  assembled with the new `bundle.resources` entry or `webviewInstallMode`
  setting. `O1`/`O3`/`WIN1` being checked off means "the code and CI wiring
  are in place and the fetch mechanism is proven," not "a working installer
  was produced and tested" — that's `X1`'s job.
- `resolve_voice_python()`-style resource-directory resolution for
  `bundled_ollama_path()` was verified conceptually against the existing
  `voice_sidecar.rs` pattern, not against a running app on any platform.
- O2 (choosing and staging the actual default LLM model file) was not
  attempted this pass — `bundle.resources` currently stages the Ollama
  *runtime* only, no model weights.

**Correction to this document's own earlier framing:** an earlier pass
described `release.yml` as the only build pipeline and implied macOS/Linux
had no build coverage at all. That undersold what exists: `ci.yml` already
runs `tauri build` for **all three platforms** as artifacts on `main`
pushes/manual dispatch (`desktop` for Windows is blocking; `desktop-macos`
and `desktop-linux` are `continue-on-error: true`) — it just doesn't publish
those artifacts as a public release the way `release.yml`'s tag-triggered
Windows build does. The fetch script is now wired into all three `ci.yml`
jobs, not just `release.yml`.

## Definition of done

This document's work is complete when the acceptance criterion at the top —
not the existence of any task's code — has passed on real, network-isolated,
nothing-preinstalled VMs for Windows, macOS, and Linux, with the evidence
recorded here in the same format `TRUTH_FIRST_EXECUTION_PLAN.md` already
requires: command or procedure, date, result, and any remaining limitation.
A task checked off based on "the bundling code exists" without that VM
evidence is not done — reopen it.

Per `REPO_RULES.md` R22/R38, run `scripts/verify.sh` (or `scripts/verify.ps1`
on Windows) and cite its result alongside the VM evidence above — it is this
repo's standing verification baseline (secret-scan, doc-freshness, build,
test, deploy-dry) and is required regardless of how narrow a given task's
change surface is (R17).
