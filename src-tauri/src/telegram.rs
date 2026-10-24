use crate::{
  app_data_subdir, now_ms, ConnectorInboundMessage, ConnectorPollProof, ConnectorSendProof,
};
use serde::Deserialize;
use serde_json::Value;
use std::fs;

/// Telegram refuses a button whose data is longer than this (bytes).
const TELEGRAM_CALLBACK_DATA_MAX: usize = 64;

/// One inline button: the text shown and the data sent back when pressed.
#[derive(Deserialize, Clone, Debug)]
pub(crate) struct TelegramButton {
  pub(crate) text: String,
  pub(crate) data: String,
}

/// One update from getUpdates as an inbound message: a text message, or a
/// button press (phase 5). Anything else, or a message with no text, is None.
pub(crate) fn parse_telegram_update(
  row: &Value,
  received_at_ms: u64,
) -> Option<ConnectorInboundMessage> {
  let update_id = row
    .get("update_id")
    .and_then(|value| value.as_i64())
    .unwrap_or(0);
  if let Some(callback) = row.get("callback_query") {
    let callback_id = callback.get("id").map(json_value_to_plain_string)?;
    let chat_id = callback
      .get("message")
      .and_then(|message| message.get("chat"))
      .and_then(|chat| chat.get("id"))
      .map(json_value_to_plain_string)
      .unwrap_or_else(|| "unknown".to_string());
    return Some(ConnectorInboundMessage {
      update_id,
      chat_id,
      from_id: callback
        .get("from")
        .and_then(|from| from.get("id"))
        .map(json_value_to_plain_string),
      text: String::new(),
      date_unix: None,
      received_at_ms,
      callback_id: Some(callback_id),
      callback_data: callback
        .get("data")
        .and_then(|value| value.as_str())
        .map(|value| value.to_string()),
    });
  }
  let message_value = row.get("message").or_else(|| row.get("edited_message"))?;
  let chat_id = message_value
    .get("chat")
    .and_then(|chat| chat.get("id"))
    .map(json_value_to_plain_string)
    .unwrap_or_else(|| "unknown".to_string());
  let text = message_value
    .get("text")
    .and_then(|value| value.as_str())
    .or_else(|| {
      message_value
        .get("caption")
        .and_then(|value| value.as_str())
    })
    .unwrap_or("")
    .trim()
    .to_string();
  if text.is_empty() {
    return None;
  }
  Some(ConnectorInboundMessage {
    update_id,
    chat_id,
    from_id: message_value
      .get("from")
      .and_then(|from| from.get("id"))
      .map(json_value_to_plain_string),
    text,
    date_unix: message_value.get("date").and_then(|value| value.as_i64()),
    received_at_ms,
    callback_id: None,
    callback_data: None,
  })
}

/// The sendMessage body, with an inline keyboard when buttons are given.
/// A blank button or one whose data Telegram would refuse is an error.
pub(crate) fn telegram_send_payload(
  chat_id: &str,
  text: &str,
  buttons: Option<&Vec<Vec<TelegramButton>>>,
) -> Result<Value, String> {
  let mut payload = serde_json::json!({
    "chat_id": chat_id,
    "text": text,
    "disable_web_page_preview": true
  });
  if let Some(rows) = buttons.filter(|rows| !rows.is_empty()) {
    let mut keyboard = Vec::new();
    for row in rows {
      let mut keys = Vec::new();
      for button in row {
        if button.text.trim().is_empty() || button.data.is_empty() {
          return Err("A button needs a label and data.".to_string());
        }
        if button.data.len() > TELEGRAM_CALLBACK_DATA_MAX {
          return Err(format!(
            "A button's data is limited to {TELEGRAM_CALLBACK_DATA_MAX} bytes."
          ));
        }
        keys.push(serde_json::json!({ "text": button.text, "callback_data": button.data }));
      }
      keyboard.push(Value::Array(keys));
    }
    payload["reply_markup"] = serde_json::json!({ "inline_keyboard": keyboard });
  }
  Ok(payload)
}

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

