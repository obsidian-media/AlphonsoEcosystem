# Smart Installer ("Ritual Installer") — Design

**Date:** 2026-09-07
**Branch:** `feat/smart-installer-bundling`
**Status:** design, not yet implemented
**Supersedes:** `docs/SMART_INSTALLER_SPEC_2026-09-06.md` (Copilot draft, agent-grid-first
flow) — kept in the repo for historical reference only, do not implement from it.
**Builds on top of:** `docs/DEPENDENCY_BUNDLING_PLAN.md` (the separate, in-progress
effort that decides what ships *inside* the installer itself — Ollama binary,
default model, Voice OS Python deps). This document does not duplicate that
plan or re-decide its scope; it treats that plan's task board as a moving
baseline and its "current baseline" table as the source of truth for what's
actually bundled at any given time.

---

## 1. Purpose

Replace the placeholder in-app `OnboardingWizard.tsx` first-run flow with a
richer, pre-launch "Setup" experience: an intent-first wizard (what do you
want Alphonso to do, not which of 25 connectors do you want) that combines a
real hardware scan with the user's stated intent to produce a concrete,
editable install plan, installs it in parallel with an early-exit path to
chat, and closes with a themed activation sequence before handing off to the
real app.

This is explicitly a UX/onboarding project, not a bundling project — it
answers "how does a user choose and install the *optional* tier" (image
generation, voice, memory, workflow tools), not "what ships inside the base
installer" (that's `DEPENDENCY_BUNDLING_PLAN.md`'s job).

## 2. Platform scope

**v1: Windows + Linux only.** macOS is explicitly deferred — `release.yml`
has no `build-macos` job today (only `build-windows`/`build-linux`); macOS
only exists as an unpublished, advisory `ci.yml` artifact, and nobody has
ever been able to download a real macOS build from a GitHub release.
Standing up a real macOS release pipeline (build, signing, notarization,
publish) is a prerequisite for macOS Smart Installer work and is a separate,
materially-sized undertaking from this project. Tracked in
`docs/governance/DEFERRED_WORK.md`'s 2026-09-07 entry — do not re-decide this
here, follow that entry's resume hint when macOS work starts.

## 3. Architecture: same-binary dual-mode, not a separate executable

**Decision:** the Setup experience ships as an additional mode of the
existing Alphonso binary — not a second, separately-built/signed executable,
and (self-critique correction, see below) not Tauri's formal multi-window
"Splashscreen" pattern either. It reuses the exact same gating mechanism
`OnboardingWizard.tsx` already uses today.

**Why, in order of how the decision was actually reached (kept for the
record — the reasoning that ruled out a separate binary is still correct,
only the final mechanism changed on a later self-critique pass):**

1. The user's original requirement was "genuinely separate pre-launch
   bootstrap" (not the existing in-app `OnboardingWizard.tsx`, first-run
   window inside the running app). A literal separate binary
   (`AlphonsoSetup.exe`) was the first design that satisfied this, and was
   agreed to initially.
2. Investigating what that would take surfaced two costs: (a) no Cargo
   workspace exists in this repo today — `src-tauri/Cargo.toml` is a single
   standalone crate, so a second binary needs a first-time workspace
   restructure plus either duplicated detection logic or a new shared crate;
   (b) a second binary means a second thing to keep in sync with every
   `runtime_manager.rs` change, and a second entry in the release/signing
   pipeline forever.
3. Checking how the "launch Setup automatically after install" mechanism
   would actually work per platform found it doesn't generalize: Windows NSIS
   has a real `installerHooks`/`NSIS_HOOK_POSTINSTALL` mechanism (confirmed
   against Tauri's own docs — `tauri.conf.json`'s NSIS config already has an
   unused `"installerHooks": null` extension point for this), but macOS
   `.dmg` has **no install step at all** (the user drags to Applications,
   nothing runs automatically) and the Linux `.AppImage` (the only Linux
   artifact actually published) **also has no install step** — running the
   AppImage *is* using the app. A mechanism that only exists on one of three
   platforms can't be the primary design. This step's conclusion (same
   binary, not a second one) still holds.
