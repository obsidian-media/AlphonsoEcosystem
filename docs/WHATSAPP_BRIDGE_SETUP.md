# WhatsApp Bridge Setup

Status: official outbound send path is wired in this build (Meta Cloud API or Twilio). Inbound pull path is wired for Twilio provider; Cloud API inbound still requires webhook wiring.

Allowed transport options:

- WhatsApp Cloud API.
- Twilio WhatsApp.
- A documented webhook adapter using approved provider credentials.

Blocked:

- Unofficial account scraping.
- Browser automation against a personal WhatsApp session.
- Silent file uploads.
- Hardcoded tokens.

Required environment names:

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

Intended flow:

1. Provider webhook receives inbound message.
2. Bridge validates provider signature and allowed sender.
3. Bridge creates a local connector route packet.
4. Jose routes to Hector, Miya, or Alphonso.
5. Risky actions require visible approval.
6. Response formatting is provider-specific.

Current implementation:

- Connector status UI exists.
- Local route packet simulation exists.
- Official outbound send command exists (`connector_send_whatsapp`):
  - Meta Cloud API path using `WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID`
  - Twilio path using `WHATSAPP_TWILIO_ACCOUNT_SID` + `WHATSAPP_TWILIO_AUTH_TOKEN` + `WHATSAPP_TWILIO_FROM`
- Twilio inbound polling command exists (`connector_poll_whatsapp`) and routes inbound text to Jose through supervised connector packets.
- Cloud API verification helpers now exist in Tauri runtime:
  - `verify_whatsapp_cloud_webhook_challenge`
  - `verify_whatsapp_cloud_webhook_signature`
  - `normalize_whatsapp_cloud_inbound`
- Connector Setup panel includes a supervised Cloud API webhook simulation path to test:
  - challenge token handling
  - signature validation
  - inbound payload normalization + Jose routing
- Public hosted webhook endpoint is still setup-required for live Meta callback delivery.
