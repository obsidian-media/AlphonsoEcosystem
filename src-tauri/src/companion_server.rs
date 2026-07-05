use crate::companion_auth::PinManager;
use crate::companion_router::route;
use crate::companion_types::{ClientState, CompanionConfig, JsonRpcRequest};
use futures_util::{SinkExt, StreamExt};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::AppHandle;
use tokio::net::TcpListener;
use tokio::sync::{broadcast, Mutex};
use tokio_tungstenite::accept_async;
use tokio_tungstenite::tungstenite::Message;
use uuid::Uuid;

pub struct CompanionServer {
  config: CompanionConfig,
  pin_manager: Arc<PinManager>,
  clients: Arc<Mutex<HashMap<Uuid, ClientState>>>,
  event_tx: broadcast::Sender<String>,
}

#[allow(dead_code)]
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

  #[allow(dead_code)]
  pub fn broadcast_event(&self, event_json: String) {
    let _ = self.event_tx.send(event_json);
  }

  pub async fn run(
    &self,
    app_handle: AppHandle,
  ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let addr = format!("0.0.0.0:{}", self.config.port);
    let listener = TcpListener::bind(&addr).await?;
    log::info!("Companion server listening on {}", addr);

    loop {
      let (stream, peer_addr) = listener.accept().await?;
      let clients = Arc::clone(&self.clients);
      let pin_manager = Arc::clone(&self.pin_manager);
      let event_rx = self.event_tx.subscribe();
      let app = app_handle.clone();

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
          app,
        )
        .await
        {
          // Handshake errors from non-WS probes (health checks, etc.) are expected noise
          log::debug!("Companion connection closed: {}", e);
        }

        clients.lock().await.remove(&client_id);
      });
    }
  }
}

async fn handle_connection(
  stream: tokio::net::TcpStream,
  peer_addr: String,
  client_id: Uuid,
  clients: Arc<Mutex<HashMap<Uuid, ClientState>>>,
  pin_manager: Arc<PinManager>,
  mut event_rx: broadcast::Receiver<String>,
  app: AppHandle,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
  let ws = accept_async(stream).await?;
  let (mut ws_tx, mut ws_rx) = ws.split();

  loop {
    tokio::select! {
        msg = ws_rx.next() => {
            match msg {
                Some(Ok(Message::Text(text))) => {
                    let state = clients.lock().await.get(&client_id).cloned();
                    let response = match state {
                        Some(ClientState::Authenticated { .. }) => {
                            match serde_json::from_str::<JsonRpcRequest>(&text) {
                                Ok(req) => serde_json::to_string(&route(req, app.clone()).await)?,
                                Err(_) => r#"{"error":{"code":-32700,"message":"Parse error"}}"#.to_string(),
                            }
                        }
                        Some(ClientState::Pending { pin_attempts: _ }) => {
                            handle_auth(&text, client_id, &clients, &pin_manager, &peer_addr).await?
                        }
                        None => break,
                    };
                    ws_tx.send(Message::Text(response.into())).await?;
                }
                Some(Ok(Message::Close(_))) | None => break,
                Some(Ok(Message::Ping(p))) => { ws_tx.send(Message::Pong(p)).await?; }
                _ => {}
            }
        }
        event = event_rx.recv() => {
            if let Ok(json) = event {
                let state = clients.lock().await.get(&client_id).cloned();
                if matches!(state, Some(ClientState::Authenticated { .. })) {
                    ws_tx.send(Message::Text(json.into())).await?;
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

#[tauri::command]
pub async fn companion_get_pin(
  state: tauri::State<'_, Arc<CompanionServer>>,
) -> Result<String, String> {
  Ok(state.generate_pin().await)
}

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

#[tauri::command]
pub async fn companion_start_discovery(port: u16) -> Result<(), String> {
  use crate::companion_discovery::CompanionDiscovery;
  let discovery = CompanionDiscovery::new().map_err(|e| e.to_string())?;
  let hostname = hostname::get()
    .map(|h| h.to_string_lossy().to_string())
    .unwrap_or("alphonso-desktop".to_string());
  discovery
    .advertise(port, &hostname)
    .map_err(|e| e.to_string())?;
  Ok(())
}

#[tauri::command]
pub async fn companion_get_local_ip() -> Result<Vec<String>, String> {
  use std::net::UdpSocket;
  let mut ips: Vec<String> = Vec::new();
  // Use UDP trick to discover the primary outbound IP without actually sending data
  if let Ok(sock) = UdpSocket::bind("0.0.0.0:0") {
    if sock.connect("8.8.8.8:80").is_ok() {
      if let Ok(addr) = sock.local_addr() {
        ips.push(addr.ip().to_string());
      }
    }
  }
  Ok(ips)
}

#[tauri::command]
pub async fn companion_broadcast(
  state: tauri::State<'_, Arc<CompanionServer>>,
  event: String,
  payload: serde_json::Value,
) -> Result<(), String> {
  let msg = serde_json::to_string(&serde_json::json!({"event": event, "payload": payload}))
    .map_err(|e| e.to_string())?;
  state.broadcast_event(msg);
  Ok(())
}
