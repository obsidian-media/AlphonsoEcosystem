# Alphonso Connectors Reference

Alphonso has **35 connectors** (`DEFAULT_CONNECTORS` in `src/services/connectors/connectorRegistry.js`). All outbound connector calls run through `policyEnforcementService.ts` before any external API is contacted. The gate fails closed: missing credentials, zero-cost mode, or unauthorized senders all result in a blocked result with an audit receipt. No raw stubs — every listed path is wired through the policy gate.

**Setup flow for every connector:**

> **Important:** enter credentials in the app (**Settings → Connectors**). They are kept in your system's keychain (Windows Credential Manager, macOS Keychain, the Linux secret service), never in localStorage, backups or exports. A variable set in the app's own environment still works as a fallback; a `.env` file is read only in development runs, never by an installed app. The variable names below are the names of the fields.

1. Open **Settings → Connectors**; connectors are grouped (Messaging, AI Models, Search & Research, Content & Productivity, Automation)
2. Enter the credentials and click **Save** (or **Save & Enable**)
3. Use **Test** in the Connector Health Monitor: "Live check passed" means the service itself answered; "key found" means only that a key is saved (nothing was sent). Each key shows as "saved", "environment only" or "missing"
4. YouTube, Facebook and Instagram have **Sign in** buttons instead of pasted tokens (see their sections)
5. Paid connectors stay blocked while Zero-Cost Mode is on, and every publish, send or spend asks first

---

## 1. Telegram

**Status:** Live polling + outbound send wired; webhook mode not wired (desktop uses polling).

**Required env vars:**
| Variable | Description |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Token from BotFather (`/newbot`) |
| `TELEGRAM_ALLOWED_CHAT_IDS` | Comma-separated numeric chat/user IDs to allowlist |

**How to get credentials:**
1. Open Telegram, message `@BotFather`, run `/newbot`
2. Copy the token BotFather returns → `TELEGRAM_BOT_TOKEN`
3. Send a message to your bot, then call `https://api.telegram.org/bot<TOKEN>/getUpdates` to find your chat ID → `TELEGRAM_ALLOWED_CHAT_IDS`

**How to test:**
- Start `npm run tauri dev`
- Open the Connector Setup panel, verify env keys are green
- Send a message from an allowlisted chat ID; it should appear routed through Jose in the command ledger

**Known limitations:**
- Webhook mode not wired; polling only (desktop limitation)
- Unauthorized chat IDs are blocked and logged but not replied to

**Setup doc:** `docs/TELEGRAM_BRIDGE_SETUP.md`

---

## 2. WhatsApp — Cloud API (Meta)

**Status:** Fully wired — outbound send via browser fallback (`browserSendWhatsApp`), inbound polling via Railway gateway queue (`browserPollWhatsAppGateway`). No hosted endpoint required beyond the Railway gateway.

**Required credentials** (enter in Settings → Connectors → WhatsApp — NOT in `.env`):
| Credential | Description |
|---|---|
| `WHATSAPP_ACCESS_TOKEN` | Meta Cloud API access token |
| `WHATSAPP_PHONE_NUMBER_ID` | Phone number ID from Meta for Developers |
| `WHATSAPP_VERIFY_TOKEN` | Webhook verify token you define (must match Railway) |
| `WHATSAPP_CLOUD_GATEWAY_DRAIN_URL` | `https://<your-railway-url>/queue/drain` |
| `WHATSAPP_ALLOWED_NUMBERS` | Comma-separated allowed sender numbers (digits only, no `+`) |

**How to get credentials:**
1. Create a Meta for Developers app at `developers.facebook.com`
2. Add WhatsApp product; go to WhatsApp > API Setup
3. Copy the access token → `WHATSAPP_ACCESS_TOKEN`
4. Copy the Phone Number ID → `WHATSAPP_PHONE_NUMBER_ID`
5. Set `WHATSAPP_VERIFY_TOKEN` to any secret string you choose
6. Deploy `gateway/whatsapp-cloud/` to Railway (see setup below)
7. Railway drain URL → `WHATSAPP_CLOUD_GATEWAY_DRAIN_URL`

**Railway gateway setup:**
1. Deploy `gateway/whatsapp-cloud/` to Railway
2. Set env vars in Railway dashboard: `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_ALLOWED_NUMBERS`
3. Point Meta webhook URL to `https://<railway-url>/webhook`
4. Enter the drain URL in Alphonso: `https://<railway-url>/queue/drain`
5. Alphonso polls `/queue/drain` every ~30s for inbound messages

**How to test:**
- Outbound: Settings → Connectors → WhatsApp → supervised send test
- Inbound: Send a WhatsApp message from an allowlisted number → should appear routed through Jose within 30s

**Known limitations:**
- Inbound polling interval is ~30s (not real-time; webhook events go to the queue)
- Allowlist numbers must be digits only, no `+` (the gateway strips `+` automatically)
- Credentials are stored in `alphonso_connector_credentials_v1` (localStorage + SQLite), not env vars

**Setup docs:** `docs/GETTING_STARTED.md`, `docs/WHATSAPP_BRIDGE_SETUP.md`, `docs/RAILWAY_WHATSAPP_GATEWAY.md`

---

