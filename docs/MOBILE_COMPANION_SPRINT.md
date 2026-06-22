# Alphonso Mobile Companion — Kilo CLI Sprint Instructions

**Purpose:** Complete instructions for Kilo CLI (or any agent) to implement the Alphonso iOS/mobile companion from scratch in parallel with other development work.

**Status as of 2026-06-22:** Planning documents only — zero implementation code exists. Both architecture docs are in `docs/IOS_COMPANION_PLAN.md` and `docs/platform/ios-companion.md`. This sprint guide is the executable version of those plans.

**Estimated duration:** 15–23 days across 5 phases.

---

## Before You Start — Read These First

1. `docs/ALPHONSO_GROUND_TRUTH.md` — single source of truth for what already exists
2. `docs/IOS_COMPANION_PLAN.md` — high-level architecture and protocol
3. `docs/platform/ios-companion.md` — detailed file structure, types, and phase breakdown
4. `CLAUDE.md` — build commands, do-not-duplicate table, test requirements

**Critical rules:**
- Run `npm run test` before and after any JS/TS change — all 1621+ tests must stay green
- Run `cargo clippy -- -D warnings` and `cargo fmt --all -- --check` from `src-tauri/` before every Rust commit
- Run `cargo test` from `src-tauri/` after every Rust change
- Do not add anything to the "Do Not Duplicate" section that already exists
- Every new Rust module must be declared in `src-tauri/src/lib.rs`
- Every new service must be added to `docs/ALPHONSO_GROUND_TRUTH.md` Section 3

---

## Architecture Summary

The design is deliberately simple: **the desktop does everything, the phone is a remote control.**

```
iPhone App  ←──WebSocket (ws://192.168.x.x:8765)──→  Tauri Desktop
   |                                                        |
SwiftUI UI                                          companion_server.rs
WebSocket client                                    ↕ routes to existing
mDNS browser                                        Tauri commands
PIN auth                                            (no new logic needed)
```

The desktop companion server:
1. Listens on `0.0.0.0:8765`
2. Authenticates via 6-digit PIN
3. Routes JSON-RPC method calls to **already-existing** Tauri commands
4. Streams tokens back to the iOS client in real time

Nothing in the existing Alphonso business logic changes. The companion server is a pure transport layer.

---

## Phase 1 — Desktop WebSocket Server (Days 1–5)

### Goal
A working WebSocket server in Rust that accepts connections, handles PIN auth, and can echo JSON-RPC messages back. No iOS app yet — test with `wscat` from the terminal.

### Files to Create

#### `src-tauri/src/companion_types.rs`
All shared types. Create this first so everything else can import from it.

```rust
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcRequest {
    pub id: Option<String>,
    pub method: String,
    pub params: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcResponse {
    pub id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<JsonRpcError>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcError {
    pub code: i32,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcNotification {
    pub event: String,
    pub payload: serde_json::Value,
}

#[derive(Debug, Clone)]
pub enum ClientState {
    Pending { pin_attempts: u8 },
    Authenticated { peer_addr: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompanionConfig {
    pub port: u16,          // default: 8765
    pub pin_ttl_secs: u64,  // default: 300 (5 minutes)
    pub max_clients: usize, // default: 3
}

impl Default for CompanionConfig {
    fn default() -> Self {
        Self {
            port: 8765,
            pin_ttl_secs: 300,
            max_clients: 3,
        }
    }
}
```

#### `src-tauri/src/companion_auth.rs`
PIN generation, verification, and rate-limiting.

```rust
use rand::Rng;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;

pub struct PinManager {
    current_pin: Mutex<Option<(String, Instant)>>,
    ttl: Duration,
}

impl PinManager {
    pub fn new(ttl_secs: u64) -> Self {
        Self {
            current_pin: Mutex::new(None),
            ttl: Duration::from_secs(ttl_secs),
        }
    }

    pub async fn generate(&self) -> String {
        let pin: String = format!("{:06}", rand::thread_rng().gen_range(0..1_000_000));
        *self.current_pin.lock().await = Some((pin.clone(), Instant::now()));
        pin
    }

    pub async fn verify(&self, attempt: &str) -> bool {
        let guard = self.current_pin.lock().await;
        match &*guard {
            Some((pin, created_at)) => {
                if created_at.elapsed() > self.ttl {
                    return false; // expired
                }
                pin == attempt
            }
            None => false,
        }
    }

    pub async fn invalidate(&self) {
        *self.current_pin.lock().await = None;
    }
}
```

