use crate::companion_types::{JsonRpcError, JsonRpcRequest, JsonRpcResponse};
use serde_json::{json, Value};
use tauri::AppHandle;
use tauri::Emitter;

pub async fn route(req: JsonRpcRequest, app: AppHandle) -> JsonRpcResponse {
  let result = match req.method.as_str() {
    "get_status" => handle_get_status().await,
    "send_command" => handle_send_command(req.params, app).await,
    "abort_command" => handle_abort_command(req.params).await,
    "approve_task" => handle_approve_task(req.params, app).await,
    "get_projects" => handle_get_projects().await,
    "get_boardroom" => handle_get_boardroom(app).await,
    _ => Err(JsonRpcError {
      code: -32601,
      message: format!("Method not found: {}", req.method),
    }),
  };

  match result {
    Ok(val) => JsonRpcResponse {
      id: req.id,
      result: Some(val),
      error: None,
    },
    Err(e) => JsonRpcResponse {
      id: req.id,
      result: None,
      error: Some(e),
    },
  }
}

async fn handle_get_status() -> Result<Value, JsonRpcError> {
  Ok(json!({
      "version": env!("CARGO_PKG_VERSION"),
      "agents": 9,
      "status": "running"
  }))
}

async fn handle_send_command(params: Value, app: AppHandle) -> Result<Value, JsonRpcError> {
  let text = params["text"].as_str().ok_or(JsonRpcError {
    code: -32602,
    message: "Missing 'text' param".into(),
  })?;
  let command_id = uuid::Uuid::new_v4().to_string();

  // Emit a Tauri event that the React frontend listens to for Jose routing
  app.emit("companion://command", json!({
      "commandId": command_id,
      "text": text,
      "source": "ios_companion"
  })).ok();

  Ok(json!({ "commandId": command_id, "status": "queued", "text": text }))
}

async fn handle_abort_command(params: Value) -> Result<Value, JsonRpcError> {
  let _command_id = params["commandId"].as_str().ok_or(JsonRpcError {
    code: -32602,
    message: "Missing 'commandId' param".into(),
  })?;
  Ok(json!({ "ok": true }))
}

async fn handle_approve_task(params: Value, app: AppHandle) -> Result<Value, JsonRpcError> {
  let task_id = params["taskId"].as_str().ok_or(JsonRpcError {
    code: -32602,
    message: "Missing 'taskId' param".into(),
  })?;

  // Emit Tauri event that ApprovalModal listens to
  app.emit("companion://approve", json!({ "taskId": task_id })).ok();

  Ok(json!({ "ok": true }))
}

async fn handle_get_projects() -> Result<Value, JsonRpcError> {
  Ok(json!({ "projects": [] }))
}

async fn handle_get_boardroom(app: AppHandle) -> Result<Value, JsonRpcError> {
  // Read from KV store: alphonso_boardroom_sessions_v1
  let raw = crate::kv_store::kv_get(app, "alphonso_boardroom_sessions_v1".to_string())
    .unwrap_or(None);
  let sessions: Value = raw
    .and_then(|r| serde_json::from_str(&r).ok())
    .unwrap_or(json!([]));
  Ok(json!({ "sessions": sessions }))
}
