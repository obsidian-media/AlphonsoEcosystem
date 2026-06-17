# Remaining Setup-Required Items

This file lists items that are intentionally **not** marked complete without external setup proof.

## 1) Connector credentials + authorization profiles
- Telegram bot token + allowed chat IDs
- WhatsApp Cloud/Twilio credentials + allowed IDs
- YouTube OAuth credentials
- Notion / ClickUp tokens and destination IDs
- Optional paid providers (ChatGPT / Claude) if explicitly enabled

## 2) WhatsApp Cloud inbound hosting
- Public webhook endpoint
- Verify token challenge handling
- Signature validation in hosted environment
- Inbound event normalization is implemented locally; hosting is still required.

## 3) Auto-update release signing pipeline
- Key generation/rotation policy
- Signed manifest hosting endpoint
- Release artifact upload + manifest publication automation
- In-app check path exists, but full signed release ops are setup-dependent.

## 4) Durable memory schema evolution
- Governance metadata is carried in content envelope.
- Dedicated SQLite columns for workflow/sensitivity/retention/privacy are not yet migrated.

## 5) OCR/screen intelligence productionization
- Foundation exists.
- Full supervised production pipeline (capture permissions, filtering, pattern engine, alerts) remains partial.

## 6) Live external publish/engagement
- Marcus execution paths remain approval-gated.
- No external publish path should be considered production-live until connector/auth setup is verified.