Note: add `rand = "0.8"` to `src-tauri/Cargo.toml` dependencies.

#### `src-tauri/src/companion_discovery.rs`
mDNS advertising so the iOS app can discover the desktop automatically.

```rust
use mdns_sd::{ServiceDaemon, ServiceInfo};

pub struct CompanionDiscovery {
    daemon: ServiceDaemon,
}

impl CompanionDiscovery {
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        let daemon = ServiceDaemon::new()?;
        Ok(Self { daemon })
    }

    pub fn advertise(&self, port: u16, hostname: &str) -> Result<(), Box<dyn std::error::Error>> {
        let service_type = "_alphonso._tcp.local.";
        let instance_name = format!("Alphonso-{}", hostname);
        let ip = local_ip().unwrap_or("0.0.0.0".to_string());

        let service_info = ServiceInfo::new(
            service_type,
            &instance_name,
            hostname,
            ip.as_str(),
            port,
            None,
        )?;

        self.daemon.register(service_info)?;
        Ok(())
    }

    pub fn stop(&self) {
        let _ = self.daemon.shutdown();
    }
}

fn local_ip() -> Option<String> {
    // Use the first non-loopback IPv4 address
    use std::net::{IpAddr, UdpSocket};
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    match socket.local_addr().ok()?.ip() {
        IpAddr::V4(ip) => Some(ip.to_string()),
        _ => None,
    }
}
```

Note: add `mdns-sd = "0.10"` to `src-tauri/Cargo.toml` dependencies.

#### `src-tauri/src/companion_router.rs`
Maps JSON-RPC method names to handlers. Each handler calls **already-existing** Tauri commands by invoking the same logic they use.

```rust
use crate::companion_types::{JsonRpcError, JsonRpcRequest, JsonRpcResponse};
use serde_json::{json, Value};

pub async fn route(req: JsonRpcRequest) -> JsonRpcResponse {
    let result = match req.method.as_str() {
        "get_status" => handle_get_status().await,
        "send_command" => handle_send_command(req.params).await,
        "abort_command" => handle_abort_command(req.params).await,
        "approve_task" => handle_approve_task(req.params).await,
        "get_projects" => handle_get_projects().await,
        _ => Err(JsonRpcError {
            code: -32601,
            message: format!("Method not found: {}", req.method),
        }),
    };

    match result {
        Ok(val) => JsonRpcResponse { id: req.id, result: Some(val), error: None },
        Err(e) => JsonRpcResponse { id: req.id, result: None, error: Some(e) },
    }
}

async fn handle_get_status() -> Result<Value, JsonRpcError> {
    // Return basic status — ollama reachability, agent count, version
    Ok(json!({
        "version": env!("CARGO_PKG_VERSION"),
        "agents": 9,
        "status": "running"
    }))
}

async fn handle_send_command(params: Value) -> Result<Value, JsonRpcError> {
    let text = params["text"].as_str().ok_or(JsonRpcError {
        code: -32602,
        message: "Missing 'text' param".into(),
    })?;
    // TODO Phase 2: pipe into joseExecutionEngineService via IPC
    Ok(json!({ "commandId": uuid::Uuid::new_v4().to_string(), "status": "queued", "text": text }))
}

async fn handle_abort_command(params: Value) -> Result<Value, JsonRpcError> {
    let _command_id = params["commandId"].as_str().ok_or(JsonRpcError {
        code: -32602,
        message: "Missing 'commandId' param".into(),
    })?;
    Ok(json!({ "ok": true }))
}

async fn handle_approve_task(params: Value) -> Result<Value, JsonRpcError> {
    let _task_id = params["taskId"].as_str().ok_or(JsonRpcError {
        code: -32602,
        message: "Missing 'taskId' param".into(),
    })?;
    Ok(json!({ "ok": true }))
}

async fn handle_get_projects() -> Result<Value, JsonRpcError> {
    Ok(json!({ "projects": [] }))
}
```

