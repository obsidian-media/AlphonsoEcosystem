# WhatsApp Bridge Setup

Status: Meta Cloud API only. Outbound send and inbound polling (through the hosted gateway's queue) are wired, with owner pairing and audit logs. Every message goes through Jose. Twilio support was removed on 2026-10-21.

Blocked:

- Unofficial account scraping.
- Browser automation against a personal WhatsApp session.
- Silent file uploads.
- Hardcoded tokens.

Credentials (Settings → Connectors → WhatsApp; kept in the system keychain):

- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_CLOUD_GATEWAY_DRAIN_URL` — `https://<your-gateway>/queue/drain`
- `WHATSAPP_ALLOWED_NUMBERS` — digits only; required to pair

Flow:

1. Meta sends the inbound message to the gateway (`gateway/whatsapp-cloud`), which checks the signature and the allowlist and queues it.
2. Alphonso drains the queue (with a lease, so a failed poll doesn't lose messages; acknowledged through `POST /queue/ack`).
3. The message goes to Jose, who answers or plans it; WhatsApp gets "Jose is on it", and one line when the request ends.
4. Steps that publish, send or spend wait for your approval (in the app, or on Telegram if paired).

Commands: `/status`, `/queue`, `/approve`, `/reject`, `/agents`, `/report`, `/ping`, `/help`, `/ask`.

The companion starts by itself at launch when the access token and drain URL are saved.