fn connector_cursor_path(
  app: &tauri::AppHandle,
  connector_id: &str,
) -> Result<std::path::PathBuf, String> {
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

fn write_connector_cursor(
  app: &tauri::AppHandle,
  connector_id: &str,
  cursor: i64,
) -> Result<(), String> {
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
  token: Option<String>,
  limit: Option<u8>,
) -> Result<ConnectorPollProof, String> {
  let checked_at_ms = now_ms();
  let token = token
    .map(|value| value.trim().to_string())
    .filter(|value| !value.is_empty())
    .or_else(|| std::env::var("TELEGRAM_BOT_TOKEN").ok())
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
    // Messages and button presses (phase 5).
    (
      "allowed_updates".to_string(),
      "[\"message\",\"callback_query\"]".to_string(),
    ),
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
      error: Some(format!(
        "Telegram getUpdates returned HTTP {}",
        status.as_u16()
      )),
    });
  }
  if !payload
    .get("ok")
    .and_then(|value| value.as_bool())
    .unwrap_or(false)
  {
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
      let update_id = row
        .get("update_id")
        .and_then(|value| value.as_i64())
        .unwrap_or(0);
      if update_id > 0 {
        next_cursor = Some(
          next_cursor
            .map(|cursor| cursor.max(update_id))
            .unwrap_or(update_id),
        );
      }
      if let Some(message) = parse_telegram_update(row, checked_at_ms) {
        messages.push(message);
      }
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

/// Telegram's limits for a bot upload (phase 4b): 50 MB for any file, 10 MB for a photo.
const TELEGRAM_FILE_LIMIT: u64 = 50 * 1024 * 1024;
const TELEGRAM_PHOTO_LIMIT: u64 = 10 * 1024 * 1024;

/// Which Bot API method sends this file: (method, field, mime); None when it is over 50 MB.
pub(crate) fn telegram_file_method(
  ext: &str,
  size: u64,
) -> Option<(&'static str, &'static str, &'static str)> {
  if size > TELEGRAM_FILE_LIMIT {
    return None;
  }
  Some(match ext.to_ascii_lowercase().as_str() {
    "png" if size <= TELEGRAM_PHOTO_LIMIT => ("sendPhoto", "photo", "image/png"),
    "jpg" | "jpeg" if size <= TELEGRAM_PHOTO_LIMIT => ("sendPhoto", "photo", "image/jpeg"),
    "mp4" => ("sendVideo", "video", "video/mp4"),
    "png" => ("sendDocument", "document", "image/png"),
    "jpg" | "jpeg" => ("sendDocument", "document", "image/jpeg"),
    _ => ("sendDocument", "document", "application/octet-stream"),
  })
}

/// A multipart/form-data body with the chat, an optional caption and the file.
pub(crate) fn telegram_file_body(
  boundary: &str,
  chat_id: &str,
  caption: &str,
  field: &str,
  filename: &str,
  mime: &str,
  bytes: &[u8],
) -> Vec<u8> {
  let safe_name: String = filename
    .chars()
    .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'))
    .collect();
  let mut body = Vec::with_capacity(bytes.len() + 1024);
  body.extend_from_slice(
    format!(
      "--{boundary}\r\nContent-Disposition: form-data; name=\"chat_id\"\r\n\r\n{chat_id}\r\n"
    )
    .as_bytes(),
  );
  if !caption.trim().is_empty() {
    let text: String = caption.chars().take(1000).collect();
    body.extend_from_slice(
      format!("--{boundary}\r\nContent-Disposition: form-data; name=\"caption\"\r\n\r\n{text}\r\n")
        .as_bytes(),
    );
  }
  body.extend_from_slice(format!("--{boundary}\r\nContent-Disposition: form-data; name=\"{field}\"; filename=\"{safe_name}\"\r\nContent-Type: {mime}\r\n\r\n").as_bytes());
  body.extend_from_slice(bytes);
  body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());
  body
}

/// Sends a file from the output folder to a chat (phase 4b: a Higgsfield result).
/// Over Telegram's limit it sends nothing and answers `tooLarge`, so the app names the folder instead.
#[tauri::command]
pub(crate) async fn connector_send_telegram_file(
  http_client: tauri::State<'_, reqwest::Client>,
  token: Option<String>,
  chat_id: String,
  workspace_root: String,
  relative_path: String,
  caption: Option<String>,
) -> Result<Value, String> {
  let token = crate::utils::secret_or_env(token, "TELEGRAM_BOT_TOKEN");
  if token.trim().is_empty() || chat_id.trim().is_empty() {
    return Ok(
      serde_json::json!({ "ok": false, "error": "TELEGRAM_BOT_TOKEN or the chat is not set." }),
    );
  }
  let file = match crate::media_tools::checked_file(
    &workspace_root,
    &relative_path,
    &["png", "jpg", "jpeg", "mp4", "webp"],
  ) {
    Ok(f) => f,
    Err(e) => return Ok(serde_json::json!({ "ok": false, "error": e })),
  };
  let size = fs::metadata(&file).map(|m| m.len()).unwrap_or(0);
  let ext = file
    .extension()
    .and_then(|e| e.to_str())
    .unwrap_or("")
    .to_string();
  let Some((method, field, mime)) = telegram_file_method(&ext, size) else {
    return Ok(serde_json::json!({ "ok": false, "tooLarge": true }));
  };
  let bytes = fs::read(&file).map_err(|_| "The file could not be read.".to_string())?;
  let filename = file
    .file_name()
    .and_then(|n| n.to_str())
    .unwrap_or("file")
    .to_string();
  let boundary = format!("alphonso{}", now_ms());
  let body = telegram_file_body(
    &boundary,
    chat_id.trim(),
    caption.as_deref().unwrap_or(""),
    field,
    &filename,
    mime,
    &bytes,
  );
  let response = http_client
    .inner()
    .post(format!(
      "https://api.telegram.org/bot{}/{method}",
      token.trim()
    ))
    .header(
      "Content-Type",
      format!("multipart/form-data; boundary={boundary}"),
    )
    .body(body)
    .send()
    .await
    .map_err(|_| "Telegram could not be reached.".to_string())?;
  let answer: Value = response.json().await.unwrap_or(Value::Null);
  if answer.get("ok").and_then(|v| v.as_bool()).unwrap_or(false) {
    Ok(serde_json::json!({ "ok": true }))
  } else {
    let description = answer
      .get("description")
      .and_then(|v| v.as_str())
      .unwrap_or("Telegram refused the file.");
    Ok(serde_json::json!({ "ok": false, "error": description }))
  }
}

