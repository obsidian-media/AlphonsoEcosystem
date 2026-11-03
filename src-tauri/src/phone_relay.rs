//! The computer's connection to the phone relay (phone app; moved to the backend 2026-11-03).
//! The window's security policy doesn't let it connect to the relay, so the backend holds the
//! one WebSocket and passes text frames both ways: `phone_relay_open` connects (closing any
//! connection already open), `phone_relay_send` sends, `phone_relay_close` closes, and
//! everything that happens arrives in the window as `phone://relay` events tagged with the
//! connection's id. Frames are already sealed (`phone_box.rs`); this module never reads them.
//! The relay's address is fixed when the app is built (`VITE_PHONE_RELAY_URL`), so nothing in
//! the window can point the connection elsewhere.
use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};
use tokio_tungstenite::tungstenite::protocol::WebSocketConfig;
use tokio_tungstenite::tungstenite::Message;

pub(crate) const NO_RELAY: &str = "Phone access isn't available in this version of Alphonso.";
const NOT_OPEN: &str = "Not connected to the phone relay.";
const BAD_DEVICE: &str = "That phone's id isn't valid.";
const EVENT: &str = "phone://relay";
/// The phone's own limit on one sealed frame is 4 MB (`PHONE_MAX_FRAME_BYTES`); base64 and
/// the envelope add about a third.
const MAX_FRAME_BYTES: usize = 6 * 1024 * 1024;

struct Conn {
  id: u64,
  tx: UnboundedSender<String>,
}
static CURRENT: Mutex<Option<Conn>> = Mutex::new(None);
static NEXT_ID: AtomicU64 = AtomicU64::new(1);

#[derive(Serialize, Clone)]
struct RelayEvent {
  id: u64,
  kind: &'static str,
  #[serde(skip_serializing_if = "Option::is_none")]
  text: Option<String>,
}

/// An address the computer may connect to: wss, or ws to this computer only.
pub(crate) fn relay_url_ok(url: &str) -> bool {
  let Ok(parsed) = reqwest::Url::parse(url.trim()) else {
    return false;
  };
  let local = matches!(parsed.host_str(), Some("127.0.0.1" | "localhost" | "[::1]"));
  match parsed.scheme() {
    "wss" => parsed.host_str().is_some(),
    "ws" => local,
    _ => false,
  }
}

/// The relay's https address for its WebSocket address (unpairing uses it).
pub(crate) fn http_base(url: &str) -> Option<String> {
  let mut parsed = reqwest::Url::parse(url.trim()).ok()?;
  let scheme = if parsed.scheme() == "ws" { "http" } else { "https" };
  parsed.set_scheme(scheme).ok()?;
  parsed.set_path("");
  parsed.set_query(None);
  Some(parsed.as_str().trim_end_matches('/').to_string())
}

/// The relay address built in, or (debug builds only, for `npm run tauri dev`) the one the
/// window was built with.
pub(crate) fn relay_target(
  built: Option<&str>,
  from_window: Option<&str>,
) -> Result<String, String> {
  let candidate = match built.map(str::trim).filter(|u| !u.is_empty()) {
    Some(url) => Some(url),
    None if cfg!(debug_assertions) => from_window.map(str::trim).filter(|u| !u.is_empty()),
    None => None,
  };
  match candidate {
    Some(url) if relay_url_ok(url) => Ok(url.to_string()),
    _ => Err(NO_RELAY.to_string()),
  }
}

fn built_relay() -> Option<&'static str> {
  option_env!("VITE_PHONE_RELAY_URL")
}

pub(crate) fn device_id_ok(id: &str) -> bool {
  let ok_char = |c: char| c.is_ascii_alphanumeric() || c == '-' || c == '_';
  !id.is_empty() && id.len() <= 128 && id.chars().all(ok_char)
}

fn emit(app: &AppHandle, id: u64, kind: &'static str, text: Option<String>) {
  let _ = app.emit(EVENT, RelayEvent { id, kind, text });
}

fn take_current(only: Option<u64>) {
  let mut current = CURRENT.lock().unwrap_or_else(|e| e.into_inner());
  if only.is_none_or(|id| current.as_ref().is_some_and(|c| c.id == id)) {
    // Dropping the sender ends the connection's task, which closes the socket.
    *current = None;
  }
}

async fn run(app: AppHandle, url: String, id: u64, mut rx: UnboundedReceiver<String>) {
  let mut config = WebSocketConfig::default();
  config.max_message_size = Some(MAX_FRAME_BYTES);
  config.max_frame_size = Some(MAX_FRAME_BYTES);
  let connected = tokio_tungstenite::connect_async_with_config(url, Some(config), false).await;
  let Ok((socket, _)) = connected else {
    take_current(Some(id));
    emit(&app, id, "close", None);
    return;
  };
  emit(&app, id, "open", None);
  let (mut write, mut read) = socket.split();
  loop {
    tokio::select! {
      out = rx.recv() => match out {
        Some(text) => {
          if write.send(Message::Text(text.into())).await.is_err() {
            break;
          }
        }
        None => {
          let _ = write.close().await;
          break;
        }
      },
      incoming = read.next() => match incoming {
        Some(Ok(Message::Text(text))) => emit(&app, id, "message", Some(text.to_string())),
        Some(Ok(Message::Close(_))) | Some(Err(_)) | None => break,
        Some(Ok(_)) => {}
      },
    }
  }
  take_current(Some(id));
  emit(&app, id, "close", None);
}

