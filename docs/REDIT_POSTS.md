# Reddit Post Drafts: AlphonsoEcosystem Launch

> Drafted: 2026-09-01
> Target subreddits: r/SideProject, r/LocalLLaMA, r/Tauri, r/selfhosted
> Product: Alphonso v2.6.5 — Local-first AI desktop companion

---

## Post 1: r/SideProject (Primary Launch Post)

**Flair**: Show / Launch

**Title**: I built a local-first AI companion with 9 specialized agents that runs entirely on your machine via Ollama

**Body**:

i've been working on this for the past year, and i finally feel ready to share it with you all.

alphonso is a local-first AI desktop companion built with Tauri v2 (Rust + React). it runs entirely on your machine — no cloud required for core operation. powered by Ollama with llama3.2:3b as the default model.

the core idea: instead of one generic chatbot, you get 9 specialized agents that each handle a different part of the workflow:

- **Jose** — orchestrator, intake, routing, merge, confirm
- **Hector** — research + citations
- **Miya** — creative (strategy, script, storyboard)
- **Maria** — governance, audit, risk review
- **Marcus** — approved distribution execution
- **Echo** — memory historian
- **Sentinel** — security monitoring
- **Nova** — scoring + analysis
- **Alphonso** — general execution

each agent has its own permissions file, persona prompt, and constraints. they can work together in "boardroom" sessions where you @mention specific agents and they respond in character.

some things that actually work:
- full voice OS with faster-whisper STT + piper TTS (local, offline)
- telegram + whatsapp companion bots
- iOS companion app with voice tab
- auto-update (download + install + relaunch)
- 25 connectors (brave search, youtube, github, slack, claude API, chatgpt, etc.)
- sqlite memory on-device
- approval workflows for risky actions

the whole thing is source-visible under the SHALAUDE license (not OSI-approved open source — being transparent about that). free for local use. pro tier adds cloud fallback and premium connectors.

i built this because i wanted an AI assistant that didn't phone home, didn't have API bills, and could actually do things instead of just talking.

would love feedback from this community — especially on the multi-agent architecture and whether the agent permission model makes sense.

github: https://github.com/obsidian-media/AlphonsoEcosystem
download: https://github.com/obsidian-media/AlphonsoEcosystem/releases

what's the biggest friction point you've hit with local AI tools? i'm curious what i should tackle next.

---

## Post 2: r/LocalLLaMA (Community-Focused, NOT Promotional)

**Title**: What I learned building a 9-agent local AI system on consumer hardware (and the benchmarks)

**Body**:

hey r/LocalLLaMA — i've been lurking here for a while and learned a ton from this community. wanted to share some benchmarks and lessons from building a multi-agent local AI system, in case it's useful for anyone working on similar projects.

the setup: Tauri v2 desktop app, Ollama backend, llama3.2:3b default (swappable). runs on a single RTX 3060 with ~12GB VRAM.

**benchmarks (tokens/sec) on consumer hardware:**
- llama3.2:3b — ~45 tok/s on RTX 3060 (12GB)
- llama3.1:8b — ~28 tok/s on RTX 3060 (12GB)
- qwen2.5:7b — ~35 tok/s on RTX 3060 (12GB)

**what surprised me:**
1. agent switching overhead is the real bottleneck, not raw inference. routing between 9 agents adds ~200ms per handoff.
2. context window management matters more than model size for multi-agent sessions. we cap at 8K context per agent to keep things responsive.
3. tool calling reliability varies wildly. llama3.2:3b handles simple function calls fine but struggles with nested parameters.

**what i'd do differently:**
- start with 3 agents, not 9. the complexity of permission management scales non-linearly.
- use a single shared context store instead of per-agent memory (simpler, fewer bugs).
- invest more in prompt engineering for the orchestrator agent — it's the load-bearing wall.

the project is called alphonso. it's source-visible (not OSI open source — being upfront about that). happy to answer questions about the architecture or share more detailed benchmarks.

what's your experience with multi-agent setups? anyone tried more than 3-4 agents locally?

---

## Post 3: r/Tauri (Technical Deep-Dive)

