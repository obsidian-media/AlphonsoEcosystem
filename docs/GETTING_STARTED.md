# Getting Started with Alphonso

Alphonso is a local-first AI desktop companion. Your data stays on your machine.

## Install the app (most people)

1. Download the installer from the [latest release](https://github.com/obsidian-media/AlphonsoEcosystem/releases/latest): Windows `…_x64-setup.exe`, macOS (Apple Silicon, macOS 13.3 or later) `…_aarch64.dmg`, Linux `…_amd64.AppImage`. On macOS the build isn't signed by Apple yet: the first time, right-click Alphonso in Applications and choose **Open**. For finished videos a Mac also needs FFmpeg once: open Terminal and run `brew install ffmpeg` (the Windows and Linux installers include it).
2. Launch Alphonso. **Setup** checks your computer, asks what you want to do (Chat only, Chat + Images, Chat + Voice, Full Power, or Custom), asks where to install tools, and installs what that needs, including the starter model `llama3.2:3b` and, on Windows, the bundled Ollama runtime. Ollama installed already, or ComfyUI of your own, is found and used.
3. When it's done, chat. Installed copies update themselves.

## Build from source (developers)

### Prerequisites

| Dependency | Version | Install |
|-----------|---------|---------|
| **Ollama** | Latest | https://ollama.com |
| **Node.js** | 22 LTS (`nvm use` picks the repo's version) | https://nodejs.org |
| **Rust** | 1.77.2+ | https://rustup.rs |

### Quick Start (5 minutes)

#### 1. Install Ollama and pull a model

```bash
# Install from https://ollama.com, then:
ollama pull llama3.2:3b
```

#### 2. Clone and install

```bash
git clone https://github.com/obsidian-media/AlphonsoEcosystem.git
cd AlphonsoEcosystem
npm install
```

#### 3. Run

```bash
# Web-only mode (fastest to start)
npm run dev
# Opens at http://localhost:5173

# Or full desktop app
npm run tauri dev
```

#### 4. First-run Setup

On first launch, the Setup screen runs as described above. In web-only mode (`npm run dev`) it can't scan the computer and shows "Unknown" instead.

## What's Next

- **Chat** — Type a message. A plain question is answered at once; anything else Jose plans as steps for the right agents, and bigger plans are shown first. Approvals, results and insights appear inline in the chat thread; **Open on the board** shows the plan on the Requests board (System → Orchestrator → Requests).
- **Agents** — 9 specialized agents handle different tasks. See [AGENT_GUIDE.md](./AGENT_GUIDE.md).
- **Your first video** — set **Settings → Output folder**, open **Work → Creative** (Miya Studio), create a project for your brand, fill in the idea and press **Run project**. For the finished video, install Kokoro (voice-over) and, for AI clips, a video model in **Runtimes**. See the [User Manual, section 8](./USER_MANUAL.md#8-miya-studio--the-content-factory).
- **Connectors** — Connect Telegram, WhatsApp, YouTube, Facebook and Instagram, and more in **Settings → Connectors**; YouTube, Facebook and Instagram have **Sign in** buttons. **Test** says whether the service itself answered. See [CONNECTORS.md](./CONNECTORS.md).
- **Telegram** — pair your Telegram chat and Jose asks you there when something waits for your approval.
- **Settings** — approval mode and what asks first, zero-cost mode, paid models (off by default), privacy shield, and more.

## WhatsApp Cloud Setup (optional)

To use WhatsApp Cloud API (send/receive messages):

### 1. Deploy the Railway Gateway

Deploy `gateway/whatsapp-cloud/` to Railway and set these env vars:
- `WHATSAPP_VERIFY_TOKEN` — any secret string you choose
- `WHATSAPP_APP_SECRET` — from Meta App Dashboard → App Settings
- `WHATSAPP_ALLOWED_NUMBERS` — comma-separated allowed sender numbers (digits only, no `+`)

Point your Meta webhook URL to `https://<your-railway-url>/webhook`.

### 2. Enter Credentials in Alphonso

Open **Settings → Connectors → WhatsApp** and enter:

| Key | Where to find it |
|-----|-----------------|
| `WHATSAPP_ACCESS_TOKEN` | Meta App Dashboard → WhatsApp → API Setup |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta App Dashboard → WhatsApp → Phone Numbers |
| `WHATSAPP_VERIFY_TOKEN` | Same value you set in Railway |
| `WHATSAPP_CLOUD_GATEWAY_DRAIN_URL` | `https://<your-railway-url>/queue/drain` |
| `WHATSAPP_ALLOWED_NUMBERS` | Same comma-separated list as Railway |

Alphonso will poll the gateway queue every 30 seconds for inbound messages and route them through Jose.

## Voice OS (optional — real-time voice interface)

Alphonso includes a full real-time voice pipeline: speech-to-text → agent routing → Ollama LLM → text-to-speech.

### Prerequisites for Voice OS

In the app, **Runtimes → Voice OS → Install** installs Python (if needed) and everything below, and the speech models download on first use. For running it by hand:

| Dependency | Install |
|-----------|---------|
| **Python 3.10+** | https://python.org |
| **faster-whisper** | `pip install faster-whisper` |
| **piper-tts** | `pip install piper-tts` |
| **webrtcvad** | `pip install webrtcvad` |
| **Ollama** | Running at the address set in Settings (default `http://localhost:11434`) |

### Start the Voice Server

```bash
cd voice/backend
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt
# Voice OS refuses every connection unless VOICE_OS_TOKEN is set (fail-closed).
# When launched from Alphonso, the app generates and passes this token for you.
# --no-access-log keeps the token (sent as ?token=) out of uvicorn's access log.
set VOICE_OS_TOKEN=<any-long-random-string>   # Windows (bash: export VOICE_OS_TOKEN=...)
python -m uvicorn main:app --host 127.0.0.1 --port 8766 --no-access-log
```

Or launch it from within Alphonso: open **Runtimes → Voice OS → Start**, or the **Voice** page. Started from the app, it uses the Ollama model and address you chose.

### First Use

1. With the voice server running, open **Chat** in Alphonso
2. Click the microphone button — it uses the `useJarvisVoice` hook (AudioWorklet)
3. Speak naturally — Alphonso waits until you finish, transcribes, routes to the right agent, and responds by voice
4. Say anything to interrupt the response (barge-in is supported)

### Voice Agent Routing

The voice pipeline routes to the same 9 agents as the chat interface:

| Say something like... | Routes to |
|----------------------|-----------|
| "Search for..." / "Find..." | Hector |
| "Write..." / "Draft..." | Miya |
| "Task..." / "Schedule..." / "Plan..." | Jose |
| "Remember..." / "What did I..." | Echo |
| "Scan for security..." | Sentinel |
| "Market opportunity..." | Nova |
| "Publish..." / "Post to..." | Marcus |
| "Compliance..." / "Governance..." | Maria |
| Anything else | Alphonso |

## Hermes profiles (optional)

[Hermes Agent](https://github.com/NousResearch) (Nous Research, MIT) gives an agent its own tools, such as web search.

1. Open **Runtime Hub** and install **Hermes Agent** (it needs Python 3.11–3.13; Runtime Hub offers to install Python).
2. Open **Settings → Connectors → Agent Providers → Hermes profiles** and choose **Set up a Hermes profile for** an agent, then pick the model it uses. Alphonso makes the profile, its key and its port; nothing to type. Already run Hermes yourself? **Find my Hermes profiles** lists them (Alphonso reads only their settings, never their keys) and **Use for this agent** connects one.
3. That agent's steps now run on Hermes. Chat's live line shows what it's doing; when it wants to run a command or change something, the step waits for your approval on the board and Telegram.

Profiles start when a step needs them, and the ones Alphonso started stop after 30 idle minutes. Every other agent keeps its own provider.

## Key Concepts

### Approval Mode (on by default)
Each step asks according to what it does (Settings → General → What asks first). Spending, publishing or sending, and deleting always ask, even with Approval Mode off.

### Zero-Cost Mode (on by default)
Blocks paid connectors (Claude, ChatGPT, Runway, ElevenLabs, Higgsfield, CALL-E and others) unless you turn it off.

### Privacy Shield
When active, no data leaves your machine. All processing happens locally via Ollama.

## Production Build

```bash
npm run build          # Web build → dist/
npm run tauri build    # Desktop installer → src-tauri/target/release/bundle/
```

## Need Help?

- [Troubleshooting Guide](./TROUBLESHOOTING.md)
- [User Manual](./USER_MANUAL.md)
- [Architecture Overview](../ARCHITECTURE.md)
