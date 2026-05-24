# Railway WhatsApp Gateway Setup

This is the hosted service for the Alphonso WhatsApp Cloud gateway.
It is still truthfully setup_required until the env vars, callback URL, and webhook proof are live.

## Service

- Service root directory: `/gateway/whatsapp-cloud`
- Railway config: `gateway/whatsapp-cloud/railway.json`
- Start command: `npm start`
- Healthcheck path: `/health`

## Required env vars

- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_APP_SECRET`
- `ALPHONSO_FORWARD_URL`
- `WHATSAPP_ALLOWLIST` or `ALPHONSO_FORWARD_ALLOWLIST`
- `WHATSAPP_RATE_WINDOW_MS` and `WHATSAPP_RATE_MAX_REQUESTS` if you want custom limits
- `WHATSAPP_MAX_WEBHOOK_BODY_BYTES` if you want a custom payload cap

## Twilio mode

- `WHATSAPP_PROVIDER=twilio`
- `WHATSAPP_TWILIO_ACCOUNT_SID`
- `WHATSAPP_TWILIO_AUTH_TOKEN`
- `WHATSAPP_TWILIO_FROM`
- `WHATSAPP_ALLOWED_NUMBERS`

## Cloud API mode

- `WHATSAPP_PROVIDER=cloud`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_ALLOWED_NUMBERS`

## Deployment truth

- `/health` should return `200`
- `/webhook` must answer the Meta verify challenge
- signature validation must pass
- forwarded packets must hit Alphonso/Jose successfully
- keep the service setup_required until the test action is verified

