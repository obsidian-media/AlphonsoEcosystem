# Alphonso User Manual

**Version**: 2.2.3
**Last Updated**: 2026-06-24
**Status**: Production Ready

---

## Table of Contents

1. [What is Alphonso](#1-what-is-alphonso)
2. [Getting Started](#2-getting-started)
3. [Chat Interface](#3-chat-interface)
4. [Voice OS — Real-Time Voice Pipeline](#4-voice-os--real-time-voice-pipeline)
5. [Jose Command System](#5-jose-command-system)
6. [9 Agents — Who Does What](#6-9-agents--who-does-what)
7. [Boardroom Orchestrator](#7-boardroom-orchestrator)
8. [Content Catalyst](#8-content-catalyst)
9. [Connector System](#9-connector-system)
10. [Approval & Governance](#10-approval--governance)
11. [Memory & Knowledge](#11-memory--knowledge)
12. [Operator Dashboard](#12-operator-dashboard)
13. [Project Execution Mode](#13-project-execution-mode)
14. [All Chat Commands](#14-all-chat-commands)
15. [Keyboard Shortcuts](#15-keyboard-shortcuts)
16. [License Tiers](#16-license-tiers)
17. [Performance Features](#17-performance-features)
18. [Troubleshooting](#18-troubleshooting)

---

## 1. What is Alphonso

Alphonso is a **local-first AI desktop companion** that runs entirely on your machine. It uses:

- **Ollama** for local LLM inference (no cloud API needed)
- **Tauri** for the desktop shell (Rust backend + React frontend)
- **SQLite** for local data persistence
- **9 specialized AI agents** that collaborate on tasks

**Key principles**:
- Everything runs locally — no data leaves your machine unless you explicitly approve it
- Approval required for any destructive, irreversible, or paid action
- You are always in control

---

## 2. Getting Started

### Prerequisites

1. **Ollama** installed and running (`ollama serve`)
2. A model pulled (`ollama pull llama3.2:3b` or your preferred model)
3. Alphonso desktop app built and running

### First Launch

1. Open Alphonso
2. The chat interface appears — this is your primary interaction point
3. Type anything to start. Alphonso will route your request to the right agent automatically.

### Ollama Setup

If Ollama is not running, Alphonso will show a preflight warning. To start Ollama:

```powershell
$env:OLLAMA_ORIGINS="*"
ollama serve
```

---

## 3. Chat Interface

The chat interface is the main way to interact with Alphonso.

### How It Works

1. **Type a message** in the textarea at the bottom
2. **Press Enter** or click the send button
3. Alphonso analyzes your input and routes it to the appropriate agent(s)
4. Results appear as chat messages with structured result cards

### Message Types

| Type | Description |
|------|-------------|
| **User** | Your input messages |
| **Assistant** | Alphonso's responses and agent results |
| **System** | Status updates, progress indicators |

### Result Cards

After agent execution, you'll see a **Pipeline Result Card** showing:
- Which agents worked on your request
- Status of each agent (completed, pending, failed)
- Artifacts generated (files, research, creative work)
- Generated images (if applicable)
- Retry buttons for failed tasks

---

## 4. Voice OS — Local Voice Pipeline

Alphonso's desktop Voice console shows the real readiness of the local voice
pipeline: the managed Voice OS runtime, Python, and the local WebSocket
service. It runs as a Python microservice (`voice/backend/`) launched from
**Runtimes**. A running process is not proof that a microphone-to-audio reply
has been verified; use the Chat microphone to make that check.

### How It Works

```
Microphone (AudioWorklet PCM)
  → WebSocket → FastAPI voice server (port 8766)
  → VAD gate (webrtcvad — discards silence)
  → STT (faster-whisper, CPU, int8)
  → Agent routing (9-agent regex patterns)
  → Ollama /api/chat streaming (same local model as chat)
  → TTS (piper — WAV audio back over WebSocket)
  → Speakers
```

### Starting the Voice Server

**From Runtime Manager (recommended):**
1. Open Alphonso → **Voice** to review readiness, or **Runtimes** to install the managed runtime
2. Find the **Voice OS** entry
3. Click **Start local voice** in Voice, or **Start** in Runtimes — the server launches on `ws://127.0.0.1:8766`

**From terminal (development):**
```bash
cd voice/backend
python -m venv .venv && .venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn main:app --host 127.0.0.1 --port 8766
```

### Using Voice in Chat

Once the Voice OS server is running:

1. Click the **microphone button** in the Chat input area
2. Speak your request — the status indicator shows: `idle → listening → thinking → speaking`
3. Alphonso transcribes, routes to the appropriate agent, generates a response, and plays it back
4. **Barge in** at any time by speaking — the current response will be cancelled immediately
5. Click **Stop** to end the voice session; click **Reset** to clear the conversation history

### Cloud Voice companion

Cloud Voice is separate from desktop Voice OS. It requires a paired, enrolled
iPhone plus a real request/reply audio check. The Voice console deliberately
marks it as pending until that physical-device verification has been recorded.

### Voice Agent Routing

The voice pipeline uses the same 9 agents as the chat interface. Routing is keyword-based:

| Keywords | Agent routed to |
|----------|----------------|
| "search", "find", "research", "what is", "who is" | **Hector** |
| "write", "draft", "create", "compose", "generate content" | **Miya** |
| "publish", "post", "share", "distribute", "send to" | **Marcus** |
| "remember", "recall", "memory", "what did I", "last time" | **Echo** |
| "task", "assign", "schedule", "plan", "todo" | **Jose** |
| "security", "scan", "vulnerability", "audit", "risk" | **Sentinel** |
| "opportunity", "market", "trend", "analyse", "growth" | **Nova** |
| "policy", "compliance", "governance", "approve", "review" | **Maria** |
| Everything else | **Alphonso** |

### Voice Health Check

The server exposes a health endpoint:

```bash
curl http://127.0.0.1:8765/health
# → {"status": "ok"}
```

### Voice Troubleshooting

| Problem | Fix |
|---------|-----|
| "Voice server not running" | Start it from Runtime Manager or terminal |
| No transcription | Check Ollama is running and a model is pulled |
| No audio output | Ensure `piper-tts` is installed (`pip install piper-tts`) |
| Browser microphone blocked | Allow microphone permission in system settings |
| High latency | Use a smaller Ollama model (`llama3.2:1b`) or reduce `beam_size` in `stt.py` |

---

## 5. Jose Command System

Jose is the orchestrator agent. You can explicitly invoke Jose with these prefixes:

### Explicit Jose Commands

| Command | Description |
|---------|-------------|
| `/jose <task>` | Route any task through Jose's decomposition pipeline |
| `ask jose <task>` | Same as above, natural language variant |
| `jose: <task>` | Colon-prefix variant |

### Automatic Jose Routing

Jose is automatically triggered when your message contains these keywords:
`folder`, `file`, `desktop`, `rename`, `create`, `make`, `generate`, `image`, `picture`, `visual`, `miya`, `jose`, `agent`, `delegate`, `task`, `move`, `delete`, `remove`, `open`, `save`, `install`, `write`, `edit`, `copy`, `path`, `command`, `system`, `plan`, `roadmap`, `batch`, `boardroom`

### What Jose Does

1. **Parses** your command into intent flags (research, creative, execution, etc.)
2. **Decomposes** the command into agent-specific assignments
3. **Routes** assignments to the right agents (Hector, Miya, Alphonso, etc.)
4. **Executes** agents in dependency order (wave execution)
5. **Merges** all agent results into a final report
6. **Displays** the result in chat with a structured card

### Zero-Cost Mode

If enabled, Jose blocks any task that would use paid external services (Telegram, WhatsApp, YouTube connectors). You'll be prompted to approve or reroute.

---

## 5. 9 Agents — Who Does What

| Agent | Role | Triggers | Can Do | Cannot Do |
|-------|------|----------|--------|-----------|
| **Jose** | Orchestrator | `/jose`, `ask jose`, planning keywords | Decompose, route, merge, approve, parallel execution | Bypass approval gates |
| **Hector** | Research | `research`, `lookup`, `docs`, `source`, `citation`, `github` | Fetch sources, verify citations, write reports, GitHub repo/code/issue search | Terminal commands, file writes, social posting |
| **Miya** | Creative | `video`, `script`, `brand`, `campaign`, `image`, `creative` | Scripts, storyboards, images (ComfyUI), content | System commands, file operations |
| **Alphonso** | Operator | `build`, `file`, `verify`, `install`, `command`, `fix`, `test`, `github` | Execute commands, write files, install packages, verify builds, GitHub PR/issue management, code search | Bypass safety checks |
| **Maria** | Governance | `audit`, `compliance`, `policy`, `approval`, `risk` | Requirements, roadmaps, risk registers, audits | Destructive execution |
| **Marcus** | Distribution | `distribute`, `schedule`, `publish`, `upload`, `release`, `slack` | Approved publishing, security reviews, release readiness, GitHub releases, Slack notifications | Execute without approval |
| **Echo** | Memory | `remember`, `archive`, `knowledge`, `history` | Store decisions, preserve context, knowledge archival | Execution, posting |
| **Sentinel** | Security | `security`, `secrets`, `permission`, `vulnerability` | Safety monitoring, vulnerability scanning, alerts | Execution, posting |
| **Nova** | Analysis | `opportunity`, `priority`, `score`, `roi`, `value` | Scoring, prioritization, performance analysis | Execution, file writes |

### Agent Dependency Order (Wave Execution)

```
Wave 0: Hector, Maria, Sentinel, Nova (no dependencies)
Wave 1: Miya (needs Hector), Marcus (needs Maria)
Wave 2: Alphonso (needs Miya)
Wave 3: Echo (needs all)
```

---

## 6. Boardroom Orchestrator

The Boardroom is Alphonso's **autonomous project execution system**. It breaks high-level goals into concrete tasks, assigns them to specialized agents, and executes them in iterative batches — with Maria governance reviewing each batch.

### How to Use

#### Via Chat

```
plan Build a SaaS analytics dashboard
```

or

```
/jose plan Create a REST API backend with authentication
```

or

```
roadmap Design a React Native mobile app
```

#### Via Dashboard

1. Open the **Boardroom Panel** in the operator dashboard
2. Enter your project goal and optionally a project folder path
3. Click **SET GOAL & GENERATE BATCH**
4. Batch #1 is generated with ~7-10 tasks assigned to agents by specialty
5. Click **EXECUTE BATCH** to run all tasks through the agent pipeline
6. Watch real-time progress as each task executes (hector researches, miya designs, alphonso codes)
7. When batch completes, Maria reviews outputs for governance
8. Click **NEXT** to generate the next batch
9. Repeat until the goal is achieved

### What Happens (Autonomous Flow)

1. **Goal Creation**: Your text becomes a tracked project goal with an optional project directory
2. **Batch Generation**: System generates task batches using:
   - **LLM-powered** (when Ollama is available): Context-aware, analyzes progress
   - **Rule-based** (fallback): Template-based, instant, always works
3. **Batch Execution**: Each task is dispatched to its assigned agent through the full pipeline:
   - **Hector** researches documentation and sources
   - **Maria** defines requirements and data models
   - **Miya** creates UI/UX designs and creative packages
   - **Alphonso** implements code, builds, and tests
   - **Marcus** performs security audits
   - **Sentinel** monitors for safety issues
   - **Nova** scores and prioritizes
   - **Echo** preserves knowledge
4. **Maria Governance Review**: After batch completion, Maria reviews all outputs for:
   - Risk classification (low/medium/high/critical)
   - Compliance issues
   - Approval requirements
   - Agent trust state verification
5. **Next Batch**: System generates the next set of tasks based on completed work
6. **Repeat**: Continues until all batches are complete

### Project Directories

Each project can have its own working directory:

1. Set the directory when creating a goal: "plan Build a dashboard in /path/to/project"
2. Or set it via the Boardroom Panel input field
3. Agents receive directory context in their task assignments
4. File operations reference the project directory

### Commands

| Chat Command | What It Does |
|---|---|
| `plan <goal>` | Create goal + generate first batch |
| `execute batch` | Run all pending tasks in the active batch |
| `run batch` | Same as execute batch |
| `next batch` | Generate next batch (if current is complete) |
| `advance batch` | Same as next batch |
| `batch` | Show current batch progress |
| `boardroom` | Show boardroom status |
| `set project folder to <path>` | Set project directory for current goal |

---

## 7. Content Catalyst

Content Catalyst is Miya's **content creation studio** for social media. Start
with a creative brief, choose the asset types you need, then review each output
before it moves forward. The studio never treats an unavailable asset as a
finished one.

For image work, the studio checks the local ComfyUI runtime. If ComfyUI is
installed but stopped, use **Start ComfyUI** from the active job; if it is not
installed, set it up in **Runtimes** first. A generated image is shown directly
in the Creative output card when available. Video generation uses Runway only
when it is configured. Publishing always requires approval.

### Trigger

```
Create an Instagram post about our new feature
Generate a LinkedIn article on AI trends
Make a YouTube video script for product launch
```

### Pipeline Steps

1. **Brief** — Miya creates a content brief (platform, format, tone)
2. **Draft** — LLM generates the content draft
3. **Image** — ComfyUI generates visual assets
4. **Video** — Runway generates video (if requested)
5. **Narration** — A narration script (if requested; audio generation is not implied)
6. **Preview** — Shows the complete package
7. **Publish** — Posts to the platform (requires approval)

### Supported Platforms

- Instagram (posts, reels, stories)
- Facebook (posts, ads)
- Twitter/X (tweets, threads)
- TikTok (videos)
- LinkedIn (posts, articles)
- YouTube (scripts, descriptions)

---

## 8. Connector System

Alphonso has 13 built-in connectors, all policy-gated:

| Connector | Type | Cost | Tier Required |
|-----------|------|------|---------------|
| Telegram | Messaging | Free (self-hosted bot) | Free |
| WhatsApp | Messaging | Free (Meta Cloud API + Railway gateway) | Free |
| Brave Search | Search | Free | Free |
| YouTube | Publishing | Free | Pro |
| Claude | LLM | Paid | Pro |
| ChatGPT | LLM | Paid | Pro |
| GitHub | Development | Free tier | Pro |
| Slack | Communication | Free tier | Pro |
| Notion | Workspace | Free tier | Pro |
| ClickUp | Project Mgmt | Free tier | Pro |
| SD WebUI | Image Gen | Free (local) | Pro |
| ComfyUI | Image Gen | Free (local) | Pro |
| Runway | Video Gen | Paid | Pro |
| Ollama | LLM | Free (local) | Free |

### WhatsApp Cloud Setup

WhatsApp uses Meta's Cloud API (free) + a small Railway gateway service for inbound messages.

**Required credentials** (set in Settings → Connectors → WhatsApp):

| Credential | Description |
|---|---|
| `WHATSAPP_ACCESS_TOKEN` | From Meta App Dashboard → WhatsApp → API Setup |
| `WHATSAPP_PHONE_NUMBER_ID` | Your WhatsApp Business phone number ID |
| `WHATSAPP_VERIFY_TOKEN` | Secret token you set in both Railway and here |
| `WHATSAPP_CLOUD_GATEWAY_DRAIN_URL` | `https://<your-railway-url>/queue/drain` |
| `WHATSAPP_ALLOWED_NUMBERS` | Comma-separated allowed sender numbers (digits only) |

See [GETTING_STARTED.md](./GETTING_STARTED.md) for the full Railway deployment steps.

### Setting Up Connectors

1. Go to **Settings → Connectors** and select the connector you want to set up
2. Enter the required credential(s) in the input fields
3. Click **Save** — credentials are automatically verified immediately after saving
4. A green "saved & verified ✓" notice confirms the connector is ready to use
5. If verification fails, re-check your credential values and try again

> **Note (v2.2.3+)**: Connectors now auto-verify when you save credentials. You no longer need to click "Test Connection" manually after saving.

### Connector Safety

- Every connector call goes through `policyEnforcementService`
- Paid connectors trigger approval prompts in Zero-Cost Mode
- External actions (publish, upload) always require approval

---

## 9. Approval & Governance

### When Approval Is Required

| Action | Risk Level | Approval Needed |
|--------|-----------|----------------|
| Read files, research | Low | No |
| Write files, create code | Medium | No (local only) |
| Delete files | High | Yes |
| External API calls | Medium | Yes (if paid) |
| Publish/upload | High | Yes |
| Payment actions | Critical | Yes |
| Deploy | Critical | Yes |

### Approval Panel

When approval is required, an **Approval Panel** appears **directly in the chat thread**, inline below the last assistant message:
- Risk level badge (color-coded)
- Action description
- **Approve** / **Deny** buttons
- **Continue** button after all approvals resolved

> **Note (v2.2.3+)**: All pipeline results (agent receipts, approval prompts, Nova insights) now appear inline in the chat thread — you no longer need to scroll below the chat or look at separate panels.

### Governance Agents

- **Maria**: Reviews requirements, roadmaps, and acceptance criteria
- **Marcus**: Reviews security, release readiness, and distribution
- **Sentinel**: Monitors for safety violations and blocks dangerous actions

---

## 10. Memory & Knowledge

Alphonso maintains several memory systems:

### Memory Types

| Type | Purpose | Storage |
|------|---------|---------|
| **Core Memory** | User preferences, decisions, context | localStorage + SQLite |
| **Miya Memory** | Creative work history, brand decisions | localStorage |
| **Ecosystem Memory** | Cross-agent knowledge, learnings | localStorage |
| **Session Events** | Real-time activity log | localStorage + SQLite |
| **Orchestration Receipts** | Execution audit trail | localStorage + SQLite |

### Memory Commands

| Command | What It Does |
|---------|-------------|
| `remember <info>` | Store information in core memory |
| `archive <topic>` | Archive knowledge for future reference |
| `what do you know about <topic>` | Search memory for relevant items |

### Memory Persistence

- Primary: `localStorage` (always available)
- Secondary: SQLite via `kv_set` (survives app restarts)
- Max items per type: 500-6000 (auto-trimmed)

---

## 11. Operator Dashboard

The operator dashboard shows system health and controls.

### Panels

| Panel | Shows |
|-------|-------|
| **System Health** | Build status, verification, Ollama connection (polls every 3s) |
| **Connector Health** | Status of all 11 connectors |
| **Approval Center** | Pending approvals across all agents |
| **Memory Confidence** | Memory item quality scores |
| **Session Intelligence** | Real-time activity feed |
| **Boardroom** | Project goals, batch progress, task queue |

### Focus Mode

Toggle between **Focus** (compact) and **Full** (detailed) views. Focus mode collapses non-essential sections.

---

## 12. Project Execution Mode

A structured workflow for complex projects.

### Steps

1. **Project Intake** — Name, description, stack, deadline, features
2. **Agent Selection** — Choose which agents participate
3. **Decomposition** — Jose breaks the project into agent tasks
4. **Execution** — Agents work in dependency order
5. **Audit** — Marcus reviews security and readiness
6. **Final Packet** — Complete execution report with all artifacts

### Access

Navigate to the Project Execution panel in the dashboard, or use:
```
/jose build a project with <description>
```

---

## 13. All Chat Commands

### Jose Commands

| Command | Description |
|---------|-------------|
| `/jose <task>` | Route task through Jose's pipeline |
| `ask jose <task>` | Natural language Jose invocation |
| `jose: <task>` | Colon-prefix variant |
| `plan <goal>` | Create project goal + generate batch |
| `execute batch` | Run all pending tasks in the active batch |
| `run batch` | Same as execute batch |
| `next batch` | Generate next batch of tasks |
| `advance batch` | Same as next batch |
| `batch` | Show current batch status |
| `boardroom` | Show boardroom status |
| `roadmap <goal>` | Create roadmap for a goal |
| `decompose <task>` | Break down a complex task |
| `milestones <project>` | Define project milestones |
| `set project folder to <path>` | Set project directory for current goal |

### Agent-Specific Commands

| Command | Agent | Description |
|---------|-------|-------------|
| `research <topic>` | Hector | Research a topic, find sources |
| `lookup <info>` | Hector | Look up specific information |
| `docs <library>` | Hector | Find documentation |
| `create image <prompt>` | Miya | Generate an image via ComfyUI |
| `make a video <script>` | Miya | Generate video content |
| `brand <direction>` | Miya | Brand strategy and creative |
| `script <topic>` | Miya | Write a script |
| `build <thing>` | Alphonso | Build/compile/package |
| `install <package>` | Alphonso | Install a package |
| `fix <issue>` | Alphonso | Fix a bug or issue |
| `test <scope>` | Alphonso | Run tests |
| `verify` | Alphonso | Verify build/runtime |
| `audit <scope>` | Maria | Governance audit |
| `compliance <area>` | Maria | Compliance review |
| `security <check>` | Sentinel | Security scan |
| `remember <info>` | Echo | Store in memory |
| `archive <topic>` | Echo | Archive knowledge |
| `opportunity <area>` | Nova | Score an opportunity |
| `prioritize <list>` | Nova | Prioritize items |
| `publish <content>` | Marcus | Publish (requires approval) |
| `upload <file>` | Marcus | Upload (requires approval) |
| `distribute <content>` | Marcus | Distribute content |

### Content Creation Commands

| Command | Description |
|---------|-------------|
| `create content for <platform>` | Full content pipeline |
| `make an Instagram post about <topic>` | Instagram content |
| `generate a YouTube video script` | YouTube script |
| `write a blog article about <topic>` | Blog post |
| `create a marketing campaign` | Full campaign |

### System Commands

| Command | Description |
|---------|-------------|
| `check ollama` | Verify Ollama connection |
| `list models` | Show available Ollama models |
| `system health` | Show system health status |
| `list connectors` | Show connector status |
| `list agents` | Show all agents and their status |

### Memory Commands

| Command | Description |
|---------|-------------|
| `remember <info>` | Store information |
| `what do you know about <topic>` | Search memory |
| `archive <topic>` | Archive knowledge |
| `history` | Show recent activity |

---

## 14. Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Enter` | Send message |
| `Shift + Enter` | New line in textarea |
| `Escape` | Cancel current generation |

---

## 15. License Tiers

Alphonso offers three license tiers to match different needs:

### Free Tier

**Included features:**
- All 9 agents (Jose, Hector, Miya, Alphonso, Maria, Marcus, Echo, Sentinel, Nova)
- Ollama local LLM integration
- Telegram and WhatsApp connectors
- Brave Search connector
- Local memory and knowledge base
- Boardroom orchestrator
- Content Catalyst
- Community support

**Limitations:**
- No cloud LLM connectors (Claude, ChatGPT)
- No premium connectors (GitHub, Slack, Notion, ClickUp)
- No image/video generation connectors

### Pro Tier ($19/month)

**Everything in Free, plus:**
- Claude API connector
- ChatGPT API connector
- GitHub connector (issues, PRs, releases, code search)
- Slack connector (messaging, channels, webhooks)
- Notion connector
- ClickUp connector
- SD WebUI image generation
- ComfyUI image generation
- Runway video generation
- Priority email support
- Early access to new features

### Enterprise Tier ($99/month)

**Everything in Pro, plus:**
- Multi-user support
- Admin dashboard with team management
- SSO integration
- Advanced audit logs
- Custom agent development
- Dedicated support
- SLA guarantees

### Activating a License

1. Open **Settings** → **License**
2. Enter your license key
3. Click **Activate**
4. Restart Alphonso

Your license key is stored locally and validated against the policy enforcement system. Premium connectors are automatically enabled based on your tier.

---

## 16. Performance Features

Alphonso v2.0.0 includes significant performance optimizations:

### Parallel Execution

Tasks that don't depend on each other now run in parallel:
- Multiple agents can work simultaneously
- Batch operations execute concurrently
- Configurable concurrency limits (default: 5 parallel tasks)
- Automatic retry with exponential backoff on failures

**Example:** When Jose decomposes a task into Hector research + Miya creative + Alphonso implementation, Hector and Miya can work in parallel while Alphonso waits for their outputs.

### Memory Caching

Frequently accessed data is cached in memory:
- Agent profiles and permissions (5-minute TTL)
- Connector configurations (5-minute TTL)
- Memory search results (2-minute TTL)
- LRU eviction when cache is full (max 1000 entries)

This reduces redundant service calls and speeds up repeated operations.

### Optimized Policy Checks

Policy enforcement now uses:
- Cached connector risk levels
- Batched approval checks
- Lazy evaluation (stops at first failure)

### SQLite Optimizations

- WAL mode enabled for concurrent reads
- Prepared statements for repeated queries
- Indexed lookups for memory and receipts

### Performance Metrics

| Operation | v1.0.3 | v2.0.0 | Improvement |
|-----------|--------|--------|-------------|
| Agent dispatch | ~200ms | ~50ms | 4x faster |
| Memory search | ~150ms | ~20ms | 7.5x faster |
| Policy check | ~80ms | ~15ms | 5x faster |
| Batch execution | Sequential | Parallel | 3-5x faster |

---

## 17. Troubleshooting

### Ollama Not Connecting

```powershell
# Start Ollama with CORS enabled
$env:OLLAMA_ORIGINS="*"
ollama serve
```

### Build Fails

```bash
# From src-tauri/
cargo check

# From project root
npm run build
```

### Tests Fail

```bash
# Run all tests
npm run test

# Run specific test
npx vitest run src/test/<filename>.test.js
```

### Lint Errors

```bash
npm run lint
```

### Reset All Data

Delete localStorage keys starting with `alphonso_`:
```javascript
Object.keys(localStorage)
  .filter(k => k.startsWith('alphonso_'))
  .forEach(k => localStorage.removeItem(k));
```

---

## Architecture Quick Reference

```
src/
  agents/           9 agent profiles, permissions, schemas
  components/       82+ UI components (5 migrated to .tsx)
  services/         ~126 services (policy-gated)
    connectors/     GitHub, Slack, and other connector implementations
  hooks/            14 custom React hooks
  lib/              Utilities (ollama.js, chatUtils.js, durableStore.js)
  features/         Content Catalyst, etc.
  test/             112 test files (1621+ tests)

src-tauri/
  src/lib.rs        Rust backend (~1,713 lines, 18 modules)
  src/utils.rs      Shared Rust utilities
  src/kv_store.rs   SQLite KV store
  src/memory_store.rs  Runtime ledger
  src/policy_gate.rs   Policy enforcement backend
  src/ollama.rs     Ollama backend
  src/telegram.rs   Telegram connector
  src/youtube.rs    YouTube upload

Key Services:
  joseCommandRouterService.js      Command parsing & decomposition
  joseExecutionEngineService.js    Wave execution engine
  batchOrchestratorService.js      Boardroom batch planning + auto-execution
  parallelExecutionService.ts      Parallel task execution with retry
  cacheService.ts                  Memory caching with TTL and LRU
  licenseService.ts                License tier validation
  projectDirectoryService.js       Per-project directory mapping
  agentBusService.js               Inter-agent messaging
  agentContractService.ts          Per-agent execution contracts
  policyEnforcementService.ts      Safety gate for all outbound calls
  hectorResearchService.js         Live research pipeline (DuckDuckGo + Ollama)
  connectorHealthCheckService.js   Live connector health probes
  connectorRegistryService.js      13 connector registry
  connector_commands.rs            Rust: connector_github_action (5 actions via GitHub REST API v3)
  connector_commands.rs            Rust: connector_slack_send (chat.postMessage via Slack Web API)
```
