# Railway WhatsApp Gateway Setup

This is the hosted service for the Alphonso WhatsApp Cloud gateway (`gateway/whatsapp-cloud`). Each owner deploys their own; it stays setup_required until its environment, callback URL and webhook proof are live.

## Service

- Service root directory: `/gateway/whatsapp-cloud`
- Railway config: `gateway/whatsapp-cloud/railway.json`
- Start command: `npm start`
- Healthcheck path: `/health`

## Environment

- `WHATSAPP_VERIFY_TOKEN` — the same value as in the app
- `WHATSAPP_APP_SECRET` — for signature checks
- `WHATSAPP_ALLOWED_NUMBERS` or `WHATSAPP_ALLOWLIST` — digits only
- `ALPHONSO_DRAIN_TOKEN` — the token Alphonso sends to `GET /queue/drain` (Bearer header only); falls back to the verify token
- Optional: `QUEUE_LEASE_MS` (default 60 s), `WHATSAPP_RATE_WINDOW_MS`, `WHATSAPP_RATE_MAX_REQUESTS`, `WHATSAPP_MAX_WEBHOOK_BODY_BYTES`
- Optional: `ALPHONSO_FORWARD_URL`, `ALPHONSO_FORWARD_ALLOWLIST`, `FORWARD_TIMEOUT_MS` (forwarding is not needed; Alphonso drains the queue)

Twilio mode was removed on 2026-10-21; the gateway is Meta Cloud API only.

## Deployment truth

- `/health` should return `200`
- `/webhook` must answer the Meta verify challenge
- signature validation must pass
- the app's drain must receive the test message
- the queue is in memory: a restart drops anything not yet drained