#### `src-tauri/src/companion_server.rs`
The main server — ties everything together.

```rust
use crate::companion_auth::PinManager;
use crate::companion_router::route;
use crate::companion_types::{ClientState, CompanionConfig, JsonRpcRequest, JsonRpcResponse};
use futures_util::{SinkExt, StreamExt};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::net::TcpListener;
use tokio::sync::{broadcast, Mutex};
use tokio_tungstenite::accept_async;
use tokio_tungstenite::tungstenite::Message;
use uuid::Uuid;

pub struct CompanionServer {
    config: CompanionConfig,
    pin_manager: Arc<PinManager>,
    clients: Arc<Mutex<HashMap<Uuid, ClientState>>>,
    event_tx: broadcast::Sender<String>, // for push events to all clients
}

impl CompanionServer {
    pub fn new(config: CompanionConfig) -> (Self, broadcast::Receiver<String>) {
        let (event_tx, event_rx) = broadcast::channel(256);
        let server = Self {
            pin_manager: Arc::new(PinManager::new(config.pin_ttl_secs)),
            clients: Arc::new(Mutex::new(HashMap::new())),
            event_tx,
            config,
        };
        (server, event_rx)
    }

    pub async fn generate_pin(&self) -> String {
        self.pin_manager.generate().await
    }

    // Call this to push an event to all authenticated clients
    pub fn broadcast_event(&self, event_json: String) {
        let _ = self.event_tx.send(event_json);
    }

    pub async fn run(&self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let addr = format!("0.0.0.0:{}", self.config.port);
        let listener = TcpListener::bind(&addr).await?;
        log::info!("Companion server listening on {}", addr);

        while let Ok((stream, peer_addr)) = listener.accept().await {
            let clients = Arc::clone(&self.clients);
            let pin_manager = Arc::clone(&self.pin_manager);
            let event_rx = self.event_tx.subscribe();

            tokio::spawn(async move {
                let client_id = Uuid::new_v4();
                clients
                    .lock()
                    .await
                    .insert(client_id, ClientState::Pending { pin_attempts: 0 });

                if let Err(e) = handle_connection(
                    stream,
                    peer_addr.to_string(),
                    client_id,
                    Arc::clone(&clients),
                    Arc::clone(&pin_manager),
                    event_rx,
                )
                .await
                {
                    log::warn!("Companion connection error: {}", e);
                }

                clients.lock().await.remove(&client_id);
            });
        }

        Ok(())
    }
}

async fn handle_connection(
    stream: tokio::net::TcpStream,
    peer_addr: String,
    client_id: Uuid,
    clients: Arc<Mutex<HashMap<Uuid, ClientState>>>,
    pin_manager: Arc<PinManager>,
    mut event_rx: broadcast::Receiver<String>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let ws = accept_async(stream).await?;
    let (mut ws_tx, mut ws_rx) = ws.split();

    loop {
        tokio::select! {
            // Inbound message from iOS
            msg = ws_rx.next() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        let state = clients.lock().await.get(&client_id).cloned();
                        let response = match state {
                            Some(ClientState::Authenticated { .. }) => {
                                // Parse and route
                                match serde_json::from_str::<JsonRpcRequest>(&text) {
                                    Ok(req) => serde_json::to_string(&route(req).await)?,
                                    Err(_) => r#"{"error":{"code":-32700,"message":"Parse error"}}"#.to_string(),
                                }
                            }
                            Some(ClientState::Pending { pin_attempts }) => {
                                // Only authenticate method allowed in Pending state
                                handle_auth(&text, client_id, &clients, &pin_manager, &peer_addr).await?
                            }
                            None => break,
                        };
                        ws_tx.send(Message::Text(response)).await?;
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Ok(Message::Ping(p))) => { ws_tx.send(Message::Pong(p)).await?; }
                    _ => {}
                }
            }
            // Outbound event from desktop
            event = event_rx.recv() => {
                if let Ok(json) = event {
                    let state = clients.lock().await.get(&client_id).cloned();
                    if matches!(state, Some(ClientState::Authenticated { .. })) {
                        ws_tx.send(Message::Text(json)).await?;
                    }
                }
            }
        }
    }

    Ok(())
}

async fn handle_auth(
    text: &str,
    client_id: Uuid,
    clients: &Arc<Mutex<HashMap<Uuid, ClientState>>>,
    pin_manager: &Arc<PinManager>,
    peer_addr: &str,
) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    #[derive(serde::Deserialize)]
    struct AuthRequest {
        method: String,
        params: AuthParams,
    }
    #[derive(serde::Deserialize)]
    struct AuthParams {
        pin: String,
    }

    match serde_json::from_str::<AuthRequest>(text) {
        Ok(req) if req.method == "authenticate" => {
            if pin_manager.verify(&req.params.pin).await {
                pin_manager.invalidate().await;
                clients.lock().await.insert(
                    client_id,
                    ClientState::Authenticated {
                        peer_addr: peer_addr.to_string(),
                    },
                );
                Ok(r#"{"result":{"authenticated":true}}"#.to_string())
            } else {
                Ok(r#"{"error":{"code":401,"message":"Invalid PIN"}}"#.to_string())
            }
        }
        _ => Ok(r#"{"error":{"code":403,"message":"Authentication required"}}"#.to_string()),
    }
}

/// Tauri command — called from the frontend to get the current pairing PIN
#[tauri::command]
pub async fn companion_get_pin(
    state: tauri::State<'_, Arc<CompanionServer>>,
) -> Result<String, String> {
    Ok(state.generate_pin().await)
}

/// Tauri command — get companion server status
#[tauri::command]
pub async fn companion_get_status(
    state: tauri::State<'_, Arc<CompanionServer>>,
) -> Result<serde_json::Value, String> {
    let clients = state.clients.lock().await;
    let connected = clients
        .values()
        .filter(|s| matches!(s, ClientState::Authenticated { .. }))
        .count();
    Ok(serde_json::json!({
        "running": true,
        "port": state.config.port,
        "connected_clients": connected,
    }))
}
```

