use crate::companion_types::{JsonRpcError, JsonRpcRequest, JsonRpcResponse};
use serde_json::{json, Value};
use tauri::AppHandle;
use tauri::Emitter;

pub async fn route(req: JsonRpcRequest, app: AppHandle) -> JsonRpcResponse {
  let result = match req.method.as_str() {
    "get_status" => handle_get_status().await,
    "get_operations" => handle_get_operations(app.clone()).await,
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
  let agent_id = params["agentId"].as_str().unwrap_or("alphonso");
  if !matches!(
    agent_id,
    "alphonso" | "jose" | "hector" | "miya" | "maria" | "marcus" | "echo" | "sentinel" | "nova"
  ) {
    return Err(JsonRpcError {
      code: -32602,
      message: "Unsupported 'agentId' param".into(),
    });
  }
  let language = params["language"].as_str().unwrap_or("en-US");
  if !matches!(
    language,
    "en-US" | "es-US" | "fr-FR" | "de-DE" | "ja-JP" | "zh-CN" | "fa-IR"
  ) {
    return Err(JsonRpcError {
      code: -32602,
      message: "Unsupported 'language' param".into(),
    });
  }
  let voice_conversation = params["voiceConversation"].as_bool().unwrap_or(false);
  let command_id = uuid::Uuid::new_v4().to_string();

  // Emit a Tauri event that the React frontend listens to for Jose routing
  app
    .emit(
      "companion://command",
      json!({
          "commandId": command_id,
          "text": text,
          "source": "ios_companion",
          "agentId": agent_id,
          "language": language,
          "voiceConversation": voice_conversation
      }),
    )
    .ok();

  Ok(json!({ "commandId": command_id, "status": "queued", "text": text }))
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn voice_command_payload_preserves_agent_and_language() {
    let payload = json!({
      "agentId": "maria",
      "language": "fa-IR",
      "voiceConversation": true
    });
    assert_eq!(payload["agentId"], "maria");
    assert_eq!(payload["language"], "fa-IR");
    assert_eq!(payload["voiceConversation"], true);
  }

  #[test]
  fn operations_snapshot_keeps_empty_state_honest() {
    let snapshot = operations_snapshot(&[]);
    assert_eq!(snapshot["activeWork"], json!([]));
    assert_eq!(snapshot["recentOutcomes"], json!([]));
    assert_eq!(snapshot["approvals"], json!([]));
  }

  #[test]
  fn operations_snapshot_separates_active_and_terminal_receipts() {
    let receipts = vec![
      json!({ "id": "done", "status": "completed", "agent": "maria", "details": { "summary": "Verified" }, "timestampMs": 2 }),
      json!({ "id": "live", "status": "running", "agent": "jose", "details": { "summary": "Deploying" }, "timestampMs": 3 }),
    ];
    let snapshot = operations_snapshot(&receipts);
    assert_eq!(snapshot["activeWork"][0]["id"], "live");
    assert_eq!(snapshot["recentOutcomes"][0]["id"], "done");
  }

  #[test]
  fn operations_snapshot_keeps_all_completed_receipt_variants_out_of_active_work() {
    let receipts = vec![
      json!({ "id": "executed", "status": "executed", "timestampMs": 1 }),
      json!({ "id": "reported", "status": "reported_to_jose", "timestampMs": 2 }),
      json!({ "id": "success", "status": "success", "timestampMs": 3 }),
      json!({ "id": "approval", "status": "pending_approval", "timestampMs": 4 }),
    ];

    let snapshot = operations_snapshot(&receipts);

    assert_eq!(snapshot["activeWork"][0]["id"], "approval");
    assert_eq!(snapshot["recentOutcomes"].as_array().unwrap().len(), 3);
    assert_eq!(snapshot["recentOutcomes"][0]["id"], "success");
    assert_eq!(snapshot["recentOutcomes"][1]["id"], "reported");
    assert_eq!(snapshot["recentOutcomes"][2]["id"], "executed");
  }
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

fn receipt_title(receipt: &Value) -> String {
  receipt["details"]["summary"]
    .as_str()
    .or_else(|| receipt["details"]["reason"].as_str())
    .or_else(|| receipt["actionType"].as_str())
    .unwrap_or("Desktop activity")
    .to_string()
}

fn operations_snapshot(receipts: &[Value]) -> Value {
  let is_terminal = |status: &str| {
    matches!(
      status,
      "recorded"
        | "completed"
        | "failed"
        | "cancelled"
        | "canceled"
        | "aborted"
        | "stopped"
        | "approved"
        | "rejected"
        | "executed"
        | "reported_to_jose"
        | "success"
        | "dead_letter"
    )
  };
  let mut active_work = Vec::new();
  let mut recent_outcomes = Vec::new();

  for receipt in receipts.iter().rev() {
    let status = receipt["status"].as_str().unwrap_or("recorded");
    let title = receipt_title(receipt);
    let item = json!({
      "id": receipt["id"].as_str().unwrap_or_default(),
      "title": title,
      "summary": title,
      "agent": receipt["agent"].as_str().unwrap_or("alphonso"),
      "status": status,
      "commandId": receipt["commandId"].as_str(),
      "timestampMs": receipt["timestampMs"].as_u64().unwrap_or(0),
    });
    if is_terminal(status) {
      recent_outcomes.push(item);
    } else {
      active_work.push(item);
    }
  }

  active_work.truncate(12);
  recent_outcomes.truncate(12);
  json!({
    "activeWork": active_work,
    "recentOutcomes": recent_outcomes,
    // The authoritative approval queue is currently owned by the desktop web runtime.
    // Do not derive actionable approvals from historical receipts.
    "approvals": [],
  })
}

async fn handle_get_operations(app: AppHandle) -> Result<Value, JsonRpcError> {
  let raw =
    crate::kv_store::kv_get(app, "alphonso_orchestration_receipts_v1".to_string()).unwrap_or(None);
  let receipts: Vec<Value> = raw
    .and_then(|value| serde_json::from_str(&value).ok())
    .unwrap_or_default();
  Ok(json!({ "operations": operations_snapshot(&receipts) }))
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