4. **First self-critique pass** proposed Tauri's documented "Splashscreen"
   pattern (hidden `main` window + a shown second window, a Rust `setup`
   hook deciding when to swap them) as the mechanism. This was presented as
   confirmed/bulletproof at the time — it wasn't wrong exactly, but it was
   never checked against what this codebase already does for the exact same
   problem.
5. **Second self-critique pass (this one) found that check was skipped.**
   `OnboardingWizard.tsx` — the thing Setup replaces — already solves "show
   a full-takeover first-run experience instead of the main app" today,
   verified directly in `App.tsx`:
   ```
   showOnboarding initial state = !getStorage('alphonso_onboarding_complete_v1', false)
   render: if (showOnboarding && !settings.selectedModel) { render <OnboardingWizard/> in place of the entire app shell }
   ```
   A plain `localStorage` flag (via `src/lib/appStorage.ts`'s typed
   wrapper), checked in JS at React state-init, with a top-level conditional
   render that replaces the whole shell (sidebar, chat, everything) — no
   Rust involvement, no second Tauri window, no on-disk marker file, no CLI
   flag. This already delivers a full-takeover "separate" experience; the
   Tauri Splashscreen pattern would have solved a problem this codebase
   doesn't have.

**Resulting design:** Setup replaces `OnboardingWizard` at the exact same
gating point, using the same kind of mechanism — very likely extending or
directly reusing the `alphonso_onboarding_complete_v1` key (naming TBD in
the implementation plan), not a new Rust marker file. On app boot, if the
flag is unset, render the Setup flow instead of the app shell, exactly like
`OnboardingWizard` does today, just fuller (system scan, intent, install
queue, activation) instead of the current 6 steps. Windows' `installerHooks`
remains available as an optional accelerator (auto-launch the app
immediately after NSIS finishes) but is now clearly optional polish, not
something the core mechanism depends on either way.

This does **not** require a Cargo workspace, a second binary, a second
signing/release pipeline, a second Tauri window, or new boot-sequence Rust
code for window swapping. It **does** still require new Rust code inside
`src-tauri/`: hardware detection (GPU/RAM/disk — none of `find_python`/
`find_git`/`find_ollama`/`find_docker`/`find_node` cover this; there is no
`sysinfo` or equivalent crate in `Cargo.toml` today) exposed as new Tauri
commands the existing frontend-gating pattern can call, same as any other
Runtime Hub command today.

## 4. Relationship to `OnboardingWizard.tsx`

**Retire it once Setup ships.** Every one of its 6 steps already has a
standalone permanent home elsewhere in the app for "change this later,"
confirmed directly rather than assumed:

- Ollama/model check → Runtime Hub (install any tool anytime)
- Approval-mode decision → `SettingsView.tsx`'s standalone `settings.approvalMode`
  toggle, independent of the wizard (`SettingsView.tsx:1095-1100`)
- Connect-a-channel (Telegram/WhatsApp/Composio) → `ConnectorSetupPanel.tsx`,
  reachable from Settings anytime
- Advanced-services check (ChromaDB/Voice OS) → Runtime Hub

There is no unique capability a "demoted" wizard would preserve. `--first-run`
(or the marker-file equivalent) goes straight to a working chat once Setup
has run; anyone adding capabilities later uses Runtime Hub/Settings like any
other change, not a wizard.

### 4.1 Flag-write timing (self-critique fix — was unstated)

The completion flag (§3 — `alphonso_onboarding_complete_v1` or its
Setup-specific successor) must be written **only** on reaching Launch
(step 8) or an explicit "Skip Setup" action — never earlier, and never
optimistically — exactly matching how `OnboardingWizard.tsx`'s `onComplete`
callback already only fires `setShowOnboarding(false)` once its own flow
finishes, not partway through. If the app is killed mid-install (crash,
forced close, power loss), the flag must not be set yet, so the next launch
re-enters Setup rather than dumping the user into a half-installed app with
no way back to finish. This also means Setup's own progress state (which
components were already Ready before the crash) should be persisted
separately and resumed, not re-run from scratch — the broader
"recover interrupted work on next boot" shape used by
`recoverInterruptedExecutions()`/`recoverInterruptedOutreachCalls()`
elsewhere in this codebase is a reasonable pattern to follow for *that* part
specifically, though those are JS-side queue/execution recovery, not a
direct precedent for a UI-gating flag — the gating flag's own precedent is
`showOnboarding` itself, cited above.

