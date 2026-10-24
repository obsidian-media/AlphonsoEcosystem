# Telegram Bridge Setup

Status: live polling + outbound send are wired (desktop runtime bridge), with allowlist pairing and audit logs. Every message goes through Jose. Checked live with the owner's bot on 2026-10-23.

Security rules:

- Enter keys in **Settings → Connectors**. They are kept in your system's keychain, never in localStorage, backups or exports. A variable in the app's environment still works as a fallback; a `.env` file is read only in development runs.
- Do not commit credentials.
- `TELEGRAM_BOT_TOKEN` and `TELEGRAM_ALLOWED_CHAT_IDS` (required to pair: the first `/start` only pairs a chat on that list).
- Unauthorized chat IDs are rejected and logged without printing secrets.

What it does:

1. **Messages:** free text, `/ask` and `/research` go to Jose, who answers or plans (and replies "Jose is on it" at once). There are 21 commands; `/help` lists them.
2. **Approvals while you're away:** Jose sends your paired chat a note when a step waits for you (**Approve** / **Reject**, with the cost for a paid step), when a plan waits (**Run this plan** / **Cancel**), when a request finishes or fails, when a review asks you to decide, and when a request was cut off (**Carry on**). Pressing a button twice runs it once; an old button says "That button has expired."
3. **Miya Studio:** a daily summary of posts that reached 7 days, with their lessons to **Keep** or **Drop**, and new ideas with **Start project** / **Dismiss**; reminders for posts to make by hand; sign-in warnings.
4. **Higgsfield by name:** "Make a Higgsfield picture of …" asks with the cost and sends the result (or its folder, over 50 MB).
5. Settings → Approvals → **Jose on Telegram** switches each kind of message on or off; the older "N agent actions since your last check" summaries are off unless you turn them on.

Implementation notes:

- Polling asks for `message` and `callback_query`; `connector_send_telegram` sends text and buttons (callback data at most 64 bytes); `connector_answer_telegram_callback` answers a press; `connector_send_telegram_file` sends pictures, videos or documents.
- Webhook mode is not wired (the desktop app polls).
