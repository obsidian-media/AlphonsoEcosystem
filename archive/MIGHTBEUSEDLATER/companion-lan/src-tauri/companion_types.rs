use serde::{Deserialize, Serialize};

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

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcNotification {
  pub event: String,
  pub payload: serde_json::Value,
}

#[allow(dead_code)]
#[derive(Debug, Clone)]
pub enum ClientState {
  Pending { pin_attempts: u8 },
  Authenticated { peer_addr: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompanionConfig {
  pub port: u16,
  pub pin_ttl_secs: u64,
  pub max_clients: usize,
  /// Maximum wrong-PIN attempts a pending client may make before the
  /// connection is dropped and the current PIN is invalidated. Bounds
  /// brute-force of the 6-digit PIN over the network.
  pub max_pin_attempts: u8,
}

impl Default for CompanionConfig {
  fn default() -> Self {
    Self {
      port: 8765,
      pin_ttl_secs: 300,
      max_clients: 3,
      max_pin_attempts: 5,
    }
  }
}
