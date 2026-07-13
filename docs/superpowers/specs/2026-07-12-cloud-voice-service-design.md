# Cloud Voice Service Design

## Status

Approved for implementation on 2026-07-12. This specification defines a new,
standalone Railway service for the iOS Cloud Voice mode. It does not replace or
deploy the local voice stack.

## Goal

Provide a real cloud voice conversation loop for the iOS companion:

1. iOS performs speech recognition using Apple Speech.
2. The app sends a final text transcript to the Cloud Voice Service.
3. The service obtains a reply from NVIDIA NIM.
4. The service synthesizes that reply through NVIDIA Magpie or Chatterbox TTS.
5. The app displays and plays the returned text and WAV audio.

The service must not require Ollama, Whisper, Piper, a desktop machine, or a
database. It is stateless and retains no transcript, audio, or conversation
history after a request completes.

## Service Boundaries

### Cloud Voice Service

Location: `voice/cloud-backend`.

Deployment: a separate Railway service with `voice/cloud-backend` as its root
directory. The repository root `railway.json` continues to serve the existing
web application and is not repurposed.

Responsibilities:

- Authenticate iOS requests.
- Validate and normalize request content.
- Call NVIDIA NIM's OpenAI-compatible chat-completions API.
- Call the selected NVIDIA TTS endpoint.
- Return a complete response containing text and WAV audio.
- Report non-sensitive readiness and health state.

It must never import or start local STT/TTS modules and must never call a
localhost LLM endpoint.

### Local Voice Gateway

Location: existing `voice/backend`.

Responsibilities:

- Run locally with Ollama, Whisper, and Piper.
- Use a configurable `LOCAL_OLLAMA_URL`, defaulting to localhost.
- Check real local provider readiness in health status.

It is not deployed to Railway and does not provide the Cloud Voice API.

## HTTP Contract

`POST /v1/voice/respond`

Required header:

`Authorization: Bearer <VOICE_CLOUD_API_KEY>`

Request body:

```json
{
  "session_id": "client-generated-uuid",
  "text": "What should I focus on today?",
  "history": [
    { "role": "user", "content": "Previous message" },
    { "role": "assistant", "content": "Previous reply" }
  ],
  "language": "en-US",
  "tts_model": "magpie"
}
```

Rules:

- `history` is optional and limited to 12 messages.
- Each history item must contain only a permitted `role` and non-empty `content`.
- The user transcript and every history item have explicit length limits.
- Supported initial languages match the iOS language picker.
- `tts_model` is `magpie` or `chatterbox`.
- The active user message is supplied once, as `text`; it is not duplicated in
  `history`.

Successful response:

```json
{
  "request_id": "server-generated-uuid",
  "session_id": "client-generated-uuid",
  "agent": "alphonso_core",
  "reply": "Here is the focused next step.",
  "audio_base64": "...WAV bytes...",
  "tts_model": "magpie",
  "language": "en-US",
  "state": "idle",
  "timings_ms": { "llm": 0, "tts": 0, "total": 0 }
}
```

`GET /health` reports process health. `GET /ready` verifies that all required
configuration is present without exposing credentials.

## NVIDIA Integration

The LLM provider is NVIDIA NIM through its OpenAI-compatible chat-completions
API. The base URL and model name are Railway variables so a model can be
changed without an iOS release.

The TTS provider is selected per request. Magpie and Chatterbox use their
provider-specific documented request contracts. The service validates the
configured voice against the requested language before synthesis. It returns
WAV audio and never silently falls back to Piper or another provider.

## Security and Privacy

- `VOICE_CLOUD_API_KEY` is mandatory. A missing key makes readiness fail and
  all voice requests return a configuration error.
- `NVIDIA_API_KEY` exists only in Railway variables.
- iOS stores `VOICE_CLOUD_API_KEY` in Keychain, not `UserDefaults`.
- Release builds require an HTTPS endpoint.
- CORS is restricted to known application clients or omitted for the native app
  API; no permissive credentials-enabled wildcard policy is used.
- Request and response logs contain request IDs and operational metadata only,
  never transcripts, model responses, API keys, or audio.
- No database is introduced in this release.

## Failure Semantics

| Condition | HTTP status |
|---|---:|
| Missing or invalid mobile service key | 401 or 403 |
| Invalid request, history, language, or TTS model | 400 |
| Required service configuration missing | 503 |
| NVIDIA provider timeout or unavailable | 503 |
| NVIDIA rate limit | 429 |
| Empty or invalid generated output | 502 |

The iOS app displays the server's safe error description and returns to idle.
It does not speak error text or attempt to fall back from Cloud Voice into the
local stack.

## Verification

- Python unit tests for authentication, input validation, history normalization,
  provider response mapping, readiness, and error translation.
- HTTP contract tests with mocked NVIDIA responses using documented payloads.
- iOS tests for Keychain storage, request encoding, and error handling.
- A Railway smoke test after secrets are configured: health, readiness,
  authenticated reply, valid WAV payload, and on-device playback.
- Separate Local Voice Gateway tests for configurable Ollama reachability and
  local model readiness.

## Required Railway Variables

- `VOICE_CLOUD_API_KEY`
- `NVIDIA_API_KEY`
- `NVIDIA_NIM_BASE_URL`
- `NVIDIA_NIM_MODEL`
- `NVIDIA_TTS_MAGPIE_URL`
- `NVIDIA_TTS_MAGPIE_DEFAULT_VOICE`
- `NVIDIA_TTS_CHATTERBOX_URL`
- `NVIDIA_TTS_CHATTERBOX_DEFAULT_VOICE`

Optional operational variables include request timeout and maximum reply tokens.
Secrets are entered in Railway only and are not committed.
