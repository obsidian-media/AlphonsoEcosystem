<div align="center">

<img src="https://raw.githubusercontent.com/obsidian-media/AlphonsoEcosystem/main/ALPHONSO_THUMBNAIL.webp" alt="Alphonso" width="180"/>

# Alphonso

**Your AI team, on your own computer.**

Nine AI agents that research, write, design, build and publish for you. They run on local models, so your work stays on your machine, and nothing is sent, posted or paid for without your approval.

[**Download**](https://github.com/obsidian-media/AlphonsoEcosystem/releases/latest) · [Getting started](docs/GETTING_STARTED.md) · [User manual](docs/USER_MANUAL.md) · [obsidianmedia.online](https://obsidianmedia.online)

</div>

---

## What it does

Ask in plain words, in Chat or from your phone on Telegram. **Jose** answers a simple question at once, or plans the work as steps and gives each step to the agent who owns it:

| Agent | What they do |
|---|---|
| **Alphonso** | Answers questions, writes everyday text, works on your code projects |
| **Jose** | Plans each request, hands out the steps, asks you when a step needs approval |
| **Hector** | Researches the web and answers with his sources |
| **Nova** | Weighs the options and tells you what to do first |
| **Miya** | Writes and designs: scripts, pictures, videos, music, posts |
| **Maria** | Checks the work for quality and risk before it goes anywhere |
| **Sentinel** | Checks for security problems: leaked keys, bad links, risky commands |
| **Marcus** | Sends, posts and publishes, only after you approve the exact text |
| **Echo** | Remembers what you decided, so you don't have to repeat yourself |

**Miya Studio** takes one idea all the way to finished videos, Shorts and carousels for YouTube, Instagram and Facebook: research, script, scenes, voice-over, music, captions, thumbnails, a posting calendar, and what worked afterwards.

**Connect what you already use:** Telegram, WhatsApp, Slack, Discord, GitHub, Notion, ClickUp, YouTube, Meta, search engines, free and paid AI models, and your own online services through MCP. Every connection is optional.

## You stay in charge

- **Approvals.** Anything that sends, publishes, spends money or deletes always asks first, showing exactly what will happen. You choose what else should ask.
- **Free by default.** Zero-Cost Mode is on until you turn it off, so paid services can't run up a bill.
- **Stop any time.** Stop a running request from Chat, the Requests board or Telegram.
- **Local first.** Chat and the agents run on your own computer through Ollama. Keys you enter are kept in your system's keychain.

## Download

| System | Installer | Notes |
|---|---|---|
| Windows | `Alphonso_…_x64-setup.exe` | Includes Ollama and FFmpeg |
| macOS 13.3 or later (Apple Silicon) | `Alphonso_…_aarch64.dmg` | Includes Ollama. The first time, right-click Alphonso in Applications and choose **Open**. For finished videos, run `brew install ffmpeg` once. |
| Linux | `Alphonso_…_amd64.AppImage` | Includes Ollama and FFmpeg |

Get them from the [latest release](https://github.com/obsidian-media/AlphonsoEcosystem/releases/latest). Alphonso updates itself after that. A graphics card helps with pictures and video; chat works without one.

## Getting started

1. **Install and open Alphonso.** Setup checks your computer and asks what you want to do: chat, pictures, voice, or everything.
2. **Let Setup install what that needs**, including a small starter model. You can chat as soon as it's ready.
3. **Ask for something.** "Research the best microphones under $100 and tell me which to buy", or "write a launch post for my bakery and check it".

More in [Getting started](docs/GETTING_STARTED.md).

## Guides

| Guide | For |
|---|---|
| [Getting started](docs/GETTING_STARTED.md) | Installing and your first requests |
| [User manual](docs/USER_MANUAL.md) | Every screen, step by step |
| [Agent guide](docs/AGENT_GUIDE.md) | What each agent does and when to use them |
| [Connectors](docs/CONNECTORS.md) | Setting up each service |
| [Troubleshooting](docs/TROUBLESHOOTING.md) | When something doesn't work |
| [What's new](docs/CHANGELOG.md) | Every release |

## Price

Free: every agent and every connector, no license key. Services you connect with your own keys bill you directly, and Zero-Cost Mode blocks paid calls until you allow them. See [Pricing](docs/PRICING.md).

## For developers

Building from source, running the tests, and how it's put together: [CONTRIBUTING.md](CONTRIBUTING.md), [ARCHITECTURE.md](ARCHITECTURE.md) and [AGENTS.md](AGENTS.md).

## Third-party notices

- **FFmpeg** (bundled in the Windows installer and the Linux AppImage, for finished videos): an LGPL 2.1 build from BtbN/FFmpeg-Builds, used unmodified as separate programs; its license is installed beside it, and its source is at [ffmpeg.org](https://ffmpeg.org/legal.html).
- **Kokoro** (installed from Runtime Hub, not bundled): `kokoro-onnx` and the Kokoro-82M model and voices, Apache License 2.0.
- **MusicGen** (AudioCraft, installed from Runtime Hub, not bundled): the code is MIT; the model weights are CC-BY-NC 4.0 (non-commercial). Check that license before using generated music commercially.
- **Video models for AI clips** (installed from Runtime Hub into your own ComfyUI, not bundled): LTX-Video 2B under the LTX-Video Open Weights License (free for companies under $10M yearly revenue; larger companies need Lightricks' paid license) with Google's T5 encoder (Apache-2.0); Wan 2.2 TI2V 5B, its VAE and the UMT5 encoder under Apache-2.0.
- **Stock footage** (Pexels, Pixabay, Coverr): each clip is used under its site's license, with your own free key; the source, author and license page of every clip are kept in the project.

## Security and license

Report security issues as described in [SECURITY.md](SECURITY.md) (security@obsidianmedia.online).

SHALAUDE License v1.0: all rights reserved, source-visible. No use, copy, modification or distribution of the source without written permission ([LICENSE](LICENSE)). The app itself is used under the end-user license shown in the installer ([legal/EULA.txt](legal/EULA.txt)); privacy policy draft: [legal/PRIVACY_POLICY.md](legal/PRIVACY_POLICY.md).

---

<div align="center">

Built by [Obsidian Media](https://obsidianmedia.online) · Ontario, Canada

</div>
