# Troubleshooting

Find what you see, then try the fix. Most messages in Alphonso already say what to do; this page explains the common ones.

## Chat and models

| You see | Fix |
|---|---|
| "Ollama is not running" or "Ollama offline" | Press **Start** on the banner, or System → Runtimes → Ollama → **Start**. Alphonso starts Ollama for you when it's installed. |
| No models to choose from | Runtimes → Ollama, or Setup, installs the starter model. Or in a terminal: `ollama pull llama3.2:3b`. |
| Replies arrive all at once instead of word by word | You started Ollama yourself and it refuses the app window. Replies still work. For word-by-word replies, let Alphonso start Ollama, or start yours with `OLLAMA_ORIGINS=http://tauri.localhost`. |
| Replies are slow, or the computer struggles | Use a smaller model, close other programs, and check **Runtime Hub → Memory** for what's loaded. |
| A warning next to the model | Models under 3B work but give weaker answers. |
| "OpenRouter is busy. Try again in a minute." | OpenRouter's free models are limited per minute; it tries again by itself once. |
| "OpenRouter's free limit for today is used up, and no model on this computer can take over." | Start Ollama with a chat model, then **Carry on**. The free limit resets at midnight UTC. |
| A cloud tab (NVIDIA, Gemini, OpenRouter) is greyed out | Add its key in Settings → Connectors → AI Models. |

## Requests and approvals

| You see | Fix |
|---|---|
| A plan card that does nothing | Bigger requests show their plan first. Press **Run this plan**, or change Settings → General → **Show Jose's plan first**. |
| "Waiting for you" | A step asks first. Approve it in Chat, on the Requests board (**Approve and carry on**) or on Telegram. |
| An approval window keeps appearing | That's Approval Mode. Settings → General → **What asks first** chooses what asks; spending, sending and deleting always ask. |
| "Queued (2nd)." | Requests on your computer's model run one at a time; it starts when the one before finishes. |
| "Waiting for memory: …" | Not enough RAM or graphics memory free yet. It starts when there is; Runtime Hub → Memory shows what's using it. |
| A step "needs something set up" | It says what (a tool to install, a key to add). Do that, then **Carry on**. |
| **Interrupted** | The app closed while it ran. **Carry on** keeps the finished steps. |
| **Expired** | It waited longer than Settings → General → **Waiting requests expire after** (7 days). Ask again, or set 0 for never. |
| A paid model is never used | Zero-Cost Mode is on, **Allow paid models** is off, its key isn't set up, or its prices aren't entered. Settings → General → Allow paid models says which. |
| A Telegram button says "That button has expired." | It's over 7 days old or the request ended; open it on the board. |

## Pictures, video and sound

| You see | Fix |
|---|---|
| A picture never appears, or "Timed out waiting for ComfyUI" | The first picture after ComfyUI starts loads the model, which can take minutes. Press **Check again**; it's picked up, never made twice. |
| ComfyUI isn't found, or makes nothing | Settings → Runtime → ComfyUI lists every install found (**Search this computer** looks further). Choose yours, and pick an image model there. |
| "Windows blocked ffmpeg … (Smart App Control)" | Windows blocks Alphonso's video tool because it isn't signed yet. Voice-overs, finished videos, Shorts and motion need it. You can turn Smart App Control off in Windows Security → App & browser control, but Windows can't turn it back on without a reset. |
| On a Mac: ffmpeg isn't found | Open Terminal and run `brew install ffmpeg` (install [Homebrew](https://brew.sh) first if needed). |
| "Install Kokoro in Runtime Hub." | Runtimes → Kokoro → Install. |
| Music is skipped | AudioCraft isn't installed (optional): Runtimes → AudioCraft → Install. |
| Making a video from Chat says to install a video model | Runtimes → ComfyUI → Video models suggests one for your graphics card. |
| "This graphics card has under 8 GB, so AI clips are made smaller…" | Expected on smaller cards. |
| A "built-in template" notice in Content Studio | The model's reply couldn't be used, and the notice says why. Check Ollama and the chosen model, then try again. |

## Miya Studio

