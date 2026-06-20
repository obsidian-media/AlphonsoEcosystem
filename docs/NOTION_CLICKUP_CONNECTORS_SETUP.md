# Notion + ClickUp Connector Setup

Status: outbound write flow is wired in this build with supervised local runtime commands and connector audit logs.

## Security rules

- Keep all credentials in `.env` only.
- Do not commit real keys/tokens.
- Route risky actions through Jose approvals.
- Treat external posting/upload/write as supervised actions.

## Required environment variables

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

## What is not wired yet

- Notion inbound webhooks.
- ClickUp inbound webhooks.
- Full two-way sync and conflict resolution.
