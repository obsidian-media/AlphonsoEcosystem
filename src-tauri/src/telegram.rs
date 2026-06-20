use crate::{app_data_subdir, now_ms, ConnectorInboundMessage, ConnectorPollProof, ConnectorSendProof};
use serde_json::Value;
use std::fs;

fn json_value_to_plain_string(value: &Value) -> String {
  if let Some(text) = value.as_str() {
    return text.to_string();
  }
  if let Some(number) = value.as_i64() {
    return number.to_string();
  }
  if let Some(number) = value.as_u64() {
    return number.to_string();
  }
  value.to_string()
}

fn connector_cursor_path(app: &tauri::AppHandle, connector_id: &str) -> Result<std::path::PathBuf, String> {
  let mut dir = app_data_subdir(app, "connectors")?;
  dir.push(format!("{connector_id}_cursor.json"));
  Ok(dir)
}

fn read_connector_cursor(app: &tauri::AppHandle, connector_id: &str) -> Option<i64> {
  let path = connector_cursor_path(app, connector_id).ok()?;
  let raw = fs::read_to_string(path).ok()?;
  let parsed: Value = serde_json::from_str(&raw).ok()?;
  parsed.get("cursor").and_then(|value| value.as_i64())
}

fn write_connector_cursor(app: &tauri::AppHandle, connector_id: &str, cursor: i64) -> Result<(), String> {
  let path = connector_cursor_path(app, connector_id)?;
  let payload = serde_json::json!({
    "connectorId": connector_id,
    "cursor": cursor,
    "updatedAtMs": now_ms()
  });
  fs::write(path, payload.to_string()).map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) async fn connector_poll_telegram(
  http_client: tauri::State<'_, reqwest::Client>,
  app: tauri::AppHandle,
  limit: Option<u8>,
) -> Result<ConnectorPollProof, String> {
  let checked_at_ms = now_ms();
  let token = std::env::var("TELEGRAM_BOT_TOKEN")
    .map(|value| value.trim().to_string())
    .unwrap_or_default();
  if token.is_empty() {
    return Ok(ConnectorPollProof {
      connector_id: "telegram".to_string(),
      ok: false,
      count: 0,
      cursor: read_connector_cursor(&app, "telegram"),
      messages: vec![],
      checked_at_ms,
      trust: "unverified".to_string(),
      error: Some("TELEGRAM_BOT_TOKEN is not configured.".to_string()),
    });
  }

  let current_cursor = read_connector_cursor(&app, "telegram");
  let max_limit = limit.unwrap_or(10).clamp(1, 50);
  let client = http_client.inner();
  let endpoint = format!("https://api.telegram.org/bot{}/getUpdates", token);

  let mut query: Vec<(String, String)> = vec![
    ("limit".to_string(), max_limit.to_string()),
    ("timeout".to_string(), "0".to_string()),
    ("allowed_updates".to_string(), "[\"message\"]".to_string()),
  ];
  if let Some(cursor) = current_cursor {
    query.push(("offset".to_string(), (cursor + 1).to_string()));
  }

  let response = client
    .get(endpoint)
    .query(&query)
    .send()
    .await
    .map_err(|error| error.to_string())?;
  let status = response.status();
  let payload: Value = response.json().await.map_err(|error| error.to_string())?;
  if !status.is_success() {
    return Ok(ConnectorPollProof {
      connector_id: "telegram".to_string(),
      ok: false,
      count: 0,
      cursor: current_cursor,
      messages: vec![],
      checked_at_ms,
      trust: "failed".to_string(),
      error: Some(format!("Telegram getUpdates returned HTTP {}", status.as_u16())),
    });
  }
  if !payload.get("ok").and_then(|value| value.as_bool()).unwrap_or(false) {
    let description = payload
      .get("description")
      .and_then(|value| value.as_str())
      .unwrap_or("Telegram API returned ok=false.");
    return Ok(ConnectorPollProof {
      connector_id: "telegram".to_string(),
      ok: false,
      count: 0,
      cursor: current_cursor,
      messages: vec![],
      checked_at_ms,
      trust: "failed".to_string(),
      error: Some(description.to_string()),
    });
  }

  let mut next_cursor = current_cursor;
  let mut messages: Vec<ConnectorInboundMessage> = vec![];
  if let Some(rows) = payload.get("result").and_then(|value| value.as_array()) {
    for row in rows {
      let update_id = row.get("update_id").and_then(|value| value.as_i64()).unwrap_or(0);
      if update_id > 0 {
        next_cursor = Some(next_cursor.map(|cursor| cursor.max(update_id)).unwrap_or(update_id));
      }
      let message = row.get("message").or_else(|| row.get("edited_message"));
      let Some(message_value) = message else { continue };

      let chat_id = message_value
        .get("chat")
        .and_then(|chat| chat.get("id"))
        .map(json_value_to_plain_string)
        .unwrap_or_else(|| "unknown".to_string());
      let from_id = message_value
        .get("from")
        .and_then(|from| from.get("id"))
        .map(json_value_to_plain_string);
      let text = message_value
        .get("text")
        .and_then(|value| value.as_str())
        .or_else(|| message_value.get("caption").and_then(|value| value.as_str()))
        .unwrap_or("")
        .trim()
        .to_string();
      if text.is_empty() {
        continue;
      }
      let date_unix = message_value.get("date").and_then(|value| value.as_i64());
      messages.push(ConnectorInboundMessage {
        update_id,
        chat_id,
        from_id,
        text,
        date_unix,
        received_at_ms: checked_at_ms,
      });
    }
  }

  if let Some(cursor) = next_cursor {
    let _ = write_connector_cursor(&app, "telegram", cursor);
  }

  Ok(ConnectorPollProof {
    connector_id: "telegram".to_string(),
    ok: true,
    count: messages.len(),
    cursor: next_cursor,
    messages,
    checked_at_ms,
    trust: "verified".to_string(),
    error: None,
  })
}

