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
- `VoiceSessionViewModelTests` covers the new voice shell state transitions.
- `AlphonsoCompanionUITests` contains the launch smoke test for the mobile shell.
- The Voice tab is split into `Local` and `Cloud` modes so local speech capture and Railway-backed cloud speech can diverge cleanly.
- Voice is push-to-talk. Each turn carries the selected one of nine agents and a language. Local conversational turns are answered by the selected persona through desktop Ollama; non-voice companion commands stay on the policy-gated Jose pipeline.
- Cloud mode sends `agent_id`, language, and response-voice selection to `POST /v1/voice/respond`. English uses NVIDIA TTS; Persian/Farsi (`fa-IR`) uses Railway-hosted Piper with `Mana` or `Manta`.
- Cloud playback failures preserve the reply as text and offer a retry; the UI does not imply that a failed reply was spoken.
- The app intentionally does not expose cloud URLs or service keys. **PARTIAL:** the current local PIN pairing has no durable cloud-device enrollment, so production cloud access must remain blocked until that credential flow exists.
- Speech-recognition locale support is checked on-device before recording. A user can switch English and Farsi between turns, subject to the iPhone's supported recognition locales.
