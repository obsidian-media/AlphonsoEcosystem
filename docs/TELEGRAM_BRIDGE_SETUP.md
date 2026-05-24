# Telegram Bridge Setup

Status: live polling + outbound send is wired in this build (desktop runtime bridge), with Jose routing + allowlist auth + audit logs.

Security rules:

- Store `TELEGRAM_BOT_TOKEN` in `.env` only.
- Store `TELEGRAM_ALLOWED_CHAT_IDS` in `.env` only.
- Do not commit real tokens.
- Route every inbound message to Jose first.
- Require approval for file/system commands, uploads, posting, deploys, purchases, deletion, or external account actions.
- Log rejected unauthorized chat IDs without printing secrets.

Intended flow:

1. Telegram receives an inbound message.
2. Bridge validates the chat/user ID.
3. Bridge creates a local connector route packet.
4. Jose decides the target agent.
5. Risky requests remain in the Approval Center.
6. Approved safe results may be returned to Telegram.

Current implementation:

- Connector status UI exists.
- Local route packet simulation exists.
- Live Bot API poll command exists (`connector_poll_telegram`) and routes inbound text to Jose through connector packets.
- Poll processing now also creates a real Jose command route (`createJoseCommandRoute`) so one inbound Telegram command is decomposed into agent assignments (Miya/Alphonso/Hector/Jose) in the local command ledger.
- Failed Jose-distribution attempts are retried and then moved to dead-letter after retry limit.
- Live Bot API send command exists (`connector_send_telegram`) for supervised outbound replies.
- Unauthorized senders are rejected by allowlist profile and logged to connector audit.
- Webhook mode is still not wired (desktop app uses polling path).
