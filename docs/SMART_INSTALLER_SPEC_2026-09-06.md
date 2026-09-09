> **SUPERSEDED (2026-09-08).** This is an early Copilot draft written before
> the real design/brainstorm pass for the Smart Installer. It describes
> designs that were considered and explicitly rejected — most notably a
> separate NSIS bootstrap webview (`installer_scan` Tauri command, a
> standalone pre-launch installer app) — neither of which exists in the
> shipped implementation. The Smart Installer that actually shipped is a
> same-binary, same-app-shell flow (`SetupFlow.tsx` + the `setup/` screen
> family), gated exactly where `OnboardingWizard.tsx` used to be, not a
> second binary or window. **Do not treat anything in this file as
> authoritative.** For the real, verified design: see
> `docs/superpowers/specs/2026-09-07-smart-installer-design.md` (design)
> and `docs/superpowers/plans/2026-09-07-smart-installer.md` (implementation
> plan). Kept here only for historical context on the initial analysis that
> prompted the redesign — same treatment as this repo's superseded
> `BOARDROOM_ROLES.md`/`BOARDROOM_MODEL_REGISTRY.md`.

# Alphonso Ritual Installer — SMART_INSTALLER_SPEC
Date: 2026-09-06T17:12:00-04:00
Branch: analysis/dependency-bundling-strategy
Author: Copilot (draft — for review)

Purpose
-------
This document defines the "Ritual Installer" ("Smart Installer") for Alphonso Ecosystem: an immersive onboarding installer that performs a system scan, presents an agent-centric capability selection, downloads and configures required components in a resilient parallel fashion, and culminates in an activation sequence before launching the app.

Scope & Goals
-------------
- Ship ASAP a production-ready Web-style installer experience that allows users to pick capabilities and begin using Alphonso quickly.
- Provide an MVP path and a Full path (enterprise-grade) with clear migration between them.
- Use direct-official-sources for component downloads (Option A) for MVP; revisit CDN/torrent for scale.
- Ensure robust network resilience (resume, retries), backward-compatibility with prior installs, and unobtrusive telemetry to inform product decisions.

High-level Decision Summary (current)
-------------------------------------
- Overall bundling approach: "Web Installer" flow (small bootstrap app + downloads) with an option to pre-bundle heavy models for enterprise builds.
- Component sources: Direct official sources (Option A) for MVP.
- V1 features: include Option B feature set (Chat + Ollama + recommended image tool + voice optional) as highest priority.
- Telemetry: anonymized opt-in telemetry capturing which modules were selected, install success/failure, times, and error classes.

User-flow (refined from your draft)
-----------------------------------
START
1) Launch Bootstrap Installer (Tauri NSIS bootstrap + onboarding webview)
2) SYSTEM SCAN (native command via tauri command `installer_scan`)
   - Detect GPU (nvidia-smi / direct query / fallback), CPU cores, RAM (GB), Disk free (GB), Python presence/version, Ollama presence/version, OS and version
   - Save results to `SystemProfile` in local state and render
3) Show Scan Results in Neon Agent Colors and recommendations
4) CAPABILITY SELECTION (Agent Hologram Grid)
   - Show 9 agents (Alphonso, Miya, Marcus, Maria, Jose, Hector, Boardroom, Echo, Nova)
   - Each card: short blurb, estimated disk footprint, recommended if hardware sufficient
   - Default checks: Alphonso, Jose, Maria, Echo
   - User toggles modules: builds `InstallQueue[]`
5) INSTALL QUEUE SCREEN
   - For each module in queue: create InstallTask
   - Task state transitions: Pending → Downloading → Extracting → Configuring → Ready → Error
   - Run installers in parallel with controlled concurrency (default 3 parallel)
   - For each task: show colored progress bar (agent color), ETA, bytes downloaded, action messages
6) When ALL modules = Ready → Trigger ACTIVATION SEQUENCE (visual/sonic ritual)
7) Launch Alphonso Desktop App (pass a `--first-run` or similar flag to the app so it shows onboarding tips)
END

SystemProfile (typed contract)
------------------------------
Rust / Tauri command returns JSON:
{
  "gpu": { "present": true, "vendor": "nvidia", "model": "RTX 4060", "cuda_available": true },
  "ram_gb": 16,
  "disk_free_gb": 220,
  "python": { "found": true, "version": "3.11.4", "path": "C:\\Python311\\python.exe" },
  "ollama": { "found": false, "version": null },
  "os": { "platform": "windows", "version": "10.0.22000" }
}

Component Manifest (sample)
---------------------------
`components/manifest-v1.json` — canonical list of component definitions.