/// Connects to the relay (closing a connection already open) and returns the new
/// connection's id; its events carry that id.
#[tauri::command]
pub fn phone_relay_open(app: AppHandle, window_relay_url: Option<String>) -> Result<u64, String> {
  let url = relay_target(built_relay(), window_relay_url.as_deref())?;
  let id = NEXT_ID.fetch_add(1, Ordering::SeqCst);
  let (tx, rx) = unbounded_channel();
  take_current(None);
  *CURRENT.lock().unwrap_or_else(|e| e.into_inner()) = Some(Conn { id, tx });
  tauri::async_runtime::spawn(run(app, url, id, rx));
  Ok(id)
}

#[tauri::command]
pub fn phone_relay_send(id: u64, text: String) -> Result<(), String> {
  let current = CURRENT.lock().unwrap_or_else(|e| e.into_inner());
  match current.as_ref() {
    Some(conn) if conn.id == id => conn.tx.send(text).map_err(|_| NOT_OPEN.to_string()),
    _ => Err(NOT_OPEN.to_string()),
  }
}

#[tauri::command]
pub fn phone_relay_close(id: u64) {
  take_current(Some(id));
}

/// Tells the relay a phone was removed. The token is the user's own sign-in, used once here.
#[tauri::command]
pub async fn phone_relay_unpair(
  device_id: String,
  id_token: String,
  window_relay_url: Option<String>,
) -> Result<(), String> {
  if !device_id_ok(&device_id) {
    return Err(BAD_DEVICE.to_string());
  }
  let url = relay_target(built_relay(), window_relay_url.as_deref())?;
  let base = http_base(&url).ok_or_else(|| NO_RELAY.to_string())?;
  let client = reqwest::Client::builder()
    .timeout(std::time::Duration::from_secs(20))
    .build()
    .map_err(|_| "The relay couldn't be reached.".to_string())?;
  let sent = client
    .delete(format!("{base}/pair/{device_id}"))
    .bearer_auth(id_token)
    .send()
    .await;
  match sent {
    Ok(res) if res.status().is_success() || res.status().as_u16() == 404 => Ok(()),
    Ok(res) => Err(format!("The relay refused to forget the phone ({}).", res.status().as_u16())),
    Err(_) => Err("The relay couldn't be reached.".to_string()),
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn only_wss_or_a_local_ws_address_is_used() {
    assert!(relay_url_ok("wss://relay.example/link"));
    assert!(relay_url_ok("ws://127.0.0.1:8080/link"));
    assert!(relay_url_ok("ws://localhost:8080/link"));
    assert!(!relay_url_ok("ws://example.com/link"));
    assert!(!relay_url_ok("http://relay.example/link"));
    assert!(!relay_url_ok("https://relay.example/link"));
    assert!(!relay_url_ok(""));
    assert!(!relay_url_ok("not a url"));
  }

  #[test]
  fn the_https_base_drops_the_path() {
    let base = http_base("wss://r.example/link?x=1");
    assert_eq!(base.as_deref(), Some("https://r.example"));
    let local = http_base("ws://127.0.0.1:8080/link");
    assert_eq!(local.as_deref(), Some("http://127.0.0.1:8080"));
  }

  #[test]
  fn the_built_address_wins_and_none_means_no_relay() {
    let built = relay_target(Some("wss://r.example/link"), Some("wss://other.example/link"));
    assert_eq!(built.unwrap(), "wss://r.example/link");
    assert_eq!(relay_target(None, None), Err(NO_RELAY.to_string()));
    let bad = relay_target(Some("ws://example.com/link"), None);
    assert_eq!(bad, Err(NO_RELAY.to_string()));
  }

  #[test]
  fn the_window_address_counts_only_in_debug_builds() {
    let from_window = relay_target(Some("  "), Some("wss://dev.example/link"));
    if cfg!(debug_assertions) {
      assert_eq!(from_window.unwrap(), "wss://dev.example/link");
    } else {
      assert_eq!(from_window, Err(NO_RELAY.to_string()));
    }
  }

  #[test]
  fn device_ids_are_checked() {
    assert!(device_id_ok("phone-abc_123"));
    assert!(!device_id_ok(""));
    assert!(!device_id_ok("../pair"));
    assert!(!device_id_ok("a b"));
    assert!(!device_id_ok(&"x".repeat(129)));
  }

  #[test]
  fn sending_without_a_connection_is_refused() {
    assert_eq!(phone_relay_send(987_654, "x".to_string()), Err(NOT_OPEN.to_string()));
  }
}
