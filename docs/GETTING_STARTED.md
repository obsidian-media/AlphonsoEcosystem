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
