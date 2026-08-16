# Alphonso Dependency Bundling — Zero-Prerequisite Install

**Status:** DRAFT — not started
**Owner:** unassigned
**Applies to:** the desktop Tauri build only (`src-tauri/`), not the cloud
gateways, MCP server, or bridge, which already run in managed containers with
their own dependency images.
**Canonical project facts:** [ALPHONSO_GROUND_TRUTH.md](ALPHONSO_GROUND_TRUTH.md)
**Active backlog:** [TRUTH_FIRST_EXECUTION_PLAN.md](TRUTH_FIRST_EXECUTION_PLAN.md)
— item `G-OTHER5` ("Voice OS Python prerequisite has no auto-install path")
is the existing open thread this document supersedes and expands. Reconcile
that item's status with this document in the same change once work starts.

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
| Tesseract / OCR | **Not implemented anywhere in this codebase** | N/A | N/A — not in scope unless a new feature requires it |
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

## Scoping decision needed before work starts

This is the one decision that changes every task below, so resolve it first
and record the answer here rather than letting each task guess independently:

**Option A — Fully self-contained, no network required after download.**
Bundle the Ollama binary as a Tauri `externalBin` sidecar, ship one small
default model file (e.g. a ~1–2 GB quantized model) inside the installer,
bundle an embeddable/standalone Python build with Voice OS's pinned
dependencies pre-staged, and bundle a static FFmpeg binary per platform.
Installer size grows from the current lightweight NSIS/DMG/AppImage to
several gigabytes per platform. True "airplane mode, still works" experience.

**Option B — Bundle only the small pieces, keep the model as a required
first-run download.** Bundle Python (embeddable/standalone) and FFmpeg
(static builds are small, tens of MB), bundle Ollama the binary itself, but
leave the default model as a first-run download with clear progress UI
instead of shipping it in the installer. Installer stays in the tens-to-low-
hundreds-of-MB range; the app still needs network once, on first launch, to
be usable — matching how comparable local-LLM apps (e.g. LM Studio) already
behave.

Record the decision here once made:

- [ ] **Decision recorded** — Option A / Option B / other, with rationale and
  the installer-size number that was actually measured, not estimated.

## Task board

### O — Ollama

- [ ] **O1** — Bundle the Ollama binary as a Tauri `externalBin` sidecar for
  Windows/macOS/Linux (add to `tauri.conf.json`'s `bundle.externalBin`, sign
  per platform where required).
- [ ] **O2** — Resolve the scoping decision's model question: either stage a
  default model file into the bundle and load it via `ollama create`/local
  path, or build the first-run download UI with resumable progress and a
  clear "this needs internet once" message.
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
  machine at all.
- [ ] **PY3** — Update `resolve_voice_python()` (`voice_sidecar.rs:24-53`) to
  check the bundled interpreter first, before the Runtime Hub-managed venv,
  before bare system `python`/`python3`. Do not remove the existing
  fallbacks — reorder them.
- [ ] **PY4** — Resolve the Piper TTS voice model the same way as the Ollama
  model in the scoping decision: bundle it (~60 MB, small enough that this is
  a fairly easy "yes") or keep it as a first-run download with clear UI.
- [ ] **PY5** — Reconcile `G-OTHER5` in `TRUTH_FIRST_EXECUTION_PLAN.md` once
  this lands — that item becomes closed or superseded by this document's
  evidence, not both left open independently.

### GIT — Git

- [ ] **G1** — Decide whether Git needs bundling at all for the *core*
  acceptance criterion. Git today is only required for the optional
  Runtime Manager tool catalogue (ComfyUI/AUTOMATIC1111/Fooocus/AudioCraft),
  which is explicitly out of scope per the acceptance criterion above. If
  the core session never calls Git, this whole domain can be marked
  **out of scope** rather than done — record that decision explicitly here
  instead of leaving it silently unaddressed.
- [ ] **G2** — If a future feature does bring Git into the core path, bundle
  a portable Git distribution per platform and update `find_git()`
  (`runtime_manager.rs:471-506`) to check it first.

### FF — FFmpeg

- [ ] **FF1** — Determine what in the *current, shipped* app actually invokes
  FFmpeg today. The only references found are the policy-gate allow-list
  (`policy_gate.rs:27,141,261-263`) and the `ffmpeg-python` pip package name
  listed for the optional Whisper tool (`runtime_manager.rs:129`) — neither
  is confirmed to be an active, user-facing feature path. Answer this before
  bundling anything; do not bundle a multi-platform static FFmpeg build for a
  capability that turns out to be unused.
- [ ] **FF2** — If a real feature depends on it, source static FFmpeg builds
  per platform (note license: FFmpeg's licensing varies by which codecs are
  compiled in — verify GPL vs. LGPL implications for the specific build used
  before redistributing).
- [ ] **FF3** — Add a `find_ffmpeg()` function mirroring the existing
  `find_python()`/`find_git()`/`find_ollama()` pattern in
  `runtime_manager.rs`, checking the bundled binary first.
- [ ] **FF4** — Point `policy_gate.rs`'s allow-listed `ffmpeg`/`ffmpeg.exe`/
  `ffprobe`/`ffprobe.exe` entries at the resolved bundled path.

### OCR — Tesseract

- **Not applicable.** Tesseract/OCR does not exist anywhere in this codebase
  today (confirmed by a full-repo search — no source-code references). Do
  not add this as a bundling task; if OCR becomes a real feature requirement
  later, that is new feature work, not a bundling gap, and belongs in a
  separate plan.

### X — Cross-cutting

- [ ] **X1** — Real acceptance testing on genuinely clean VMs: fresh Windows
  (no Store apps, no WebView2 preinstalled beyond OS default), fresh macOS,
  fresh Ubuntu/Debian, each with a firewall rule blocking outbound traffic
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
  large binaries so every app update doesn't re-download gigabytes.
- [ ] **X5** — Update `docs/GETTING_STARTED.md` once bundling lands — its
  current "Install Ollama from ollama.com" / "Install Python 3.10+" manual
  steps (`docs/GETTING_STARTED.md:9,15-19,90`) become optional/advanced-only
  instructions, not the primary path.

## Sequencing

Recommended order: resolve the **scoping decision** first (it changes every
other estimate) → O (Ollama) → PY (Python/Voice OS) → FF (FFmpeg, only after
FF1 confirms it's load-bearing) → G (Git, likely out-of-scope per G1) → X
(cross-cutting verification, throughout — not just at the end).

## Definition of done

This document's work is complete when the acceptance criterion at the top —
not the existence of any task's code — has passed on real, network-isolated,
nothing-preinstalled VMs for Windows, macOS, and Linux, with the evidence
recorded here in the same format `TRUTH_FIRST_EXECUTION_PLAN.md` already
requires: command or procedure, date, result, and any remaining limitation.
A task checked off based on "the bundling code exists" without that VM
evidence is not done — reopen it.