**Title**: How I structured a Tauri v2 app with 9 AI agents, 25+ Rust commands, and real-time voice processing

**Body**:

i've been building a local-first AI desktop app with Tauri v2 and wanted to share the architecture in case it's useful for other Tauri developers dealing with heavy backend workloads.

**the challenge**: 9 AI agents, 25+ connectors, real-time voice processing (STT → LLM → TTS), and a SQLite-backed memory system — all in a single Tauri app without freezing the UI.

**what worked:**

1. **Command extraction pattern**: instead of one massive `lib.rs`, i extracted commands into modules:
   - `commands/clipboard.rs`
   - `commands/filesystem.rs`
   - `commands/bridge.rs` (Ollama HTTP)
   - `commands/voice.rs` (WebSocket to Python sidecar)
   - `commands/system.rs`
   - `commands/notification.rs`

2. **Sidecar for voice**: Python FastAPI process (faster-whisper + piper) launched as a Tauri-managed sidecar. communicates over WebSocket on port 8766. this keeps the heavy Python deps out of the Rust binary.

3. **SQLite via rusqlite**: bundled, no separate server. migrations run on startup. works well for single-user desktop apps.

4. **Frontend state**: React 18 + Zustand for UI state, SQLite for persistent data. migrating from localStorage to SQLite was painful but worth it.

**Tauri-specific lessons:**
- capability system is great for security but plan your permission matrix early
- the updater plugin works well with signed manifests (NSIS + MSI on Windows)
- `tauri-plugin-process` for relaunch after update is smooth

**one gotcha**: the voice sidecar and mobile companion both defaulted to port 8765, causing silent failures. moved voice to 8766. always check for port collisions with sidecars.

repo: https://github.com/obsidian-media/AlphonsoEcosystem

anyone else running Python sidecars with Tauri? curious how you handle the dev experience (hot reload for both processes).

---

## Post 4: r/selfhosted (Megathread Entry — Cloud Voice Backend)

**Title**: Alphonso Cloud Voice — Self-hostable voice backend for local AI desktop apps (Railway/Docker)

**Body**:

**Project**: Alphonso Cloud Voice Backend
**Age**: < 3 months (new)
**Self-hostable**: Yes (Docker + Railway template)

this is the cloud voice backend that powers the iOS companion app for alphonso. it's a standalone service that handles:

- text-to-speech via Piper voices (including Persian/Farsi)
- multilingual routing (English → NVIDIA TTS, fa-IR → Piper)
- device-gated access (Supabase auth + device UUID enrollment)
- service-role key management (server-only)

**why it exists**: the desktop app runs voice locally (faster-whisper + piper), but iOS can't run these models efficiently. this backend bridges that gap while keeping the desktop app fully local.

**self-hosting**:
- Docker image available
- Railway template for one-click deploy
- requires: Supabase instance, Piper voice models, optional NVIDIA TTS API key
- all self-hosted — no dependency on our servers if you deploy your own

**license**: source-visible (SHALAUDE v1.0). not OSI-approved open source — being transparent.

**what's new (last 3 months)**:
- separated from the desktop app into standalone service
- added device enrollment flow
- added multilingual routing
- added playback retry handling

this is my first time sharing in the megathread. happy to answer questions about the architecture or self-hosting setup.

---

## Posting Strategy

### Order
1. **r/SideProject** — primary launch, most welcoming community
2. **r/LocalLLaMA** — share benchmarks and lessons (value-first, not promotional)
3. **r/Tauri** — technical deep-dive for engineering credibility
4. **r/selfhosted** — megathread entry for cloud voice backend only

### Timing
- Tuesday–Thursday, 9–11am EST
- Space posts 2-3 days apart to avoid appearing spammy
- Engage in comments for at least 2 hours after each post

### Account Requirements
- Account should have prior participation (comments, upvotes) in each subreddit
- If new account: spend 1-2 weeks participating before posting
- 90/10 rule: no more than 10% self-promotion in your overall activity

### License Disclosure
- Always say "source-visible under the SHALAUDE license"
- Never say "open source" without qualification
- If asked directly: "not OSI-approved, but source is visible for transparency and auditing"
