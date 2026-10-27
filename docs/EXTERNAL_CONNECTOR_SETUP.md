# Alphonso External Connector Setup

Status: this documents the real connector setup path for the most-used external connectors; [CONNECTORS.md](CONNECTORS.md) covers all 34. Nothing is "live" until the Connector Health Monitor's **Test** says "Live check passed" (the service itself answered) or a supervised action succeeded.

## Truth rules

- Do not expose secrets.
- Enter credentials in **Settings → Connectors**; they are kept in the system keychain. A variable in the app's own environment still works as a fallback; a `.env` file is read only in development runs.
- "Key found" is not "working": only a live check or a real action counts.
- Publishing and sending always ask first; spending always asks first.
- Do not claim hosted webhook completion until the public callback endpoint has been deployed and tested.

## Connector setup checklist

### Telegram

- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_CHAT_IDS` (required to pair)
- Send `/start` from an allowed chat, then use **Test**. See [TELEGRAM_BRIDGE_SETUP.md](TELEGRAM_BRIDGE_SETUP.md).

### WhatsApp (Meta Cloud API only)

- `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_CLOUD_GATEWAY_DRAIN_URL`, `WHATSAPP_ALLOWED_NUMBERS`
- Twilio is not supported (removed 2026-10-21).
- Inbound needs the hosted gateway below.

### Railway-hosted WhatsApp gateway

- Deploy `gateway/whatsapp-cloud` (root `/gateway/whatsapp-cloud`, config `railway.json`).
- Confirm `/health` returns `200`, then point Meta's webhook at `https://<your-url>/webhook`.
- See [RAILWAY_WHATSAPP_GATEWAY.md](RAILWAY_WHATSAPP_GATEWAY.md).

### YouTube

- `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, then **Sign in to YouTube** (saves `YOUTUBE_REFRESH_TOKEN`); `YOUTUBE_CHANNEL_ID`
- See [YOUTUBE_CONNECTOR_SETUP.md](YOUTUBE_CONNECTOR_SETUP.md).

### Meta (Facebook and Instagram)

- `META_APP_ID`, `META_APP_SECRET`, then **Sign in to Facebook** and choose your Page; or `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET` and **Sign in with Instagram** for an Instagram account without a Page.
- Optional: **Your storage** (an S3-compatible bucket) for Instagram carousels; without it they are saved to post by hand.
- See [CONNECTORS.md](CONNECTORS.md#11-meta--instagram).

### Notion / ClickUp

- `NOTION_API_KEY`, `NOTION_PARENT_PAGE_ID`; `CLICKUP_API_KEY`, `CLICKUP_LIST_ID`
- See [NOTION_CLICKUP_CONNECTORS_SETUP.md](NOTION_CLICKUP_CONNECTORS_SETUP.md).

### Slack / Discord / Custom webhook connections

- Slack and Discord have their own connectors (bot tokens); the Tool Connections panel also manages simple webhook URLs (label, message prefix, payload template for custom webhooks).
- Keep a connection inactive until the URL is valid and a test send succeeds. Sending asks first.

### Local SD WebUI

- Default local endpoint: `http://127.0.0.1:7860`. No secret needed. Standalone: the agents make images with ComfyUI.

### Local ComfyUI

- Settings → Runtime → ComfyUI: your install (found automatically, or **Search this computer**), its address (default `http://127.0.0.1:8188`) and image model. The desktop app talks to it through its backend. No secret needed.

### Paid media (optional)

- Runway (`RUNWAYML_API_SECRET`), ElevenLabs (`ELEVENLABS_API_KEY`), Higgsfield (`HIGGSFIELD_KEY_ID`, `HIGGSFIELD_KEY_SECRET` and the model ids). Enter your prices in Settings → Approvals → Allow paid models.

## Recommended execution order

1. Enter the credentials in Settings → Connectors.
2. **Test** each one in the Connector Health Monitor.
3. Confirm allowlists (Telegram, WhatsApp).
4. Run one supervised action.

## Remaining external blockers

- None of the publishing, results or paid-media connectors have been checked with a real account yet (see the live check in [qa/DESKTOP_QA_COVERAGE.md](qa/DESKTOP_QA_COVERAGE.md)).
- Any connector with missing credentials, and any webhook connection without a valid URL.
