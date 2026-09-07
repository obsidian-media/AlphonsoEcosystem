# Alphonso Connectors Reference

All outbound connector calls run through `policyEnforcementService.js` before any external API is contacted. The gate fails closed: missing credentials, zero-cost mode, or unauthorized senders all result in a blocked result with an audit receipt. No raw stubs — every listed path is wired through the policy gate.

**Setup flow for every connector:**

> **Important:** Alphonso is a desktop app (Tauri). Environment variables in `.env` are NOT read by the running app — they only apply to the Railway gateway service. **All credentials must be entered through the in-app Connector Setup panel.** They are stored securely in localStorage/SQLite on your device.

1. Open the app → Settings → Connector Setup
2. Select the connector from the dropdown
3. Enter credentials in the credential input fields that appear below the connector status
4. Click **Save & Enable** — the connector is immediately activated
5. Verify the connector status dot turns green
6. Run a supervised test action (approval-gated) to confirm end-to-end connectivity
7. The connector stays `setup_required` until a verified test result is produced

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

## 3. WhatsApp — Twilio

**Status:** Outbound send + inbound polling wired.

**Required env vars:**
| Variable | Description |
|---|---|
| `WHATSAPP_PROVIDER` | Set to `twilio` |
| `WHATSAPP_TWILIO_ACCOUNT_SID` | Twilio account SID |
| `WHATSAPP_TWILIO_AUTH_TOKEN` | Twilio auth token |
| `WHATSAPP_TWILIO_FROM` | Your Twilio WhatsApp-enabled phone number |
| `WHATSAPP_ALLOWED_NUMBERS` | Allowlisted sender numbers |

**How to get credentials:**
1. Create a Twilio account at `twilio.com`
2. Enable WhatsApp on a Twilio number (Sandbox or production)
3. Copy Account SID and Auth Token from the Twilio Console dashboard
4. Set `WHATSAPP_TWILIO_FROM` to your Twilio WhatsApp number (e.g., `+14155238886`)

**How to test:**
- Connector Setup panel → supervised outbound send test
- Inbound: `connector_poll_whatsapp` command polls Twilio for inbound messages and routes to Jose

**Known limitations:**
- Twilio Sandbox requires recipients to opt in with a join keyword before receiving messages
- Full two-way sync not wired

**Setup docs:** `docs/WHATSAPP_BRIDGE_SETUP.md`, `docs/RAILWAY_WHATSAPP_GATEWAY.md`

---

## 4. YouTube

**Status:** Outbound upload wired (YouTube Data API v3). Inbound webhooks not wired.

**Required env vars:**
| Variable | Description |
|---|---|
| `YOUTUBE_CLIENT_ID` | OAuth client ID from Google Cloud Console |
| `YOUTUBE_CLIENT_SECRET` | OAuth client secret |
| `YOUTUBE_REFRESH_TOKEN` | Long-lived refresh token (obtained via OAuth flow) |
| `YOUTUBE_CHANNEL_ID` | Target YouTube channel ID |

**How to get credentials:**
1. Go to `console.cloud.google.com` → APIs & Services → Credentials
2. Create an OAuth 2.0 Client ID (Desktop application type)
3. Enable the YouTube Data API v3 for your project
4. Run `npm run auth:youtube` to complete the OAuth flow and capture the refresh token
5. Copy the channel ID from your YouTube channel URL

**How to test:**
- Requires a short local video file
- Connector Setup panel → supervised upload test (approval-gated)
- Successful upload returns `videoId` and a `youtube.com/watch?v=<id>` URL

**Known limitations:**
- Uploads are approval-gated (supervised/manual — not autonomous posting)
- Upload progress callbacks and chunked resume not wired
- Inbound event ingestion not wired

**Setup doc:** `docs/YOUTUBE_CONNECTOR_SETUP.md`

---

## 5. Claude (Anthropic)

**Status:** Outbound prompt exchange wired. Runs through `connector_send_claude` Rust command.

**Required env vars:**
| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | API key from `console.anthropic.com` |
| `CLAUDE_CONNECTOR_MODEL` | Optional; default `claude-3-5-sonnet-latest` |

**How to get credentials:**
1. Sign up / log in at `console.anthropic.com`
2. Go to API Keys → Create Key
3. Copy the key → `ANTHROPIC_API_KEY`

**How to test:**
- Connector Setup panel → verify env key is present
- Send a prompt through the Claude connector path in the app
- Response returns a supervised connector proof: `{ ok, external_id, target, error }`

**Known limitations:**
- Blocked by default in zero-cost mode (`policyEnforcementService.js`)
- Inbound webhooks not wired
- Auto-sync of responses into Jose task decomposition not wired

**Setup doc:** `docs/CHATGPT_CLAUDE_CONNECTORS_SETUP.md`

---

## 6. ChatGPT (OpenAI)

**Status:** Outbound prompt exchange wired. Runs through `connector_send_chatgpt` Rust command.

**Required env vars:**
| Variable | Description |
|---|---|
| `OPENAI_API_KEY` | API key from `platform.openai.com` |
| `OPENAI_CONNECTOR_MODEL` | Optional; default `gpt-4.1-mini` |

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

**Status:** Outbound video queue wired via `connector_queue_comfyui`. Local service required.

**Required env vars:**
| Variable | Description |
|---|---|
| `COMFYUI_ENDPOINT` | Default: `http://127.0.0.1:8188` |

**How to get credentials:** No cloud credentials needed — local service only.

