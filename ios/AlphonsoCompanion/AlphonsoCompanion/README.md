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
├── Views/
│   ├── ChatView.swift          — Message list, streaming
│   ├── AgentDockView.swift     — 9-agent status grid
│   ├── BoardroomView.swift     — Goals/batches/tasks
│   ├── PairingView.swift       — mDNS scan, PIN entry
│   └── SettingsView.swift      — Connection status
└── Services/
    ├── WebSocketService.swift    — Client with auth/reconnect
    └── MDNSService.swift       — Bonjour browser
```