Example component entry:
{
  "id": "com.alfonso.miya.comfyui",
  "name": "ComfyUI",
  "agent": "miya",
  "version": "2026-09-01",
  "size_mb": 30000,
  "sources": [
    { "type": "git", "url": "https://github.com/comfyui/comfyui.git", "install": ["git clone", "pip install -r requirements.txt" ] },
    { "type": "cdn", "url": "https://releases.alphonso.com/comfyui/models.zip" }
  ],
  "install": {
    "precheck": ["python >= 3.10", "free_disk_gb >= 50"],
    "install_script": "scripts/install-comfyui.ps1",
    "postcheck": ["comfyui --version"]
  }
}

Downloader contract
-------------------
- Downloads run in tokio tasks (Rust), with checksums (sha256) per artifact
- Chunked downloads, support `Range` header, resume via partial files plus manifest state written to disk
- Concurrency control (configurable: default 3 parallel tasks)
- Throttling option for low-bandwidth environments
- Verification: if sha mismatch → retry up to 3 times → mark task as `error` and surface friendly message

Install Task lifecycle
----------------------
- pending
- queued
- downloading
- verifying
- extracting
- configuring
- ready
- error (error_code, friendly_message, raw_error)

UI Design / Wireframes (text)
-----------------------------
1) Welcome / Branding Screen (Cyberpunk scan) — big CTA: "Start System Scan"
2) System Scan results — left: neon scan, right: capabilities suggestion + continue button
3) Agent Grid — 3x3 hologram tiles using agent colors; each tile reveals size, requirements, short blurb
4) Module Selection summary (bottom): Total download size, estimated time, recommended pre-check warnings
5) Install Queue — list of tasks with agent-color progress bar + per-task logs (expandable)
6) Activation Sequence overlay — animated via Framer Motion
7) Completion / Launch — open app; optionally show checklist for connectors to configure

Telemetry (anonymized, opt-in)
-----------------------------
Data to collect (opt-in toggled on at first run):
- `install_id` (uuid v4, stored locally, not tied to user identity)
- `selected_modules`: list of component ids chosen
- `install_times`: per component download time + install time
- `success_flags`: success / failure per component
- `failure_class`: enum (network, checksum, disk_space, script_error, permissions)
- `system_profile`: non-identifying: ram_gb, gpu_present (bool), os_platform (string)
- `app_version` and `installer_version`
- **Do not collect** PII, filepaths, user content, or full hardware serials

Telemetry policy
- Must be opt-in
- Data must be anonymized + hashed where appropriate
- Provide UI to opt-out and delete local telemetry

Upgrade & Backward Compatibility
--------------------------------
- On upgrade, run `scan` and detect existing components (by checking install paths or version commands)
- Skip downloads for already-present components; verify checksum if `force_verify` enabled
- Migrate user settings if schema changes (store migration scripts in `scripts/migrations/`)

Resilience
----------
- Partial download persisted to `C:\Users\<user>\AppData\Local\Alphonso\installer_cache` (or equivalent)
- On reconnect, downloader resumes from the last byte via `Range` header
- If disk gets low mid-download, gracefully pause tasks and present user with options (choose different drive, skip large modules, cancel)
- If Python not present but required for a module, present inline button to install Python via winget (Windows) or Homebrew (macOS) where possible

Security
--------
- All downloads validated via sha256 signatures signed by Alphonso release key
- HTTPS required for all downloads; no HTTP allowed
- Verify script authorship via signature where provided (optional)
- Install scripts run with minimal privilege; prefer non-elevated install in user-space when possible
- For any elevated step, obtain UAC prompt with clear explanation

Activation Sequence (animation assets)
--------------------------------------
Implement via React + Framer Motion + CSS variables:
- `--alphonso-cyan` `#00D9FF`, `--miya-pink` `#FF2D95`, etc.
- SVG grid overlay + mask animation
- Portal: radial-gradient + transform scale
- Emblem: SVG emblem + stroke-dasharray animation
- Optional audio: short 0.5s whoosh (licensed or original SFX)

QA Matrix
---------
Test matrices include:
- Fast network (500 Mbps), slow network (3 Mbps), flaky network (toggle disconnect), offline
- Old install present (v2.6.x) with ComfyUI present
- No Python present
- No Ollama present
- GPU with CUDA present vs GPU absent
- Disk low: <10GB free

Rollout Strategy
----------------
- Canary: internal + 5% of opt-in users (collect metrics)
- 24-48h monitor for failures > X% across installs
- Gradual ramp to 25% → 50% → 100% if success

