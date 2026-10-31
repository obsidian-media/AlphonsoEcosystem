# Getting Started with Alphonso

Alphonso is a team of AI agents on your own computer. Chat and the agents run on local models, and nothing is sent, posted or paid for without your approval.

## 1. Install

Download the installer from the [latest release](https://github.com/obsidian-media/AlphonsoEcosystem/releases/latest):

| System | File | Then |
|---|---|---|
| Windows | `Alphonso_…_x64-setup.exe` | Run it. No admin rights needed. |
| macOS 13.3 or later (Apple Silicon) | `Alphonso_…_aarch64.dmg` | Drag Alphonso to Applications. It isn't signed by Apple yet, so the first time, right-click it and choose **Open** (on newer macOS: System Settings → Privacy & Security → **Open Anyway**). |
| Linux | `Alphonso_…_amd64.AppImage` | Make it executable (`chmod +x`) and run it. |

Every installer includes Ollama, which runs the models. Windows and Linux also include FFmpeg for finished videos; on a Mac, install it once with `brew install ffmpeg` if you'll make videos. Alphonso updates itself after this.

## 2. Setup

The first time you open Alphonso, **Setup**:

1. Checks your computer (memory, graphics card, free space).
2. Asks what you want to do: **Chat only**, **Chat + Images**, **Chat + Voice**, **Full Power**, or **Custom** (pick per agent).
3. Asks where to install tools.
4. Installs what that needs, including a small starter model. You can start chatting as soon as the model is ready, while the rest finishes.

An Ollama, its models or a ComfyUI you already have are found and used.

## 3. Your first requests

Open **Chat** and try:

- **A question:** "What's the difference between a latte and a flat white?" Answered straight away.
- **Research:** "Research the best microphones under $100 and tell me which to buy." Hector researches with sources, then Nova says what to buy first.
- **Writing with a check:** "Write a launch post for my bakery and check it for accuracy." Alphonso writes it and Maria reviews it.
- **Remember something:** "Remember that I prefer short emails without emojis." Every agent follows it from now on.

Bigger requests show their plan first; press **Run this plan**. A step that sends, publishes, spends money or deletes always asks you first. **Open on the board** shows any request's steps as they run.

## 4. Next steps

- **Make a video:** set the output folder (Settings → Runtime), open **Work → Creative** (Miya Studio), create a brand and a project, fill in the idea and press **Run project**. Install Kokoro (voice-overs) in **System → Runtimes**, and a video model for AI clips.
- **Connect your services:** **Settings → Connectors**, one key or sign-in each; **Test** shows whether it works. YouTube, Facebook and Instagram have **Sign in** buttons. Step-by-step: [Connectors](CONNECTORS.md).
- **Telegram:** pair your Telegram chat and Jose asks you there when something waits for your approval, so you can approve while away.
- **Free cloud models:** add an NVIDIA, Gemini or OpenRouter key to use their free models in Chat or for any agent.
- **Your code:** add your project folders in Settings → Agents → **Alphonso's projects**, then ask "In shop, add a dark mode toggle".
- **Voice:** install Voice OS in Runtime Hub, start it on **System → Voice**, then use the microphone in Chat.
- **Hermes:** install Hermes Agent in Runtime Hub, then Settings → Connectors → Agent Providers → **Hermes profiles** gives an agent Hermes's own tools, such as web search.

## Good to know

- **Approval Mode** (on by default): each step asks according to what it does. Choose what asks in Settings → General → **What asks first**. Spending, sending and deleting always ask.
- **Zero-Cost Mode** (on by default): paid services (Claude, ChatGPT, Runway, ElevenLabs, Higgsfield, CALL-E, and WhatsApp, which Meta charges for) are blocked until you turn it off.
- **Your keys** are kept in your system's keychain and are never included in a backup.
- **Memory:** if your computer is short on memory, a step waits and says why instead of failing; Runtime Hub → **Memory** shows what's loaded.

## Need help?

- [User manual](USER_MANUAL.md): every screen, step by step
- [Agent guide](AGENT_GUIDE.md): what each agent does
- [Troubleshooting](TROUBLESHOOTING.md): what you see and the fix
- Building from source: [CONTRIBUTING.md](../CONTRIBUTING.md)
