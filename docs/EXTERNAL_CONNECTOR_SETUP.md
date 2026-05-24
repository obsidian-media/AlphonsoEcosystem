# Alphonso External Connector Setup

Status: this documents the real connector setup path. Nothing is marked live unless env verification, approval gating, and a verified test action exist.

## Truth rules

- Do not expose secrets.
- Keep credentials in `.env` or the OS environment only.
- Treat `setup_required` as honest until a real provider test succeeds.
- Keep outbound sends and uploads approval-gated.
- Do not claim hosted webhook completion until the public callback endpoint has been deployed and tested.

## Connector setup checklist

### Telegram

- Required env:
  - `TELEGRAM_BOT_TOKEN`
  - `TELEGRAM_ALLOWED_CHAT_IDS`
- Set allowlist IDs for the exact chats/users that may send commands.
- Verify env in the Connector Setup panel.
- Run a supervised poll/send test.
- Keep unauthorized senders blocked.

### WhatsApp

- Required env:
  - `WHATSAPP_PROVIDER`
  - `WHATSAPP_ALLOWED_NUMBERS`
- Cloud API mode:
  - `WHATSAPP_ACCESS_TOKEN`
  - `WHATSAPP_PHONE_NUMBER_ID`
  - `WHATSAPP_VERIFY_TOKEN`
- Twilio mode:
  - `WHATSAPP_TWILIO_ACCOUNT_SID`
  - `WHATSAPP_TWILIO_AUTH_TOKEN`
  - `WHATSAPP_TWILIO_FROM`
- Verify env, then test the outbound send path.
- Cloud inbound webhook remains `setup_required` until hosted verification + signature validation are deployed.

### Railway-hosted WhatsApp gateway

- Deploy `gateway/whatsapp-cloud` as the Railway service.
- Use the service config at `gateway/whatsapp-cloud/railway.json`.
- Set the service root directory to `/gateway/whatsapp-cloud`.
- Confirm `/health` returns `200` before wiring the public callback URL.
- Keep the gateway `setup_required` until the verify challenge, signature validation, and forward path all pass in the hosted environment.

### YouTube

- Required env:
  - `YOUTUBE_CLIENT_ID`
  - `YOUTUBE_CLIENT_SECRET`
  - `YOUTUBE_REFRESH_TOKEN`
  - `YOUTUBE_CHANNEL_ID`
- Uploads remain approval-gated.
- Verify env, then run a supervised upload test with a local file.

### Notion

- Required env:
  - `NOTION_API_KEY`
  - `NOTION_PARENT_PAGE_ID`
- Verify env, then run a supervised write test.

### ClickUp

- Required env:
  - `CLICKUP_API_KEY`
  - `CLICKUP_LIST_ID`
- Verify env, then run a supervised task creation test.

### Slack / Discord / Custom webhook connections

- Managed in the Tool Connections panel.
- Configure:
  - webhook URL
  - label
  - message prefix
  - payload template for custom webhook only
- Keep the connection inactive until the URL is valid and a test send succeeds.
- Approval is required before external delivery.

### Local SD WebUI

- Default local endpoint: `http://127.0.0.1:7860`
- Verify the local runtime is reachable before relying on the connector.
- No secret env values are required.

### Local ComfyUI

- Default local endpoint: `http://127.0.0.1:8188`
- Verify the local runtime and workflow JSON before relying on the connector.
- No secret env values are required.

## Recommended execution order

1. Configure env variables.
2. Verify environment presence in the Connector Setup panel.
3. Confirm allowlist/auth profiles.
4. Run a local supervised test.
5. Keep the connector `setup_required` until the test result is verified.

## Remaining external blockers

- WhatsApp hosted Cloud inbound webhook.
- Any connector with missing env vars.
- Any webhook connection without a valid URL.
- Any connector test that has not produced a verified result.