Implementation Roadmap (tasks)
------------------------------
Phases mapped to existing todos (in repo DB):
- Phase 1: System scan + Agent grid (P1.1, P1.2, P1.3)
- Phase 2: Component manifest + downloader (P2.1, P2.2, P2.3)
- Phase 3: Activation sequence (P3.1)
- Phase 4: Resilience, upgrade paths, telemetry, QA (P4.1–P4.4)

Open Questions / Decisions Needed (for you to confirm)
------------------------------------------------------
1) Final bundling posture: Full pre-bundle (enterprise) OR Web Installer? (we treat Web Installer as default with a separate pre-bundled enterprise artifact)
2) Component hosting at scale: Stay with official sources for MVP; plan CDN and/or torrent for enterprise
3) Telemetry policy: opt-in default? data retention window? (recommend opt-in, 30-day retention)
4) Activation sound: provide optional audio toggle? (recommended: yes, off by default)
5) Which model(s) to recommend by default? (recommend `llama3.2:3b` quantized as V1)

Deliverable Checklist (this doc will expand)
--------------------------------------------
- [ ] Full JSON component manifest
- [ ] installer_scan.rs implementation
- [ ] downloader module + checksum verifier
- [ ] React onboarding components (scan, grid, queue, activation)
- [ ] Framer Motion activation animation + assets
- [ ] Telemetry + privacy policy UI
- [ ] QA plan and test harness
- [ ] Release + rollback plan


Appendix: Quick Implementation Snippets
--------------------------------------
Rust Tauri command (scan stub):

```rust
#[tauri::command]
pub async fn installer_scan() -> Result<SystemProfile, String> {
  // example checks (pseudo)
  let ram_gb = sysinfo::System::new_all().total_memory() / 1024 / 1024 / 1024;
  // check nvidia-smi
  let nvidia_ok = Command::new("nvidia-smi").output().is_ok();
  // check python
  let python_ok = which::which("python3").or_else(|_| which::which("python")).is_ok();
  // check ollama
  let ollama_ok = which::which("ollama").is_ok();
  Ok(SystemProfile { /* fill fields */ })
}
```

React: Agent Tile (pseudo)

```tsx
function AgentTile({agent, recommended, checked, onToggle}) {
  return (
    <div className={`agent-tile ${recommended? 'recommended':''}`}> 
      <h3>{agent.name}</h3>
      <p>{agent.blurb}</p>
      <p>Estimated size: {formatBytes(agent.size_mb)}</p>
      <input type="checkbox" checked={checked} onChange={onToggle} />
    </div>
  );
}
```


---

## SELF-CRITIQUE & GAPS FOUND

### 🔴 Critical Gaps

**1. Agent Grid Blurbs Are Missing**
- Current: "Each card: short blurb, estimated disk footprint, recommended if hardware sufficient"
- Problem: I didn't DEFINE what each blurb says. Users won't understand what Miya/Marcus/Maria do without clear, non-technical language.
- Action: Define agent blurbs + icons + color codes (BELOW)

**2. Component Manifest Is Incomplete**
- Current: Only ComfyUI example, no full inventory of all 9 agents' components
- Problem: Users don't know what actually gets installed. Missing: Ollama, llama3.2:3b, Voice OS, Chroma, n8n, etc.
- Action: Full manifest expansion (BELOW)

**3. Download Sources Are Vague**
- Current: "Direct official sources (Option A)" but no actual URLs or source strategy
- Problem: GitHub downloads are slow (5-10 MB/s); if ComfyUI is 30GB, download takes 1+ hour. No mention of fallback sources or resume logic.
- Action: Define source priorities + fallback chain (BELOW)

**4. Network Resilience Is Underspecified**
- Current: "Resume via partial files" but HOW? What if git clone fails mid-way?
- Problem: Git-based installs (ComfyUI, InvokeAI) can't resume like HTTP downloads. Need separate strategy.
- Action: Separate HTTP vs git-based install paths (BELOW)

**5. Activation Sequence Has No Success Criteria**
- Current: 6-second animation, then launch app. But what if an error occurred during downloads?
- Problem: User just saw "Ready" but something failed silently. Activation feels broken.
- Action: Define "activation success criteria" + error state animations (BELOW)

**6. First-Run Flag & App Integration Missing**
- Current: "pass a `--first-run` flag to the app"
- Problem: What does the app DO with that flag? Show tour? Skip settings? No spec here.
- Action: Define first-run app behavior (BELOW)

**7. Telemetry Has No Data Endpoint**
- Current: Collect anonymized data, but WHERE does it go? No API defined.
- Problem: Can't implement telemetry without target endpoint.
- Action: Define telemetry service (BELOW)

**8. Error Recovery Is Weak**
- Current: Mark task as "error" and show friendly message
- Problem: What does user DO next? Retry? Skip? Cancel whole install?
- Action: Define error recovery UX + decision tree (BELOW)

