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

    let max_pin_attempts = self.config.max_pin_attempts;

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
          max_pin_attempts,
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

// Internal per-connection handler; the parameters are all distinct pieces of
// connection state (socket, identity, shared registries, config) that don't
// naturally group into a struct worth introducing here.
#[allow(clippy::too_many_arguments)]
async fn handle_connection(
  stream: tokio::net::TcpStream,
  peer_addr: String,
  client_id: Uuid,
  clients: Arc<Mutex<HashMap<Uuid, ClientState>>>,
  pin_manager: Arc<PinManager>,
  mut event_rx: broadcast::Receiver<String>,
  app: AppHandle,
  max_pin_attempts: u8,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
  let ws = accept_async(stream).await?;
  let (mut ws_tx, mut ws_rx) = ws.split();

  loop {
    tokio::select! {
        msg = ws_rx.next() => {
            match msg {
                Some(Ok(Message::Text(text))) => {
                    let state = clients.lock().await.get(&client_id).cloned();
                    let (response, should_close) = match state {
                        Some(ClientState::Authenticated { .. }) => {
                            let r = match serde_json::from_str::<JsonRpcRequest>(&text) {
                                Ok(req) => serde_json::to_string(&route(req, app.clone()).await)?,
                                Err(_) => r#"{"error":{"code":-32700,"message":"Parse error"}}"#.to_string(),
                            };
                            (r, false)
                        }
                        Some(ClientState::Pending { pin_attempts }) => {
                            handle_auth(
                                &text, client_id, &clients, &pin_manager, &peer_addr,
                                pin_attempts, max_pin_attempts,
                            )
                            .await?
                        }
                        None => break,
                    };
                    ws_tx.send(Message::Text(response.into())).await?;
                    // Drop the connection after too many wrong PINs so the socket
                    // can't be held open to keep guessing within the PIN's TTL.
                    if should_close {
                        break;
                    }
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

/// Handles a pending client's auth message. Returns the JSON response plus a
/// flag indicating whether the caller should close the connection (set once the
/// wrong-PIN attempt budget is exhausted). Every wrong PIN increments the
/// client's `pin_attempts`; on the final allowed miss the live PIN is
/// invalidated so a fresh one must be generated before any retry is possible.
async fn handle_auth(
  text: &str,
  client_id: Uuid,
  clients: &Arc<Mutex<HashMap<Uuid, ClientState>>>,
  pin_manager: &Arc<PinManager>,
  peer_addr: &str,
  pin_attempts: u8,
  max_pin_attempts: u8,
) -> Result<(String, bool), Box<dyn std::error::Error + Send + Sync>> {
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
        Ok((r#"{"result":{"authenticated":true}}"#.to_string(), false))
      } else {
        let attempts = pin_attempts.saturating_add(1);
        if attempts >= max_pin_attempts {
          // Budget exhausted: kill this PIN and signal disconnect.
          pin_manager.invalidate().await;
          Ok((
            r#"{"error":{"code":429,"message":"Too many PIN attempts — PIN invalidated, request a new one"}}"#
              .to_string(),
            true,
          ))
        } else {
          clients.lock().await.insert(
            client_id,
            ClientState::Pending {
              pin_attempts: attempts,
            },
          );
          Ok((
            r#"{"error":{"code":401,"message":"Invalid PIN"}}"#.to_string(),
            false,
          ))
        }
      }
    }
    _ => Ok((
      r#"{"error":{"code":403,"message":"Authentication required"}}"#.to_string(),
      false,
    )),
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

#[cfg(test)]
mod tests {
  use super::*;

  fn pending_clients(client_id: Uuid) -> Arc<Mutex<HashMap<Uuid, ClientState>>> {
    let clients = Arc::new(Mutex::new(HashMap::new()));
    // Insert synchronously via blocking lock is not available; use try_lock.
    clients
      .try_lock()
      .unwrap()
      .insert(client_id, ClientState::Pending { pin_attempts: 0 });
    clients
  }

  #[tokio::test]
  async fn test_wrong_pin_locks_out_and_invalidates_after_budget() {
    let pin_manager = Arc::new(PinManager::new(300));
    let pin = pin_manager.generate().await;
    let client_id = Uuid::new_v4();
    let clients = pending_clients(client_id);
    let wrong = r#"{"method":"authenticate","params":{"pin":"000000"}}"#;
    let max = 3u8;

    let (_r, close) = handle_auth(
      wrong,
      client_id,
      &clients,
      &pin_manager,
      "127.0.0.1:1",
      0,
      max,
    )
    .await
    .unwrap();
    assert!(!close, "first miss must not close");
    let (_r, close) = handle_auth(
      wrong,
      client_id,
      &clients,
      &pin_manager,
      "127.0.0.1:1",
      1,
      max,
    )
    .await
    .unwrap();
    assert!(!close, "second miss must not close");
    let (resp, close) = handle_auth(
      wrong,
      client_id,
      &clients,
      &pin_manager,
      "127.0.0.1:1",
      2,
      max,
    )
    .await
    .unwrap();
    assert!(close, "budget-exhausting miss must close the connection");
    assert!(
      resp.contains("429"),
      "lockout response should carry code 429"
    );
    // The live PIN must be dead after lockout, so the real PIN can't be reused.
    assert!(
      !pin_manager.verify(&pin).await,
      "PIN must be invalidated on lockout"
    );
  }

  #[tokio::test]
  async fn test_correct_pin_authenticates_without_closing() {
    let pin_manager = Arc::new(PinManager::new(300));
    let pin = pin_manager.generate().await;
    let client_id = Uuid::new_v4();
    let clients = pending_clients(client_id);
    let msg = format!(
      r#"{{"method":"authenticate","params":{{"pin":"{}"}}}}"#,
      pin
    );

    let (resp, close) = handle_auth(&msg, client_id, &clients, &pin_manager, "127.0.0.1:1", 0, 5)
      .await
      .unwrap();
    assert!(!close);
    assert!(resp.contains("authenticated"));
    assert!(matches!(
      clients.lock().await.get(&client_id),
      Some(ClientState::Authenticated { .. })
    ));
  }
}
