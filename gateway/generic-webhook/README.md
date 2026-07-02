# Alphonso Generic Webhook Gateway

A minimal, provider-agnostic inbound webhook receiver. Lets any external
service push events into Alphonso without a bespoke connector — deploy this
once, give each external service its own `sourceId` path and the shared
secret, and Alphonso drains queued events on a poll interval, the same way
the WhatsApp Cloud gateway (`gateway/whatsapp-cloud/`) works.

## Endpoints

- `POST /webhook/:sourceId` — any external service posts JSON here. Requires
  the shared secret via `Authorization: Bearer <token>`, `X-Webhook-Token`
  header, or `?token=` query param.
- `GET /queue/drain?limit=100` — Alphonso polls this to pull queued events.
  Requires `ALPHONSO_DRAIN_TOKEN` (falls back to `WEBHOOK_SHARED_SECRET` if
  unset).
- `GET /health` — liveness check, no auth required.

## Local development

```bash
cd gateway/generic-webhook
cp .env.example .env   # fill in WEBHOOK_SHARED_SECRET
npm start
```

## Deploy to Railway

This directory is a self-contained Railway service (`railway.json` +
`Dockerfile`). Set `WEBHOOK_SHARED_SECRET` (and optionally
`ALPHONSO_DRAIN_TOKEN`) in the Railway dashboard, then point any external
service's webhook config at `https://<your-railway-url>/webhook/<sourceId>`.

## Alphonso-side configuration

In Alphonso, Settings → Connectors → Generic Webhook, set:

- `GENERIC_WEBHOOK_DRAIN_URL` — `https://<your-railway-url>/queue/drain`
- `GENERIC_WEBHOOK_TOKEN` — same token as `ALPHONSO_DRAIN_TOKEN` (or
  `WEBHOOK_SHARED_SECRET` if you didn't set a separate drain token)

See `src/services/genericWebhookService.js` for the polling implementation.