**9. No Mention of Uninstall**
- Current: Spec covers install, upgrade, but not uninstall
- Problem: How do users remove ComfyUI after installing? Via Runtime Hub? Manually?
- Action: Define uninstall strategy (BELOW)

**10. Disk Space Checks Are Weak**
- Current: `precheck: ["free_disk_gb >= 50"]` but what if user has 100GB disk and selects 5 agents = 150GB needed?
- Problem: No validation BEFORE download starts; user wastes 30 minutes downloading before hitting disk full error
- Action: Pre-validate total requirement vs available space (BELOW)

### 🟡 Significant Issues

**11. GPU Detection Fragile**
- nvidia-smi works for NVIDIA, but AMD and Intel Arc require different commands
- WSL users won't have direct GPU access
- Fallback to CPU if detection fails (silent failure)

**12. Python Install Automation Risky**
- "present inline button to install Python via winget" — but winget can fail, timeout, etc.
- Doesn't handle virtual environments properly
- What Python version? 3.10? 3.11? 3.12?

**13. Concurrent Downloads May Starve**
- Default 3 parallel downloads: what if user's connection can't handle it?
- No adaptive bandwidth throttling
- No prioritization (should Ollama download first?)

**14. Agent Tile UX Unclear**
- "3x3 hologram tiles" — but 9 agents, 3x3 = 9 agents, leaves no space for blurbs, sizes, or description
- How large is each tile? How much text fits?
- Responsive on smaller screens?

**15. Module Dependencies Not Modeled**
- What if user selects Miya (image generation) but skips Ollama?
- No validation: "Miya requires Ollama + Python"
- What about Boardroom? Does it require all other agents?

---

## EXPANDED SPEC: Fixes & Detailed Sections

### Agent Grid — Blurbs & Color Codes

```
ALPHONSO (Cyan #00D9FF)
├─ Blurb: "Local AI assistant. Chat, memory, research. Foundation for everything."
├─ Icon: Brain + chat bubble
├─ Components: [ollama, ollama-models]
├─ Size: 2-100GB (depends on model)
├─ Requires: Ollama + Python 3.10+
├─ Recommended: Always
└─ Default: ✓ checked

JOSE (Purple #9D4EDD)
├─ Blurb: "Orchestration engine. Automates tasks, chains agents, manages workflows."
├─ Icon: Connecting nodes
├─ Components: none (local-only)
├─ Size: ~300MB
├─ Requires: Nothing extra
├─ Recommended: Always (powers Alphonso)
└─ Default: ✓ checked

MIYA (Hot Pink #FF2D95)
├─ Blurb: "Creative tools. Generate images, edit photos, design content."
├─ Icon: Palette + sparkle
├─ Components: [comfyui] OR [fooocus] (user picks one)
├─ Size: 30GB (ComfyUI) or 25GB (Fooocus)
├─ Requires: Python 3.10+, GPU recommended, 50GB+ disk
├─ Recommended: If GPU present OR >100GB disk
└─ Default: ✓ checked (if hardware sufficient), else ✗ unchecked

MARCUS (Red #FF1744)
├─ Blurb: "Voice interface. Speak to Alphonso, hear responses. Hands-free control."
├─ Icon: Microphone + waveform
├─ Components: [voice-os, faster-whisper, piper, webrtcvad]
├─ Size: ~5GB (models + dependencies)
├─ Requires: Python 3.10+, microphone + speakers
├─ Recommended: If has audio hardware
└─ Default: ✗ unchecked (optional, advanced)

MARIA (Teal #00ACC1)
├─ Blurb: "Memory & compliance. Learn from history, govern decisions, audit actions."
├─ Icon: Brain + scroll
├─ Components: [chroma, chromadb-models]
├─ Size: ~2GB
├─ Requires: Nothing extra
├─ Recommended: Always (enhances Alphonso)
└─ Default: ✓ checked

HECTOR (Orange #FF9800)
├─ Blurb: "Research assistant. Web search, source gathering, synthesis."
├─ Icon: Magnifying glass + papers
├─ Components: none (cloud-only via API keys)
├─ Size: ~0MB
├─ Requires: Internet connection + API keys (optional)
├─ Recommended: Always (no install burden)
└─ Default: ✓ checked (adds no download)

ECHO (Indigo #5E35B1)
├─ Blurb: "Memory historian. Preserves decisions, learns patterns, suggests improvements."
├─ Icon: Archive + lightbulb
├─ Components: [chroma] (same as Maria, shared)
├─ Size: ~2GB
├─ Requires: Nothing extra
├─ Recommended: Always (lightweight)
└─ Default: ✓ checked

BOARDROOM (Navy #1A237E)
├─ Blurb: "Multi-agent collaboration. Agents debate, critique, reach consensus."
├─ Icon: Roundtable + speech bubbles
├─ Components: none (local-only)
├─ Size: ~500MB
├─ Requires: Alphonso + Jose + at least 2 other agents
├─ Recommended: If installing 3+ agents
└─ Default: ✓ checked (if qualifies)

NOVA (Lime #76FF03)
├─ Blurb: "Opportunity analyzer. Scores ideas, forecasts trends, prioritizes actions."
├─ Icon: Rocket + graph
├─ Components: none (local-only, Ollama-powered)
├─ Size: ~200MB
├─ Requires: Ollama + at least 2 other agents
├─ Recommended: For advanced users
└─ Default: ✗ unchecked (optional, power-user feature)

SENTINEL (Gray #616161)
├─ Blurb: "Security monitor. Detects risks, enforces policies, audits operations."
├─ Icon: Shield + eye
├─ Components: none (local-only)
├─ Size: ~200MB
├─ Requires: Nothing extra
├─ Recommended: Always (security hardened default)
└─ Default: ✓ checked
```

