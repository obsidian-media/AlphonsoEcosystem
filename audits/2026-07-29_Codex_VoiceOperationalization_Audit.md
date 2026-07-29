# Voice Operationalization Audit

**Date:** 2026-07-29
**Scope:** Windows-executable Local Voice lifecycle and Cloud Voice contract hardening.
**Status:** PARTIAL — code-level and isolated regression verification completed; hardware, live-model, and deployed-cloud validation remain unverified.

## Completed

- Local Voice sidecar startup now waits up to five seconds for
  `http://127.0.0.1:8766/health`. A Python process that exits or fails before
  serving the endpoint is stopped and returned as a concrete startup error.
- The desktop Voice watchdog no longer clears its failure count merely because
  a restart command was accepted; only a later `running` status resets it.
- Local Voice health reports STT/TTS dependency/model availability honestly
  instead of reporting STT as unconditionally ready.
- Cloud Voice readiness no longer requires the unused `VOICE_CLOUD_API_KEY`.
  Its actual authorization boundary remains the Supabase user JWT plus active
  enrolled device record.
- Cloud Voice regression coverage now proves safe `503` provider-unavailable
  and `429` rate-limit responses without provider-detail leakage.

## Verification

| Command | Result |
|---|---|
| `npx vitest run src/test/services/voiceOsService.test.js` | PASS — 1 file, 9 tests. |
| `python -m pytest tests -q` in `voice/cloud-backend` | PASS — 16 tests. |
| `cargo fmt --all` then `cargo test voice_sidecar --lib` in `src-tauri` | PASS — 3 sidecar tests, Windows native compile completed. |
| `python -m pytest voice/cloud-backend/tests voice/backend/tests -q` | BLOCKED — local Voice test collection lacks the declared `webrtcvad` dependency. |

## Not verified / blocked

- Local microphone capture, Whisper model loading, Piper model availability,
  Ollama response, and audio playback require a prepared local Voice Python
  environment and hardware/runtime evidence.
- Live Supabase enrollment, NVIDIA/Piper calls, deployed Cloud Voice health,
  and iPhone playback were intentionally not invoked; they require external
  configuration, credentials, or device access.
- The broad npm test wrapper did not complete as a focused Voice test command;
  the direct Vitest command above was used instead.

## Residual risk

- The sidecar health endpoint proves process/HTTP readiness, not successful
  microphone/model inference. The UI must continue to expose missing local
  prerequisites rather than equating “running” with “voice-ready.”
- Cloud Voice deployment must set `SUPABASE_ANON_KEY` and validate existing
  RLS policies before the service can be called live.