#[tauri::command]
pub(crate) async fn connector_send_telegram(
  http_client: tauri::State<'_, reqwest::Client>,
  chat_id: String,
  text: String,
) -> Result<ConnectorSendProof, String> {
  let sent_at_ms = now_ms();
  let token = std::env::var("TELEGRAM_BOT_TOKEN")
    .map(|value| value.trim().to_string())
    .unwrap_or_default();
  if token.is_empty() {
    return Ok(ConnectorSendProof {
      connector_id: "telegram".to_string(),
      ok: false,
      target: chat_id,
      external_id: None,
      sent_at_ms,
      trust: "unverified".to_string(),
      error: Some("TELEGRAM_BOT_TOKEN is not configured.".to_string()),
    });
  }

  let clean_target = chat_id.trim().to_string();
  let clean_text = text.trim().to_string();
  if clean_target.is_empty() || clean_text.is_empty() {
    return Ok(ConnectorSendProof {
      connector_id: "telegram".to_string(),
      ok: false,
      target: clean_target,
      external_id: None,
      sent_at_ms,
      trust: "failed".to_string(),
      error: Some("chat_id and text are required.".to_string()),
    });
  }

  let client = http_client.inner();
  let endpoint = format!("https://api.telegram.org/bot{}/sendMessage", token);
  let payload = serde_json::json!({
    "chat_id": clean_target,
    "text": clean_text,
    "disable_web_page_preview": true
  });

  let response = client
    .post(endpoint)
    .json(&payload)
    .send()
    .await
    .map_err(|error| error.to_string())?;
  let status = response.status();
  let body: Value = response.json().await.map_err(|error| error.to_string())?;
  if !status.is_success() || !body.get("ok").and_then(|value| value.as_bool()).unwrap_or(false) {
    let description = body
      .get("description")
      .and_then(|value| value.as_str())
      .unwrap_or("Telegram sendMessage failed.");
    return Ok(ConnectorSendProof {
      connector_id: "telegram".to_string(),
      ok: false,
      target: payload.get("chat_id").map(json_value_to_plain_string).unwrap_or_default(),
      external_id: None,
      sent_at_ms,
      trust: "failed".to_string(),
      error: Some(description.to_string()),
    });
  }

  let external_id = body
    .get("result")
    .and_then(|result| result.get("message_id"))
    .map(json_value_to_plain_string);

  Ok(ConnectorSendProof {
    connector_id: "telegram".to_string(),
    ok: true,
    target: payload.get("chat_id").map(json_value_to_plain_string).unwrap_or_default(),
    external_id,
    sent_at_ms,
    trust: "verified".to_string(),
    error: None,
  })
}
