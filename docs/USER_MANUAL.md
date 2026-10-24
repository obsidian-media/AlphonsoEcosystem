# Alphonso User Manual

**Version**: 2.10.0
**Last Updated**: 2026-10-25 (every section checked against the app on `main`: Jose's requests, Miya's content factory, the Calendar, publishing, Telegram, approvals by effect, connectors)
**Status**: 2.10.0 is on `main`, not released yet; the latest release is 2.9.0. Features marked "not checked with real accounts" work in tests but have not been tried with a real account.

---

## Table of Contents

1. [What is Alphonso](#1-what-is-alphonso)
2. [Getting Started](#2-getting-started)
3. [Chat Interface](#3-chat-interface)
4. [Voice OS — Local Voice Pipeline](#4-voice-os--local-voice-pipeline)
5. [Jose — Requests and Plans](#5-jose--requests-and-plans)
6. [9 Agents — Who Does What](#6-9-agents--who-does-what)
7. [Boardroom and Project Batches](#7-boardroom-and-project-batches)
8. [Miya Studio — the Content Factory](#8-miya-studio--the-content-factory)
   - [Content Studio (quick posts)](#content-studio-quick-posts)
   - [Calendar](#calendar)
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

### Installing

Download the installer for your system from the [latest release](https://github.com/obsidian-media/AlphonsoEcosystem/releases/latest):

- **Windows:** `Alphonso_<version>_x64-setup.exe`. Run it, then launch Alphonso.
- **macOS (Apple Silicon only):** `Alphonso_<version>_aarch64.dmg`. Open it and drag Alphonso to Applications. The Mac build is not yet signed by Apple, so the first time, right-click Alphonso in Applications and choose **Open**, then confirm (on newer macOS you may need System Settings > Privacy & Security > **Open Anyway**). After that it opens normally and updates install themselves.
- **Linux:** `Alphonso_<version>_amd64.AppImage`. Make it executable (`chmod +x`) and run it.

An installed copy checks for updates at launch and offers to install them.

### First Launch

1. Open Alphonso
2. The chat interface appears — this is your primary interaction point
3. Type anything to start. A plain question gets an answer at once; anything else Jose plans as steps for the right agents (see [section 5](#5-jose--requests-and-plans)).

On a fresh install the **Setup** screen comes first: it checks your computer, asks what you want to do (chat, images, voice, everything or custom) and installs what that needs, including the starter model `llama3.2:3b`.

### Ollama Setup

Alphonso starts Ollama for you at launch when it is installed. If you prefer to run Ollama yourself, chat still works from v2.10.0 on: when Ollama refuses the app window, Alphonso sends the conversation through its backend instead, and the reply appears all at once rather than word by word. To get streamed replies from an Ollama you started yourself, allow the app window to call it:

```powershell
$env:OLLAMA_ORIGINS="http://tauri.localhost"
ollama serve
```

(`"*"` also works but allows any website open in your browser to call your local Ollama.)

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
  → VAD (webrtcvad) — waits until you finish speaking (a 0.7 s pause, 15 s at most)
  → STT (faster-whisper, CPU, int8; tiny.en by default)
  → Agent routing (9-agent regex patterns)
  → Ollama /api/chat (the model and Ollama address you chose in Settings)
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
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m uvicorn main:app --host 127.0.0.1 --port 8766
```

### Using Voice in Chat

Once the Voice OS server is running:

1. Click the **microphone button** in the Chat input area
2. Speak your request — the status indicator shows: `idle → listening → thinking → speaking`
3. Alphonso waits until you finish, transcribes, routes to the appropriate agent, answers once and plays it back; the agent that answered is shown
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
| "plan", "task", "schedule", "delegate" | **Jose** |
| "email", "letter", "note", "code", "bug", "build", "install" | **Alphonso** |
| "opportunity", "score", "prioritise", "timing", "when should" | **Nova** |
| "publish", "send", "release", "slack", "call" | **Marcus** |
| "write", "blog", "post", "script", "video", "design", "campaign" | **Miya** |
| "audit", "risk", "compliance", "check", "review" | **Maria** |
| "remember", "recall", "memory", "save" | **Echo** |
| "security", "threat", "vulnerability", "permission" | **Sentinel** |
| "research", "search", "find", "market", "competitor", "source" | **Hector** |
| Everything else | **Alphonso** |

Each agent answers in its role (from `voice/backend/agent_roles.py`) and, asked for someone else's work, says who does it.

### Voice Health Check

The server exposes a health endpoint:

```bash
curl http://127.0.0.1:8766/health
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

## 5. Jose — Requests and Plans

Jose is the orchestrator. Every message, from Chat, Telegram, WhatsApp, the phone, a schedule or a Boardroom thread, reaches him.

### Answer or plan

- **A plain question** ("what is…", "how do I…") is answered straight away.
- **Anything else** is decided by Jose's model: answer, or plan. If the model is slow or not available, a simple rule decides.
- **`/jose <task>`** always plans.
- **"Plan this fresh: <task>"** plans without starting from a template.

### Plans

A plan is a set of steps. Each step names its agent, what it does, and which steps it needs first; steps that don't need each other run at the same time. Jose starts from a template when one fits (Content video, Build an app, Research report, or one you saved) or plans fresh. Every planned reply says how it was planned.

Before anything runs, the plan is checked: no step can wait for itself, every step it needs must exist, and each agent may only do what its permissions allow (see [section 6](#6-9-agents--who-does-what)). A plan that still breaks the rules after one fix falls back to the simple plan, and Jose says why. A plan has at most 50 steps.

### Show the plan first

**Settings → General → Show Jose's plan first:** Always, Bigger requests only (the default: 4 or more agents counting Jose and Maria, or a step that always asks) or Never. A waiting plan shows as a card in Chat with **Run this plan**, **Edit on the board** and **Cancel**.

### The Requests board

**Sidebar → System → Orchestrator → Requests** lists every request. Pick one to see its plan as boxes and arrows in the agents' colours, each step's status and time, a "Waiting for you" badge where a step waits, the change log, and what each step produced (its summary, files, sources and result). From here you can:

- **Run this plan**, **Edit** (remove or add a step, change its agent, what it needs or its instruction; a plan that breaks the rules can't be saved), or **Cancel**
- **Approve and carry on** a waiting step, or **Reject** it (which cancels the request)
- **Save as template** so Jose offers the plan for similar requests
- **Carry on** a request that was cut off when the app closed

### While a plan runs

- **Reviews can send work back:** when a review finds problems, the work goes back to its author with the findings and is reviewed again, at most 2 rounds; then Jose asks you.
- **Agents can ask for help:** an agent that needs something asks Jose, who picks a helper (once per step).
- **A larger model:** a step that keeps failing is tried once with the next larger installed model.
- **Paid models, only if you allow them:** Settings → Approvals → **Allow paid models** (off by default, and Zero-Cost Mode must be off). A step that still fails may then be given to Claude or ChatGPT at the prices you enter; it asks first with the cost, and a monthly cap stops spending past it. Not checked with a paid account yet.

### Away from the app

With Telegram paired (Settings → Connectors → Telegram), Jose tells your chat when a step or a plan waits for you (with **Approve** / **Reject** or **Run this plan** / **Cancel** buttons), when a request finishes or fails, and when a review asks you to decide. Settings → Approvals → **Jose on Telegram** switches each kind on or off. A waiting request expires after the days set in Settings → Approvals (7 to start; 0 or blank = never).

### Zero-Cost Mode

On by default. It blocks every paid or metered connector (Claude, ChatGPT, Runway, ElevenLabs, Higgsfield, CALL-E and others) until you turn it off in Settings.

---

## 6. 9 Agents — Who Does What

Each kind of work has exactly one owner, and Jose gives every step to the agent who owns it; no agent does another's work. What each agent may do is one table, shown in Project Execution's capability matrix and on the Hector desk. Everyone may read and create new files of its own; only **Alphonso** may run code or change project files; only **Marcus** may publish or send. Spending (a paid model, or Miya's paid voices, pictures and clips) is allowed only on certain steps, and always asks.

| Agent | Owns | Never does | In Miya Studio |
|-------|------|------------|----------------|
| **Jose** | Planning, routing each step to its owner, approvals, the closing summary | The work itself: no writing, research or reviews | Runs a project as one request |
| **Alphonso** | Code (front-end too), commands, project changes, plain questions, everyday writing (emails, notes) | Brand content, design | — |
| **Miya** | Content and design: scripts, pictures, voice, music, Shorts, carousels, campaign copy, UI/UX design, editing the finished video | Code | Script, scenes, thumbnails, voice, music, clips, the finished video, Shorts, carousels, campaign |
| **Hector** | Finding facts: research, sources, competitors, stock footage | Judging value, writing content | What goes viral and who competes; stock clips |
| **Nova** | Judging value, priority and timing from what Hector found | Gathering facts | Judges the market from Hector's research; post times, results, lessons and ideas |
| **Maria** | Quality, governance and risk reviews | Security | Reviews the script; the quality gate |
| **Sentinel** | Security and safety checks | Quality | The security check before posting |
| **Marcus** | Sending and publishing approved work, placing calls | Deciding what to say | Posts and schedules the posts |
| **Echo** | Organising and cleaning memory (others may save their own notes) | Others' work | Remembers what you reject and decide |

Every step gets the full work of the steps it depends on, so a reviewer reads the actual draft and Marcus sends what was written, never the instruction. A request ends with a short summary, one line per step, then "Open on the board."; a one-step request shows its whole answer. When an agent can't work until something is set up (Kokoro not installed, a connector without its key), the step waits, says what to set up, and **Carry on** (board or Telegram) runs it again; it is never handed to another agent. In Boardroom and Simple mode an agent asked for someone else's work says who does it. Placing a CALL-E call is Marcus's step and waits for your approval.

---

## 7. Boardroom and Project Batches

### Boardroom (group chat)

**Sidebar → Boardroom** is a group chat with the agents. Mention one or more with `@` (for example `@hector @nova`) and each replies with its own model; a reply that mentions another agent passes the turn on, at most 3 times, then asks you. **Stop** halts the chain. Each thread has three actions, each run as a one-step Jose request on the Requests board:

- **Conclude** — Maria's governance review: risk level, whether approval is needed, and a summary, saved on the thread.
- **Distribute** — Marcus prepares a review that sends nothing, or posts to a Slack channel after you approve it.
- **Creative brief** — Miya writes a brief from the thread.

### Project goals and batches

The batch orchestrator is Alphonso's **goal-and-batch tracker**. It breaks high-level goals into concrete tasks, assigns them to specialized agents, and executes them in iterative batches — with Maria governance reviewing each batch.

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

1. Open the batch panel on the **Operator Dashboard** (turn on Settings → Desktop & UI → Developer mode first)
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
   - **Maria** reviews governance and risk
   - **Marcus** prepares approved distribution
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
2. Or set it in the project batch panel's folder field
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

## 8. Miya Studio — the Content Factory

**Sidebar → Work → Creative** (Miya Studio) turns an idea into finished, posted videos for a brand. Set **Settings → Output folder** first: every project is saved in `<output folder>/<brand>/<project>/`, with each step's versions.

### Brands

The **Brands** tab holds each brand: name, colours, fonts, logo, tone, audience, visual style, voice, platforms and posting times, honesty rules, references, and a quality threshold (pieces below it are hidden unless you tick "Show everything"). What you reject is remembered for that brand, and only the lessons you keep reach new projects. Also here:

- **Engines:** who reads the voice-over (Kokoro, free, or one of your ElevenLabs voices), who makes pictures (ComfyUI, free, or Higgsfield) and AI clips (this computer, Runway or Higgsfield), and whether ElevenLabs adds sound effects. A project can override these in the Scene Builder.
- **Characters:** any number of characters, made-up or a real person. A real person needs the tick **"This is me, or I have this person's permission"** (saved with its date). Give a character 5–20 pictures, or press **Make pictures with Miya** (8 pictures with ComfyUI, made-up characters only). One is the brand's main character; a project or a single scene can pick another, or none. With ComfyUI the character is kept free from its pictures (install the character reference model on Runtime Hub's ComfyUI card); **Train on Higgsfield** trains it once, after asking with the cost.
- **Results, lessons and ideas** (see below).

### A project, step by step

Create a project, fill in the brief (the idea, platforms, what to make, format, length) and press **Run project**. Jose runs every step as one request, shown on the Requests board:

1. **Research** — Hector looks at what goes viral, Nova checks the market.
2. **Script** — Miya writes 3 hooks and a timed script; Nova and Maria review it and may send it back (2 rounds). Then it waits: **"Approve the review in Miya Studio first."**
3. **Scenes** — a storyboard with a picture for each scene, the brand's character in it.
4. **Thumbnails** — 3 finished 1280×720 thumbnails with the headline drawn on in the brand's colours.
5. **Voice-over** — Kokoro (install it in Runtime Hub) or ElevenLabs reads each scene's lines.
6. **Music** — MusicGen (AudioCraft, from Runtime Hub) makes a music bed; without it the step is skipped and says so.
7. **Sound effects** — optional, ElevenLabs, at most one per scene.
8. **Stock clips** — Hector finds a clip per scene on Pexels, Pixabay or Coverr (free keys in Connectors → Content & Productivity), keeping each clip's source, author and license.
9. **AI clips** — real moving video for the main moments (Miya marks them; switch any scene on or off), every scene, or none. Made with a local video model in your ComfyUI (Runtime Hub → ComfyUI suggests one for your graphics card), Runway or Higgsfield. A run with paid clips stops once and asks with the cost.
10. **Motion** — a scene (or a Short's part) can copy a movement: a Higgsfield preset, a move you **Record** with the webcam (3-2-1, up to 10 seconds), or **A video from your files** (over 10 seconds is refused). Miya suggests where a move would help. Higgsfield makes it inside the clips step's one approval; without that, your computer makes it for free (install motion transfer on Runtime Hub's ComfyUI card; about 8 GB of graphics memory). If a motion can't be made, the scene gets its normal clip and says why.
11. **Finished video** — Alphonso assembles a 16:9 and a 9:16 MP4 with FFmpeg: voice on top, music under it, captions using only the script's words. The Scene Builder plays everything.
12. **Shorts** (when "What to make" asks for them, e.g. "3 Shorts") — each 30–60 seconds: its own mini-script, a highlight of the finished video with a new hook, or a plain cut. **Shorts Studio** lets you change a Short's kind, tick its platforms, play, redo or send it back.
13. **Carousel** (when "What to make" says carousel) — 5–10 slides in the brand's style and shape (4:5 or 1:1), reviewed in **Carousel Studio**.
14. **Campaign** — captions, hashtags, ad copy and posting times; ad copy can be exported as CSV for Meta Ads Manager or Google Ads Editor.
15. **Quality gate** — Maria and Sentinel check everything.
16. **Publish** — always asks (see below).

Each tab also has its own **Run** to redo one step; later steps then show **Out of date**, and nothing reruns by itself. **Send back** with a reason redoes a piece and saves the reason as a brand lesson. Asking in Chat for a content video ("make a YouTube video about…") starts a project for your default brand, with **Open in Miya Studio**. The old one-shot generator is the **Quick package** tab.

### Publishing

In **Campaign Studio → Posts**, **Make the posts list** prepares one post per platform and piece (YouTube video and Short, Instagram and Facebook Reels, carousels), each with its own title, caption, hashtags and time (from the brand's posting times, then Nova's suggestion, then tomorrow at 18:00). Change any of them, then **Approve and schedule** sends them all with one approval:

- **YouTube** uploads early as private and goes public at its time, even with the app closed. If YouTube keeps your channel's uploads private (it does for a Google project that hasn't passed its audit), Alphonso says so and reminds you at the time.
- **Facebook** Reels and photo posts are scheduled on your Page.
- **Instagram** posts are sent by Alphonso at their time, or at the next start if the app was closed then (more than 7 days late, it asks first). A post cut off while sending is never sent again blindly.
- **Daily limits:** a post over Instagram's daily limit or Facebook's 30 Reels a day waits and goes when there is room.
- **Your own storage (optional):** Instagram carousels (and Reels through Instagram Login) need a public link. Connect any S3-compatible bucket in Connectors → **Your storage** (with a Test); files are deleted once posted. Without storage, the post is saved in the project's `ready-to-post` folder with its caption, marked **Post by hand**, and Marcus reminds you at its time.

**Signing in:** Settings → Connectors → **Sign in to YouTube**, **Sign in to Facebook** and **Sign in with Instagram** open your browser and Alphonso receives the sign-in itself (on this computer only, for 5 minutes). You use your own Google project or Meta app; each button lists the steps and the address to register. Alphonso warns before a sign-in runs out (YouTube: about 7 days while your Google project is in Testing, so tick "My Google project is Published" once it is; Meta: 60 days). *Not checked with real accounts yet.*

### Results, lessons and ideas

Each post's numbers are read 1 hour, 1 day, 7 days and 30 days after it goes out: views, watch time, likes, comments, shares, saves, reach, new subscribers (whatever the platform gives; a number it doesn't give is "—"). The Posts list, the Calendar and the Brands tab's **Results** show each as good, weak or usual against the brand's own usual numbers (after 3 posts). After 7 days, Nova and Miya propose lessons (**Keep**, edit or **Drop**), a post that did well gets up to 3 follow-up ideas (**Start project**), and with 5 posts on a platform Alphonso suggests posting times (**Use this slot**). Telegram gets a daily summary. *Not checked with real accounts yet.*

### Content Studio (quick posts)

**Sidebar → Work → Content** (Content Studio) is the older one-shot studio for single social posts: a brief, a draft, an optional ComfyUI image and Runway video, and an approved publish (through the same publishing path). A draft that fell back to the template says so.

### Calendar

**Sidebar → Work → Calendar** shows every brand's posts, Content Studio's scheduled drafts and Marcus's other sends, by month or week, with brand and platform filters. Colours show the platform, a small marker the brand; striped means it needs you. **Drag** a post to move it (in the month it keeps its time, in the week it takes the hour you drop it on). A post already scheduled on YouTube or Facebook asks first and changes there. The side panel shows a post's details and numbers, changes its time, cancels it or opens its project.

---

## 9. Connector System

Alphonso has 33 connectors, all set up in **Settings → Connectors** and all policy-gated. Keys are kept in your system's keychain, never in a file; an environment variable still works as a fallback.

| Group | Connectors | Cost |
|-------|-----------|------|
| Messaging | Telegram, WhatsApp Cloud, Discord, Slack, Generic Webhook, Mobile Bridge | Free |
| | CALL-E (real outbound phone calls) | Paid |
| AI models | Ollama (local), NVIDIA NIM, Gemini (free tiers), Hermes Agents (self-hosted) | Free |
| | Claude, ChatGPT, Qwen, DeepSeek | Paid |
| Search & research | Brave Search, Tavily, Perplexity | Free tiers / paid |
| Content & productivity | YouTube, Meta (Facebook and Instagram), ComfyUI, SD WebUI, Pexels, Pixabay, Coverr, your own storage, Notion, ClickUp, GitHub | Free |
| | Runway, ElevenLabs, Higgsfield | Paid |
| Automation | n8n | Free (self-hosted) |

**Claude and ChatGPT:** pick the model from the live list in each connector (Claude Haiku 5.5 and GPT-6 Luna by default). **Higgsfield:** paste the model ids from the Higgsfield Console (pictures, clips, character training, motion), each with optional extra settings as JSON; **Test** gives Higgsfield's estimate without making anything. **ElevenLabs:** **Test** lists your voices, including your clones. Prices for paid engines are yours to enter in Settings → Approvals → Allow paid models.

### WhatsApp Cloud Setup

WhatsApp uses Meta's Cloud API (free) + a small Railway gateway service for inbound messages. Twilio is not supported.

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

1. Go to **Settings → Connectors**; connectors are grouped (Messaging, AI Models, Search & Research, Content & Productivity, Automation)
2. Enter the required credential(s) and click **Save**
3. Use **Test** in the Connector Health Monitor: "Live check passed" means the service itself answered; "key found" means only that a key is saved
4. If a check fails, the reason says what is missing or what the service said

### Connector Safety

- Every connector call goes through the policy gate
- Paid connectors are blocked in Zero-Cost Mode
- Publishing, sending and spending always ask first

---

## 10. Approval & Governance

### What asks first

Each step says what it does, and approval follows from that, not from the words in your request. **Settings → General → What asks first** has a switch for each kind:

| A step that… | Asks first |
|---|---|
| reads | No |
| creates new files of its own | No |
| changes project files | Your choice |
| runs code or commands | Your choice (asked per command; commands that only read never ask) |
| spends money | **Always** |
| publishes or sends | **Always** |
| deletes | **Always** (including AI-planned commands such as `git reset --hard` or `ollama rm`) |

The last three ask even with Approval Mode off. A command's risk rating comes from what it does, and the approval window says why.

### Where you approve

- **In Chat**, inline under the reply (Approve / Deny)
- **On the Requests board** (Approve and carry on / Reject)
- **On Telegram**, with the buttons Jose sends
- **In Miya Studio**, for the review, AI clips and Publish steps

Approving carries the request on; approving twice runs it once.

### Governance Agents

- **Maria**: governance, risk and quality reviews (scripts, the quality gate, Boardroom's Conclude)
- **Sentinel**: security scanning of activity, commands and content
- **Marcus**: the only agent that publishes or sends, after approval

---

## 11. Memory & Knowledge

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

## 12. Operator Dashboard

The Operator Dashboard is a developer tool: it appears in the sidebar and on Home only when **Settings → Desktop & UI → Developer mode** is on. It shows system health and controls.

### Panels

| Panel | Shows |
|-------|-------|
| **System Health** | Build status, verification, Ollama connection (polls every 3s) |
| **Connector Health** | Status of all 33 connectors |
| **Approval Center** | Pending approvals across all agents |
| **Memory Confidence** | Memory item quality scores |
| **Session Intelligence** | Real-time activity feed |
| **Batches** | Project goals, batch progress, task queue |

### Focus Mode

Toggle between **Focus** (compact) and **Full** (detailed) views. Focus mode collapses non-essential sections.

---

## 13. Project Execution Mode

A structured workflow for complex projects.

### Steps

1. **Project Intake** — Name, description, stack, deadline, features
2. **Agent Selection** — Choose which agents participate
3. **Decomposition** — Jose breaks the project into agent tasks
4. **Execution** — Agents work in dependency order
5. **Audit** — Maria reviews governance and risk
6. **Final Packet** — Complete execution report with all artifacts

### Access

Navigate to the Project Execution panel in the dashboard, or use:
```
/jose build a project with <description>
```

---

## 14. All Chat Commands

You don't need commands: write what you want and you get an answer (from Alphonso) or Jose plans it. These still work:

### Jose Commands

| Command | Description |
|---------|-------------|
| `/jose <task>` | Always plan the task |
| `Plan this fresh: <task>` | Plan without starting from a template |
| `ask jose <task>` | Natural language Jose invocation |
| `jose: <task>` | Colon-prefix variant |
| `Make a Higgsfield picture of <description>` | One Higgsfield picture (asks first with the cost; also works on Telegram) |
| `Make a Higgsfield video of <description>` | One Higgsfield clip (same) |
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
| `make a YouTube video about <topic>` | Miya | Start a Miya Studio project (see section 8) |
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
| `create content for <platform>` | Content Studio post |
| `make an Instagram post about <topic>` | Instagram content |
| `make a YouTube video about <topic>` | A full Miya Studio project, opened from Chat |
| `write a blog article about <topic>` | Blog post |
| `create a marketing campaign` | Full campaign |

### System Commands

Ask in plain words ("is Ollama running?", "which models do I have?"); Alphonso answers. Settings → Runtime and Runtime Hub show the real status of Ollama, ComfyUI, Voice OS and the other tools, and the Connector Health Monitor tests each connector.

### Memory Commands

| Command | Description |
|---------|-------------|
| `remember <info>` | Store information |
| `what do you know about <topic>` | Search memory |
| `archive <topic>` | Archive knowledge |
| `history` | Show recent activity |

---

## 15. Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Enter` | Send message |
| `Shift + Enter` | New line in textarea |
| `Escape` | Stop the current reply |
| `Ctrl + N` | New chat |
| `Ctrl + K` or `/` | Focus the message box |
| `Ctrl + B` | Boardroom |
| `Ctrl + S` | Settings |
| `Ctrl + D` | Agent dock |
| `Ctrl + M` | Metrics |
| `Ctrl + E` | Export a backup |
| `Ctrl + L` | Clear chat |
| `Ctrl + P` | Search memory |
| `?` | Show all shortcuts |

On a Mac, use `⌘` instead of `Ctrl`.

---

## 16. License Tiers

**Alphonso is free at launch.** Every agent and connector is available without a license key.

The licensing system still ships in the app (`licenseService.ts`), but it stays inactive until a vendor signing key is configured. There is currently nothing to buy and no key to enter. When paid tiers are introduced, this section and [docs/PRICING.md](PRICING.md) will describe them. Approving an action will never stand in for a license.

Connecting a third-party service (Claude, ChatGPT, Runway and so on) uses your own account and API key, and that provider bills you directly for usage. Zero-Cost Mode and Approval Mode, both on by default in **Settings**, block paid or metered calls until you approve them.

---

## 17. Performance Features

Alphonso includes these performance features (first added in v2.0.0):

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

## 18. Troubleshooting

### Ollama Not Connecting

```powershell
# Either let Alphonso start Ollama (Runtimes > Ollama > Start), or start it
# yourself with the desktop window's origin allowed:
$env:OLLAMA_ORIGINS="http://tauri.localhost"
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
  joseExecutionEngineService.ts    Wave execution engine
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

