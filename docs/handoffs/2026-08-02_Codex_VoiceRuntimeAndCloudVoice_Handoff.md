# Voice runtime and Cloud Voice handoff

> **2026-08-10 addendum:** PR #140 (which introduced the bypass described
> below) merged with 20 CodeRabbit review threads unresolved, including a
> Critical finding on this exact bypass. The "Mandatory rollback" section
> was never executed — the bypass was still live in source 8 days later.
> It has now been removed from source entirely (not just reset to false):
> `Settings.allow_owner_testing_bypass` deleted from
> `voice/cloud-backend/app/config.py`, the conditional in `main.py`'s
> `/v1/voice/respond` removed so device enforcement is unconditional, and
> `CloudVoiceOwnerTestingBypass` deleted from iOS `Info.plist` and
> `VoiceCloudService.swift`/`VoiceSession.swift`. If the ECS task definition
> still sets `VOICE_ALLOW_OWNER_TESTING_BYPASS`, that var is now a no-op and
> should be dropped on the next deploy. Steps 2–3 of the original rollback
> plan (restore iOS sign-in UI, validate magic-link enrollment) are still
> open — see `docs/governance/DEFERRED_WORK.md`.

## Current state

- **Local Voice: PARTIAL.** `http://127.0.0.1:8766/health` is HTTP 200 with STT and Ollama reachable, while the desktop watchdog still shows `Voice OS offline — restarting...`.
- **Ollama: PARTIAL.** Runs from `D:\AgentDevWork\Apps\Ollama\ollama.exe` on RTX 2060/Vulkan. `llama3.2:latest` cold-load did not finish in 90 seconds; logs prove the client cancelled while the runner loaded the 1.87 GiB model from D:. This is not an `OLLAMA_ORIGINS` issue.
- **Timeout fix:** commit `005a1db` increases frontend and Rust fallback generation timeout to 300 seconds. GitHub Windows build `30724711091` passed; its installer is at `D:\agentdevwork\alphonsothelatestedition\app.exe`. A real successful generation is still unverified.
- **Cloud Voice: TEMPORARY OWNER TESTING.** ECS `alphonso-cloud-voice` / `cloud-voice-staging` runs task definition `alphonso-cloud-voice:2`; `/ready` passed. Image `owner-bypass-e6a37d0` contains `VOICE_ALLOW_OWNER_TESTING_BYPASS=true`, which bypasses Supabase device enforcement only for this owner test window.
- **iOS:** TestFlight run `30725246840` passed for commit `e6a37d0`, containing the matching temporary client bypass. Earlier magic-link callback support is `437be5d`.

## Evidence

- `Invoke-RestMethod http://127.0.0.1:8766/health` returned `status: ok`, `stt: true`, Ollama reachable.
- `Invoke-RestMethod https://voice.obsidianmedia.online/ready` returned ready with NVIDIA, Magpie and Farsi Piper.
- Ollama `server.log` recorded `client connection closed before llama-server finished loading` and the 90-second direct `/api/generate` probe timed out.
- GitHub Actions: Windows `30724711091`; iOS/TestFlight `30725246840`.

## Next agent actions

1. Run one D: desktop request to `llama3.2:latest`; allow five minutes and capture output plus `%LOCALAPPDATA%\Ollama\server.log` tail.
2. Reproduce Voice OS with one desktop instance. If `/health` is 200 while toast persists, change watchdog semantics from child-handle-only to loopback-health-aware; eliminate duplicate voice-os processes first.
3. Install TestFlight build `30725246840`; test owner-bypass Cloud Voice in English and Farsi, including audio.

## Mandatory rollback

1. Deploy an ECS revision with `VOICE_ALLOW_OWNER_TESTING_BYPASS=false`/omitted.
2. Restore iOS Cloud Voice sign-in UI and remove `CloudVoiceOwnerTestingBypass` from Info.plist.
3. Validate Supabase magic-link enrollment before broader release.

## Cost controls

One ECS task is retained; no new AWS capacity or infrastructure was created. The temporary bypass exposes NVIDIA/TTS spending to unauthenticated callers, so it must be reverted immediately after the owner test.