## 3. WhatsApp — Twilio (removed)

Twilio was never supported for setup, and its leftover code and fields were removed on 2026-10-21. WhatsApp is Meta Cloud API only (section 2).

---

## 4. YouTube

**Status:** Upload, scheduling (private with a publish time), moving and cancelling scheduled videos, thumbnails, and reading each video's numbers (YouTube Analytics and the Data API). Used by Miya Studio's Publish step and the Calendar. *Not checked with a real account yet.*

**Credentials:**
| Field | Description |
|---|---|
| `YOUTUBE_CLIENT_ID` | OAuth client ID from your own Google Cloud project |
| `YOUTUBE_CLIENT_SECRET` | OAuth client secret |
| `YOUTUBE_REFRESH_TOKEN` | Saved for you by **Sign in to YouTube** |
| `YOUTUBE_CHANNEL_ID` | Target YouTube channel ID |

**How to get credentials:**
1. Go to `console.cloud.google.com` → APIs & Services → Credentials
2. Create an OAuth 2.0 Client ID (Desktop application type) and enable the YouTube Data API v3 and YouTube Analytics API
3. Paste the client ID and secret in Settings → Connectors → YouTube
4. Press **Sign in to YouTube**: the browser opens, and Alphonso receives the sign-in itself on `127.0.0.1:8085` (for 5 minutes). If the browser can't come back, paste the address it ended on. (`npm run auth:youtube` is still there for developers.)
5. While the Google project is in **Testing**, Google ends the sign-in after about 7 days and keeps uploads private; Alphonso warns 2 days before. Publish the project and tick **My Google project is Published**.

**Known limitations:**
- Every upload asks first (publish always asks)
- A channel whose uploads YouTube keeps private gets a reminder at the time, with a link to make the video public in YouTube Studio
- Inbound event ingestion not wired

**Setup doc:** `docs/YOUTUBE_CONNECTOR_SETUP.md`

---

## 5. Claude (Anthropic)

**Status:** Outbound prompt exchange wired through the `connector_send_claude` Rust command. Pick the model in the connector's **Model** list (loaded live from Anthropic; the default is Claude Haiku 5.5). Paid: blocked in Zero-Cost Mode; Jose uses it for a step only when Settings → Approvals → Allow paid models is on.