### Full Component Manifest (expanded)

```json
{
  "manifest_version": "1.0",
  "generated": "2026-09-06",
  "components": [
    {
      "id": "com.alphonso.core.ollama-binary",
      "name": "Ollama Binary",
      "agent": "alphonso",
      "version": "0.3.5",
      "category": "runtime",
      "size_mb": 150,
      "sources": [
        {
          "type": "direct",
          "url": "https://github.com/ollama/ollama/releases/download/v0.3.5/ollama-windows-amd64.exe",
          "fallback": true
        }
      ],
      "install": {
        "precheck": ["windows_10_plus"],
        "install_script": "scripts/install-ollama.ps1",
        "postcheck": ["ollama --version"]
      },
      "required": true,
      "blocking": true
    },
    {
      "id": "com.alphonso.core.ollama-model-llama",
      "name": "Llama 3.2 (3B)",
      "agent": "alphonso",
      "version": "latest",
      "category": "model",
      "size_mb": 2000,
      "sources": [
        {
          "type": "ollama-pull",
          "command": "ollama pull llama3.2:3b",
          "requires": "ollama-binary"
        }
      ],
      "install": {
        "precheck": ["ollama-binary present", "free_disk_gb >= 3"],
        "install_script": "scripts/download-ollama-model.sh",
        "postcheck": ["ollama list | grep llama3.2"]
      },
      "required": true,
      "blocking": false
    },
    {
      "id": "com.alphonso.miya.comfyui",
      "name": "ComfyUI",
      "agent": "miya",
      "version": "2026-09-01",
      "category": "tool",
      "size_mb": 30000,
      "sources": [
        {
          "type": "git",
          "url": "https://github.com/comfyanonymous/ComfyUI.git",
          "branch": "master",
          "install": ["git clone --depth 1", "pip install -r requirements.txt"]
        }
      ],
      "install": {
        "precheck": ["python >= 3.10", "git installed", "free_disk_gb >= 50", "optional_but_rec: gpu_present"],
        "install_script": "scripts/install-comfyui.ps1",
        "postcheck": ["python main.py --version"]
      },
      "required": false,
      "blocking": false,
      "conflictsWith": ["fooocus"]
    },
    {
      "id": "com.alphonso.miya.fooocus",
      "name": "Fooocus (Simplified Image Gen)",
      "agent": "miya",
      "version": "2026-09-01",
      "category": "tool",
      "size_mb": 25000,
      "sources": [
        {
          "type": "git",
          "url": "https://github.com/lllyasviel/Fooocus.git",
          "branch": "main",
          "install": ["git clone --depth 1", "pip install -r requirements.txt"]
        }
      ],
      "install": {
        "precheck": ["python >= 3.10", "git installed", "free_disk_gb >= 30"],
        "install_script": "scripts/install-fooocus.ps1",
        "postcheck": ["python entry_point.py --version"]
      },
      "required": false,
      "blocking": false,
      "conflictsWith": ["comfyui"]
    },
    {
      "id": "com.alphonso.marcus.voice-os",
      "name": "Voice OS (FastAPI Backend)",
      "agent": "marcus",
      "version": "1.0.0",
      "category": "runtime",
      "size_mb": 500,
      "sources": [
        {
          "type": "local",
          "path": "voice/backend",
          "install": ["create venv", "pip install -r requirements.txt"]
        }
      ],
      "install": {
        "precheck": ["python >= 3.10", "free_disk_gb >= 2"],
        "install_script": "scripts/setup-voice-os.ps1",
        "postcheck": ["python -c \"import faster_whisper; import piper_tts; print('ok')\""]
      },
      "required": false,
      "blocking": false
    },
    {
      "id": "com.alphonso.marcus.faster-whisper",
      "name": "Faster-Whisper (Speech-to-Text)",
      "agent": "marcus",
      "version": "0.10.1",
      "category": "dependency",
      "size_mb": 1500,
      "sources": [
        {
          "type": "pip",
          "package": "faster-whisper==0.10.1"
        }
      ],
      "install": {
        "precheck": ["python >= 3.10"],
        "install_script": "pip install faster-whisper",
        "postcheck": ["python -c \"from faster_whisper import WhisperModel; print('ok')\""]
      },
      "required_by": ["voice-os"],
      "blocking": false
    },
    {
      "id": "com.alphonso.marcus.piper-tts",
      "name": "Piper (Text-to-Speech)",
      "agent": "marcus",
      "version": "1.2.0",
      "category": "dependency",
      "size_mb": 800,
      "sources": [
        {
          "type": "pip",
          "package": "piper-tts==1.2.0"
        }
      ],
      "install": {
        "precheck": ["python >= 3.10"],
        "install_script": "pip install piper-tts",
        "postcheck": ["python -c \"from piper import PiperTTS; print('ok')\""]
      },
      "required_by": ["voice-os"],
      "blocking": false
    },
    {
      "id": "com.alphonso.maria.chroma",
      "name": "Chroma (Vector Memory DB)",
      "agent": "maria",
      "version": "0.4.x",
      "category": "tool",
      "size_mb": 2000,
      "sources": [
        {
          "type": "pip",
          "package": "chromadb"
        }
      ],
      "install": {
        "precheck": ["python >= 3.10"],
        "install_script": "scripts/setup-chroma.ps1",
        "postcheck": ["python -c \"import chromadb; print(chromadb.__version__)\""]
      },
      "required": false,
      "blocking": false,
      "shared": true
    }
  ],
  "dependencies": {
    "miya": {
      "oneOf": ["comfyui", "fooocus"],
      "requires": ["python >= 3.10"]
    },
    "marcus": {
      "requires": ["voice-os", "faster-whisper", "piper-tts", "python >= 3.10"]
    },
    "maria": {
      "requires": ["chroma"]
    },
    "boardroom": {
      "requires": ["alphonso", "jose"],
      "recommendedWith": ["miya", "marcus", "hector"]
    }
  }
}
```