Note: add `tokio-tungstenite = "0.21"`, `futures-util = "0.3"`, `uuid = { version = "1", features = ["v4"] }` to `src-tauri/Cargo.toml`.

---

### Register in `lib.rs`

At the top of `src-tauri/src/lib.rs`, add the module declarations:

```rust
mod companion_auth;
mod companion_discovery;
mod companion_router;
mod companion_server;
mod companion_types;
```

In the `tauri::Builder` chain, add the new commands to `.invoke_handler`:

```rust
companion_server::companion_get_pin,
companion_server::companion_get_status,
```

And in the `.setup()` closure, start the server:

```rust
let config = crate::companion_types::CompanionConfig::default();
let (server, _rx) = crate::companion_server::CompanionServer::new(config);
let server = std::sync::Arc::new(server);
let server_clone = std::sync::Arc::clone(&server);
app.manage(server_clone);
tokio::spawn(async move {
    if let Err(e) = server.run().await {
        log::error!("Companion server error: {}", e);
    }
});
```

### Cargo.toml additions

Add to `[dependencies]` in `src-tauri/Cargo.toml`:

```toml
tokio-tungstenite = "0.21"
futures-util = "0.3"
uuid = { version = "1", features = ["v4"] }
rand = "0.8"
mdns-sd = "0.10"
```

Note: `tokio`, `serde`, `serde_json` already exist in Cargo.toml.

### Phase 1 Test — verify with wscat

```bash
# Terminal 1 — run the app
npm run tauri dev

# Terminal 2 — connect a WebSocket client
npx wscat -c ws://localhost:8765

# In wscat, send auth (get PIN from app UI or companion_get_pin command):
{"method":"authenticate","params":{"pin":"123456"}}
# Should receive: {"result":{"authenticated":true}}

# Then send a status request:
{"id":"1","method":"get_status","params":{}}
# Should receive: {"id":"1","result":{"version":"2.0.6","agents":9,"status":"running"}}
```

### Phase 1 Rust Tests

