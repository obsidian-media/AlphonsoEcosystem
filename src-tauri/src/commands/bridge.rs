use serde_json::Value;
use std::time::Duration;

fn normalize_bridge_path_prefix(raw: &str) -> String {
  let trimmed = raw.trim();
  if trimmed.is_empty() {
    "/api/alphonso-bridge".to_string()
  } else if trimmed.starts_with('/') {
    trimmed.to_string()
  } else {
    format!("/{}", trimmed)
  }
}

fn trim_trailing_slashes(raw: &str) -> String {
  raw.trim().trim_end_matches('/').to_string()
}

#[tauri::command]
pub(crate) fn alphonso_bridge_status() -> Value {
  let base_url = std::env::var("ALPHONSO_BRIDGE_URL").unwrap_or_default();
  let token = std::env::var("ALPHONSO_BRIDGE_TOKEN").unwrap_or_default();
  let path_prefix = std::env::var("ALPHONSO_BRIDGE_PATH_PREFIX")
    .ok()
    .map(|value| normalize_bridge_path_prefix(&value))
    .unwrap_or_else(|| "/api/alphonso-bridge".to_string());
  let timeout_ms = std::env::var("ALPHONSO_BRIDGE_TIMEOUT_MS")
    .ok()
    .and_then(|value| value.trim().parse::<u64>().ok())
    .unwrap_or(15000);
  let configured = !base_url.trim().is_empty() && !token.trim().is_empty();

  serde_json::json!({
    "success": true,
    "configured": configured,
    "enabled": configured,
    "status": if configured { "configured" } else { "setup_required" },
    "baseUrlConfigured": !base_url.trim().is_empty(),
    "tokenConfigured": !token.trim().is_empty(),
    "pathPrefix": path_prefix,
    "timeoutMs": timeout_ms
  })
}

#[tauri::command]
pub(crate) async fn alphonso_bridge_send_packet(
  state: tauri::State<'_, reqwest::Client>,
  packet: Value,
) -> Result<Value, String> {
  let base_url = std::env::var("ALPHONSO_BRIDGE_URL")
    .map_err(|_| "ALPHONSO_BRIDGE_URL is not configured.".to_string())?;
  let token = std::env::var("ALPHONSO_BRIDGE_TOKEN")
    .map_err(|_| "ALPHONSO_BRIDGE_TOKEN is not configured.".to_string())?;
  let path_prefix = std::env::var("ALPHONSO_BRIDGE_PATH_PREFIX")
    .ok()
    .map(|value| normalize_bridge_path_prefix(&value))
    .unwrap_or_else(|| "/api/alphonso-bridge".to_string());
  let timeout_ms = std::env::var("ALPHONSO_BRIDGE_TIMEOUT_MS")
    .ok()
    .and_then(|value| value.trim().parse::<u64>().ok())
    .unwrap_or(15000);
  let url = format!("{}{}", trim_trailing_slashes(&base_url), path_prefix);
  // Use shared reqwest::Client from managed state (connection pooling)
  let client = state.inner().clone();

  let response = client
    .post(&url)
    .bearer_auth(token.trim())
    .json(&packet)
    .timeout(Duration::from_millis(timeout_ms))
    .send()
    .await
    .map_err(|error| error.to_string())?;

  let http_status = response.status().as_u16();
  let response_text = response.text().await.map_err(|error| error.to_string())?;
  let parsed_response =
    serde_json::from_str(&response_text).unwrap_or(serde_json::Value::String(response_text));
  let status_proof = alphonso_bridge_status();
  let ok = http_status < 400;

  Ok(serde_json::json!({
    "success": ok,
    "ok": ok,
    "httpStatus": http_status,
    "response": parsed_response,
    "bridge": status_proof,
    "status": if ok { "synced" } else { "failed" }
  }))
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn trim_trailing_slashes_removes_trailing_slashes() {
    assert_eq!(
      trim_trailing_slashes("http://localhost:11434/"),
      "http://localhost:11434"
    );
    assert_eq!(
      trim_trailing_slashes("http://localhost:11434///"),
      "http://localhost:11434"
    );
    assert_eq!(
      trim_trailing_slashes("  http://localhost:11434/  "),
      "http://localhost:11434"
    );
  }

  #[test]
  fn trim_trailing_slashes_leaves_clean_urls_unchanged() {
    assert_eq!(
      trim_trailing_slashes("http://localhost:11434"),
      "http://localhost:11434"
    );
    assert_eq!(trim_trailing_slashes(""), "");
  }
}
