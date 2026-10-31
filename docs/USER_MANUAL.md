# Alphonso User Manual

How to use each part of Alphonso. For installing, see [Getting started](GETTING_STARTED.md); for setting up a service, [Connectors](CONNECTORS.md); when something goes wrong, [Troubleshooting](TROUBLESHOOTING.md).

## Contents

1. [Getting around](#1-getting-around)
2. [Chat](#2-chat)
3. [How a request runs](#3-how-a-request-runs)
4. [What asks first](#4-what-asks-first)
5. [Asking each agent](#5-asking-each-agent)
6. [Miya Studio](#6-miya-studio)
7. [Projects, Teams and Boardroom](#7-projects-teams-and-boardroom)
8. [Memory](#8-memory)
9. [Skills](#9-skills)
10. [Connecting services](#10-connecting-services)
11. [Your computer: models, tools and memory](#11-your-computer-models-tools-and-memory)
12. [Voice](#12-voice)
13. [Telegram and your phone](#13-telegram-and-your-phone)
14. [Keyboard shortcuts](#14-keyboard-shortcuts)

---

## 1. Getting around

The sidebar has five spaces:

| Space | Pages |
|---|---|
| **Home** | Dashboard, Session History |
| **Work** | Projects, Content, Automation, Creative (Miya Studio), Calendar |
| **Research** | Research Desk |
| **Boardroom** | Boardroom |
| **System** | Orchestrator (the Requests board), All Agents, Teams, Runtimes (Runtime Hub), Voice, Connectors, and more |

**Chat** is always one click away at the top of the sidebar, with your recent chats under it. **Settings** is at the bottom.

---

## 2. Chat

Type what you want and press **Enter** (**Shift + Enter** for a new line).

- **A plain question** ("what is…", "how do I…") gets an answer straight away.
- **Anything else** is planned by Jose as steps for the right agents. The reply says how it was planned, and a progress line shows what's happening, with **Stop** and **Open on the board**.
- **`/jose <task>`** always plans. **"Plan this fresh: <task>"** plans without starting from a template.

In Chat you choose the model: one on this computer (Ollama), or a free cloud model (NVIDIA, Gemini, OpenRouter) once its key is set up. A very small model (under 3B) gets a warning; it works, but answers are weaker.

You can drop files onto Chat, use the microphone (see [Voice](#12-voice)), and ask for media in plain words: "create an image of …", "make a video of a cat on a boat", "create calm piano music for my intro". Pictures come from ComfyUI; videos and music are made on this computer by the video model and AudioCraft you install in Runtime Hub. If a tool is missing, Alphonso says what to install and starts nothing.

---

## 3. How a request runs

**Jose** plans every request that isn't a plain question. A plan is a set of steps; each names its agent, what it does and which steps it waits for. Steps that don't wait for each other run at the same time. Jose starts from a template when one fits (Content video, Build an app, Research report, or one you saved) or plans fresh.

**Show Jose's plan first** (Settings → General): Always, Bigger requests only (the default: 4 or more agents, or a step that always asks) or Never. A waiting plan shows as a card in Chat with **Run this plan**, **Edit on the board** and **Cancel**.

### The Requests board

**System → Orchestrator → Requests** lists every request. Pick one to see its plan as a map, each step's status, a "Waiting for you" badge, what changed, and what each step produced (summary, files, sources). From here you can:

- **Run this plan**, **Edit** it (add or remove a step, change its agent, what it waits for or its instruction), or **Cancel**.
- **Approve and carry on** a waiting step, or **Reject** it (which cancels the request).
- **Stop** a running request: the step working now stops, finished work is kept, nothing new starts.
- **Carry on** a request cut off when the app closed, or one waiting for something to be set up.
- **Save as template**, so Jose offers the plan for similar requests.

Requests that use the model on your computer run one at a time ("Queued (2nd)."); plain answers never wait.

### While it runs

- **Reviews can send work back.** When a review finds problems, the work goes back to its author and is checked again, at most twice; then Jose asks you.
- **Agents can ask for help** from another agent, or for an action (a send, a code change) that becomes its own step and asks you first.
- **A step that keeps failing** is tried once with the next larger model you have installed.
- **When a tool isn't set up** (Kokoro not installed, a connector without its key), the step waits and says what to set up; **Carry on** tries again.
- **When memory is short**, a step waits and says what it's waiting for (see [section 11](#11-your-computer-models-tools-and-memory)).

A request ends with a short summary, one line per step. A waiting request expires after 7 days (Settings → General → **Waiting requests expire after**; 0 means never).

---

## 4. What asks first

Approval follows from what a step does, not from the words in your request. **Settings → General → What asks first** has a switch for each kind:

| A step that… | Asks first |
|---|---|
| reads | No |
| creates new files of its own | No |
| changes project files | Your choice |
| runs code or commands | Your choice (commands that only read never ask) |
| spends money | **Always** |
| publishes or sends | **Always** |
| deletes | **Always** |

The last three ask even with Approval Mode off. The approval shows exactly what will happen: "Send to Slack #news: “…”", a code change file by file, or the cost of a paid step.

You can approve in Chat, on the Requests board, on Telegram (with the buttons Jose sends), and in Miya Studio for its review, AI clips and publishing steps. Approving twice runs it once.

### Zero-Cost Mode and paid models

**Zero-Cost Mode** (on by default) blocks every paid service: Claude, ChatGPT, Qwen, Runway, ElevenLabs, Higgsfield, CALL-E, WhatsApp (Meta charges for conversations), paid OpenRouter models and outside tools you marked Paid.

To let a step use a paid model, turn Zero-Cost Mode off and switch on **Settings → General → Allow paid models**: choose Claude, ChatGPT or OpenRouter, enter the prices (OpenRouter fills them in) and a monthly cap. A step that still fails on your own models may then be given to the paid model, after asking with the cost. Prices for Runway, ElevenLabs and Higgsfield are entered in the same place.

---

## 5. Asking each agent

Each kind of work has one owner, and Jose gives every step to that agent. You don't need to name the agent; just ask.

| Agent | Ask for… |
|---|---|
| **Alphonso** | Code, commands, plain questions, everyday writing (emails, notes) |
| **Hector** | Research with sources |
| **Nova** | What to do first, from what Hector found |
| **Miya** | Scripts, pictures, videos, music, posts, UI design |
| **Maria** | Checking work for quality, accuracy and risk |
| **Sentinel** | Checking for security problems |
| **Marcus** | Sending, posting, publishing, placing calls |
| **Echo** | Remembering and forgetting decisions |
| **Jose** | Plans the rest; does none of the work himself |

### Research (Hector)

"Research how many honeybee colonies there are in Europe", or use **Research → Research Desk**. Hector breaks the question into parts, searches, reads the relevant parts of each page, and goes back for anything missing. His report starts with the answer, then each part with numbered sources [1][2] and how well supported it is, what the sources disagree on, and what he couldn't find. Each source is marked **Read** or **Snippet only** (a site that blocked him, or a PDF he couldn't read).

A search key (Brave, Tavily or Perplexity in Settings → Connectors) gives better results than the free search; the Research Desk says when only free search is set up. On the Desk, **Save source** keeps a source, **Use in a request** puts the report into Chat, and **Export** saves it as Markdown, PDF or PowerPoint.

### What to do first (Nova)

"Which should my bakery do first: a newsletter, a loyalty card or a podcast?" Nova answers with **What to do first**, then every option in order with why, its value, effort and risk, and what **Would change this**. With research, she cites Hector's sources. Her recent verdicts are in Settings → Runtime → **Nova's last verdicts**.

### Checking work (Maria)

"Research three facts about honeybees, write a short post, and have it checked for accuracy." Maria's review starts with **Pass.** or **Fix:**, quotes the exact words to change and how, and lists claims no source backs. To check a plan instead: "Audit this plan for compliance risks: …". Her answer starts with **Risk:** (low, medium or high), and nothing in the plan is started. When she asks for approval, the steps after hers wait for you.

### Security (Sentinel)

"Check this post for security problems before I publish it: …". Sentinel answers **Safe.**, **Risky:** or **Unsafe:**, with each finding, where it is and what to do. He also checks without being asked: before anything is sent, after code changes, and any request with a key or a link. A key in your request is hidden from every agent. Links he doesn't trust aren't opened; if you click one in a report, Alphonso asks first. Add trusted sites in the right-hand panel's allowlist; a Google Web Risk key (Settings → Connectors) also checks links against Google's phishing and malware lists.

### Sending (Marcus)

"Write a two-line announcement that we open Saturday and post it to Slack #news." The writing is done first, Sentinel checks it, then Marcus waits with the exact text. Approve once and he sends exactly that. He sends only to places you name or the defaults in Settings → Connectors (**Where Marcus sends**). Text you quote is sent as you wrote it. "Send it tomorrow at 9" sends at that time and shows on the Calendar. "Is my announcement ready to post?" only checks, and sends nothing.

### Code (Alphonso)

Add your projects in **Settings → Agents → Alphonso's projects** (a name and a folder each), then name the project in your request: "In shop, add a dark mode toggle." With several projects and none named, he asks which. Small code with no project goes in a new folder in your output folder.

Before changing anything he shows the change on the board: each file with lines added and removed, and each command with why. You approve once; you can **Edit** a file in the preview first. Commands that only read run without asking. He never commits to git unless you ask. **Model for Alphonso's code** (same section) picks the model he codes with.

---

## 6. Miya Studio

**Work → Creative** turns an idea into finished videos, Shorts and carousels for a brand. Set the **Output folder** first (Settings → Runtime); every project is saved there, by brand and project.

### Brands

The **Brands** tab holds each brand: colours, fonts, logo, tone, audience, voice, platforms, posting times, honesty rules, references and a quality threshold (pieces below it are hidden unless you tick "Show everything"). What you reject is remembered as a lesson for that brand.

- **Engines:** who reads the voice-over (Kokoro, free, or ElevenLabs), who makes pictures (ComfyUI, free, or Higgsfield) and AI clips (this computer, Runway or Higgsfield). A project can choose differently.
- **Characters:** made-up, or a real person (with the tick "This is me, or I have this person's permission"). Give a character 5–20 pictures, or **Make pictures with Miya**. Scenes then show that character.
- **Results** and **Ideas:** see below.

### A project

Create a project, fill in the brief (the idea, platforms, what to make, length) and press **Run project**. The steps:

1. **Research** — what goes viral, and the market.
2. **Script** — 3 hooks and a timed script, reviewed by Nova and Maria. It then waits: **Approve the review in Miya Studio first.**
3. **Scenes** — a storyboard with a picture per scene.
4. **Thumbnails** — 3 finished thumbnails in the brand's colours.
5. **Voice-over** — Kokoro (install it in Runtime Hub) or ElevenLabs.
6. **Music** — from AudioCraft (Runtime Hub); skipped, and says so, without it.
7. **Sound effects** — optional, ElevenLabs.
8. **Stock clips** — from Pexels, Pixabay or Coverr (free keys), with each clip's source and license kept.
9. **AI clips** — moving video for the main moments, every scene, or none: your video model in ComfyUI (Runtime Hub suggests one for your graphics card), Runway or Higgsfield. Paid clips ask once with the cost.
10. **Motion** — a scene can copy a movement you record with the webcam or pick from your files.
11. **Finished video** — a 16:9 and a 9:16 MP4 with voice, music and captions. On a Mac, install FFmpeg once: open Terminal and run `brew install ffmpeg`.
12. **Shorts** and **Carousel** — when "What to make" asks for them ("3 Shorts", "carousel"), edited in **Shorts Studio** and **Carousel Studio**.
13. **Campaign** — captions, hashtags, ad copy (exportable for Meta Ads Manager and Google Ads Editor) and posting times.
14. **Quality gate** — Maria and Sentinel check everything.
15. **Publish** — always asks.

Each tab has its own **Run** to redo one step; later steps then show **Out of date**. **Send back** with a reason redoes a piece and saves the reason as a lesson. Asking in Chat for a content video ("make a YouTube video about…") starts a project with **Open in Miya Studio**.

### Publishing

Sign in first: Settings → Connectors → **Sign in to YouTube**, **Sign in to Facebook**, **Sign in with Instagram**. Each uses your own Google project or Meta app; the button lists the steps.

In **Campaign Studio → Posts**, **Make the posts list** prepares one post per platform and piece, each with its own title, caption, hashtags and time. Change any of them, then **Approve and schedule**:

- **YouTube** uploads early as private and goes public at its time, even with the app closed.
- **Facebook** posts are scheduled on your Page.
- **Instagram** posts are sent by Alphonso at their time, or at the next start if the app was closed.
- Posts over a platform's daily limit wait for room.
- Instagram carousels need a public link: connect your own storage (Settings → Connectors → **Your storage**), or the post is saved in a **ready-to-post** folder for you to post by hand, with a reminder.

### Results and ideas

Each post's numbers are read after 1 hour, 1 day, 7 days and 30 days, and shown as good, weak or usual against the brand's own numbers. After 7 days, Nova and Miya propose lessons (**Keep** or **Drop**), a post that did well gets follow-up ideas (**Start project**), and with enough posts Alphonso suggests posting times.

### Calendar and Content Studio

**Work → Calendar** shows every brand's posts and Marcus's scheduled sends by month or week. Drag a post to move it; one already scheduled on YouTube or Facebook asks first and changes there. Striped means it needs you.

**Work → Content** (Content Studio) makes single social posts: a brief, a draft, an optional picture and video, and an approved publish. The **Quick package** tab in Miya Studio makes a one-shot creative package, and lists the videos and music made from Chat.

---

## 7. Projects, Teams and Boardroom

**Work → Projects** turns a project description into a request: give it a name and what it should do (plus stack, features, risks or a deadline if you like) and press **Start**. The page shows the run's **Plan**, **Steps**, **Approval** and **Results**. Start it again to run it again.

**System → Teams** keeps teams of agents for jobs you do often: a name, the job, then the agents in order with what each does. Run one from the page, or in Chat or Telegram: "use team Weekly report to cover October".

**Boardroom** is a group chat with the agents. Mention them with `@` (`@hector @nova`); a reply that mentions another agent passes the turn on, at most 3 times, then asks you. Each thread has **Conclude** (Maria's review), **Distribute** (Marcus, after approval) and **Creative brief** (Miya).

**Work → Automation → Schedules** runs a request on a timetable. Built-in schedules include Nova's daily "what to do next", Sentinel's review of the week, Maria's Monday review of the week's risks, and Echo's Sunday tidy-up.

---

## 8. Memory

Echo keeps what you decided, and every agent gets the decisions and preferences that apply to its work.

| You say | What happens |
|---|---|
| "Remember that our launch is on Friday the 14th." | Saved. Chat shows **Echo remembered: …** with **Edit** and **Forget**. |
| "Remember that I prefer short emails without emojis." | A preference every agent follows from then on. |
| "What did we decide about the launch?" | Answered from what was saved. |
| "Remember that the launch moved to Saturday." | Replaces the old decision. |
| "Forget the launch decision" | Forgotten; if it could mean several, you pick. |
| "Clean up my memory" | Echo proposes merges and removals; nothing changes until you **Apply**. |

Echo also saves each finished request's decisions and what you turn down. **Settings → Memory → What Echo remembers** lists everything. **Match decisions by meaning** (on by default) downloads a small model so "morning meals" finds "breakfast"; plain word search works without it.

---

## 9. Skills

Each agent works from skills, one per kind of job (Hector's "Web research with sources", Maria's "Claim check"). For each step the agent picks the one that fits, and the board shows it: "Skill: Claim check — The post quotes numbers."

**System → All Agents → Skills** lists every skill, with how often it's used and how its work did in reviews. To add your own: **New skill** (a name, when to use it, its kind of work, its tools and instructions), or **Import** a skill file. A skill that would give an agent another agent's work is refused with the reason.

---

## 10. Connecting services

Everything is set up in **Settings → Connectors**, grouped into Messaging, AI Models, Search & Research, Content & Productivity, and Automation. Enter the key, **Save**, then **Test**: "Live check passed" means the service answered; "key found" means only that a key is saved. Keys are kept in your system's keychain. Step-by-step setup for each service is in [Connectors](CONNECTORS.md).

- **OpenRouter:** free models for Chat and any agent; the picker shows the free requests left today. When they run out, a step carries on with this computer's model, or asks to use a paid one if you chose that (Settings → General → **When OpenRouter's free limit runs out**).
- **Outside tools (MCP):** connect your own online services, such as your shop or issue tracker. Mark each server Free or Paid; every tool asks first until you mark it **Reading only**. Agents read from reading-only tools; changes are Marcus's step and show the exact call.
- **Hermes profiles:** install Hermes Agent in Runtime Hub, then **Agent Providers → Hermes profiles** sets up a profile for an agent, which then uses Hermes's own tools. Hermes asks you before it runs a command or changes something.
- **Agent Providers:** each agent can use a different model or provider.

---

## 11. Your computer: models, tools and memory

**Runtime Hub** (System → Runtimes) installs and starts the tools Alphonso uses: Ollama, ComfyUI, Kokoro, AudioCraft, Whisper, Voice OS, Hermes Agent and more. Each card says which agent or page uses it. The first time, it asks where to install tools. The ComfyUI card also installs video models and the character and motion models.

**Memory.** Before each step, Alphonso checks free RAM and graphics memory. If the step fits, it runs; if not, idle models and idle tools Alphonso started are freed to make room, or the step waits and says why. **Runtime Hub → Memory** (or the meter in the top bar) shows what's loaded, who started it and what's waiting, and how long each tool may sit idle before it stops (ComfyUI: 15 minutes). Programs you started yourself are never stopped.

Settings worth knowing:
- **Settings → General:** the Ollama address and model (and **Download a model**: type a name from Ollama's model library and press Download), Approval Mode, What asks first, Allow paid models, Show Jose's plan first, Developer mode.
- **Settings → Runtime:** the output folder, the ComfyUI install to use, phone pairing.
- **Settings → Agents:** Alphonso's projects, when agents call their own tools (by model size).
- **Settings → Logs** and **Settings → Backup:** the crash log, and exporting or restoring your data (keys are never exported).

---

## 12. Voice

Install **Voice OS** in Runtime Hub, start it from **System → Voice**, then click the microphone in Chat. Speak; Alphonso waits until you finish, answers with the right agent and reads the answer aloud. Speak again to interrupt. **Stop** ends the session; **Reset** clears its history. Without Voice OS, the microphone types what you say into the message box.

---

## 13. Telegram and your phone

**Telegram:** set up your bot in Settings → Connectors → Telegram and add your chat ID to the allowed list, then send `/start` to pair. Message it in plain words, or use commands:

| Command | Does |
|---|---|
| `/ask <text>` | Send a request to Jose |
| `/status`, `/report`, `/ping` | How Alphonso is doing |
| `/queue`, `/approve <id>`, `/reject <id>` | Approvals |
| `/stop` | Stop the request that is running |
| `/research <topic>` | Research with Hector |
| `/memory [words]` | Search what Echo remembers |
| `/nova` | Nova's last verdicts |
| `/agents`, `/activity`, `/receipts` | What the agents did |
| `/scan` | Sentinel's review of the week |
| `/files`, `/read <file>` | Your workspace files |
| `/pause`, `/resume` | Pause or resume notifications |
| `/help` | The full list |

Jose tells you on Telegram when a step or plan waits for you (with **Approve** / **Reject** buttons), when a request finishes or fails, and when Miya Studio has results or ideas. Settings → General → **Jose on Telegram** chooses which.

**WhatsApp** works the same way through Meta's Cloud API (see [Connectors](CONNECTORS.md)). **The iPhone app** pairs in Settings → Runtime → **Remote Access** (turn on mobile pairing, then scan the code).

---

## 14. Keyboard shortcuts

| Key | Does |
|---|---|
| `Enter` / `Shift + Enter` | Send / new line |
| `Esc` | Stop the current reply |
| `Ctrl + N` | New chat |
| `Ctrl + K` or `/` | Go to the message box |
| `Ctrl + B` | Boardroom |
| `Ctrl + S` | Settings |
| `Ctrl + D` | Agent dock |
| `Ctrl + M` | Metrics |
| `Ctrl + E` | Export a backup |
| `Ctrl + L` | Clear chat |
| `Ctrl + P` | Search memory |
| `?` | All shortcuts |

On a Mac, use `⌘` instead of `Ctrl`.