Add to `src-tauri/src/companion_auth.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_pin_generate_and_verify() {
        let mgr = PinManager::new(300);
        let pin = mgr.generate().await;
        assert_eq!(pin.len(), 6);
        assert!(mgr.verify(&pin).await);
        assert!(!mgr.verify("000000").await);
    }

    #[tokio::test]
    async fn test_pin_invalidated_after_use() {
        let mgr = PinManager::new(300);
        let pin = mgr.generate().await;
        mgr.invalidate().await;
        assert!(!mgr.verify(&pin).await);
    }

    #[tokio::test]
    async fn test_pin_expired() {
        let mgr = PinManager::new(0); // 0-second TTL
        let pin = mgr.generate().await;
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        assert!(!mgr.verify(&pin).await);
    }
}
```

---

## Phase 2 — mDNS Discovery + Desktop UI (Days 6–8)

### Goal
The iOS app can automatically find the desktop on the local network. A PIN QR code appears in the desktop UI.

### New Tauri Command

In `companion_server.rs`, add:

```rust
/// Tauri command — start mDNS advertising
#[tauri::command]
pub async fn companion_start_discovery(port: u16) -> Result<(), String> {
    use crate::companion_discovery::CompanionDiscovery;
    let discovery = CompanionDiscovery::new().map_err(|e| e.to_string())?;
    let hostname = hostname::get()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or("alphonso-desktop".to_string());
    discovery.advertise(port, &hostname).map_err(|e| e.to_string())?;
    Ok(())
}
```

Add `hostname = "0.3"` to Cargo.toml.

### Desktop UI Component

Create `src/components/CompanionPairingPanel.jsx`:
- Shows "Remote Access" section in SettingsView
- "Generate PIN" button → calls `companion_get_pin` Tauri command
- Displays 6-digit PIN in large text (copy-to-clipboard on click)
- Shows QR code of `alphonso://<ip>:<port>?pin=<pin>` using a QR library
- Shows connection status: "0 devices connected" / "iPhone connected"
- Uses `companion_get_status` to poll every 5s

Wire into `SettingsView.jsx` under a new "Remote Access" section.

---

## Phase 3 — iOS App Core (Days 9–14)

### Project Setup

Create an Xcode project at `ios/AlphonsoCompanion/` in the repo root.

```
ios/
  AlphonsoCompanion.xcodeproj
  AlphonsoCompanion/
    AlphonsoCompanionApp.swift      — @main entry point
    ContentView.swift               — tab view: Chat | Agents | Boardroom | Settings
    Views/
      ChatView.swift
      AgentDockView.swift
      BoardroomView.swift
      SettingsView.swift
      PairingView.swift             — mDNS scan + PIN entry
    Services/
      WebSocketService.swift
      MDNSService.swift
      CacheService.swift
    Models/
      Message.swift
      AgentModel.swift
      ConnectionState.swift
  AlphonsoCompanionTests/
  AlphonsoCompanionUITests/
```

### `WebSocketService.swift` — core class

```swift
import Foundation
import Combine

@MainActor
class WebSocketService: ObservableObject {
    @Published var connectionState: ConnectionState = .disconnected
    @Published var messages: [Message] = []

    private var webSocketTask: URLSessionWebSocketTask?
    private let session = URLSession(configuration: .default)
    private var reconnectDelay: Double = 1.0

    func connect(host: String, port: Int, pin: String) {
        let url = URL(string: "ws://\(host):\(port)")!
        webSocketTask = session.webSocketTask(with: url)
        webSocketTask?.resume()
        connectionState = .connecting
        authenticate(pin: pin)
        receive()
    }

    private func authenticate(pin: String) {
        let msg = #"{"method":"authenticate","params":{"pin":"\#(pin)"}}"#
        send(text: msg)
    }

    func sendCommand(text: String) -> String {
        let id = UUID().uuidString
        let msg = """
        {"id":"\(id)","method":"send_command","params":{"text":"\(text)"}}
        """
        send(text: msg)
        return id
    }

    private func send(text: String) {
        webSocketTask?.send(.string(text)) { _ in }
    }

    private func receive() {
        webSocketTask?.receive { [weak self] result in
            switch result {
            case .success(.string(let text)):
                self?.handleMessage(text)
                self?.receive()
            case .failure:
                self?.scheduleReconnect()
            default:
                self?.receive()
            }
        }
    }

    private func handleMessage(_ text: String) {
        // Parse JSON-RPC response or notification and update @Published state
    }

    private func scheduleReconnect() {
        connectionState = .disconnected
        DispatchQueue.main.asyncAfter(deadline: .now() + reconnectDelay) { [weak self] in
            guard let self else { return }
            self.reconnectDelay = min(self.reconnectDelay * 2, 30.0)
            // Re-attempt connection with stored credentials
        }
    }

    func disconnect() {
        webSocketTask?.cancel(with: .normalClosure, reason: nil)
        connectionState = .disconnected
    }
}
```

