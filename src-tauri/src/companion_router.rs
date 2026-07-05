use crate::companion_types::{JsonRpcError, JsonRpcRequest, JsonRpcResponse};
use serde_json::{json, Value};
use tauri::AppHandle;
use tauri::Emitter;

pub async fn route(req: JsonRpcRequest, app: AppHandle) -> JsonRpcResponse {
  let result = match req.method.as_str() {
    "get_status" => handle_get_status().await,
    "send_command" => handle_send_command(req.params, app).await,
    "abort_command" => handle_abort_command(req.params, app.clone()).await,
    "approve_task" => handle_approve_task(req.params, app).await,
    "get_projects" => handle_get_projects(app.clone()).await,
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
  app
    .emit(
      "companion://command",
      json!({
          "commandId": command_id,
          "text": text,
          "source": "ios_companion"
      }),
    )
    .ok();

  Ok(json!({ "commandId": command_id, "status": "queued", "text": text }))
}

async fn handle_abort_command(params: Value, app: AppHandle) -> Result<Value, JsonRpcError> {
  let command_id = params["commandId"].as_str().ok_or(JsonRpcError {
    code: -32602,
    message: "Missing 'commandId' param".into(),
  })?;
  // Tell the frontend to cancel this pipeline via companion://abort event
  app
    .emit("companion://abort", json!({ "commandId": command_id }))
    .ok();
  Ok(json!({ "ok": true, "commandId": command_id }))
}

async fn handle_approve_task(params: Value, app: AppHandle) -> Result<Value, JsonRpcError> {
  let task_id = params["taskId"].as_str().ok_or(JsonRpcError {
    code: -32602,
    message: "Missing 'taskId' param".into(),
  })?;

  // Emit Tauri event that ApprovalModal listens to
  app
    .emit("companion://approve", json!({ "taskId": task_id }))
    .ok();

  Ok(json!({ "ok": true }))
}

async fn handle_get_projects(app: AppHandle) -> Result<Value, JsonRpcError> {
  // Read orchestration receipts from KV; derive unique project names from receipt agentId/summary
  let raw =
    crate::kv_store::kv_get(app, "alphonso_orchestration_receipts_v1".to_string()).unwrap_or(None);
  let receipts: Vec<Value> = raw
    .and_then(|r| serde_json::from_str(&r).ok())
    .unwrap_or_default();

  // Derive project entries: unique (agentId or first word of summary) with last timestamp
  use std::collections::HashMap;
  let mut projects: HashMap<String, Value> = HashMap::new();
  for r in &receipts {
    let name = r["agentId"]
      .as_str()
      .or_else(|| r["agent"].as_str())
      .unwrap_or("alphonso")
      .to_string();
    let ts = r["timestampMs"].as_u64().unwrap_or(0);
    let entry = projects.entry(name.clone()).or_insert(json!({
      "id": name,
      "name": name,
      "lastActivityMs": ts,
      "receiptCount": 0
    }));
    if ts > entry["lastActivityMs"].as_u64().unwrap_or(0) {
      entry["lastActivityMs"] = json!(ts);
    }
    entry["receiptCount"] = json!(entry["receiptCount"].as_u64().unwrap_or(0) + 1);
  }

  let mut list: Vec<Value> = projects.into_values().collect();
  list.sort_by(|a, b| {
    b["lastActivityMs"]
      .as_u64()
      .unwrap_or(0)
      .cmp(&a["lastActivityMs"].as_u64().unwrap_or(0))
  });
  Ok(json!({ "projects": list }))
}

async fn handle_get_boardroom(app: AppHandle) -> Result<Value, JsonRpcError> {
  // Read from KV store: alphonso_boardroom_sessions_v1
  let raw =
    crate::kv_store::kv_get(app, "alphonso_boardroom_sessions_v1".to_string()).unwrap_or(None);
  let sessions: Value = raw
    .and_then(|r| serde_json::from_str(&r).ok())
    .unwrap_or(json!([]));
  Ok(json!({ "sessions": sessions }))
}