### 4.2 Existing-install detection on upgrade (self-critique fix — was silently dropped)

A user who installs a version with Setup *after* already having used today's
detect-and-fetch Runtime Hub flow (e.g. already has ComfyUI or Voice OS
manually installed) must not be told to reinstall them. The System Scan step
must check Runtime Hub's existing installed-tool state (`getAllStatus()`/
equivalent) alongside hardware, and the Recommended Setup screen must show
already-installed components as already-satisfied, not as items to queue.
This was present in the original superseded Copilot draft's "Upgrade &
Backward Compatibility" section and was dropped without a deliberate decision
when this document replaced that draft — restored here as a hard requirement,
not an optional nice-to-have.

## 5. Screen-by-screen flow

Corrected from the user's original draft flowchart — mechanics kept
(scan → results → selection → queue → activation → launch), the
"capability selection" step replaced with an intent-first design, two new
steps added (Recommended Setup, Early Exit), agent roster corrected.

1. **Boot / Ritual Intro** — emblem forms, brief scanline sweep, skippable,
   2-3s. Visual direction: **Cyberpunk Ritual** (neon grid lines, glow rings,
   monospace HUD readouts) — confirmed over two alternatives (Minimal Sci-Fi
   Calm, Agent Constellation) that were mocked up and rejected. **Color
   correction, refined on a third pass (the first correction overcorrected):**
   every mockup produced during this design used an invented cyan
   (`#00D9FF`), carried over uncritically from the superseded Copilot draft's
   CSS variable. Sampling the real shipped app-icon emblem
   (`logo-banner-thumbnail-media/alphonso_app_icon_06_main/`) found its true
   color is green (`#8EDB64` lit facet, `#1D5818` shadow) with an orange
   accent (`#F87C02`) — that part still stands, and is corrected in step 7
   below. But checking `src/styles/tokens.css` (skipped in the first color
   pass) found the app's **existing, established, pervasively-used UI accent
   token is itself cyan** — `--accent: oklch(78% 0.18 200)`, explicitly
   commented `/* Accent — cyan (mascot primary) */`, used throughout
   `OnboardingWizard.tsx`, `SettingsView.tsx`, and the rest of the shipped
   product (including WCAG-contrast fixes already made against this and
   adjacent tokens — see that file's own comments). **Resolved split:**
   general Setup UI chrome (buttons, step indicators, progress-bar "in
   progress" state, focus rings) should use the existing `var(--accent)`
   cyan token, matching every other screen in the app rather than
   introducing a jarring, inconsistent second primary color — only the
   **Activation Sequence's emblem-reveal moment** (§5 step 7) should use the
   real sampled green/orange, since that's the one place literally revealing
   the actual brand mark. Implementation should add new tokens (e.g.
   `--emblem-green`, `--emblem-orange`) to `src/styles/tokens.css` for that
   specific use, not replace `--accent` globally. Per-agent tile colors
   (Miya pink, Marcus red, etc.) are unaffected either way.
   **Implemented 2026-09-08** as `src/components/setup/BootRitualIntro.tsx`
   — a real, late gap: the original implementation pass shipped step 7
   (Activation Sequence) but skipped this step entirely, so Setup opened
   straight into a plain "Scanning your system…" text with none of the
   ritual visual direction described above. Caught only when directly
   asked whether the "whole visual ritual" had actually been built.
   **Visually confirmed working 2026-09-09** in a real `npm run tauri dev`
   run — clean emblem render, animated cyan glow/pulse/scanline sweep (not
   a static flash), readable HUD text, and a correct auto-advance into
   System Scan with no click needed. See
   `docs/governance/DEFERRED_WORK.md`'s 2026-09-09 entry.
2. **System Scan** — GPU (presence/vendor/VRAM if detectable), RAM, disk free,
   Python, Ollama, **and Docker** (new — required because n8n/ChromaDB/
   OpenHands in Runtime Hub's tool catalogue all launch via `docker run`, not
   pip/git as originally assumed; confirmed directly against
   `runtime_manager.rs`'s `ToolDef` list). Docker gets no auto-install path
   (unlike Python/Git/Ollama, which already have winget/brew/apt
   auto-install via `runtime_install_prerequisite`) — Docker Desktop's
   install is interactive/EULA-gated and often needs a reboot for WSL2, so
   the scan must hard-detect it and offer a manual-install link only, never
   promise an automatic install. **Contrast with Python** (needed for
   Fooocus/ComfyUI/AUTOMATIC1111/InvokeAI/Voice OS): Python already has a
   working auto-install path via `runtime_install_prerequisite`
   (winget/brew/apt), confirmed against `runtime_manager.rs`. The scan/
   recommendation UI must treat these two differently — Python-missing shows
   an "Install for me" action, Docker-missing shows only a manual-install
   link — not the same generic "prerequisite missing" treatment for both.
3. **Intent Selection** — replaces the agent-hologram-grid as the first real
   choice. Six large tiles, plain language, no agent jargon: **Chat Only /
   Chat + Images / Chat + Voice / Full Power Mode / Custom**.
   **Clarification (self-critique fix — this branch was ambiguous):**
   picking one of the first four tiles proceeds to step 4 (Recommended
   Setup) as described below. Picking **Custom** skips step 4 entirely and
   goes straight to the agent-grid (the same grid step 4's "Customize"
   button also reaches) — there is no meaningful "recommendation" to show
   without a stated intent to combine with the hardware scan, so Custom is a
   direct shortcut into the grid, not a degraded version of step 4.
4. **Recommended Setup** — the "smart" step. Combines scan results + intent
   into an editable, agent-colored line-item list. Each recommendation shows
   *why* inline (folded in from competitive research on LM Studio/Jan/
   GPT4All, which all put hardware-fit warnings directly on the
   model/tool choice rather than as a separate scan readout read once and
   forgotten) — e.g. "No GPU detected — image generation will be slow
   (CPU-only)" sits next to the Fooocus line item, not buried in the earlier
   scan screen. Model size is a hybrid recommendation: the scan suggests a
   tier (small/medium/large based on RAM/VRAM) but the user confirms it
   rather than it being silently auto-picked; meanwhile a small fixed
   starter model downloads first regardless, so chat works immediately while
   a larger recommended model can continue downloading in the background if
   the user opts in. "Looks Good → Install" or "Customize" (drops into the
   original agent-grid, demoted to the power-user path here, not gone).
   Already-installed components (see §4.2) render as satisfied, not queued.
   **Disk-space precheck (self-critique fix — was in the superseded draft,
   silently dropped from an earlier version of this document):** before
   "Looks Good → Install" can proceed, sum the selected components' sizes
   against free disk space on the target drive; if insufficient, block with
   a clear "need N GB more" message and options to deselect a large
   component or choose a different drive — never let the user discover this
   thirty minutes into a Fooocus download.
5. **Install Queue** — per-task agent-colored progress bars, status states
   (Pending → Downloading → Extracting → Configuring → Ready → Error), real
   bytes/ETA. Starter model prioritized first in the queue.

   **Implemented 2026-09-08.** `installComponent()` in `setupFlowService.ts`
   gained an optional `onProgress` callback that normalizes two real,
   previously-unwired progress mechanisms into one `{message, pct}` shape:
   `pullOllamaModel()`'s real byte-based pull progress (`ollama.ts`) and
   `installTool()`'s real `runtime://progress` Tauri events (`runtime_manager.rs`).
   `InstallQueue.tsx` renders that message and a percentage-width bar per
   task, colored by the same per-agent palette `AgentGrid.tsx` uses (exported
   as `COMPONENT_AGENT_COLORS` so the two never drift apart), with an
   indeterminate sweep animation when a mechanism hasn't reported a
   percentage yet (e.g. "starting", "verifying digest"). Honest deviation
   from this doc's imagined state names: the real stage strings are whatever
   ollama/Runtime Hub actually emit ("pulling manifest", "cloning",
   "installing_deps", etc.), not a fixed
   Pending/Downloading/Extracting/Configuring/Ready/Error enum — showing the
   real string is more honest than inventing a mapping to fictitious states.
6. **Early Exit → Chat Now** (new) — the instant the starter model reaches
   Ready, a pulsing "Start Chatting Now" control appears; the user doesn't
   have to wait for Fooocus/Voice OS/Chroma to finish. Those continue
   installing in the background after the main app opens.

   **Implemented 2026-09-08.** Previously `InstallQueue.tsx` auto-fired
   `onStarterReady()` the instant the starter model's status became `ready`
   — there was no control, pulsing or otherwise, and no user choice; the
   flow silently jumped to chat. Fixed: the starter model reaching `ready`
   now renders a real pulsing `motion.button` ("Start Chatting Now", reusing
   Framer Motion's opacity-loop pattern) instead, and `onStarterReady()`
   only fires on click. If the user never clicks it and the whole queue
   finishes successfully anyway, `onAllComplete()` fires as a fallback so
   the flow can't get stuck.
7. **Activation Sequence** — kept from the original draft's structure: (A)
   full-screen pulse in the real Alphonso green (`#8EDB64`, corrected from
   the draft's invented cyan — see step 1's color correction), (B)
   portal/radial expansion, (C) emblem ignite using the real emblem asset
   (§7) + "Alphonso is online." Two trigger contexts: **full sequence** (3-4s,
   full-screen) if the user waited for everything; **short toast variant**
   (~1.5s, non-blocking, doesn't interrupt an already-open chat) if the user
   already exited early and a background task finishes later.
8. **Launch** — main app opens, chat focused, starter model already loaded.

## 6. Corrected component reference data

Every size figure below was verified against an official/primary source this
session, not carried over from the two Copilot drafts, several of which were
meaningfully wrong:

| Component | Verified figure | Source |
|---|---|---|
| Ollama runtime (bundled, Windows/Linux, CUDA) | 1,391MB / 1,355MB compressed | `DEPENDENCY_BUNDLING_PLAN.md`'s real measured fetch, not estimated |
| Ollama runtime (bundled, macOS) | 146MB compressed | same |
| WebView2 offline installer | +127MB | `DEPENDENCY_BUNDLING_PLAN.md` (`WIN1`), cross-checked against Tauri docs |
| `llama3.2:3b` starter model | 2.0GB | Ollama's own library page |
| Fooocus | ~12-18GB installed, 30GB+ free recommended | Fooocus's own docs/community guides (was wrongly listed as a flat 25GB) |
| ComfyUI | ~6-10GB installed before any models | Official Comfy docs (was wrongly listed as 30GB) |
| AUTOMATIC1111 | ~10GB minimum install | Community-verified guides |
| InvokeAI | ~12-20GB | InvokeAI's own install docs |
| Voice OS deps (`faster-whisper`, `piper-tts`, `webrtcvad`, `fastapi`, etc.) | Lightweight, **no torch** — `faster-whisper` uses `ctranslate2`, not PyTorch | Verified directly against `runtime_manager.rs`'s pinned `pip_packages` list and `voice/backend/requirements.txt`; the Dependency Bundling Analysis doc's "torch ^2.1 CPU, 2GB+" claim is false |
| n8n (docker image) | ~180-260MB compressed | Docker Hub layer data |
| ChromaDB (docker image) | ~140-165MB compressed | Docker Hub layer data |
| OpenHands (`ghcr.io/all-hands-ai/runtime`) | ~6.49GB | GitHub Container Registry data — the heaviest single optional component in the whole catalogue |

**Docker-based tools, confirmed directly against `runtime_manager.rs`**: n8n,
ChromaDB, and OpenHands all launch via `docker run` (`exe: "docker"` in their
`ToolDef`), not npm/pip installs as both source drafts assumed. `find_docker()`
exists (detection only) — no install path exists for Docker itself.

**Full Runtime Hub catalogue is 14 tools**, not 13 as `CLAUDE.md` states —
`ollama, comfyui, automatic1111, fooocus, invokeai, whisper, audiocraft,
openwebui, voice-os, n8n, mcp-server, alphonso-bridge, chromadb, openHands`.
Doc correction, not part of this project's scope to fix.

## 7. Agent roster (verified, corrected from the original draft)

The real 9 agents, confirmed against `src/agents/agentRegistry.js`:
**Alphonso, Jose, Miya, Hector, Maria, Marcus, Echo, Sentinel, Nova.**

The user's original draft flowchart listed 8 tiles including **"Boardroom"**
— Boardroom is not an agent, it's a multi-agent group-chat feature. The draft
also omitted **Sentinel** and **Nova** entirely. Any agent-grid UI (the
Custom-path fallback in step 4 above) must use the corrected 9, not the
draft's 8.

**Real agent art assets supplied by the user (2026-09-07), for use once
implementation reaches the visual-polish pass — not needed for this design
doc's structure, saved locally rather than left as ephemeral URLs so this
document doesn't rot (self-critique fix — the first draft of this section
only pointed at CloudFront URLs and conversation history, which would be
unrecoverable once this doc outlives that context):**

Downloaded and verified as real images (2048×2048 character portraits, full
figure, dramatic lighting — not icon-style art) into
`docs/superpowers/specs/assets/agents/`, **all 9 now complete**:

- `alphonso.png` — an alpaca in an ornate blue/gold robe with sunglasses
  (confirmed by direct inspection)
- `hector.png` — an alpaca in a library, tech goggles, denim jacket (supplied
  directly by the user 2026-09-07 with a full local path, superseding the
  earlier Higgsfield-generated asset `gPcA434m0d4`)
- `miya.png`, `marcus.png`, `jose.png`, `maria.png`, `sentinel.png`,
  `echo.png`, `nova.png` — downloaded, not yet individually inspected

**Correction (self-critique fix, caught by the user, not found independently
this pass): a real Alphonso emblem already exists — the earlier claim in this
document that "no emblem suited for an ignite animation exists" was wrong**
because it only checked `src-tauri/icons/` (flat packaged-icon exports) and
never looked at `logo-banner-thumbnail-media/` at the repo root, which holds
the actual source brand assets. The real emblem — a hexagonal shield with a
glowing green outline, an "M" mark, and a subtle circuit-board texture,
exactly the kind of clean silhouette a `stroke-dasharray` glow-draw
animation needs — is saved into this spec's assets at
`docs/superpowers/specs/assets/alphonso_emblem_master_1024.png` (1024×1024
master) and `alphonso_emblem_wrapper.svg` (raster-wrapped SVG; per that
folder's own `README.txt`, this is high-quality raster art cropped from a
concept sheet, not hand-vectorized — fine for a mid-animation glow overlay,
but not something to trace into crisp vector paths without redoing it as
real vector art first). **This is also where the real green/orange brand
colors in step 1 above were sampled from.** No new emblem generation is
needed for v1.

Also found in that same folder, useful context for future visual-polish work
though not required for this design: `ALPHONSO_LOGO.webp` and
`ALPHONSO_BANNER.webp` show the full 9-agent roster together as a "team"
composition with a secondary circular quadrant badge (cloud/clock/chart/
heart, one color per theme) distinct from the hexagonal app-icon emblem —
worth being aware of as an alternate official mark if a second, non-app-icon
badge is ever needed, but not something this project needs to resolve now.
A further group composition, supplied directly by the user (2026-09-07,
newer than the banner above), showed 8 agent characters in a library
setting around a glowing crystal-globe, titled "Alphonso Ecosystem" —
useful additional reference for the boot/ritual-intro screen's mood
(library/knowledge motif, glowing central orb) alongside the portrait set
above.

**Post-derivation cleanup (2026-09-08, self-critique):** the raw source
files this section describes (`docs/superpowers/specs/assets/`, ~58MB of
uncompressed PNGs) were removed from the repo after this pass — they were
one-time intermediate input to the crop/compress step below, never
referenced by the running app, and committing 58MB of throwaway derivation
input to permanent git history for a ~78KB final output was a real mistake,
caught late rather than avoided. The actual shipped assets
(`src/assets/agents/setup/*.webp`, `src/assets/branding/alphonso-emblem.webp`)
remain in the repo as normal; this paragraph's file paths are historical
record of the process, not live references.

Everything else in the Ritual UI (scanline grids, glow rings, portal
expansion, particle fields) is built procedurally in CSS/SVG/Framer Motion —
confirmed by how the mockups for this design were actually built — and does
not need AI-generated art.

## 8. Cross-cutting risks flagged during research (not part of this project, but block or inform it)

- ~~**Suspected Linux `.AppImage` Ollama-bundling gap**~~ — **RETRACTED, the
  suspicion was wrong.** An earlier version of this section claimed
  byte-level inspection showed the Linux release shipped without the bundled
  Ollama runtime. Verified properly on 2026-09-07 via WSL Ubuntu:
  `--appimage-extract` on the real published v2.7.1 asset yields
  `usr/lib/Alphonso/ollama/ollama`, a working 39MB ELF binary that reports
  `client version is 0.32.13` when run, plus the full GGML CPU backend set.
  **Ollama is bundled on Linux.** The 1000MB-vs-112MB size gap that prompted
  the suspicion is explained by `scripts/fetch-ollama-runtime.mjs`
  deliberately pruning all GPU backend subdirectories (~1.2GB of CUDA and
  Vulkan) on Linux only, to work around a real linuxdeploy RPATH resolution
  failure — documented at length in that script. Linux ships CPU-only Ollama
  inference by design. Full post-mortem, including why each piece of the
  original evidence was a false positive, is in
  `docs/governance/DEFERRED_WORK.md`'s 2026-09-07 entry.
  **The design guidance this produced still stands on its own merits,
  independent of the retracted premise:** the Smart Installer's system scan
  should verify Ollama's real presence at runtime rather than assuming a
  bundling invariant, because `DEPENDENCY_BUNDLING_PLAN.md`'s baseline is
  itself a moving target (see the next bullet) and per-platform packaging
  genuinely does differ.
- **macOS release pipeline doesn't exist** — see §2 above and the
  corresponding `DEFERRED_WORK.md` entry.
- **`DEPENDENCY_BUNDLING_PLAN.md`'s own baseline is a moving target** —
  as of this writing, `O2` (bundle a default model) and all of `PY`
  (bundle Voice OS's Python + deps) are unstarted. The Setup UI's scan/
  recommendation logic must read *actual current state* (is a model already
  present, is Voice OS's interpreter already bundled) rather than hardcode
  today's snapshot, since that plan's task board will change the answer over
  time.

## 9. Open items for the implementation plan (not resolved here)

- Exact on-disk location/format of the "setup completed" marker file.
- Exact Rust hardware-detection implementation (crate choice for RAM/disk —
  none exists in `Cargo.toml` today; GPU detection per-OS command choice).
- Exact default starter model choice and its Ollama tag (was informally
  `llama3.2:3b` throughout discussion — not a re-litigated decision here,
  just needs to be pinned formally against whatever `DEPENDENCY_BUNDLING_PLAN.md`'s
  `O2` lands on, since that task owns the actual bundled-model choice).
- Full component manifest in machine-readable form (JSON), built from the
  verified table in §6, not the placeholder numbers in either superseded
  draft.
- Error-recovery UX for the install queue (network failure, disk-full
  mid-download, Docker absent for a Custom-path selection) — needs its own
  design pass, not fully specified here.
- Telemetry — explicitly not decided in this document. Neither drafted
  endpoint (`telemetry.alphonso.dev`) exists; if telemetry is wanted, it
  needs its own scoping conversation, not an assumption carried over from
  the superseded Copilot spec.
- **Scan timeout/hang handling** (self-critique finding) — no stated fallback
  if a detection call (`nvidia-smi` or equivalent) hangs on an unusual
  system. Needs a timeout + "couldn't fully detect, here's what we found"
  degraded-continue path rather than blocking the whole Setup flow.
- **Accessibility** (self-critique finding) — a heavily-animated ritual UI
  needs a stated `prefers-reduced-motion` fallback (swap the pulse/portal/
  emblem animation for a simple static confirmation) and basic screen-reader
  support for the intent/recommendation choices, not just visual polish. Not
  addressed anywhere in this document; needs real attention before
  implementation, not an afterthought.
- **QA test matrix** — the superseded draft had a real one (network
  conditions, hardware permutations, upgrade scenarios, error scenarios).
  Deliberately not recreated in this document (would bloat an already-large
  design doc); the implementation plan should build one against the actual
  screens and prechecks defined here, not inherit the old draft's matrix
  verbatim since several of its assumptions (component sizes, Docker
  requirement, agent roster) were wrong.