### Download Source Priority & Fallback Chain

```
Priority chain for each component type:

HTTP/DIRECT sources (resumable):
1. Official GitHub Release (https://github.com/.../releases/download/...)
2. Project CDN (if available)
3. Fallback mirror (Alphonso CDN, if bandwidth available)
Retry: 3 attempts with exponential backoff

GIT sources (git clone):
1. Official GitHub repo (shallow clone --depth 1)
2. Fallback mirror repo
Retry: 1 attempt (git clone doesn't resume)
Strategy: Clone to temp dir, verify, move to final location

OLLAMA-PULL sources (custom protocol):
1. Ollama Hub (default)
2. Custom model registry (if configured)
Retry: Auto-retry via ollama CLI

PIP sources (Python packages):
1. PyPI (default)
2. Private PyPI mirror (if configured)
Retry: 3 attempts

Fallback behavior on source failure:
- If primary source fails after retries → try fallback
- If ALL sources fail → mark task ERROR, offer retry or skip
- Resume state: persisted to %LOCALAPPDATA%\Alphonso\installer_state.json
```

### Error Recovery Decision Tree

```
INSTALL_TASK_ERROR event:

if error_code == "network_timeout":
  → Show: "Internet connection unstable. [Retry] [Skip] [Cancel]"
  → On Retry: resume from last checkpoint
  
elif error_code == "disk_full":
  → Show: "Not enough disk space (need 50GB, have 15GB)"
  → Options: [Choose Different Drive] [Skip This Component] [Cancel]
  → If user skips: mark component "deferred", continue with other tasks
  
elif error_code == "checksum_failed":
  → Show: "Downloaded file corrupted. [Retry] [Skip]"
  → On Retry: delete partial file, re-download from start
  → Retry up to 3 times before marking error
  
elif error_code == "script_execution_failed":
  → Show: "Installation script failed. Error details: [EXPAND]"
  → [EXPAND] shows last 20 lines of stderr
  → Options: [View Full Log] [Report Error] [Skip] [Cancel]
  
elif error_code == "python_not_found":
  → Show: "Python 3.10+ required but not installed"
  → [Install Python Now] → triggers winget/homebrew installer
  → On success: retry this task
  → On failure: mark deferred, continue (user can install manually later)
  
elif error_code == "permissions_denied":
  → Show: "Cannot write to installation directory"
  → [Choose Different Location] → folder picker
  → Re-attempt write to new location

If ANY critical component (ollama, alphonso core) fails 3 times:
  → Offer: [Abort Installation] vs [Continue Without This Component]
  → If abort: revert all changes, mark installation failed
  → If continue: skip only this component, complete install for others
```