| You see | Fix |
|---|---|
| "Choose an output folder in Settings first, then ask again." | Settings → Runtime → **Output Folder**. |
| "Approve the review in Miya Studio first." | The run waits after the script's reviews: approve in Script Studio, on the board or on Telegram. |
| "No stock footage keys are set…" | Add a free Pexels, Pixabay or Coverr key (Settings → Connectors), or carry on with scene pictures. |
| "Runway clips were not approved for this run…" | Run AI clips again and approve the cost. |
| "Waiting for Higgsfield…" | Press **Check again**; it's fetched, never made twice. |
| "Higgsfield isn't set up…" | Settings → Connectors → Higgsfield: add your keys and paste the model ids from the Higgsfield Console. |
| Characters: "Tick that this is you or that you have permission first." / "Add at least 5 pictures." | A real person needs the permission tick; every character needs 5–20 pictures. |
| "Install the character reference model in Runtime Hub to keep the character." | Runtimes → ComfyUI → Characters → Install (about 6 GB), or train the character on Higgsfield. |
| Motion: "The clip is longer than 10 seconds." | Trim it, or record a move (recording stops at 10 seconds). |
| "Alphonso couldn't use the camera…" | Allow the camera in your system's privacy settings, or choose a file. |
| "Make the finished video first…" (a Short) | Run the Finished video step first. |
| **Out of date** | An earlier step changed. Run it again when you're ready; nothing reruns by itself. |

## Publishing and the Calendar

| You see | Fix |
|---|---|
| "No posts are approved…" | Campaign Studio → Posts → **Approve and schedule**. |
| "Sign in to YouTube again in Settings → Connectors: the sign-in has run out." | Press **Sign in to YouTube**. While your Google project is in Testing, Google ends the sign-in after about 7 days; publish the project and tick "My Google project is Published". |
| **Kept private by YouTube** | YouTube keeps uploads private until your Google project passes its audit. Alphonso reminds you at the time, with a link to make it public. |
| **Post by hand** | It needs a public link and no storage is set up. Its files and caption are in the project's `ready-to-post` folder; or set up Settings → Connectors → Your storage. |
| **Waiting: daily limit** | Instagram's or Facebook's daily limit; it goes when there's room. |
| **Check it** | It was cut off while sending. Check the platform, then retry or cancel; it's never sent again blindly. |
| "Sign in again to see … numbers" | Sign in again; posting keeps working meanwhile. |
| Moving a post asks first | It's already scheduled on YouTube or Facebook, and moving it changes it there. |

## Connectors

| You see | Fix |
|---|---|
| A connector shows "setup required" | Settings → Connectors: enter the key and **Save**. You don't need environment variables. |
| **Test** says "key found" but not "Live check passed" | Only the key was found; the service wasn't asked. A failing live check says what the service answered. |
| "credentials are missing" | Add the key in Settings → Connectors. |
| "action blocked by policy" | Zero-Cost Mode or Approval Mode stopped it; check Settings → General. |
| "No outside tool can do this." | Add one in Settings → Connectors → Outside tools (MCP), and make sure it's signed in and switched on. |
| "Paid servers are used only as their own step." | Agents only read from free servers; a Paid server's tools run as Marcus's step, with your approval. |
| Telegram doesn't pair | Add your chat ID in Settings → Connectors → Telegram ("required to pair"), then send `/start`. |
| WhatsApp: nothing arrives | Check the gateway address ends in `/queue/drain`, the verify token matches your gateway's, and the sender's number (digits only, no `+`) is in the allowed list. Full steps: [Connectors](CONNECTORS.md). |
| WhatsApp: messages don't send | Meta tokens run out after about 60 days; make a new one in your Meta app. Numbers are digits only. |

## Hermes

| You see | Fix |
|---|---|
| Setting up a profile fails | Hermes Agent must be installed (System → Runtimes → Hermes Agent); it needs Python 3.11–3.13, which Runtime Hub can install. |
| A step on Hermes waits for you | Hermes wants to run a command or change something. Approve or reject it on the board or Telegram. |
| A profile doesn't start | Alphonso starts a profile when a step needs it, yours too; if it can't, the step says why. |
| "This profile's API server is off. Switch it on in Hermes first." | Your own profile needs its API server on (in that profile's Hermes settings); then enter its API server key in **Use for this agent**. |
| A Hermes step fails | It never falls back to another agent's answer. Fix the profile, or switch that agent back to Ollama in Settings → Connectors → Agent Providers. |

## Voice

| You see | Fix |
|---|---|
| "Connection failed" | Start Voice OS from System → Voice (install it in Runtime Hub first). |
| The microphone is blocked | Allow the microphone in your system's privacy settings. |
| No spoken reply | The voice is downloaded the first time it's used; make sure you're online then. |
| Slow replies | Use a smaller model. |

## Still stuck

1. Look at the request on the Requests board: each step says what happened.
2. Settings → Logs shows the crash log.
3. Open an issue at https://github.com/obsidian-media/AlphonsoEcosystem/issues with what you did and what you saw (don't include keys).
