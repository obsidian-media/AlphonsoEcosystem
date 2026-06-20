# Alphonso iOS Companion — Architecture Plan

## Concept
Desktop runs everything (Ollama, agents, Composio, SQLite, filesystem).
iOS is a remote control — connects via WebSocket to your desktop on local network.

## Why Not Standalone iOS
- Ollama doesn't run on iOS (no local LLM without MLX compilation)
- 7B model needs ~4GB RAM — iOS gives ~2GB per app
- Desktop already has the full pipeline wired
- Zero-cost promise broken if cloud LLM required

## Architecture

```
┌─────────────────────────────────────┐     WebSocket (ws://192.168.x.x:8765)     ┌──────────────────────┐
│         Desktop (Tauri v2)          │◄─────────────────────────────────────────►│   iOS Companion App  │
│                                     │                                            │                      │
│  ┌───────────┐  ┌───────────────┐   │         ┌──────────────────────┐          │  ┌────────────────┐  │
│  │  Ollama   │  │   Alphonso    │   │         │                      │          │  │  SwiftUI UI    │  │
│  │  (7B LLM) │  │   React App   │   │         │                      │          │  │  - Chat view   │  │
│  └─────┬─────┘  └───────┬───────┘   │         │                      │          │  │  - Agent dock  │  │
│        │                │           │         │                      │          │  │  - Boardroom   │  │
│  ┌─────┴─────┐  ┌───────┴───────┐   │         │                      │          │  │  - Settings    │  │
│  │  Rust     │  │   WebSocket   │   │         │                      │          │  └────────────────┘  │
│  │  Backend  │  │   Server      │◄──┼─────────┤  JSON-RPC Protocol   │          │                      │
│  │  (lib.rs) │  │  (new module) │   │         │                      │          │  ┌────────────────┐  │
│  └───────────┘  └───────────────┘   │         │                      │          │  │  WebSocket     │  │
│                                     │         │                      │          │  │  Client        │  │
│  ┌───────────┐  ┌───────────────┐   │         │                      │          │  └────────────────┘  │
│  │  SQLite   │  │   Composio    │   │         │                      │          │                      │
│  │  (memory) │  │   (external)  │   │         │                      │          │  ┌────────────────┐  │
│  └───────────┘  └───────────────┘   │         └──────────────────────┘          │  │  Local Cache   │  │
│                                     │                                            │  │  (UserDefaults)│  │
└─────────────────────────────────────┘                                            └────────────────────┘
```

## Protocol: JSON-RPC over WebSocket

### Connection Flow
1. iOS discovers desktop via mDNS/Bonjour (`_alphonso._tcp.local`)
2. WebSocket handshake with auth token (PIN code pairing)
3. Desktop sends initial state: agents, models, active projects
4. iOS subscribes to event streams

### Message Types

#### Client → Desktop (iOS requests)
| Method | Params | Response |
|--------|--------|----------|
| `send_command` | `{ text, chatId }` | `{ commandId, status }` |
| `abort_command` | `{ commandId }` | `{ ok }` |
| `get_status` | `{}` | `{ agents, models, ollama }` |
| `stream_tokens` | `{ commandId }` | Stream of `{ token, fullText }` |
| `approve_task` | `{ taskId, action }` | `{ ok }` |
| `get_projects` | `{}` | `{ projects }` |
| `get_boardroom` | `{ goalId }` | `{ batches, tasks }` |
| `execute_batch` | `{ batchId }` | `{ ok }` |

#### Desktop → Client (iOS receives)
| Event | Payload |
|-------|---------|
| `token` | `{ commandId, token, fullText, tokens }` |
| `progress` | `{ commandId, stage, agent, detail }` |
| `task_complete` | `{ commandId, result }` |
| `approval_needed` | `{ taskId, agent, action, risk }` |
| `agent_status` | `{ agent, status, detail }` |
| `state_update` | `{ projects, goals, batches }` |

## Tech Stack

### Desktop Side (Rust/Tauri)
- **tokio** + **tokio-tungstenite** — async WebSocket server
- **mdns-sd** — mDNS/Bonjour service discovery
- **serde_json** — JSON-RPC serialization
- New module: `src-tauri/src/companion_server.rs`

### iOS Side (Swift/SwiftUI)
- **SwiftUI** — native UI, declarative
- **Starscream** or native `URLSessionWebSocketTask` — WebSocket client
- **Network.framework** — mDNS discovery
- **SwiftData** — local caching (messages, settings)
- **MarkdownUI** — render markdown responses

### Alternative: React Native
- Reuse existing React components (ChatView, AgentDock, BoardroomPanel)
- **react-native-websocket** — WebSocket client
- **react-native-network-info** — mDNS
- **AsyncStorage** — local cache
- **~70% code reuse** from desktop React app

## Implementation Phases

### Phase 1: Desktop WebSocket Server (3-5 days)
```rust
// src-tauri/src/companion_server.rs
use tokio::net::TcpListener;
use tokio_tungstenite::accept_async;
use serde_json::{json, Value};

pub struct CompanionServer {
    port: u16,
    auth_token: String,
}

impl CompanionServer {
    pub async fn start(&self) -> Result<(), Box<dyn std::error::Error>> {
        let listener = TcpListener::bind(format!("0.0.0.0:{}", self.port)).await?;
        while let Ok((stream, _)) = listener.accept().await {
            let ws = accept_async(stream).await?;
            tokio::spawn(handle_client(ws, self.auth_token.clone()));
        }
        Ok(())
    }
}
```

Key features:
- Bind to `0.0.0.0:8765` (configurable port)
- PIN code auth (6-digit, shown in desktop UI)
- JSON-RPC message routing to existing Tauri commands
- Token streaming via WebSocket frames

### Phase 2: Discovery & Connection (2-3 days)
- mDNS/Bonjour advertising from desktop
- iOS scans for `_alphonso._tcp.local`
- Shows "Alphonso Desktop Found" with IP
- PIN code entry for pairing
- TLS optional (self-signed cert for local network)

### Phase 3: iOS Chat UI (5-7 days)
- SwiftUI chat view (reuse ChatView.jsx design)
- Message list with markdown rendering
- Streaming text display with token counter
- Abort button
- Agent status indicators

### Phase 4: Agent Control (3-5 days)
- Agent dock (9 agents with status)
- Boardroom panel (goals, batches, tasks)
- Approval workflow (push notifications for pending approvals)
- Project browsing

### Phase 5: Polish (2-3 days)
- Push notifications for task completion
- Offline queue (commands queued when desktop offline)
- Settings sync
- Dark/light theme

## Total Estimate: 15-23 days

## What You Get
- Full agent control from iPhone
- Real-time streaming with token counter
- Boardroom batch execution
- Approval requests as push notifications
- Project browsing
- Agent status monitoring

## What You DON'T Get (by design)
- Local LLM on iOS (desktop does it)
- Filesystem access on iOS (desktop does it)
- Standalone operation (requires desktop running)

## Next Step
Start with Phase 1 — the Rust WebSocket server. It's the foundation and can be tested with any WebSocket client (wscat, browser DevTools).

Want me to start building it?
