# GitHub Release: Alphonso v2.6.5

## 🚀 Alphonso v2.6.5 — Local-First AI Desktop Companion

**The AI that runs on your machine. Not someone else's server.**

---

### What's New

#### 🎙️ Voice OS — Fully Rewritten
The voice backend pipeline called a broken/nonexistent LLM function on every request and never awaited its own text-to-speech call. We rewrote it from scratch. Local voice conversations now work reliably with faster-whisper STT, Piper TTS, and Ollama LLM — all running on-device.

#### 📱 iOS Companion — Fixed & Functional
The #1 reported issue: Mobile Companion pairing never worked. Root cause was a port collision — the Companion server and Voice OS were both trying to use port 8765. Fixed by moving Voice OS to port 8766. iOS cloud voice now supports multilingual routing including Persian/Farsi with device-gated authentication.

#### 🤖 Boardroom — Real-Time Multi-Agent Group Chat
Boardroom is rebuilt as a true multi-agent conversation. @mention any of the 9 agents, get real persona-specific responses, bounded chaining with auto-escalation, cross-thread context recall, and a Stop button when things go sideways.

#### 🔒 Security Hardening
- Telegram companion bot now requires pre-configured chat ID (previously, first messenger became permanent owner)
- Constant-time token comparison on all inbound webhook gateways
- Full security audit of Discord, webhook, and CI posture

#### 🐛 Bug Fixes
- Fixed CMD windows flashing open/closed on Windows (process spawn flags)
- Fixed sidebar navigation clipping on short windows
- Fixed Coach Mode (zero permissions granted by Tauri capability system)
- Fixed WhatsApp bot — added real commands (/status, /queue, /approve, /reject, /agents, /report, /ping, /help, /ask)
- Fixed Telegram bot response and poll batch processing

#### 🏗️ Architecture
- 6 more services migrated to TypeScript (Sprint 5, batch 10)
- ESLint now covers all `.ts`/`.tsx` files (previously never linted)
- 3,758+ tests passing
- Full in-app auto-update with signed manifests

---

### Downloads

| Platform | Package |
|----------|---------|
| Windows x64 | [Alphonso_2.6.5_x64-setup.exe](https://github.com/obsidian-media/AlphonsoEcosystem/releases/download/v2.6.5/Alphonso_2.6.5_x64-setup.exe) |

### System Requirements
- Windows 10/11 (64-bit)
- 8GB RAM minimum (16GB recommended for local models)
- Ollama installed (we'll guide you through setup)

### Quick Start
1. Download and run the installer
2. Install Ollama from [ollama.com](https://ollama.com)
3. Launch Alphonso — it'll detect Ollama and set everything up
4. Start chatting with your 9 agents

---

**Full changelog:** [CHANGELOG.md](https://github.com/obsidian-media/AlphonsoEcosystem/blob/main/docs/CHANGELOG.md)
**Documentation:** [docs/](https://github.com/obsidian-media/AlphonsoEcosystem/tree/main/docs)
**Architecture:** [ARCHITECTURE.md](https://github.com/obsidian-media/AlphonsoEcosystem/blob/main/ARCHITECTURE.md)

---

*Local-first. Privacy-first. Your AI, your rules.*