### First-Run App Integration

```
When app launches with --first-run flag:

1) Onboarding modal appears (can be dismissed):
   - Welcome message ("You're all set! Here's how to get started")
   - Quickstart buttons: "Chat Now" | "Configure Connectors" | "Run Tutorial"
   - Checkbox: "Show this every time?" (unchecked by default)

2) If user picked Miya (image gen):
   - Suggest: "Image generation is ready! Try: 'Generate a cyberpunk portrait'"
   
3) If user picked Marcus (voice):
   - Suggest: "Voice mode enabled. Click the mic button to talk to Alphonso"
   - Test: "Click to test microphone" (simple beep test)

4) Pinned "Get Started" panel in sidebar (for this session only):
   - Link 1: "Configure your API keys" (Slack, GitHub, etc.)
   - Link 2: "Install more tools via Runtime Hub"
   - Link 3: "Learn about Alphonso Agents"
   - Dismiss button: removes this session, doesn't show next time

5) First prompt hint: "Try: 'Generate an image of a cat' or 'What's the weather?'"
```

### Telemetry Service Specification

```
Endpoint: https://telemetry.alphonso.dev/v1/install-event

POST body (anonymized):
{
  "install_id": "uuid-here",
  "timestamp": "2026-09-06T18:00:00Z",
  "installer_version": "2.7.1",
  "app_version": "2.7.1",
  "os": "windows",
  "os_version": "10.0.22000",
  "system": {
    "ram_gb": 16,
    "gpu_present": true,
    "gpu_vendor": "nvidia"
  },
  "selected_modules": [
    "com.alphonso.core.ollama-binary",
    "com.alphonso.core.ollama-model-llama",
    "com.alphonso.miya.comfyui",
    "com.alphonso.maria.chroma"
  ],
  "install_results": [
    {
      "component_id": "com.alphonso.core.ollama-binary",
      "status": "success",
      "duration_seconds": 45,
      "size_mb": 150
    },
    {
      "component_id": "com.alphonso.miya.comfyui",
      "status": "error",
      "duration_seconds": 1200,
      "error_class": "network_timeout",
      "retries": 3
    }
  ],
  "total_duration_seconds": 3600,
  "cancelled": false
}

Data retention: 30 days (auto-deleted)
Transmission: HTTPS only, once per installation
User can opt-out: Settings → Privacy → Disable telemetry
```

### Uninstall Strategy

```
Uninstall for each component:

Ollama binary:
  → Remove C:\Users\<user>\AppData\Local\Ollama (if installed by installer)
  → Keep user's ~/.ollama/models (preserve downloaded models)

ComfyUI:
  → Remove installation directory (full recursive delete)
  → Offer checkbox: "Keep downloaded models?" → preserve ComfyUI/models/

Voice OS:
  → Remove venv (if installed by installer)
  → Keep any recorded audio files

Chroma:
  → Offer: "Delete local memory database?" (yes/no)
  → Default: keep (data preservation)

Access via:
- Uninstall via Windows Control Panel (standard ARP entry per component)
- OR: In-app Settings → Installed Tools → [Uninstall] button per component
- OR: Runtime Hub → Installed tab → [Remove] button
```

### Disk Space Validation (Pre-Download)

```
Before download starts:

1) Calculate total size needed:
   total_needed = SUM(component.size_mb for each selected component) / 1024

2) Check system state:
   free_disk_gb = sys.disk_usage(installer_cache_drive).free / 1024 / 1024 / 1024

3) Pre-validate:
   if free_disk_gb < (total_needed + 10):  # 10GB buffer
     Show error: "Not enough disk space"
     Options: [Choose Different Drive] [Deselect Large Components] [Cancel]

4) If user chooses different drive:
   - Show folder picker
   - Update installer_cache path to new drive
   - Re-validate space on new drive

5) Continuous monitoring during install:
   - Check free disk before each component download
   - If disk drops below 5GB during download → pause
   - Show: "Disk space running low. Pause to clean up? [Pause] [Continue] [Cancel]"
```

### Testing Matrix (Comprehensive QA)

