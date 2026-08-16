# Alphonso Dependency Bundling — Zero-Prerequisite Install

**Status:** DRAFT — v1 scope decided 2026-08-16 (see "Priority for v1" and
"Scoping decision" below), implementation not started
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

- **Windows WebView2.** `tauri.conf.json`'s `bundle.windows.webviewInstallMode`
  is set to `"downloadBootstrapper"` (`tauri.conf.json:80-83`), which fetches
  the Edge WebView2 runtime from Microsoft at install time if the target
  machine doesn't already have it. Recent Windows 10/11 ship WebView2
  in-box, so a genuinely clean *recent* Windows VM may already satisfy this
  — but "nothing preinstalled" must not quietly assume that. Resolve one of:
  switch to `"embedBootstrapper"` or `"offlineInstaller"` (larger installer,
  no network needed regardless of OS baseline) or explicitly document the
  supported Windows baseline this plan assumes already has WebView2, and
  test both the "has it" and "doesn't have it" cases on real VMs.
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
  sense.
- `voice_sidecar.rs`'s `resolve_voice_python()` falls back to a bare
  `python`/`python3` off PATH if no managed venv exists, which the code's own
  comments flag as a crash risk on first missing import
  (`voice_sidecar.rs:22-53`).
- Bundle targets are `nsis`, `dmg`, `app`, `appimage`, `deb`
  (`tauri.conf.json:42-48`); no `msi` target is configured today.

## Scoping decision (resolved 2026-08-16)

**Ollama: Option A, chosen.** Bundle the Ollama binary as a Tauri
`externalBin` sidecar *and* ship one small, lightweight default model file
inside the installer (a 1–3B-class quantized model, exact choice TBD in O2).
This is what makes the MUST-tier "it just chats, offline, on first launch"
promise true without asking a brand-new user to run anything first.

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

- [ ] **O1** — Bundle the Ollama binary as a Tauri `externalBin` sidecar for
  Windows/macOS/Linux (add to `tauri.conf.json`'s `bundle.externalBin`, sign
  per platform where required). Tauri requires each sidecar binary to be
  named with its Rust target triple (e.g.
  `ollama-x86_64-pc-windows-msvc.exe`, `ollama-aarch64-apple-darwin`), so the
  build pipeline must produce and stage both `x86_64` and `aarch64` builds
  per platform Alphonso ships for (notably macOS, which supports both Intel
  and Apple Silicon) — a single-architecture binary will silently fail to
  resolve on the other.
- [ ] **O2** — Pick the specific lightweight default model (1–3B-class,
  quantized) per the resolved scoping decision, stage it into the bundle,
  and load it via `ollama create`/a local model path at first launch — no
  first-run download for the default model. Leave the existing `ollama pull`
  flow untouched for users who want a bigger model afterward.
- [ ] **O3** — Update `find_ollama()` (`runtime_manager.rs:520-562`) to check
  the bundled sidecar path before falling back to system-PATH detection, the
  same pattern the reference SessionGuard document uses for its own runtimes.
- [ ] **O4** — Verify a full chat round-trip (send message → real model
  response) works with network disabled after install, not just that the
  Ollama process starts.

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
- [ ] **WIN1** — Resolve the WebView2 gap called out in the acceptance
  criterion: either change `tauri.conf.json`'s
  `bundle.windows.webviewInstallMode` from `"downloadBootstrapper"`
  (`tauri.conf.json:80-83`) to `"embedBootstrapper"` or `"offlineInstaller"`
  so Windows install genuinely needs no network regardless of OS baseline,
  or explicitly document the minimum Windows build this plan assumes already
  ships WebView2 in-box and test the installer against a VM just below that
  baseline to confirm it fails predictably rather than silently.

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
