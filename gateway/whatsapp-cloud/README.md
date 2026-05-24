# WhatsApp Cloud Gateway

This package is a deployable inbound gateway for WhatsApp Cloud webhook traffic.

It is intentionally setup-required until it is actually hosted, verified by Meta, and forwarding to Alphonso's local or remote ingress endpoint.

## What it does

- answers the Meta verify-token challenge
- validates inbound signatures
- normalizes inbound messages
- checks allowlists before forwarding
- forwards normalized packets to Alphonso/Jose endpoints
- keeps logging secret-safe
- exposes a health endpoint
- enforces a per-client webhook rate limit
- caps inbound webhook bodies before JSON parsing

## Run locally

```powershell
cd gateway/whatsapp-cloud
npm.cmd start
```

## Deploy targets

This package is suitable for Railway, Render, or a small VPS deployment.

## Railway service

- Root directory: `/gateway/whatsapp-cloud`
- Config file: `railway.json`
- Start command: `npm start`
- Healthcheck path: `/health`

See [`../../docs/RAILWAY_WHATSAPP_GATEWAY.md`](../../docs/RAILWAY_WHATSAPP_GATEWAY.md) for the full deployment checklist.

## Setup-required until hosted

- public webhook URL
- Meta callback verification
- signature validation with the configured app secret
- forwarding target confirmation
- confirmed rate-limit and body-size settings for the hosted environment