**How to start ComfyUI:**
1. Install ComfyUI from its GitHub repo
2. Start with `python main.py` (or the provided launcher)
3. Verify `http://127.0.0.1:8188` is reachable

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

**Status:** Outbound publish wired via `metaPublishService.js` and `connector_send_meta` (Marcus-governed). Inbound not wired.

**Required env vars:**
| Variable | Description |
|---|---|
| `META_ACCESS_TOKEN` | Long-lived page/system user token from Meta for Developers |
| `META_APP_ID` | Meta app ID |
| `META_APP_SECRET` | Meta app secret |
| `META_PAGE_ID` | Facebook Page ID |
| `INSTAGRAM_BUSINESS_ACCOUNT_ID` | Instagram Business Account ID linked to the Page |
| `META_GRAPH_API_VERSION` | Default: `v20.0` |

**How to get credentials:**
1. Create a Meta for Developers app at `developers.facebook.com`
2. Add Instagram and Facebook Pages products
3. Run `npm run auth:meta` to complete the OAuth flow and exchange for a long-lived token
4. Find `META_PAGE_ID` in your Facebook Page settings
5. Find `INSTAGRAM_BUSINESS_ACCOUNT_ID` via Graph API: `GET /{page-id}?fields=instagram_business_account`

**How to test:**
- All Meta/Instagram publish actions are Marcus-governed (require explicit approval)
- Connector Setup panel → verify env keys
- Submit a publish action; it will require approval before reaching the API

**Known limitations:**
- All publishing is approval-gated and requires Marcus to be the executing agent
- Inbound webhooks not wired
- `META_APP_SECRET` must never appear in the frontend — backend-only

**Setup doc:** `docs/EXTERNAL_CONNECTOR_SETUP.md`

---

## 12. Runway (Miya creative cloud draft)

**Status:** Cloud video draft wired via Tauri backend. Backend-only secret.

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
- Text-to-video only (default)
- Outputs are ephemeral until saved locally
- Missing secret shows as `setup_required` in Miya Studio
- Secret must remain in `.env` — never exposed in the frontend WebView

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

**Status:** Two integration paths — a REST connector (form-driven, single call) and a conversational MCP flow (chat-driven, clarifying-question loop). Both real outbound phone calls, unconditionally high-risk/paid.

**Required env vars (REST):**
| Variable | Description |
|---|---|
| `CALLE_API_KEY` | API key from `dashboard.heycall-e.com/account/api-keys` |

**MCP path:** no static API key — a separate brokered OAuth login via Settings → Connectors → CALL-E → "Connect via Browser Login" (`calleMcpAuthService.ts`; no loopback server, poll-based session exchange against `seleven-mcp-sg.airudder.com`).

**How to get credentials (REST):**
1. Sign up at `heycall-e.com`
2. Go to the dashboard → API Keys → copy your key → `CALLE_API_KEY`

**How to test:**
- REST: `CalleOutreachPanel.tsx` (not yet wired into app navigation, pending the in-progress UI redesign) — draft a call, approve, `createCall`/`pollCallUntilTerminal` places and tracks it
- MCP: type a message starting with "call"/"phone"/"ring"/"dial" in ChatView; `plan_call` asks clarifying questions until ready, then a real button click (not typed text) approves `run_call`

**Known limitations:**
- Real cost (~$0.05/call per CALL-E's pricing) and a real phone rings — both paths are unconditionally high-risk in `policyEnforcementService.ts`
- `run_call` (MCP) has **no idempotency key** — a durable `submitting` stage in `calleMcpOutreachService.ts` blocks resubmission after any failure, but cannot itself guarantee exactly-once delivery
- No real call has been placed by either path as of this writing (live-verified via safe read-only/planning-only calls only — see `docs/TRUTH_FIRST_EXECUTION_PLAN.md`'s J3 entry)

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

**Status:** Frontend-only (`hectorResearchService.js`'s `searchBrave`/`isBraveSearchConfigured`), used as Hector's primary web-search provider.

**Required env vars:**
| Variable | Description |
|---|---|
| `BRAVE_SEARCH_API_KEY` | API key from `search.brave.com/register` |

**How to get credentials:**
1. Sign up at `search.brave.com/register` (free tier: 2,000 queries/month)
2. Copy the API key → `BRAVE_SEARCH_API_KEY`

**How to test:**
- Connector Setup panel → verify key is present
- Ask Hector a research question; without this key it silently falls back to DuckDuckGo HTML scraping instead

**Known limitations:**
- Without a key, Hector's fallback (DuckDuckGo scraping) is noticeably lower quality — this key is a strong recommendation, not just a nice-to-have

---

## 22. Perplexity

**Status:** Connector registered (`perplexityConnector.ts` — `isPerplexityConfigured`, `searchPerplexity`) and listed in the Connectors status panel, **but has no credential-entry UI** in `ConnectorSetupPanel.tsx` as of this writing — grepped and confirmed absent, not assumed. There is currently no in-app way to actually save `PERPLEXITY_API_KEY`.

**Required env vars:**
| Variable | Description |
|---|---|
| `PERPLEXITY_API_KEY` | API key from `perplexity.ai` (no in-app save path yet — see below) |

**Known limitations:**
- **Real, current gap, not a doc omission**: no `CredentialSection` for Perplexity exists in `ConnectorSetupPanel.tsx`, so this connector cannot be configured through the UI at all right now, only via a raw OS environment variable (which the app does not read either — see this doc's top-level "Important" note on `.env` not being read). Logged in `docs/governance/DEFERRED_WORK.md`.

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
