# Alphonso iOS Companion

SwiftUI iOS app for remote-controlling Alphonso desktop via WebSocket.

## Architecture
- Desktop runs on `0.0.0.0:8765` (WebSocket server)
- iOS connects via mDNS discovery (`_alphonso._tcp.local`)
- PIN-based authentication (shown in desktop Settings → Remote Access)
- JSON-RPC protocol for all operations

## Building
Open `ios/AlphonsoCompanion/AlphonsoCompanion.xcodeproj` in Xcode 15+ on macOS.

## Requirements
- iOS 17.0+ (SwiftData, Network.framework)
- macOS desktop running Alphonso with companion server enabled

## Files
```
AlphonsoCompanion/
├── AlphonsoCompanionApp.swift  — @main entry, DI setup
├── ContentView.swift           — Tab view container
├── Assets.xcassets/AgentAvatars — agent portrait assets used in Agent Dock
├── Models/
│   ├── ConnectionState.swift   — connection and boardroom data models
│   └── VoiceSession.swift      — voice mode, transcript, and view model
├── Views/
│   ├── ChatView.swift          — Message list, streaming
│   ├── VoiceView.swift        — Voice shell with local/cloud mode switch
│   ├── AgentDockView.swift     — 9-agent status grid
│   ├── BoardroomView.swift     — Goals/batches/tasks
│   ├── PairingView.swift       — mDNS scan, PIN entry
│   └── SettingsView.swift      — Connection status
└── Services/
    ├── WebSocketService.swift    — Client with auth/reconnect
    ├── VoiceAudioService.swift   — Mic capture, transcription, and TTS
    ├── VoiceCloudService.swift   — Cloud voice request transport and playback
    ├── CompanionConnectionStateMachine.swift — reconnect/auth state machine
    └── MDNSService.swift         — Bonjour browser
```

## Tests
- `AlphonsoCompanionTests` contains unit coverage for the connection state machine.
- `VoiceSessionViewModelTests` covers voice state transitions, Cloud Voice enrollment gating, and concurrent-send protection.
- `AlphonsoCompanionUITests` contains the launch smoke test for the mobile shell.
- The Voice tab is split into `Local` and `Cloud` modes so local speech capture and Railway-backed cloud speech can diverge cleanly.
- Voice is push-to-talk. Each turn carries the selected one of nine agents and a language. Local conversational turns are answered by the selected persona through desktop Ollama; non-voice companion commands stay on the policy-gated Jose pipeline.
- Cloud mode sends `agent_id`, language, and response-voice selection to `POST /v1/voice/respond`. English uses NVIDIA TTS; Persian/Farsi (`fa-IR`) uses Railway-hosted Piper with `Mana` or `Manta`.
- Cloud playback failures preserve the reply as text and offer a retry; the UI does not imply that a failed reply was spoken.
- Cloud Voice cannot start recording or send a turn until the user has completed email sign-in and this iPhone is enrolled. The app exposes that state, prevents duplicate enrollment requests, and allows the user to sign out safely.
- Chat keeps one desktop request active at a time and turns the send control into **Stop response** while that request runs. The stop action calls the companion abort command; it is not a simulated cancellation.
- The app intentionally does not expose provider service keys. It uses Supabase email one-time-code sign-in, stores the resulting session in Keychain, and enrolls a generated device UUID with Cloud Voice. Railway validates the user session and active device on every request; the Supabase service-role key remains server-only.
- Speech-recognition locale support is checked on-device before recording. A user can switch English and Farsi between turns, subject to the iPhone's supported recognition locales.

## Release verification

TestFlight is the delivery path for the companion. Before the next EAS build, verify the iOS unit suite on macOS. After installation from TestFlight, complete one physical-device Cloud Voice run: pair, request the email code, enroll the iPhone, send a voice turn, and confirm both the reply text and audio playback. Until that evidence is recorded, Cloud Voice is **PARTIAL**, not release-proven.
