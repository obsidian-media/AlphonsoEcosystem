# Connecting services

Every service is optional. Set each one up in **Settings → Connectors**, where they're grouped as below:

1. Find the service and enter its key (or press **Sign in**), then **Save**.
2. Press **Test**. "Live check passed" means the service answered; "key found" means only that the key is saved.
3. Keys are kept in your system's keychain, never in a file, and never in a backup.

Paid services stay blocked while **Zero-Cost Mode** is on, and anything that sends, publishes or spends asks you first.

**Contents:** [Messaging](#messaging) · [AI models](#ai-models) · [Search and research](#search-and-research) · [Content and publishing](#content-and-publishing) · [Work tools](#work-tools) · [Outside tools (MCP)](#outside-tools-mcp) · [Your phone](#your-phone)

---

## Messaging

### Telegram
Chat with Alphonso from your phone, and approve steps while you're away.
1. In Telegram, message **@BotFather**, send `/newbot` and copy the token into **Bot Token**.
2. Message **@userinfobot** to get your numeric chat ID and put it in **Allowed Chat IDs** (required to pair).
3. Save, then send `/start` to your bot.
- **Where Marcus sends: team chat** (optional): a group's chat ID, for messages to your team.
- Only the chats you allowed can use the bot. Commands are listed in the [User manual](USER_MANUAL.md#13-telegram-and-your-phone).

### WhatsApp (Meta Cloud API)
Messages through your WhatsApp Business number. Receiving messages needs a small gateway you host.
1. Create an app at developers.facebook.com and add **WhatsApp**. From WhatsApp → API Setup copy the **Access Token** and **Phone Number ID**.
2. Choose any secret for **Webhook Verify Token**.
3. To receive messages, deploy the WhatsApp gateway from this repository (`gateway/whatsapp-cloud/`, ready for Railway) with the same verify token, your Meta app secret and the allowed numbers. Point your Meta webhook at `https://<your-gateway>/webhook`, and enter `https://<your-gateway>/queue/drain` as **Cloud Gateway Drain URL**.
4. Put your number in **Allowed Numbers** (digits only, no `+`).
- Meta charges for some WhatsApp conversations, so WhatsApp counts as paid: turn Zero-Cost Mode off to use it.
- Meta tokens run out after about 60 days; make a new one in your Meta app when sending stops.

### Slack
1. Create an app at api.slack.com/apps and add the `chat:write` scope (OAuth & Permissions).
2. Install it to your workspace and copy the **Bot Token** (`xoxb-…`). An app-level `xapp-` token is refused.
3. Invite the bot to each channel it should post in.
- **Where Marcus sends: default channel** (optional), e.g. `#team`.

### Discord
1. Create an application at discord.com/developers/applications, add a Bot, and switch on **Message Content**.
2. Invite the bot to your server (OAuth2 → URL Generator, `bot` scope) and copy its **Bot Token**.
- **Where Marcus sends:** the server ID and a default channel ID (optional).

### CALL-E (phone calls)
Paid: places real phone calls. Get an **API Key** at heycall-e.com (dashboard → API Keys). A call is Marcus's step and always asks first. **CALL-E Outreach** (same page) drafts a call from a form; **Escalation Calls** can call you about an approval that has waited too long (off until you switch it on and add your number).

### Generic Webhook
Lets another service push events into Alphonso. Deploy `gateway/generic-webhook/` from this repository, point the service at `https://<your-gateway>/webhook/<name>`, and enter the gateway's **Gateway Drain URL** and **Drain Token**.

---

## AI models

### Ollama (on this computer)
The default for Chat and every agent. Every installer includes it, and Setup installs a starter model. The address and model are in Settings → General. Using an Ollama you installed yourself works too.

### NVIDIA NIM, Gemini (free tiers)
- **NVIDIA:** a free **API Key** from build.nvidia.com. Some listed models aren't actually served; Alphonso finds one that answers and marks the rest "(not served)".
- **Gemini:** a free **API Key** from aistudio.google.com.

Both send your messages to that company's cloud. Use them on Chat's model tabs, or for any agent in **Agent Providers**.

### OpenRouter
One **API Key** (openrouter.ai/settings/keys) for OpenRouter's free models, and its paid models if you allow them.
- **Free models:** pick one on Chat's OpenRouter tab or for an agent, or "Let OpenRouter choose a free model". The picker shows the free requests left today: 50 a day until you've bought $10 of OpenRouter credit, 1,000 after that, and 20 a minute. When they run out, a step carries on with this computer's model (or asks to use a paid one, if you chose that in Settings → General). Some free models are run by companies that may keep what you send.
- **Paid models:** Settings → General → **Allow paid models** → OpenRouter → a model; its prices fill in from OpenRouter. Every paid step asks first with the cost.
- **Your own provider keys:** keys added in OpenRouter (Gemini, Anthropic, OpenAI, Mistral) work through your one OpenRouter key.

### Claude, ChatGPT, Qwen, DeepSeek (paid)
An **API Key** from console.anthropic.com, platform.openai.com, dashscope.aliyuncs.com or platform.deepseek.com. Each company bills you directly. For Claude and ChatGPT, pick the model from the list (loaded from your account). Claude, ChatGPT and Qwen are blocked while Zero-Cost Mode is on; DeepSeek isn't, so keep an eye on its use. Jose gives a step to Claude, ChatGPT or OpenRouter only when **Allow paid models** is on, and asks first with the cost.

### Hermes profiles
Gives an agent Hermes Agent's own tools, such as web search.
1. System → Runtimes → **Hermes Agent** → Install (Python 3.11–3.13; Runtime Hub can install Python).
2. Settings → Connectors → Agent Providers → **Hermes profiles** → **Set up a Hermes profile for** an agent, then pick its model (an Ollama model or a free OpenRouter model). Nothing to type.
3. Already run Hermes? **Find my Hermes profiles** lists yours (only their settings are read, never their keys) and **Use for this agent** connects one, with that profile's API server key. A profile with its own Telegram or other messaging gets a warning: messages there skip Alphonso's approvals.
- When Hermes wants to run a command or change something, the step waits for you on the board and Telegram.
- Profiles start when a step needs them; those Alphonso started stop after 30 idle minutes.

### Agent Providers
Each agent can use a different provider and model (Settings → Connectors → **Agent Providers**). By default every agent uses Ollama.

---

## Search and research

Hector searches with every key you add, plus a free search. A key gives clearly better results.

| Service | Key from | Free tier |
|---|---|---|
| **Brave Search** | search.brave.com (API) | 2,000 searches a month |
| **Tavily** | app.tavily.com | 1,000 searches a month |
| **Perplexity** | perplexity.ai (API) | None: billed per search by Perplexity (not blocked by Zero-Cost Mode) |

### Google Web Risk (link check)
Sentinel checks links against Google's phishing and malware lists. A Google Cloud **API Key** with the Web Risk API on. The first 100,000 checks a month are free (then $0.50 per 1,000). Only the link is sent.

---

## Content and publishing

### YouTube
Uploads and schedules videos, thumbnails and Shorts, and reads their numbers.
1. In your own Google Cloud project, turn on the YouTube Data API v3 and YouTube Analytics API, and create an OAuth client (Desktop app).
2. Paste the **Client ID** and **Client Secret**, then press **Sign in to YouTube**. Your browser opens; when it can't come back to Alphonso, paste the address it ended on.
3. Add your **Channel ID**.
- While your Google project is in **Testing**, Google ends the sign-in after about 7 days and keeps uploads private. Publish the project, then tick **My Google project is Published**. Alphonso warns 2 days before a sign-in runs out.

### Facebook and Instagram (Meta)
Reels, photo posts and carousels, scheduled or now, and their numbers.
1. Create an app at developers.facebook.com with Facebook Login, Pages and Instagram.
2. Paste the **App ID** and **App Secret**, press **Sign in to Facebook**, and choose your Page.
3. For an Instagram professional account without a Facebook Page, use **Sign in with Instagram** instead (with the Instagram app ID and secret). **Post to Instagram** chooses which way Instagram posts go.
- Instagram carousels (and Reels through Instagram Login) need a public link: set up **Your storage** below, or the post is saved for you to post by hand.
- Facebook posts are scheduled on your Page; Instagram posts are sent by Alphonso at their time.

### Your storage (optional)
Your own S3-compatible bucket (Cloudflare R2, Amazon S3, Supabase Storage, Backblaze B2, Wasabi) for posts that need a public link. Enter the **Storage address**, **Region**, **Bucket**, **Access key** and **Secret key**, and tick "The address includes the bucket in its path" if yours does. **Test** uploads, links and deletes a small file. The bucket stays private: a link works for an hour, and the file is deleted once posted.

### Stock footage: Pexels, Pixabay, Coverr
Free stock clips for Miya Studio's scenes. A free **API Key** from pexels.com/api, pixabay.com/api/docs or coverr.co; any one is enough. Each clip's source, author and license are kept with the project.

### ComfyUI (pictures and AI clips, on this computer)
Set up in Settings → Runtime → ComfyUI: choose your install (or **Search this computer**), its address and the image model. Runtime Hub installs ComfyUI with a starter image model, and on its card the video models, the character model and motion transfer.

### Runway (paid)
AI clips. An **API Secret** from runwayml.com (Account → API). Enter your price per second in Settings → General → **Allow paid models**; each run asks once with the estimate.

### ElevenLabs (paid)
Voice-overs in your own ElevenLabs voices (clones too) and sound effects. An **API Key**; **Test** lists your voices. Enter your prices in Settings → General → **Allow paid models**.

### Higgsfield (paid)
Pictures, AI clips, character training and motion for Miya Studio, and "Make a Higgsfield picture (or video) of …" from Chat or Telegram. Enter your **Key id** and **Key secret**, and paste each model id from the Higgsfield Console (picture, clip, character training, motion), with optional extra settings as JSON. **Test** shows Higgsfield's estimate without making anything. Everything asks first with the cost.

### SD WebUI (Automatic1111)
Can be connected (default address `http://127.0.0.1:7860`, started with `--api`), but the agents make pictures with ComfyUI.

---

## Work tools

### GitHub
A **Personal Access Token** (github.com/settings/tokens) with `repo` access. Marcus makes draft releases and issues, after your approval. **Where Marcus sends: default repository** is optional.

### Notion
1. At notion.so/my-integrations, create an integration and copy its **Integration Secret**.
2. Share the page Marcus should write under with the integration, and put that page's ID (the 32 characters at the end of its address) in **Where Marcus sends: default page ID**.

### ClickUp
An **API Key** (ClickUp → Settings → Apps → API Token) and **Where Marcus sends: default list ID** (from the list's address). The list must be in the same workspace as the key.

### n8n
Your own n8n (default **n8n Base URL** `http://localhost:5678`). List the workflows Marcus may send to in **Where Marcus sends: your workflows**; he sends to no others.

### Composio
Settings → Connectors → **External Tools (Composio)**: your Composio API key, then switch on the toolkits you want. Marcus sends through switched-on apps (after approval); agents may use their read-only actions.

---

## Outside tools (MCP)

Your own online services that offer an MCP server, such as a shop or an issue tracker. Alphonso calls them; nothing calls in.

1. Settings → Connectors → **Outside tools (MCP)**: search the MCP Registry, or paste the server's address (https only).
2. Choose **Free** or **Paid** (Paid by default; Paid servers are blocked in Zero-Cost Mode and only run as their own step), with an optional price per call.
3. **Sign in** in your browser, or save the key the server asks for.
4. Mark each tool: **Asks first** (the default), **Reading only**, or **Deletes**; or switch it off.

Agents read from reading-only tools on free servers when a request needs the facts. Changes are Marcus's step: the approval shows the exact call ("Shop: Update price (product: Blue mug, price: 18)") and it runs once. **Refresh tools** reloads a server's tool list.

---

## Your phone

**The iPhone app** pairs in Settings → Runtime → **Remote Access**: turn on mobile pairing, then scan the QR code or enter the 6-digit PIN in the app (five wrong PINs and it changes). Both need to be on the same network. Requests from the phone go through Jose like any other.
