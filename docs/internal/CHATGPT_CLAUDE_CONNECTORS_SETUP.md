# ChatGPT + Claude Connector Setup

Status: outbound prompt exchange is wired with supervised connector commands and audit logs. Both are paid: Zero-Cost Mode blocks them, and Jose gives a step to one only when you turn on Settings → General → **Allow paid models** (off by default), at the prices you enter there, inside a monthly cap. Not checked with a paid account yet (unit tests only).

## Security rules

- Enter keys in **Settings → Connectors**. They are kept in your system's keychain, never in localStorage, backups or exports. A variable in the app's environment still works as a fallback; a `.env` file is read only in development runs.
- Do not commit credentials.
- Treat generated outputs as untrusted until verified by Jose/Alphonso.
- Do not auto-execute returned content.

## Credentials and model

### ChatGPT connector

- `OPENAI_API_KEY`
- **Model:** pick it from the connector's Model list, loaded live from OpenAI (saved as `OPENAI_MODEL`). "Default" is `gpt-6-luna`. If the list can't load, type a model name.

### Claude connector

- `ANTHROPIC_API_KEY`
- **Model:** pick it from the Model list, loaded live from Anthropic (saved as `CLAUDE_MODEL`). "Default" is `claude-haiku-5-5`.

The earlier defaults (`gpt-4.1-mini`, `claude-3-5-sonnet-latest`, then `gpt-4o-mini` and `claude-3-haiku-20240307`) were retired or deprecated by the providers; until 2026-10-22 every Claude call failed because of that.

## Wired commands

- `connector_send_chatgpt` -> calls OpenAI.
- `connector_send_claude` -> calls Anthropic `POST /v1/messages`.

Both commands return a supervised connector proof with:

- `ok`
- `external_id` (when provided by provider API)
- `target` model
- `error` on failure

When Jose gives a step a paid model (`claude:<model>` or `chatgpt:<model>`), the step asks first with "(about $X.XX)", and the cost reported by the provider is recorded against the month's cap.

## Not wired yet

- Inbound webhooks/listeners for either provider.