### `MDNSService.swift` — discover the desktop

```swift
import Network
import Foundation

@MainActor
class MDNSService: ObservableObject {
    @Published var discovered: [DiscoveredHost] = []
    private var browser: NWBrowser?

    func startBrowsing() {
        let descriptor = NWBrowser.Descriptor.bonjourWithTXTRecord(
            type: "_alphonso._tcp",
            domain: "local."
        )
        browser = NWBrowser(for: descriptor, using: .tcp)
        browser?.browseResultsChangedHandler = { [weak self] results, _ in
            Task { @MainActor in
                self?.discovered = results.compactMap { result in
                    if case .service(let name, _, _, _) = result.endpoint {
                        return DiscoveredHost(name: name, endpoint: result.endpoint)
                    }
                    return nil
                }
            }
        }
        browser?.start(queue: .main)
    }

    func stopBrowsing() {
        browser?.cancel()
    }
}

struct DiscoveredHost: Identifiable {
    let id = UUID()
    let name: String
    let endpoint: NWEndpoint
}
```

### `PairingView.swift` — connection screen

```swift
import SwiftUI

struct PairingView: View {
    @ObservedObject var mdns: MDNSService
    @ObservedObject var ws: WebSocketService
    @State private var pin = ""
    @State private var selectedHost: DiscoveredHost?

    var body: some View {
        NavigationStack {
            List {
                Section("Discovered Desktops") {
                    if mdns.discovered.isEmpty {
                        Text("Scanning...").foregroundStyle(.secondary)
                    } else {
                        ForEach(mdns.discovered) { host in
                            Button(host.name) { selectedHost = host }
                                .foregroundColor(selectedHost?.id == host.id ? .accentColor : .primary)
                        }
                    }
                }
                Section("PIN Code") {
                    TextField("6-digit PIN from desktop", text: $pin)
                        .keyboardType(.numberPad)
                }
            }
            .toolbar {
                Button("Connect") {
                    guard let host = selectedHost, pin.count == 6 else { return }
                    // Resolve NWEndpoint to IP + port, then ws.connect(...)
                }
                .disabled(selectedHost == nil || pin.count != 6)
            }
            .navigationTitle("Connect to Desktop")
        }
        .onAppear { mdns.startBrowsing() }
        .onDisappear { mdns.stopBrowsing() }
    }
}
```

---

## Phase 4 — iOS UI: Chat + Agents + Boardroom (Days 15–18)

### `ChatView.swift`

```swift
import SwiftUI

struct ChatView: View {
    @ObservedObject var ws: WebSocketService
    @State private var inputText = ""

    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 12) {
                        ForEach(ws.messages) { msg in
                            MessageBubble(message: msg)
                                .id(msg.id)
                        }
                    }
                    .padding()
                }
                .onChange(of: ws.messages.count) { _ in
                    proxy.scrollTo(ws.messages.last?.id)
                }
            }

            HStack {
                TextField("Ask Alphonso...", text: $inputText, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                    .lineLimit(1...5)

                Button {
                    let text = inputText
                    inputText = ""
                    let _ = ws.sendCommand(text: text)
                } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.title2)
                }
                .disabled(inputText.isEmpty || ws.connectionState != .connected)
            }
            .padding()
            .background(.regularMaterial)
        }
        .navigationTitle("Chat")
    }
}
```

### `AgentDockView.swift`

Display all 9 agents with status badges. Agent names are static (Alphonso, Jose, Hector, Miya, Maria, Marcus, Echo, Sentinel, Nova). Status data comes from the `agent_status` WebSocket event.

