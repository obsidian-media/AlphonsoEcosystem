# Credential Rotation Checklist

> Rotate ALL of the following if `.env` was ever committed to git history,
> or if you suspect any of these values may have been exposed.
> **Check git history** with: `git log --all --full-history -- .env`
> and `git grep -i "token\|secret\|key\|password" $(git rev-list --all)`

---

## Variables to Rotate

### Alphonso Bridge
- `ALPHONSO_BRIDGE_TOKEN`

### Telegram
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_ALLOWED_CHAT_IDS` *(verify these are not real user IDs)*

### WhatsApp
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_ALLOWED_NUMBERS` *(verify no real personal phone numbers)*
- `WHATSAPP_TWILIO_ACCOUNT_SID`
- `WHATSAPP_TWILIO_AUTH_TOKEN`
- `WHATSAPP_TWILIO_FROM`

### YouTube (OAuth)
- `YOUTUBE_CLIENT_ID`
- `YOUTUBE_CLIENT_SECRET`
- `YOUTUBE_REFRESH_TOKEN`

### Meta / Facebook / Instagram
- `META_ACCESS_TOKEN`
- `META_APP_ID`
- `META_APP_SECRET`
- `META_PAGE_ID`
- `INSTAGRAM_BUSINESS_ACCOUNT_ID`

### AI Provider APIs
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`

### Productivity Connectors
- `NOTION_API_KEY`
- `NOTION_PARENT_PAGE_ID`
- `CLICKUP_API_KEY`
- `CLICKUP_LIST_ID`

### Media Generation
- `RUNWAYML_API_SECRET`

### Tauri Updater Signing
- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

---

## How to Rotate Each Credential

### Telegram Bot Token
1. Message `@BotFather` on Telegram.
2. Send `/mybots` → select your bot → `API Token` → `Revoke current token`.
3. Copy the new token into your `.env` file.

### WhatsApp (Meta Cloud API)
1. Go to [Meta Developer Console](https://developers.facebook.com/) → your app → WhatsApp → API Setup.
2. Generate a new System User access token with the same permissions.
3. Revoke the old token.
4. Update `WHATSAPP_ACCESS_TOKEN` in `.env`.

### WhatsApp (Twilio)
1. Log in to [Twilio Console](https://console.twilio.com/).
2. Navigate to Account → API Keys & Tokens.
3. Create a new Auth Token / API Key pair.
4. Revoke the old credentials.
5. Update `WHATSAPP_TWILIO_ACCOUNT_SID` and `WHATSAPP_TWILIO_AUTH_TOKEN` in `.env`.

### YouTube OAuth
1. Go to [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials.
2. Find the OAuth 2.0 Client → delete and recreate, or revoke the refresh token in [Google Account Permissions](https://myaccount.google.com/permissions).
3. Re-run the OAuth flow to obtain a fresh `YOUTUBE_REFRESH_TOKEN`.

### Meta / Facebook / Instagram
1. Go to [Meta Developer Console](https://developers.facebook.com/) → Tools → Graph API Explorer.
2. Generate a new long-lived Page Access Token.
3. Revoke the old `META_ACCESS_TOKEN`.
4. If `META_APP_SECRET` was exposed, go to App Settings → Basic → Reset App Secret.

### OpenAI API Key
1. Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys).
2. Delete the compromised key.
3. Create a new key and update `OPENAI_API_KEY` in `.env`.

### Anthropic API Key
1. Go to [console.anthropic.com](https://console.anthropic.com/) → API Keys.
2. Delete the compromised key.
3. Create a new key and update `ANTHROPIC_API_KEY` in `.env`.

### Notion API Key
1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations).
2. Select your integration → Secrets → Show → Reset.
3. Update `NOTION_API_KEY` in `.env`.

### ClickUp API Key
1. Go to ClickUp → Settings → Apps → API Token.
2. Click `Regenerate` to invalidate the old token.
3. Update `CLICKUP_API_KEY` in `.env`.

### RunwayML API Secret
1. Log in to [RunwayML](https://app.runwayml.com/) → Account → API.
2. Revoke the old key and generate a new one.
3. Update `RUNWAYML_API_SECRET` in `.env`.

### Tauri Updater Signing Key
1. Generate a new keypair: `npx @tauri-apps/cli signer generate`
2. Update `plugins.updater.pubkey` in `src-tauri/tauri.conf.json` with the new **public** key.
3. Store the new **private** key value in `TAURI_SIGNING_PRIVATE_KEY` in `.env` only.
4. Delete any old `.tauri-updater-key` or `.tauri-updater-key.pub` files locally.
5. Rebuild and re-sign all release artifacts.

---

## After Rotation

- [ ] Update `.env` with all new values on every machine/server that uses this project.
- [ ] Verify new credentials work in dev before deploying.
- [ ] If Railway or any other server environment uses these vars, update them in the Railway dashboard.
- [ ] Consider enabling audit logs / token usage alerts where the provider supports it.
- [ ] Document the rotation date in this file or an incident log.

---

*Last updated: 2026-05-31*
