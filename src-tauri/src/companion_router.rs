use crate::companion_types::{JsonRpcError, JsonRpcRequest, JsonRpcResponse};
use serde_json::{json, Value};

pub async fn route(req: JsonRpcRequest) -> JsonRpcResponse {
  let result = match req.method.as_str() {
    "get_status" => handle_get_status().await,
    "send_command" => handle_send_command(req.params).await,
    "abort_command" => handle_abort_command(req.params).await,
    "approve_task" => handle_approve_task(req.params).await,
    "get_projects" => handle_get_projects().await,
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

async fn handle_send_command(params: Value) -> Result<Value, JsonRpcError> {
  let text = params["text"].as_str().ok_or(JsonRpcError {
    code: -32602,
    message: "Missing 'text' param".into(),
  })?;
  Ok(json!({ "commandId": uuid::Uuid::new_v4().to_string(), "status": "queued", "text": text }))
}

async fn handle_abort_command(params: Value) -> Result<Value, JsonRpcError> {
  let _command_id = params["commandId"].as_str().ok_or(JsonRpcError {
    code: -32602,
    message: "Missing 'commandId' param".into(),
  })?;
  Ok(json!({ "ok": true }))
}

async fn handle_approve_task(params: Value) -> Result<Value, JsonRpcError> {
  let _task_id = params["taskId"].as_str().ok_or(JsonRpcError {
    code: -32602,
    message: "Missing 'taskId' param".into(),
  })?;
  Ok(json!({ "ok": true }))
}

async fn handle_get_projects() -> Result<Value, JsonRpcError> {
  Ok(json!({ "projects": [] }))
}
