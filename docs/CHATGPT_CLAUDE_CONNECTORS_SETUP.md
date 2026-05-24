# ChatGPT + Claude Connector Setup

Status: outbound prompt exchange is wired in this build with supervised connector commands and audit logs.

## Security rules

- Keep API keys in `.env` only.
- Do not commit credentials.
- Treat generated outputs as untrusted until verified by Jose/Alphonso.
- Do not auto-execute returned content.

## Required environment variables

### ChatGPT connector

- `OPENAI_API_KEY`
- Optional: `OPENAI_CONNECTOR_MODEL` (default: `gpt-4.1-mini`)

### Claude connector

- `ANTHROPIC_API_KEY`
- Optional: `CLAUDE_CONNECTOR_MODEL` (default: `claude-3-5-sonnet-latest`)

## Wired commands

- `connector_send_chatgpt` -> calls OpenAI `POST /v1/responses`.
- `connector_send_claude` -> calls Anthropic `POST /v1/messages`.

Both commands return a supervised connector proof with:

- `ok`
- `external_id` (when provided by provider API)
- `target` model
- `error` on failure

## Not wired yet

- Inbound webhooks/listeners for either provider.
- Automatic sync of provider responses into Jose task decomposition flow.
