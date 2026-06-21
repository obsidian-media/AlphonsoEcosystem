# Alphonso Connectors Reference

All outbound connector calls run through `policyEnforcementService.js` before any external API is contacted. The gate fails closed: missing credentials, zero-cost mode, or unauthorized senders all result in a blocked result with an audit receipt. No raw stubs — every listed path is wired through the policy gate.

**Setup flow for every connector:**
1. Add the required env vars to `.env` (copy from `.env.example`)
2. Verify presence in the Connector Setup panel inside the app
3. Confirm allowlist / auth profiles
4. Run a supervised test action (approval-gated)
5. The connector stays `setup_required` until a verified test result is produced

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

## Runway (Miya creative cloud draft)

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
