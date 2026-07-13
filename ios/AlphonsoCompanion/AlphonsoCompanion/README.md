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
- Cloud mode expects a Railway-deployed endpoint that accepts `POST /voice/respond` and returns `reply` plus `audio_base64`.
