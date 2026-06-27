# iOS Companion — Completion Handoff
**Date:** 2026-06-27 — v2.4.3
**Status:** Infrastructure EXISTS on both sides. The shell connects. The router returns stub data. Nothing real flows yet.

---

## 1. What Already Exists (do NOT re-implement)

### Rust side (src-tauri/src/)
| File | What it does |
|---|---|
| `companion_server.rs` | TCP WebSocket server on `0.0.0.0:8765`. Accepts connections, spawns per-client tasks, PIN auth handshake, auto-starts on app launch |
| `companion_auth.rs` | `PinManager` — generates 6-digit PIN with TTL (default 5 min), validates attempts |
| `companion_router.rs` | JSON-RPC dispatcher — routes 6 methods: `get_status`, `send_command`, `abort_command`, `approve_task`, `get_projects`, `get_boardroom` |
| `companion_types.rs` | `JsonRpcRequest`, `JsonRpcResponse`, `JsonRpcError`, `CompanionConfig`, `ClientState` |
| `companion_discovery.rs` | mDNS/Bonjour advertisement (`_alphonso._tcp.local`, port 8765) |
| `lib.rs:1918-1923` | Server is constructed, `.manage()`-d as Arc, `run()` spawned in tokio background task on every app start |
| Tauri commands | `companion_get_pin`, `companion_get_status`, `companion_start_discovery` registered |

### Swift/iOS side (ios/AlphonsoCompanion/)
| File | What it does |
|---|---|
| `WebSocketService.swift` | Full WebSocket client — connect, authenticate, send_command, abort, reconnect with exponential backoff, streaming token accumulation |
| `MDNSService.swift` | Bonjour browser for `_alphonso` service type — discovers desktop on LAN |
| `PairingView.swift` | Scan UI + PIN entry |
| `ChatView.swift` | Message list with streaming |
| `AgentDockView.swift` | 9-agent status grid |
| `BoardroomView.swift` | Goals/batches/tasks |
| `SettingsView.swift` | Connection status, disconnect |
| `ContentView.swift` | Tab container |
| `Models/ConnectionState.swift` | Enum: disconnected / connecting / authenticated / failed |

### React side
| File | What it does |
|---|---|
| `src/components/CompanionPairingPanel.tsx` | Desktop UI showing PIN, connection count, start/stop server |
| `src/components/SettingsView.tsx:1165` | "Remote Access" section wired to `CompanionPairingPanel` |

---

## 2. The Exact Problem — Why It Doesn't Work

The Rust router (`companion_router.rs`) is **fully stubbed**. Every method returns hardcoded empty JSON:

```rust
// handle_send_command → returns "queued" but NEVER actually routes to Jose
Ok(json!({ "commandId": "...", "status": "queued", "text": text }))

// handle_get_boardroom → always empty
Ok(json!({ "goals": [], "batches": [], "tasks": [] }))

// handle_approve_task → always ok but does nothing
Ok(json!({ "ok": true }))
```

There is also **no event push**. The server has a `broadcast::Sender<String>` (`event_tx`) wired into each client handler, but nothing in the app ever calls `companion_server.broadcast_event(...)`. So the iOS streaming UI (token events, agent_status events) never receives anything.

**Summary of gaps:**

| Gap | Severity | Description |
|---|---|---|
| `send_command` is a stub | P0 | Returns "queued" but never calls `createJoseCommandRoute` or any service |
| No event broadcasting | P0 | `broadcast_event` is never called from the app; iOS never gets `token` or `agent_status` events |
| `get_boardroom` is stub | P1 | Always returns `{ goals: [], batches: [], tasks: [] }` |
| `get_projects` is stub | P1 | Always returns `{ projects: [] }` |
| `approve_task` is stub | P1 | Does nothing |
| mDNS Bonjour service type | P2 | iOS looks for `_alphonso` but Bonjour convention requires `_alphonso._tcp` — check `companion_discovery.rs` service type string matches Swift `NWBrowser.Descriptor.bonjour(serviceType: "_alphonso", ...)` |
| Router has no access to app state | P0 | `companion_router.rs` is a pure function — it has no handle to Tauri's `AppHandle`, so it cannot invoke services, read KV, or emit Tauri events |
| `parseBoardroomResponse` TODO | P2 | `WebSocketService.swift:parseBoardroomResponse` has a `// TODO` comment — goals state never updates |
| `MDNSService` switch falls through | P2 | `.added` case uses wrong destructuring for `NWBrowser.Result` — may not extract host/port correctly on real hardware |

---

## 3. What Needs to Be Built

### Step 1 — Thread `AppHandle` into the router (Rust)