#[tauri::command]
pub(crate) async fn connector_send_telegram(
  http_client: tauri::State<'_, reqwest::Client>,
  rate_limiter: tauri::State<'_, crate::RateLimiter>,
  token: Option<String>,
  chat_id: String,
  text: String,
  buttons: Option<Vec<Vec<TelegramButton>>>,
) -> Result<ConnectorSendProof, String> {
  rate_limiter.check_and_record("connector_send_telegram")?;
  let sent_at_ms = now_ms();
  let token = token
    .map(|value| value.trim().to_string())
    .filter(|value| !value.is_empty())
    .or_else(|| std::env::var("TELEGRAM_BOT_TOKEN").ok())
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
  let payload = match telegram_send_payload(&clean_target, &clean_text, buttons.as_ref()) {
    Ok(payload) => payload,
    Err(error) => {
      return Ok(ConnectorSendProof {
        connector_id: "telegram".to_string(),
        ok: false,
        target: clean_target,
        external_id: None,
        sent_at_ms,
        trust: "failed".to_string(),
        error: Some(error),
      });
    }
  };

  let response = client
    .post(endpoint)
    .json(&payload)
    .send()
    .await
    .map_err(|error| error.to_string())?;
  let status = response.status();
  let body: Value = response.json().await.map_err(|error| error.to_string())?;
  if !status.is_success()
    || !body
      .get("ok")
      .and_then(|value| value.as_bool())
      .unwrap_or(false)
  {
    let description = body
      .get("description")
      .and_then(|value| value.as_str())
      .unwrap_or("Telegram sendMessage failed.");
    return Ok(ConnectorSendProof {
      connector_id: "telegram".to_string(),
      ok: false,
      target: payload
        .get("chat_id")
        .map(json_value_to_plain_string)
        .unwrap_or_default(),
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
    target: payload
      .get("chat_id")
      .map(json_value_to_plain_string)
      .unwrap_or_default(),
    external_id,
    sent_at_ms,
    trust: "verified".to_string(),
    error: None,
  })
}

/// Answer a button press so Telegram stops showing it as loading, with a
/// short text shown to the person who pressed it (phase 5).
#[tauri::command]
pub(crate) async fn connector_answer_telegram_callback(
  http_client: tauri::State<'_, reqwest::Client>,
  token: Option<String>,
  callback_id: String,
  text: String,
) -> Result<ConnectorSendProof, String> {
  let sent_at_ms = now_ms();
  let token = token
    .map(|value| value.trim().to_string())
    .filter(|value| !value.is_empty())
    .or_else(|| std::env::var("TELEGRAM_BOT_TOKEN").ok())
    .map(|value| value.trim().to_string())
    .unwrap_or_default();
  let failed = |error: String| ConnectorSendProof {
    connector_id: "telegram".to_string(),
    ok: false,
    target: callback_id.clone(),
    external_id: None,
    sent_at_ms,
    trust: "failed".to_string(),
    error: Some(error),
  };
  if token.is_empty() {
    return Ok(failed("TELEGRAM_BOT_TOKEN is not configured.".to_string()));
  }
  let endpoint = format!("https://api.telegram.org/bot{}/answerCallbackQuery", token);
  // Telegram shows at most 200 characters here.
  let short: String = text.chars().take(200).collect();
  let response = http_client
    .inner()
    .post(endpoint)
    .json(&serde_json::json!({ "callback_query_id": callback_id, "text": short }))
    .send()
    .await
    .map_err(|error| error.to_string())?;
  let body: Value = response.json().await.map_err(|error| error.to_string())?;
  if !body
    .get("ok")
    .and_then(|value| value.as_bool())
    .unwrap_or(false)
  {
    let description = body
      .get("description")
      .and_then(|value| value.as_str())
      .unwrap_or("Telegram answerCallbackQuery failed.");
    return Ok(failed(description.to_string()));
  }
  Ok(ConnectorSendProof {
    connector_id: "telegram".to_string(),
    ok: true,
    target: callback_id.clone(),
    external_id: None,
    sent_at_ms,
    trust: "verified".to_string(),
    error: None,
  })
}

#[cfg(test)]
mod tests {
  #[test]
  fn a_file_goes_by_its_kind_and_size() {
    assert_eq!(
      telegram_file_method("png", 1_000),
      Some(("sendPhoto", "photo", "image/png"))
    );
    assert_eq!(
      telegram_file_method("PNG", 11 * 1024 * 1024),
      Some(("sendDocument", "document", "image/png"))
    );
    assert_eq!(
      telegram_file_method("mp4", 40 * 1024 * 1024),
      Some(("sendVideo", "video", "video/mp4"))
    );
    assert_eq!(telegram_file_method("mp4", 51 * 1024 * 1024), None);
  }

  #[test]
  fn the_file_body_has_the_chat_caption_and_file() {
    let body = String::from_utf8(telegram_file_body(
      "B",
      "42",
      "Your video",
      "video",
      "a\"b.mp4",
      "video/mp4",
      b"DATA",
    ))
    .unwrap();
    assert!(
      body.starts_with("--B\r\nContent-Disposition: form-data; name=\"chat_id\"\r\n\r\n42\r\n")
    );
    assert!(body.contains("name=\"caption\"\r\n\r\nYour video\r\n"));
    assert!(body.contains(
      "name=\"video\"; filename=\"ab.mp4\"\r\nContent-Type: video/mp4\r\n\r\nDATA\r\n--B--\r\n"
    ));
    assert!(!String::from_utf8(telegram_file_body(
      "B",
      "1",
      "  ",
      "photo",
      "x.png",
      "image/png",
      b""
    ))
    .unwrap()
    .contains("caption"));
  }

  use super::*;
  use serde_json::json;

  #[test]
  fn a_message_update_parses_as_before() {
    let row = json!({ "update_id": 7, "message": { "chat": { "id": 42 }, "from": { "id": 9 }, "text": " /status ", "date": 100 } });
    let message = parse_telegram_update(&row, 5).expect("a message");
    assert_eq!(message.update_id, 7);
    assert_eq!(message.chat_id, "42");
    assert_eq!(message.from_id.as_deref(), Some("9"));
    assert_eq!(message.text, "/status");
    assert!(message.callback_id.is_none());
  }

  #[test]
  fn a_button_press_parses_with_its_id_data_and_chat() {
    let row = json!({ "update_id": 8, "callback_query": { "id": "cb1", "data": "j:abcd1234", "from": { "id": 9 }, "message": { "chat": { "id": 42 } } } });
    let message = parse_telegram_update(&row, 5).expect("a button press");
    assert_eq!(message.chat_id, "42");
    assert_eq!(message.from_id.as_deref(), Some("9"));
    assert_eq!(message.text, "");
    assert_eq!(message.callback_id.as_deref(), Some("cb1"));
    assert_eq!(message.callback_data.as_deref(), Some("j:abcd1234"));
  }

  #[test]
  fn an_empty_message_or_unknown_update_is_skipped() {
    assert!(parse_telegram_update(
      &json!({ "update_id": 1, "message": { "chat": { "id": 1 }, "text": "  " } }),
      0
    )
    .is_none());
    assert!(parse_telegram_update(&json!({ "update_id": 2, "poll": {} }), 0).is_none());
  }

  #[test]
  fn buttons_go_in_an_inline_keyboard_only_when_given() {
    let plain = telegram_send_payload("42", "hi", None).expect("payload");
    assert!(plain.get("reply_markup").is_none());
    let buttons = vec![vec![TelegramButton {
      text: "Approve".into(),
      data: "j:abcd1234".into(),
    }]];
    let with = telegram_send_payload("42", "hi", Some(&buttons)).expect("payload");
    assert_eq!(
      with["reply_markup"]["inline_keyboard"][0][0]["text"],
      "Approve"
    );
    assert_eq!(
      with["reply_markup"]["inline_keyboard"][0][0]["callback_data"],
      "j:abcd1234"
    );
  }

  #[test]
  fn a_button_with_too_much_data_is_refused_before_sending() {
    let buttons = vec![vec![TelegramButton {
      text: "Approve".into(),
      data: "x".repeat(65),
    }]];
    assert!(telegram_send_payload("42", "hi", Some(&buttons)).is_err());
    let blank = vec![vec![TelegramButton {
      text: " ".into(),
      data: "j:1".into(),
    }]];
    assert!(telegram_send_payload("42", "hi", Some(&blank)).is_err());
  }
}