**Required env vars:**
| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | API key from `console.anthropic.com` |
| `CLAUDE_MODEL` | Optional; the **Model** dropdown (from Anthropic's live list). Default `claude-haiku-5-5` |

**How to get credentials:**
1. Sign up / log in at `console.anthropic.com`
2. Go to API Keys → Create Key
3. Copy the key → `ANTHROPIC_API_KEY`

**How to test:**
- Connector Setup panel → verify env key is present
- Send a prompt through the Claude connector path in the app
- Response returns a supervised connector proof: `{ ok, external_id, target, error }`

**Known limitations:**
- Blocked by default in zero-cost mode (`policyEnforcementService.ts`)
- Inbound webhooks not wired
- Auto-sync of responses into Jose task decomposition not wired

**Setup doc:** `docs/CHATGPT_CLAUDE_CONNECTORS_SETUP.md`

---

## 6. ChatGPT (OpenAI)

**Status:** Outbound prompt exchange wired through the `connector_send_chatgpt` Rust command. Pick the model in the connector's **Model** list (loaded live from OpenAI; the default is GPT-6 Luna). Paid: blocked in Zero-Cost Mode; Jose uses it for a step only when paid models are allowed.

**Required env vars:**
| Variable | Description |
|---|---|
| `OPENAI_API_KEY` | API key from `platform.openai.com` |
| `OPENAI_MODEL` | Optional; the **Model** dropdown (from OpenAI's live list). Default `gpt-6-luna` |

**How to get credentials:**
1. Log in at `platform.openai.com`
2. Go to API Keys → Create new secret key
3. Copy the key → `OPENAI_API_KEY`

**How to test:**
- Connector Setup panel → verify env key is present
- Send a prompt through the ChatGPT connector path
- Response returns a supervised connector proof: `{ ok, external_id, target, error }`

**Known limitations:**
- Blocked by default in zero-cost mode
- Inbound webhooks not wired

**Setup doc:** `docs/CHATGPT_CLAUDE_CONNECTORS_SETUP.md`

---

## 7. Notion

**Status:** Outbound create-page wired via `connector_send_notion`.

**Required env vars:**
| Variable | Description |
|---|---|
| `NOTION_API_KEY` | Internal integration token from `notion.so/my-integrations` |
| `NOTION_PARENT_PAGE_ID` | ID of the Notion page where new pages will be created |

**How to get credentials:**
1. Go to `notion.so/my-integrations` → New integration
2. Copy the Internal Integration Token → `NOTION_API_KEY`
3. In Notion, open the target parent page → Share → Add your integration
4. Copy the page ID from the URL (32-char hex after the last `-`) → `NOTION_PARENT_PAGE_ID`

**How to test:**
- Connector Setup panel → verify env keys
- Run a supervised write test; a new page should appear under the parent page in Notion

**Known limitations:**
- Inbound webhooks not wired
- Full two-way sync and conflict resolution not implemented

**Setup doc:** `docs/NOTION_CLICKUP_CONNECTORS_SETUP.md`

---

## 8. ClickUp

**Status:** Outbound create-task wired via `connector_send_clickup`.

**Required env vars:**
| Variable | Description |
|---|---|
| `CLICKUP_API_KEY` | Personal API token from ClickUp settings |
| `CLICKUP_LIST_ID` | ID of the ClickUp list where tasks will be created |

**How to get credentials:**
1. Go to ClickUp → Profile Settings → Apps → API Token → Generate
2. Copy the token → `CLICKUP_API_KEY`
3. Open the target list in ClickUp; the list ID is in the URL → `CLICKUP_LIST_ID`

**How to test:**
- Connector Setup panel → verify env keys
- Run a supervised task creation test; a new task should appear in the target ClickUp list

**Known limitations:**
- Inbound webhooks not wired
- Full two-way sync not implemented

**Setup doc:** `docs/NOTION_CLICKUP_CONNECTORS_SETUP.md`

---

## 9. Stable Diffusion WebUI (Automatic1111)

**Status:** Outbound image generation wired via `connector_generate_sdwebui`. Local service required.

**Required env vars:**
| Variable | Description |
|---|---|
| `LOCAL_SDWEBUI_ENDPOINT` | Default: `http://127.0.0.1:7860` |
| `LOCAL_SDWEBUI_BASIC_AUTH` | Optional; format `username:password` |

**How to get credentials:** No cloud credentials needed — local service only.

**How to start Automatic1111:**
1. Install Automatic1111 from its GitHub repo
2. Launch with the `--api` flag: `webui.bat --api` (Windows)
3. Verify `http://127.0.0.1:7860/docs` is reachable

**How to test:**
- Connector Setup panel → verify endpoint is reachable
- Submit an image generation request from Miya Studio
- Supported params: prompt, negative prompt, width, height, steps, cfg scale

**Known limitations:**
- Local service must be running before Alphonso is started
- No cloud fallback

**Setup doc:** `docs/MIYA_LOCAL_MEDIA_SETUP.md`

---

## 10. ComfyUI

**Status:** The agents' one image tool, and the local engine for AI clips, the character reference and motion transfer. The desktop app reaches it through a narrow backend route (`comfyui_request`, `comfyui_upload_image`, `comfyui_save_output`), since ComfyUI refuses the app window. Before each job Alphonso frees the graphics card from Ollama.

**Settings (Settings → Runtime → ComfyUI):**
| Setting | Description |
|---|---|
| ComfyUI address | Default `http://127.0.0.1:8188` |
| Your ComfyUI | Every install found on this computer (running ones, the one you chose, usual places); **Search this computer** looks through your drives |
| Image model | The checkpoints ComfyUI has; Automatic = the starter model |

**How to get it:**
1. **Runtimes → ComfyUI → Install** installs it with the PyTorch build for your NVIDIA driver and the Stable Diffusion 1.5 starter model, or Alphonso uses your own ComfyUI
2. On the ComfyUI card: **Video models** (LTX-Video 2B for 6 GB and up, Wan 2.2 5B for 8 GB and up), **Characters** (the character reference model) and **Motion transfer** (Wan 2.1 VACE 1.3B, about 8 GB), each pinned and checked

**How to test:**
- Provide a valid ComfyUI API workflow JSON in Miya Studio
- Submit a video queue job
- Check job status via `/history/{prompt_id}`

**Known limitations:**
- Requires a valid API-format workflow JSON (export from ComfyUI with "Save (API Format)" mode)
- Local service must be running

**Setup doc:** `docs/MIYA_LOCAL_MEDIA_SETUP.md`

---

## 11. Meta / Instagram

**Status:** Facebook Reels (now, or scheduled on the Page 11 minutes to 29 days ahead) and photo posts (carousels), Instagram Reels and carousels, moving and cancelling scheduled posts, daily-limit checks, and reading each post's numbers. Videos on this computer are uploaded straight to Meta (resumable upload). Instagram can go through your Facebook Page or through **Instagram Login** (an Instagram professional account without a Page). *Not checked with a real account yet.*

**Credentials (Settings → Connectors → Meta):**
| Field | Description |
|---|---|
| `META_APP_ID`, `META_APP_SECRET` | Your Meta app (the secret stays in the backend) |
| `META_ACCESS_TOKEN` | Saved for you by **Sign in to Facebook** (long-lived) |
| `META_PAGE_ID`, `META_PAGE_ACCESS_TOKEN` | The Page you choose after signing in |
| `INSTAGRAM_BUSINESS_ACCOUNT_ID` | The Instagram account linked to the Page |
| `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET` | For Instagram Login |
| `INSTAGRAM_LOGIN_TOKEN`, `INSTAGRAM_LOGIN_USER_ID` | Saved for you by **Sign in with Instagram** (60 days; renewed by itself under 10 days left) |
| `META_GRAPH_API_VERSION` | Default: `v20.0` |

**How to get credentials:**
1. Create a Meta for Developers app at `developers.facebook.com` and add Facebook Login, Pages and Instagram
2. Paste the App ID and App Secret, then press **Sign in to Facebook** (callback `127.0.0.1:8086`) and choose your Page; or **Sign in with Instagram** (callback `127.0.0.1:8087`). Each button lists the steps and the address to register. (`npm run auth:meta` is still there for developers.)
3. **Post to Instagram** chooses the route: whichever is set up, through my Facebook Page, or through Instagram Login
4. Instagram carousels (and Reels through Instagram Login) need a public link: connect **Your storage** (section 30), or the post is saved to post by hand

**Known limitations:**
- Every publish asks first, and only Marcus publishes
- Instagram posts are sent by Marcus's runner at their time (Meta can't schedule them)
- Inbound webhooks not wired

**Setup doc:** `docs/EXTERNAL_CONNECTOR_SETUP.md`

---

## 12. Runway (Miya creative cloud draft)

**Status:** AI clips for the main moments in Miya Studio (and Content Studio's video step), through the Tauri backend. Paid: enter your price per second in Settings → Approvals → Allow paid models; each run asks once with the estimate, inside the monthly cap. *Not checked with a real account yet.*

**Required env vars:**
| Variable | Description |
|---|---|
| `RUNWAYML_API_SECRET` | API key from Runway dashboard |
| `RUNWAYML_API_BASE_URL` | Optional; default `https://api.dev.runwayml.com` |
| `RUNWAYML_API_VERSION` | Optional; default `2024-11-06` |

**How to get credentials:**
1. Create an account at `runwayml.com`
2. Go to Account Settings → API → Generate API Key → `RUNWAYML_API_SECRET`

**Known limitations:**
- Clips are 5 or 10 seconds, from the scene's picture (`gen4_turbo` by default)
- A clip that times out (30 minutes) says Runway may still charge
- The secret is used by the backend only

**Setup doc:** `docs/MIYA_LOCAL_MEDIA_SETUP.md`

---

## 13. Mobile Bridge (iOS Companion)

**Status:** `foundation_only` — PIN-paired WebSocket, not a credential-based connector. Backend: `companion_server.rs`/`companion_auth.rs`/`companion_discovery.rs`/`companion_router.rs`.

**Required env vars:** None — pairing-based, not API-key-based.

**How to pair:**
1. Open Settings → Companion in the desktop app
2. A 6-digit PIN is generated (`companion_get_pin`) and a QR code shown
3. On the iOS Companion app, scan the QR code or enter the PIN manually
4. mDNS discovery (`companion_start_discovery`) is **opt-in only** — click "Start Discovery" in Settings; it does not run automatically at boot
5. Once paired, `companion_get_status` reports connected clients

**How to test:**
- `CompanionPairingPanel.tsx` shows live connected-client count
- Send a command from the iOS app; it should route through Jose the same as an in-app command

**Known limitations:**
- PIN has a 5-attempt lockout (constant-time compare) — a locked-out PIN must be regenerated
- Requires port 8765 free locally (Voice OS was moved to 8766 specifically to avoid colliding with this) and mDNS UDP 5353 open on the firewall
- `permissions: ['remote_approvals', 'runtime_status', 'active_tasks', 'voice_notes']` — no direct outbound API calls; the companion only relays commands into Alphonso's own pipeline

**Setup doc:** `docs/IOS_COMPANION_HANDOFF.md`

---

## 14. Alibaba Qwen Connector

**Status:** Outbound prompt exchange wired via `connector_send_qwen` (Rust), DashScope's OpenAI-compatible endpoint.

**Required env vars:**
| Variable | Description |
|---|---|
| `DASHSCOPE_API_KEY` | API key from DashScope |

**How to get credentials:**
1. Sign up at `dashscope.aliyuncs.com`
2. Generate an API key → `DASHSCOPE_API_KEY`
3. Alphonso uses the international endpoint automatically — no region config needed

**How to test:**
- Connector Setup panel → verify key is present
- Send a prompt through the Qwen connector path; response returns the standard supervised connector proof

**Known limitations:**
- Blocked by default in zero-cost mode (`permissions` includes `paid_connector_send`)
- Inbound webhooks not wired

---

## 15. GitHub Connector

**Status:** Outbound wired via `connector_github_action` (Rust), GitHub REST API v3.

**Required env vars:**
| Variable | Description |
|---|---|
| `GITHUB_TOKEN` | Personal access token with `repo` and `workflow` scopes |

**How to get credentials:**
1. Go to `github.com/settings/tokens` → Generate new token
2. Select `repo` and `workflow` scopes
3. Copy the token → `GITHUB_TOKEN`

**How to test:**
- Connector Setup panel → verify token is present
- Supported actions (via `connector_github_action`): `create_issue`, `dispatch_workflow`, `create_pr`, `get_repo`, `list_issues`
- Used by Marcus for releases and issue management

**Known limitations:**
- No inbound webhook listener (GitHub → Alphonso events are not wired)
- Token is a single flat scope, not fine-grained per-repo

---

## 16. Slack Connector

**Status:** Outbound wired via `connector_slack_send` (Rust), Slack Web API.

**Required env vars:**
| Variable | Description |
|---|---|
| `SLACK_BOT_TOKEN` | Bot User OAuth Token (`xoxb-...`) |

**How to get credentials:**
1. Create a Slack app at `api.slack.com/apps`
2. Add the `chat:write` scope under OAuth & Permissions
3. Install the app to your workspace
4. Copy the Bot User OAuth Token → `SLACK_BOT_TOKEN`

**How to test:**
- Connector Setup panel → verify token is present
- Supported via `slackConnector.ts`: messages, channels, files, reactions, webhooks

**Known limitations:**
- No inbound event subscription wired (outbound send only)

---

## 17. Discord Connector

**Status:** Outbound wired via `discordConnector.ts` (plain `fetch`, no Rust command — Discord REST API v10 directly from the frontend).

**Required env vars:**
| Variable | Description |
|---|---|
| `DISCORD_BOT_TOKEN` | Bot token from the Discord Developer Portal |

**How to get credentials:**
1. Create an application at `discord.com/developers/applications`
2. Add a Bot to the application
3. Enable the **Message Content** privileged intent
4. Invite the bot to your server (OAuth2 URL Generator, `bot` scope)
5. Copy the Bot Token → `DISCORD_BOT_TOKEN`

**How to test:**
- Connector Setup panel → verify token is present
- Supported functions (`discordConnector.ts`): `sendMessage`, `editMessage`, `deleteMessage`, `listGuildChannels`, `getChannelHistory`, `addReaction`, `sendWebhookMessage`

**Known limitations:**
- No inbound gateway/event listener (outbound REST calls only, no live Discord Gateway websocket)

---

## 18. CALL-E

**Status:** Three integration paths — a REST connector (form-driven, single call), a conversational MCP flow (chat-driven, clarifying-question loop), and an automated escalation-call service (system-triggered, no chat/form involved). All real outbound phone calls, unconditionally high-risk/paid. REST is wired into Settings → Connectors → Connectors → "CALL-E Outreach" (PR #234 — not "pending a UI redesign" as an earlier version of this doc said).

**2026-09-10 fix — CSP was silently blocking every real request from the native app:** `tauri.conf.json`'s CSP `connect-src` allowlist never included `api.heycall-e.com` (REST) or `seleven-mcp-sg.airudder.com` (MCP broker + server) — both call out via plain `fetch()` from the frontend, and the webview silently blocked every request with zero visible error. This is very likely why "no real call has been placed by either path" persisted for so long: nobody could get past this point in the packaged/native app. Fixed on branch `fix/calle-csp-allowlist`. The same CSP gap also affected 9 other connectors (DeepSeek, Perplexity, Tavily, NVIDIA NIM, Discord, Slack, GitHub, Composio, plugin marketplace) — all fixed in the same change.

**Required env vars (REST):**
| Variable | Description |
|---|---|
| `CALLE_API_KEY` | API key from `dashboard.heycall-e.com/account/api-keys` |

**MCP path:** no static API key — a separate brokered OAuth login via Settings → Connectors → CALL-E → "Connect via Browser Login" (`calleMcpAuthService.ts`; no loopback server, poll-based session exchange against `seleven-mcp-sg.airudder.com`).

**How to get credentials (REST):**
1. Sign up at `heycall-e.com`
2. Go to the dashboard → API Keys → copy your key → `CALLE_API_KEY`

**How to test:**
- REST: `CalleOutreachPanel.tsx` (Settings → Connectors → "CALL-E Outreach") — draft a call, approve, `createCall`/`pollCallUntilTerminal` places and tracks it
- MCP: type a message starting with "call"/"phone"/"ring"/"dial" in ChatView; `plan_call` asks clarifying questions until ready, then a real button click (not typed text) approves `run_call`
- Escalation: Settings → Connectors → "Escalation Calls" — enable, set a phone number, "Check now" to trigger immediately against any packet currently `pending_approval`

**Known limitations:**
- Real cost (~$0.05/call per CALL-E's pricing) and a real phone rings — all paths are unconditionally high-risk in `policyEnforcementService.ts`
- `run_call` (MCP) has **no idempotency key** — a durable `submitting` stage in `calleMcpOutreachService.ts` blocks resubmission after any failure, but cannot itself guarantee exactly-once delivery
- The 2026-09-07 ground-truth entry stating "no real call has been placed by either path" is superseded by the CSP fix above but the live-verification steps themselves (MCP login through Alphonso's own code, keychain survival, one real terminal-status call) were still in progress as of this doc's last edit — check `docs/governance/DEFERRED_WORK.md`'s CALL-E entry for current status before assuming they're done
- Escalation service is new (2026-09-10) and not yet live-verified end-to-end (a real packet reaching `pending_approval`, sitting past threshold, a real call placed, and the packet actually resolving from the spoken answer)

**Setup doc:** `docs/superpowers/specs/2026-09-06-calle-outreach-connector-design.md`, `docs/superpowers/specs/2026-09-06-calle-mcp-conversational-outreach-design.md`

---

## 19. Generic Webhook

**Status:** Inbound-only — lets any external service push events into Alphonso without a bespoke connector. Standalone gateway (`gateway/generic-webhook/`) + `genericWebhookService.ts` polling.

**Required env vars:**
| Variable | Description |
|---|---|
| `GENERIC_WEBHOOK_DRAIN_URL` | `https://<your-gateway>/queue/drain` |
| `GENERIC_WEBHOOK_TOKEN` | Shared secret configured on the gateway |

**How to get credentials:**
1. Deploy `gateway/generic-webhook/` (Railway config included) — mirrors `gateway/whatsapp-cloud/`'s pattern
2. Point any external service at `https://<gateway>/webhook/<sourceId>` with the shared secret
3. Set the drain URL and token in Alphonso → `GENERIC_WEBHOOK_DRAIN_URL` / `GENERIC_WEBHOOK_TOKEN`

**How to test:**
- Connector Setup panel → verify drain URL/token are present
- POST a test payload to the gateway's `/webhook/<sourceId>` endpoint; Alphonso's next poll should ingest it

**Known limitations:**
- Inbound only — there is no outbound send path for this connector
- Poll-based, not real-time push

---

## 20. Ollama (Local Inference)

**Status:** `foundation_only` — the default local inference runtime every agent uses. No cloud credentials.

**Required env vars:** None.

**How to start Ollama:**
1. Install Ollama from `ollama.com`
2. Ensure it's running: `http://127.0.0.1:11434` should respond
3. Pull at least one model (e.g. `ollama pull llama3.2:3b`)

**How to test:**
- Runtime Hub (Settings → Runtimes) shows live Ollama connection status
- The configured endpoint is read via `getConfiguredOllamaEndpoint()` — do not assume the hardcoded default if the user has changed it in Settings

**Known limitations:**
- Local service must be running before Alphonso can generate any response
- No cloud fallback unless the user explicitly configures NVIDIA NIM/Gemini/Hermes as an alternate provider

---

## 21. Brave Search

**Status:** `braveSearchConnector.ts` (`searchBrave`, `isBraveSearchConfigured`), policy-gated since 2026-09-21; Hector's first web-search provider.

**Required env vars:**
| Variable | Description |
|---|---|
| `BRAVE_SEARCH_API_KEY` | API key from `search.brave.com/register` |

**How to get credentials:**
1. Sign up at `search.brave.com/register` (free tier: 2,000 queries/month)
2. Copy the API key → `BRAVE_SEARCH_API_KEY`

**How to test:**
- Connector Setup panel → verify key is present
- Ask Hector a research question; without this key he falls back to Tavily, Perplexity, DuckDuckGo and the RSS feeds

**Known limitations:**
- Without a key, Hector's fallback (DuckDuckGo scraping) is noticeably lower quality — this key is a strong recommendation, not just a nice-to-have

---

## 22. Perplexity

**Status:** `perplexityConnector.ts` (`isPerplexityConfigured`, `searchPerplexity`), on Perplexity's Search API (`POST /search`) since 2026-10-21; Hector uses it after Tavily. *Not checked with a real key yet.*

**Credentials:**
| Field | Description |
|---|---|
| `PERPLEXITY_API_KEY` | API key from `perplexity.ai`, entered in Settings → Connectors → Search & Research |

**Known limitations:**
- The old `/chat/completions` call and its model were retired by Perplexity; only the Search API is used

---

## 23. Tavily

**Status:** Wired as Hector's tier-2 search fallback (`tavilyConnector.ts` — `isTavilyConfigured`, `searchTavily`), used when Brave Search is unavailable/unconfigured.

**Required env vars:**
| Variable | Description |
|---|---|
| `TAVILY_API_KEY` | API key from `app.tavily.com` |

**How to get credentials:**
1. Sign up at `app.tavily.com` (free tier: 1,000 searches/month)
2. Copy the API key → `TAVILY_API_KEY`

**How to test:**
- Connector Setup panel → verify key is present
- Disable/unset Brave Search and ask Hector a research question — Tavily should be used instead

**Known limitations:**
- Only invoked when Brave Search is unavailable, not as a primary/parallel source

---

## 24. DeepSeek

**Status:** Wired as an alternative to Claude/ChatGPT for Hector research (`deepseekConnector.ts` — `isDeepSeekConfigured`, `sendDeepSeekMessage`, `searchWithDeepSeek`), OpenAI-compatible API.

**Required env vars:**
| Variable | Description |
|---|---|
| `DEEPSEEK_API_KEY` | API key from `platform.deepseek.com` |

**How to get credentials:**
1. Sign up at `platform.deepseek.com`
2. Generate an API key → `DEEPSEEK_API_KEY`

**How to test:**
- Connector Setup panel → verify key is present
- Route a Hector request through DeepSeek and confirm a response using the `deepseek-chat` model

**Known limitations:**
- Blocked by default in zero-cost mode

---

## 25. NVIDIA NIM

**Status:** Free-tier cloud model provider (`nvidiaNimConnector.ts` — `isNvidiaConfigured`, `sendNvidiaMessage`, `listNvidiaModels`), 70-80+ hosted models via one OpenAI-compatible endpoint. Deliberately excluded from `PAID_OR_METERED_CONNECTORS` in `policyEnforcementService.ts`.

**Required env vars:**
| Variable | Description |
|---|---|
| `NVIDIA_API_KEY` | Free key from `build.nvidia.com` |

**How to get credentials:**
1. Sign up at `build.nvidia.com`
2. Generate a free API key → `NVIDIA_API_KEY`

**How to test:**
- Connector Setup panel → verify key is present
- Select NVIDIA as a per-agent provider (Settings → Connectors → Agent Providers) and send a chat message

**Known limitations:**
- Free tier, not local: requests leave the machine and go to NVIDIA's cloud
- Rate-limited and provider-controlled — not guaranteed by Alphonso if NVIDIA changes free-tier policy

---

## 26. Google Gemini

**Status:** Free-tier cloud model provider (`geminiConnector.ts` — `isGeminiConfigured`, `sendGeminiMessage`), AI Studio free tier (not billed Vertex AI). Deliberately excluded from `PAID_OR_METERED_CONNECTORS`.

**Required env vars:**
| Variable | Description |
|---|---|
| `GEMINI_API_KEY` | Free key from `aistudio.google.com` |

**How to get credentials:**
1. Sign up at `aistudio.google.com`
2. Generate a free API key → `GEMINI_API_KEY`

**How to test:**
- Connector Setup panel → verify key is present
- Select Gemini as a per-agent provider and send a chat message

**Known limitations:**
- Free tier, not local: requests leave the machine and go to Google's cloud
- Rate-limited and provider-controlled — default model has been silently retired by Google twice before (see `docs/ALPHONSO_GROUND_TRUTH.md`'s 2026-09-04 entry); if requests start failing, check whether the default model needs updating before assuming a code bug

---

## 27. Hermes Agents

**Status:** Per-agent, not a single connector — one profile per in-app agent (Jose, Alphonso, Miya, Hector, Maria, Marcus, Echo, Sentinel, Nova), each pointing at the user's own separately-run standalone Hermes Agent instance. `hermesAgentConnector.ts` — `isHermesAgentConfigured(agentId)`, `getHermesAgentEndpoint`/`saveHermesAgentEndpoint`, `getHermesSessionMode`/`setHermesSessionMode`. Local/self-hosted, same policy posture as Ollama.

**Required env vars:** None (dynamic per-agent, stored as `HERMES_<AGENTID>_URL`/`_KEY`/`_SESSION_MODE` via `connectorAuth.ts`, not static env vars).

**How to get credentials:**
1. Run a standalone Hermes Agent instance for the agent you want to mirror (its own `config.yaml` defines `api_server`)
2. In Settings → Connectors, find the "Hermes — `<Agent>`" row for that specific agent
3. Paste the Base URL and Bearer key from that profile's `config.yaml`
4. Repeat per agent — there is no single "connect all" action

**How to test:**
- Connector Setup panel → each Hermes row shows its own configured/not-configured state
- Select Hermes as a per-agent provider (Settings → Connectors → Agent Providers) and send a chat message for that agent

**Known limitations:**
- Classified **high risk** (any call can trigger real tool use, not just text generation), not just "local/self-hosted low risk" like Ollama
- Calls route through native Rust HTTP (`connector_hermes_agent_request`), not browser `fetch()` — a third-party local process has no reason to send CORS headers, so a plain webview `fetch()` was silently blocked regardless of reachability (fixed 2026-08-22, PR #190)
- `hermes_agents` currently bypasses Zero-Cost Mode for any saved endpoint, including a non-loopback one — a known, separately-tracked gap (`docs/governance/DEFERRED_WORK.md`)

---

## 28. n8n Automation

**Status:** `foundation_only` — Marcus's workflow-automation trigger target (`n8nConnector.ts` — `isN8nHealthy`, `triggerN8nWebhook`, `listN8nWorkflows`, `setN8nWorkflowActive`). Requires a local or self-hosted n8n instance.

**Required env vars:**
| Variable | Description |
|---|---|
| `N8N_BASE_URL` | Default: `http://localhost:5678` |

**How to start n8n:**
1. Run n8n in Docker (n8n must be running before Alphonso can reach it)
2. Verify `http://localhost:5678` is reachable
3. Set `N8N_BASE_URL` if not using the default

**How to test:**
- Connector Setup panel → verify the base URL is reachable (`isN8nHealthy`)
- Trigger a test webhook via Marcus and confirm it fires in the n8n workflow

**Known limitations:**
- Requires Docker running locally — no cloud-hosted n8n fallback documented here
- All endpoint calls have AbortController timeouts (15s/10s/5s) — a slow n8n instance can time out before completing

---

## 29. Pexels, Pixabay and Coverr (stock footage)

**Status:** Three free stock-clip sources, searched by Hector for each scene in Miya Studio (`stockFootageConnector.ts`; backend `content_stock_search` and `content_download_media`: https only, the stock hosts only, every redirect checked, 300 MB at most). Each clip keeps its source, author, page and license.

**Credentials (Settings → Connectors → Content & Productivity):**
| Field | Where |
|---|---|
| `PEXELS_API_KEY` | `pexels.com/api` |
| `PIXABAY_API_KEY` | `pixabay.com/api/docs` |
| `COVERR_API_KEY` | `coverr.co` (API) |

Any one is enough; with none, the scene pictures are used.

---

## 30. Your storage (S3-compatible)

**Status:** Optional. Your own bucket (Cloudflare R2, Amazon S3, Supabase Storage, Backblaze B2, Wasabi) for posts that need a public link (Instagram carousels, Reels through Instagram Login). The bucket stays private: Instagram gets a link that works for an hour, and the file is deleted once posted; leftovers older than a day are removed at start. Used only inside an already-approved post, so it has no approval of its own (`media_storage.rs`, `mediaStorageService.ts`).

**Credentials (Settings → Connectors → Content & Productivity → Your storage):** `STORAGE_ENDPOINT`, `STORAGE_REGION`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, and "The address includes the bucket in its path" (path-style). **Test** uploads, links and deletes a small file and says how each part went.

Without storage, such a post is saved in the project's `ready-to-post` folder with its caption and marked **Post by hand**.

---

## 31. ElevenLabs

**Status:** Paid, high risk. Voice-overs with one of your ElevenLabs voices (including clones), with ElevenLabs' own word timing for the captions, and sound effects (`elevenlabs.rs`, `elevenLabsConnector.ts`). Chosen per brand (Brands tab) or project; never chosen for you. Each run asks first with the cost, from your prices (Settings → Approvals → Allow paid models: per 1,000 characters, per sound effect). *Not checked with a real account yet.*

**Credentials:** `ELEVENLABS_API_KEY`. **Test** lists your voices.

---

## 32. Higgsfield

**Status:** Paid, high risk. Pictures, AI clips, character training and motion clips for Miya Studio, and one-off "Make a Higgsfield picture (or video) of …" requests from Chat, Telegram or the board (`higgsfield.rs`, `higgsfieldConnector.ts`). Everything goes through Higgsfield's own estimate first, asks with the cost, and is downloaded into your project, then deleted on Higgsfield. Something still being made is fetched by **Check again**, never run twice. *Not checked with a real account yet; the character and motion request fields come from third-party descriptions and need a live check.*

**Credentials and settings (Settings → Connectors → Content & Productivity → Higgsfield):**
| Field | Description |
|---|---|
| `HIGGSFIELD_KEY_ID`, `HIGGSFIELD_KEY_SECRET` | Your API key |
| Picture / clip / character training / motion model id | Pasted from the Higgsfield Console; no model list is built in |
| Extra settings (JSON) for each | Optional; must be a JSON object, and can't set the prompt or the input picture |

**Test picture / clip model** gives Higgsfield's estimate without making anything. **Open the Higgsfield Console** opens it in your browser.

## 33. Google Web Risk (link check)

**Status:** Optional, not paid for the first 100,000 checks a month (then $0.50 per 1,000, Google's price). Sentinel checks links against Google's phishing and malware lists (`web_risk.rs`, `sentinel/webRisk.ts`); only the address is sent, and answers are kept 30 minutes. Without a key, Sentinel's own exact checks still run. Google's free Safe Browsing API is for non-commercial use only, so it is not used.

**Credentials (Settings → Connectors → Search & Research):**
| Field | Description |
|---|---|
| `WEB_RISK_API_KEY` | A Google Cloud API key with the Web Risk API enabled |

---

## 34. OpenRouter

**Status:** Cloud model provider (2026-10-30, `openRouterConnector.ts`): one key for OpenRouter's free models, its paid models, and models served by your own provider keys added in OpenRouter. Free use passes Zero-Cost Mode like NVIDIA and Gemini; every paid or own-key OpenRouter model is a paid step that always asks first. Every call goes through the backend (`connector_openrouter_request`); no model id is written in the app, every list comes from OpenRouter.

**Credentials (Settings → Connectors → AI Models):**
| Field | Description |
|---|---|
| `OPENROUTER_API_KEY` | A key from `openrouter.ai/settings/keys` |

**Using it:** pick OpenRouter as a provider for any agent (Settings → Connectors → Agent Providers) or on Chat's provider tabs. The model list shows OpenRouter's free models only, with "Let OpenRouter choose a free model" first (the default); a free model you pick is checked once with a short question. Paid OpenRouter models are chosen in Settings → Approvals → Allow paid models: pick OpenRouter, then a model from the models your account can use; its prices fill in from OpenRouter. Every paid step asks first with its estimate and counts toward the monthly cap.

**When the free limit runs out:** a step carries on with this computer's model and says so on the board and in Chat (the default), or, with "Ask to use a paid model" in Settings → Approvals, Jose asks to finish it with a paid OpenRouter model, showing the cost. With no model on this computer, the step waits with Carry on. The 20-a-minute limit is not mistaken for the daily one: the step waits a moment and asks again. Chat used directly says the limit is reached and doesn't switch models by itself.

**How to test:** Test under the OpenRouter section, or the Connector Health Monitor: both read OpenRouter's key page and say how many free requests are left today (nothing is sent to a model).

**Your own keys:** add your Gemini, Anthropic, OpenAI or Mistral key in OpenRouter (Settings → Integrations there) to run those models through your one OpenRouter key. Checked live on 2026-10-30: Gemini and Mistral work; OpenRouter serves almost none of NVIDIA's own catalogue this way (keep the NVIDIA NIM connector for that); OpenRouter charges nothing for a request on your own key and reports the provider's price, which Alphonso counts toward your monthly cap.

**Known limitations:**
- Free models: 20 requests a minute, and 50 a day until you have bought $10 of OpenRouter credit in all (1,000 a day after that). One Jose request can use 10 to 30 model calls.
- Free models are run by other companies through OpenRouter; some may keep what you send.