`companion_router.rs` must receive Tauri's `AppHandle` so it can:
- Emit Tauri events (`app.emit(...)`) that the React frontend listens to
- Read/write KV store
- Call Jose pipeline logic

Change the signature:
```rust
// companion_router.rs
use tauri::AppHandle;

pub async fn route(req: JsonRpcRequest, app: AppHandle) -> JsonRpcResponse {
    ...
    "send_command" => handle_send_command(req.params, app.clone()).await,
    ...
}
```

Pass `app` from `companion_server.rs` into `handle_connection`, then into `route`.

### Step 2 — Wire `send_command` to Jose (Rust)

```rust
async fn handle_send_command(params: Value, app: AppHandle) -> Result<Value, JsonRpcError> {
    let text = params["text"].as_str()...;
    let command_id = uuid::Uuid::new_v4().to_string();

    // Emit a Tauri event that App.tsx already listens to for Jose routing
    app.emit("companion://command", json!({
        "commandId": command_id,
        "text": text,
        "source": "ios_companion"
    })).ok();

    Ok(json!({ "commandId": command_id, "status": "queued", "text": text }))
}
```

### Step 3 — Broadcast Jose output back to iOS (Rust + React)

The Tauri frontend already has streaming output from Jose. When a command comes from iOS, the streaming tokens need to go back.

**Approach**: App.tsx listens to `companion://command`, routes it through Jose, then for each streaming chunk emits back `companion://token` via Tauri. The Rust companion server subscribes to a dedicated channel and forwards tokens to the WebSocket client.

Add a second `broadcast::Sender` for outbound events, or reuse the existing `event_tx`:

```rust
// In handle_connection, already subscribes event_rx
// App.tsx calls invoke('companion_broadcast', { event: "token", payload: {...} })
// Rust sends it through event_tx to all connected WebSocket clients
```

Add Tauri command:
```rust
#[tauri::command]
pub async fn companion_broadcast(
    state: State<'_, Arc<CompanionServer>>,
    event: String,
    payload: serde_json::Value,
) -> Result<(), String> {
    let msg = serde_json::to_string(&json!({"event": event, "payload": payload}))
        .map_err(|e| e.to_string())?;
    state.broadcast_event(msg);
    Ok(())
}
```

### Step 4 — Wire `get_boardroom` to real data (Rust)

```rust
async fn handle_get_boardroom(app: AppHandle) -> Result<Value, JsonRpcError> {
    // Read from KV store: alphonso_boardroom_sessions_v1
    let raw = crate::kv_store::kv_get_raw(&app, "alphonso_boardroom_sessions_v1")
        .await
        .unwrap_or_default();
    let sessions: Value = serde_json::from_str(&raw.unwrap_or_default())
        .unwrap_or(json!([]));
    Ok(json!({ "sessions": sessions }))
}
```

### Step 5 — Wire `approve_task` to approval queue (Rust)

```rust
async fn handle_approve_task(params: Value, app: AppHandle) -> Result<Value, JsonRpcError> {
    let task_id = params["taskId"].as_str()...;
    // Emit Tauri event that ApprovalModal listens to
    app.emit("companion://approve", json!({ "taskId": task_id })).ok();
    Ok(json!({ "ok": true }))
}
```

### Step 6 — Fix MDNSService Swift destructuring (Swift)

The current code pattern-matches `.added(let endpoint, let _)` which is wrong for `NWBrowser.Result`. Fix:

```swift
browser?.browseResultsChangedHandler = { [weak self] results, _ in
    Task { @MainActor in
        self?.discovered = results.compactMap { result in
            guard case .service(let name, _, _, _) = result.endpoint else { return nil }
            // Use NWConnection to resolve the endpoint properly
            return DiscoveredHost(name: name, host: "", port: 8765) // resolved on connect
        }
    }
}
```

Or simpler: let the user type the IP manually (PairingView already has this fallback), and treat mDNS as best-effort.

### Step 7 — Fix `parseBoardroomResponse` TODO (Swift)

```swift
private func parseBoardroomResponse(_ json: [String: Any]) {
    if let sessions = json["sessions"] as? [[String: Any]] {
        // Publish via @Published var boardroomSessions
        boardroomSessions = sessions.compactMap { BoardroomSession(dict: $0) }
    }
}
```

Add `@Published var boardroomSessions: [BoardroomSession] = []` to `WebSocketService`.

---

## 4. React Side — What to Listen For

App.tsx needs two new listeners:

```typescript
// In useAppEffects or similar
useEffect(() => {
    const unsub1 = listen('companion://command', (event) => {
        const { text, commandId } = event.payload as { text: string; commandId: string };
        // Route through Jose exactly like a chat message
        // Tag commandId so streaming tokens can be matched
        handleChatSubmit(text, { sourceCommandId: commandId, source: 'ios' });
    });

    return () => { unsub1.then(f => f()); };
}, []);
```

Then in the streaming handler, after each token:
```typescript
invoke('companion_broadcast', {
    event: 'token',
    payload: { commandId: sourceCommandId, token: chunk }
}).catch(() => {});
```

And on completion:
```typescript
invoke('companion_broadcast', {
    event: 'done',
    payload: { commandId: sourceCommandId }
}).catch(() => {});
```

---

## 5. Tauri Event Protocol (Desktop ↔ iOS)

| Direction | Event | Payload | Meaning |
|---|---|---|---|
| iOS → Desktop | `send_command` JSON-RPC | `{ text, commandId }` | User typed a command |
| Desktop → iOS | `token` event | `{ commandId, token }` | Streaming chunk from Jose |
| Desktop → iOS | `done` event | `{ commandId }` | Stream complete |
| Desktop → iOS | `agent_status` event | `{ agent, status, detail }` | Agent started/finished |
| Desktop → iOS | `approval_required` event | `{ taskId, description, riskLevel }` | Jose needs approval |
| iOS → Desktop | `approve_task` JSON-RPC | `{ taskId }` | User approved on phone |

---

## 6. Work Order (Priority Order)

| # | Task | File(s) | Effort |
|---|---|---|---|
| 1 | Thread `AppHandle` into router | `companion_router.rs`, `companion_server.rs` | 1–2h |
| 2 | Add `companion_broadcast` Tauri command | `companion_server.rs`, `lib.rs` | 30min |
| 3 | Wire `send_command` → Tauri emit | `companion_router.rs` | 30min |
| 4 | React: listen `companion://command`, route to Jose | `App.tsx` / `useAppEffects` | 2h |
| 5 | React: broadcast tokens back via `companion_broadcast` | `ChatView.tsx` streaming handler | 1h |
| 6 | Wire `get_boardroom` → KV read | `companion_router.rs`, `kv_store.rs` | 1h |
| 7 | Wire `approve_task` → Tauri emit, React listen | `companion_router.rs`, `App.tsx` | 1h |
| 8 | Fix `parseBoardroomResponse` in Swift | `WebSocketService.swift` | 30min |
| 9 | Fix MDNSService destructuring | `MDNSService.swift` | 30min |
| 10 | Test end-to-end: iPhone → command → streaming response | Real device + Xcode | 2–4h |

**Total estimated effort: ~10–12 hours for a working MVP.**

---

## 7. Testing Checklist

- [ ] Alphonso desktop running on Windows, iOS app on same WiFi
- [ ] Settings → Remote Access shows PIN and "1 client connected" after pairing
- [ ] Typing in iOS ChatView sends command, streaming tokens appear in real-time
- [ ] Agent status badges pulse in AgentDockView while Jose runs
- [ ] Boardroom tab shows latest sessions from desktop
- [ ] Approval notification appears on phone when Jose queues a high-risk task
- [ ] PIN expires after 5 minutes; app prompts re-pair
- [ ] App reconnects within 30s if WiFi drops

---

## 8. Files to NOT Touch (already correct)

- `companion_auth.rs` — PIN manager is solid
- `companion_types.rs` — structs are complete
- `WebSocketService.swift` — client protocol is correct, just needs real data flowing
- `PairingView.swift` — UI is complete
- `AgentDockView.swift` — UI is complete, will work once `agent_status` events flow
- `CompanionPairingPanel.tsx` — desktop UI is complete

---

## 9. Known Risks

1. **Windows Firewall** — port 8765 may be blocked on the desktop. The app needs to prompt the user or auto-add a firewall rule via `netsh advfirewall firewall add rule ...` on first launch.
2. **mDNS on Windows** — Bonjour/mDNS requires Apple Bonjour for Windows or the equivalent. `companion_discovery.rs` should be checked — if it uses `mdns-sd` crate, verify the service type is `_alphonso._tcp.local.` (with trailing dot).
3. **iOS Local Network permission** — iOS 14+ requires `NSLocalNetworkUsageDescription` in `Info.plist` and `NSBonjourServices` listing `_alphonso._tcp`. Without this, mDNS scan silently returns nothing.
4. **Concurrent clients** — the server handles multiple clients but `broadcast_event` sends to ALL. If multiple phones are connected, all get all events. Fine for MVP; add per-client filtering later.
5. **AppHandle in async context** — Tauri's `AppHandle` is `Clone + Send` in Tauri v2, so threading it through async functions is safe.