### `BoardroomView.swift`

Display goals → batches → tasks hierarchy. Use `get_boardroom` JSON-RPC method. Approval buttons call `approve_task` with `action: "approve"` or `"reject"`.

---

## Phase 5 — Push Notifications + Polish (Days 19–23)

### Push Notifications (APNs)

When the desktop needs approval (`approval_needed` event), the iOS app should show a push notification even when backgrounded.

**iOS:** Request notification permissions in `AlphonsoCompanionApp.swift`:
```swift
UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in }
```

When `approval_needed` event arrives via WebSocket:
```swift
let content = UNMutableNotificationContent()
content.title = "Approval Required"
content.body = "\(event.agent): \(event.action) — \(event.risk) risk"
content.sound = .default
let request = UNNotificationRequest(identifier: event.taskId, content: content, trigger: nil)
UNUserNotificationCenter.current().add(request)
```

### Offline Queue

In `CacheService.swift`, use SwiftData to persist unsent commands:

```swift
@Model class QueuedCommand {
    var id: UUID
    var text: String
    var createdAt: Date
    init(text: String) { self.id = UUID(); self.text = text; self.createdAt = .now }
}
```

When disconnected, append to queue. On reconnect, drain the queue in order.

---

## Verification Checklist — Definition of Done

After each phase, verify:

### Phase 1
- [ ] `cargo build` passes with no errors in `src-tauri/`
- [ ] `cargo clippy -- -D warnings` clean
- [ ] `cargo fmt --all -- --check` clean
- [ ] `cargo test` — companion_auth tests all pass
- [ ] `wscat` connects to `ws://localhost:8765`, PIN auth works, `get_status` returns valid JSON

### Phase 2
- [ ] mDNS service registers without error in app logs
- [ ] CompanionPairingPanel visible in SettingsView
- [ ] PIN generates and displays in UI
- [ ] Status shows "0 clients connected" initially

### Phase 3
- [ ] iOS app builds in Xcode (no compile errors)
- [ ] Simulator: PairingView loads, mDNS scan runs
- [ ] Manual PIN entry → WebSocket auth completes → `get_status` response received
- [ ] All existing 1621+ JS tests still pass

### Phase 4
- [ ] Chat: message sent from iOS → appears in desktop activity log
- [ ] Streaming: token events appear in iOS message list in real time
- [ ] Agents: dock shows all 9 with correct names
- [ ] Boardroom: goals load from desktop

### Phase 5
- [ ] Approval notification fires on iOS when `approval_needed` event received
- [ ] Queued commands send after reconnect
- [ ] Dark/light mode follows system setting

---

## Important: Things That Already Exist — Do NOT Recreate

- `src/services/telegramCompanionService.js` — the **Telegram** companion (bot-based). Completely separate from this WebSocket iOS companion. Do not confuse them.
- `src-tauri/src/kv_store.rs` — KV storage, already handles `save_settings`/`load_settings`
- All 9 agent runtimes — the WebSocket server routes to these, does not reimplement them
- `policyEnforcementService.ts` — all agent commands still go through this gate
- `src/services/voiceService.js` — STT pipeline already exists if voice input on iOS is considered later

---

## Commit Convention for This Sprint

All commits on this sprint should be on a branch named `feat/ios-companion` and prefixed:

```
feat(companion): ...  — new server or iOS code
test(companion): ...  — new tests
fix(companion): ...   — bug fixes
docs(companion): ...  — documentation updates
```

When each phase is complete, open a PR to `main`. Do not merge phases out of order — each phase depends on the previous.

---

## Questions / Decisions Needed Before Starting

1. **iOS deployment target** — iOS 17 (SwiftData, more modern API) or iOS 16 (wider compatibility)?
2. **iOS repo location** — separate repo, git submodule in `ios/`, or same repo?
3. **TLS** — optional self-signed cert for encrypted local traffic, or plain `ws://` for now?
4. **Android** — parallel React Native app after iOS is done, or iOS only?

These do not block Phase 1 (desktop server). Start Phase 1 immediately and decide these before Phase 3 begins.