```
Network scenarios:
  □ Fast network (500 Mbps): expect <5 min for full install
  □ Slow network (3 Mbps): expect <60 min, test resume on interruption
  □ Flaky network: simulate disconnect every 30s, verify resume recovery
  □ Offline mode: launch with no internet, show offline UI, allow retry

Hardware scenarios:
  □ NVIDIA GPU present (CUDA): ComfyUI should detect and use GPU
  □ AMD GPU present: fallback to CPU, no errors
  □ No GPU: install CPU-only, show warning, estimate 2x slower
  □ 4GB RAM: warn before installing memory-heavy tools
  □ <10GB disk free: block image tool installs

Upgrade scenarios:
  □ v2.6.5 → v2.7.1 with existing ComfyUI: detect, skip re-download
  □ v2.6.5 → v2.7.1 with old Ollama version: detect, offer upgrade
  □ v2.6.5 → v2.7.1 with new component added: offer to install new components

Error scenarios:
  □ Network timeout during 30GB download: resume from checkpoint
  □ Python missing: offer inline install via winget
  □ Git not installed: offer inline install
  □ Checksum mismatch: retry up to 3 times, then error
  □ Script execution failure: capture stderr, show in UI, allow skip

First-run scenarios:
  □ First run ever: show welcome + tutorial
  □ After upgrade: show "What's new?" modal (optional)
  □ User cancels installer halfway: on re-launch, resume or restart? (decision needed)

Cross-platform:
  □ Windows 10/11: all paths, all tools
  □ macOS: homebrew fallback, different Python paths
  □ Future: Linux support (WSL detection?)
```

---

## REVISED Open Questions (Updated)

1. **Should user be able to CANCEL installer mid-way and RESUME next time?**
   - Current: Unclear
   - Recommendation: YES — persist install state, offer "Resume Previous Install" on next launch
   
2. **Activation sequence on ERROR — should it still play?**
   - Current: Assumed always plays if all "ready"
   - Recommendation: Modified activation with warning icon if any component is deferred/skipped

3. **What's the minimum viable install? (Just Alphonso + Ollama?)**
   - Current: Assumed Option B (Alphonso + Jose + Maria + Ollama + 1 model)
   - Confirmation needed: Is this correct?

4. **Should we bundle a small model (llama3.2:3b quantized)?**
   - Pros: User has chat immediately, no download wait
   - Cons: Installer becomes 4-5GB
   - Recommendation: NO for MVP (Web installer), YES for enterprise pre-bundle

5. **Choice between ComfyUI vs Fooocus for Miya?**
   - Current: User chooses during install
   - Recommendation: Default to Fooocus (simpler, smaller), offer ComfyUI as "advanced" option

---

## Deliverable Checklist (Revised)

- [ ] Complete component manifest JSON (all 9 agents, all components)
- [ ] installer_scan.rs implementation (GPU, RAM, disk, Python, Ollama detection)
- [ ] SystemProfile TypeScript interface
- [ ] Downloader module in Rust + checksum verifier + resume logic
- [ ] Download source priority + fallback chain (implementation)
- [ ] React onboarding window (Tauri webview)
  - [ ] System scan screen (progress + results)
  - [ ] Agent grid screen (9 cards, selection, dependency validation)
  - [ ] Module selection summary (total size, warnings)
  - [ ] Install queue screen (progress bars, per-task logs, error UI)
  - [ ] Activation sequence (Framer Motion animation)
- [ ] Framer Motion activation animation + SVG assets
- [ ] Telemetry SDK + privacy policy UI
- [ ] Error recovery decision tree implementation (UX + logic)
- [ ] Uninstall mechanism (Windows ARP, in-app, Runtime Hub)
- [ ] First-run flag integration with main app
- [ ] Disk space validation + drive selection UI
- [ ] Upgrade/backward-compatibility logic
- [ ] QA test harness + test matrix
- [ ] Documentation (user guide, troubleshooting, video walkthrough)
- [ ] Release + canary rollout plan

---

## Next Phases (Beyond MVP)

**Phase 4B (Polish):**
- Bandwidth throttling option (for metered connections)
- Component caching / offline mode (for repeated installs)
- Analytics dashboard (track which agents are most popular)
- Auto-recovery: if installer crashes, detect and offer resume

**Phase 5 (Enterprise):**
- Pre-bundled enterprise installer (all components included)
- MDM/deployment integration (silent install mode, config via policy)
- Custom model pre-selection (org can pick default model, not just llama3.2:3b)
- Telemetry to private on-prem server (for compliance)

**Phase 6 (Scale):**
- CDN + torrent distribution (reduce bandwidth costs)
- Component marketplace (users contribute community tools?)
- Model auto-update (keep llama3.2:3b current via background updates)

-- End of expanded spec
