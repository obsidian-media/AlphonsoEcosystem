# Getting Started with Alphonso

Alphonso is a local-first AI desktop companion. Your data stays on your machine.

## Prerequisites

| Dependency | Version | Install |
|-----------|---------|---------|
| **Ollama** | Latest | https://ollama.com |
| **Node.js** | 20+ | https://nodejs.org |
| **Rust** | 1.77+ | https://rustup.rs |

## Quick Start (5 minutes)

### 1. Install Ollama and pull a model

```bash
# Install from https://ollama.com, then:
ollama pull llama3.2:3b
```

### 2. Clone and install

```bash
git clone https://github.com/Thatisshayan/AlphonsoEcosystem.git
cd AlphonsoEcosystem
npm install
```

### 3. Run

```bash
# Web-only mode (fastest to start)
npm run dev
# Opens at http://localhost:5173

# Or full desktop app
npm run tauri dev
```

### 4. First-run wizard

On first launch, Alphonso will:
1. Check if Ollama is running
2. Let you pick a model (llama3.2:3b recommended)
3. Confirm you're ready

## What's Next

- **Chat** — Type a message in the Chat tab. Alphonso routes your request to the right agent.
- **Agents** — 9 specialized agents handle different tasks. See [AGENT_GUIDE.md](./AGENT_GUIDE.md).
- **Connectors** — Connect to Telegram, WhatsApp, Notion, and more. See [CONNECTORS.md](./CONNECTORS.md).
- **Settings** — Configure approval mode, zero-cost mode, privacy shield, and more.

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

## Key Concepts

### Approval Mode (on by default)
Any risky action (external sends, uploads, publishes) requires your explicit approval before execution.

### Zero-Cost Mode (on by default)
Blocks paid connectors (Claude API, OpenAI, etc.) unless you explicitly enable them.

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
