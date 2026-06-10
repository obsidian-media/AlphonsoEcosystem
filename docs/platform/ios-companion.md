# iOS Companion — Implementation Details

## Overview

Expands on `docs/IOS_COMPANION_PLAN.md`. The iOS companion is a native SwiftUI app that connects to the Alphonso desktop via WebSocket over local network. Desktop remains the single runtime — iOS is a remote control.

---

## Architecture

### Desktop WebSocket Server (`src-tauri/src/companion_server.rs`)

```
src-tauri/src/companion_server.rs   — WebSocket server, auth, message routing
src-tauri/src/companion_client.rs   — (future) iOS-side if using embedded Rust
```

```rust
// companion_server.rs — key types
pub struct CompanionServer {
    port: u16,
    auth_token: String,
    clients: Arc<Mutex<HashMap<Uuid, ClientState>>>,
}

enum ClientState {
    Pending { pin_attempts: u8, connected_at: Instant },
    Authenticated { peer: String, subscriptions: Vec<EventType> },
}

enum EventType {
    TokenStream, Progress, ApprovalRequest, AgentStatus, StateUpdate,
}
```

### Message Flow

```
iOS → Desktop:   JSON-RPC request { id, method, params }
Desktop → iOS:   JSON-RPC response { id, result | error }
Desktop → iOS:   JSON-RPC notification { event, payload }
```

### Connection Lifecycle

1. **Discovery** — Desktop advertises `_alphonso._tcp.local` via mDNS (mdns-sd crate)
2. **Pairing** — iOS connects, receives PIN challenge; PIN shown in desktop UI tray
3. **Auth** — iOS sends `{ method: "authenticate", params: { pin: "123456" } }`; server validates
4. **Sync** — Server pushes initial state: agents, models, projects, active sessions
5. **Session** — Bidirectional message exchange; heartbeats every 15s
6. **Disconnect** — Clean close; server cleans up subscription handles

---

## File Structure

```
src-tauri/src/companion_server.rs     — WebSocket listener, client management, routing
src-tauri/src/companion_auth.rs       — PIN generation, verification, rate-limiting
src-tauri/src/companion_discovery.rs   — mDNS advertising via mdns-sd
src-tauri/src/companion_router.rs     — Maps JSON-RPC methods to Tauri command handlers
src-tauri/src/companion_types.rs      — Shared types, enums, serialization

ios/                                     — Xcode project (separate repo or submodule)
  AlphonsoCompanion.xcodeproj
  AlphonsoCompanion/
    ContentView.swift                    — Root SwiftUI view
    Views/
      ChatView.swift                     — Message list, markdown rendering
      AgentDockView.swift                — 9 agent status indicators
      BoardroomView.swift                — Goals, batches, tasks
      SettingsView.swift                 — Connection config, theme
    Services/
      WebSocketService.swift             — WebSocket client (URLSessionWebSocketTask)
      MDNSService.swift                  — Bonjour discovery
      CacheService.swift                 — SwiftData local cache
      AuthService.swift                  — PIN entry + handshake
    Models/
      Message.swift, Agent.swift, Project.swift, etc.
```

---

## Dependencies

### Rust (Cargo.toml additions)
```toml
tokio = { version = "1", features = ["full"] }
tokio-tungstenite = "0.21"
mdns-sd = "0.10"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
uuid = { version = "1", features = ["v4"] }
chrono = "0.4"
```

### iOS (Xcode SPM or CocoaPods)
- No third-party dependencies required for WebSocket (native `URLSessionWebSocketTask`)
- Native `Network.framework` for Bonjour/mDNS
- `SwiftData` (iOS 17+) for local caching
- Optional: `MarkdownUI` for rich markdown rendering in chat

---

## Implementation Phases

### Phase 1: Core Server (Week 1)
- Implement `companion_server.rs` with tokio TCP listener + tokio-tungstenite accept
- PIN auth with bcrypt-compatible hash (6-digit, rate-limited to 3 attempts)
- JSON-RPC parser that routes method names to a handler registry
- Basic client tracking (connect, disconnect, heartbeat timeout 30s)

### Phase 2: Discovery (Week 1, Days 4-5)
- Implement `companion_discovery.rs` using mdns-sd
- Register service `_alphonso._tcp.local` on port 8765
- Desktop tray shows "Alphonso Remote: Ready" with QR code for PIN

### Phase 3: iOS App — Connection Layer (Week 2)
- Xcode project with deployment target iOS 17+
- WebSocket client with automatic reconnect (exponential backoff: 1s, 2s, 4s, max 30s)
- mDNS browser that shows discovered desktops in a list
- PIN entry screen with 6-digit code input
- Persistent keychain storage for auth tokens

### Phase 4: iOS App — UI (Weeks 3-4)
- Chat view with streaming token display, markdown rendering, send/abort
- Agent dock showing 9 agent avatars with status (idle/working/error)
- Boardroom panel: goal selector → batch list → task execution + approval
- Settings: reconnect, theme toggle, clear cache, about

### Phase 5: Polish (Week 5)
- Push notifications via APNs when desktop sends approval requests
- Offline queue: commands queued in SwiftData when disconnected, sent on reconnect
- Dark/light theme matching desktop
- Haptic feedback for approvals and errors

---

## Security

- PIN is 6 digits, generated on desktop, valid for 5 minutes or until used
- Rate-limiting: 3 PIN attempts then 60s cooldown
- WebSocket runs on local network only (0.0.0.0:8765 bound, no external exposure)
- Optional TLS via self-signed cert for encrypted local traffic
- iOS keychain for stored tokens, not UserDefaults

---

## Testing

### Desktop Server
```bash
# Manual: connect with wscat
npx wscat -c ws://localhost:8765
# Rust unit tests
cargo test --lib companion
```

### iOS
- Xcode unit tests for service layer
- UI tests with XCUITest for critical flows (connect, send message, approve)
- Mock WebSocket server in test target
