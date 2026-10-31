# Notion + ClickUp Connector Setup

Status: outbound write flow is wired with supervised runtime commands and connector audit logs.

## Security rules

- Enter keys in **Settings → Connectors**. They are kept in your system's keychain, never in localStorage, backups or exports. A variable in the app's environment still works as a fallback; a `.env` file is read only in development runs.
- Do not commit credentials.
- Writes to Notion or ClickUp are steps that ask according to Settings → General → What asks first.

## Credentials (Settings → Connectors → Content & Productivity)

### Notion

- `NOTION_API_KEY`
- `NOTION_PARENT_PAGE_ID`

### ClickUp

- `CLICKUP_API_KEY`
- `CLICKUP_LIST_ID`

## What is wired now

- Notion outbound create-page action via `connector_send_notion`.
- ClickUp outbound create-task action via `connector_send_clickup`.
- Connector audit entries are appended for success/failure.
- Since 2026-10-21 a key saved in Settings is used (before, these commands needed an environment variable).

## What is not wired yet

- Notion inbound webhooks.
- ClickUp inbound webhooks.
- Full two-way sync and conflict resolution.
