use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;

use crate::now_ms;

#[derive(Serialize)]
pub(crate) struct OllamaRuntimeProof {
  endpoint: String,
  reachable: bool,
  http_status: Option<u16>,
  models: Vec<String>,
  reason: Option<String>,
  checked_at_ms: u64,
  trust: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OllamaModelInfo {
  name: String,
  size: Option<i64>,
  modified_at: Option<String>,
  digest: Option<String>,
  details: Option<Value>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OllamaModelsProof {
  endpoint: String,
  http_status: Option<u16>,
  models: Vec<OllamaModelInfo>,
  trust: String,
  reason: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OllamaGenerateProof {
  endpoint: String,
  http_status: Option<u16>,
  model: String,
  response: String,
  done: bool,
  trust: String,
  error: Option<String>,
}

#[tauri::command]
pub(crate) async fn check_ollama_runtime(
  endpoint: Option<String>,
) -> Result<OllamaRuntimeProof, String> {
  let base = endpoint
    .unwrap_or_else(|| "http://localhost:11434".to_string())
    .trim_end_matches('/')
    .to_string();
  let url = format!("{base}/api/tags");

  let client = reqwest::Client::new();
  let response = client
    .get(&url)
    .timeout(Duration::from_secs(8))
    .send()
    .await;

  let checked_at_ms = now_ms();

  match response {
    Ok(response) => {
      let status = response.status();
      let code = status.as_u16();

      if !status.is_success() {
        return Ok(OllamaRuntimeProof {
          endpoint: base,
          reachable: false,
          http_status: Some(code),
          models: vec![],
          reason: Some(format!("HTTP {code} from /api/tags")),
          checked_at_ms,
          trust: "failed".to_string(),
        });
      }

      let body: Value = response
        .json()
        .await
        .unwrap_or(Value::Object(serde_json::Map::new()));

      let models = body
        .get("models")
        .and_then(Value::as_array)
        .map(|list| {
          list
            .iter()
            .filter_map(|item| item.get("name").and_then(Value::as_str).map(str::to_string))
            .collect::<Vec<String>>()
        })
        .unwrap_or_default();

      Ok(OllamaRuntimeProof {
        endpoint: base,
        reachable: true,
        http_status: Some(code),
        models,
        reason: None,
        checked_at_ms,
        trust: "verified".to_string(),
      })
    }
    Err(error) => {
      let reason = if error.is_timeout() {
        "Request timeout".to_string()
      } else {
        error.to_string()
      };

      Ok(OllamaRuntimeProof {
        endpoint: base,
        reachable: false,
        http_status: None,
        models: vec![],
        reason: Some(reason),
        checked_at_ms,
        trust: "failed".to_string(),
      })
    }
  }
}

#[tauri::command]
pub(crate) async fn ollama_list_models(
  endpoint: Option<String>,
) -> Result<OllamaModelsProof, String> {
  let base = endpoint
    .unwrap_or_else(|| "http://localhost:11434".to_string())
    .trim_end_matches('/')
    .to_string();
  let url = format!("{base}/api/tags");
  let client = reqwest::Client::new();
  let response = client
    .get(&url)
    .timeout(Duration::from_secs(10))
    .send()
    .await;

  match response {
    Ok(response) => {
      let code = response.status().as_u16();
      let status = response.status();
      if !status.is_success() {
        return Ok(OllamaModelsProof {
          endpoint: base,
          http_status: Some(code),
          models: vec![],
          trust: "failed".to_string(),
          reason: Some(format!("HTTP {code} from /api/tags")),
        });
      }

      let body: Value = response
        .json()
        .await
        .unwrap_or(Value::Object(serde_json::Map::new()));

      let models = body
        .get("models")
        .and_then(Value::as_array)
        .map(|list| {
          list
            .iter()
            .filter_map(|item| {
              let name = item.get("name").and_then(Value::as_str)?.to_string();
              let size = item.get("size").and_then(Value::as_i64);
              let modified_at = item
                .get("modified_at")
                .and_then(Value::as_str)
                .map(str::to_string);
              let digest = item
                .get("digest")
                .and_then(Value::as_str)
                .map(str::to_string);
              let details = item.get("details").cloned();
              Some(OllamaModelInfo {
                name,
                size,
                modified_at,
                digest,
                details,
              })
            })
            .collect::<Vec<OllamaModelInfo>>()
        })
        .unwrap_or_default();

      Ok(OllamaModelsProof {
        endpoint: base,
        http_status: Some(code),
        models,
        trust: "verified".to_string(),
        reason: None,
      })
    }
    Err(error) => Ok(OllamaModelsProof {
      endpoint: base,
      http_status: None,
      models: vec![],
      trust: "failed".to_string(),
      reason: Some(if error.is_timeout() {
        "Request timeout".to_string()
      } else {
        error.to_string()
      }),
    }),
  }
}

/// One turn of an `/api/chat` conversation, as the frontend sends it.
#[derive(Deserialize, Serialize, Clone, Debug)]
pub(crate) struct OllamaChatMessage {
  role: String,
  content: String,
}

/// Reply text from an Ollama response body. `/api/generate` answers with
/// `response`; `/api/chat` answers with `message.content`.
fn ollama_reply_text(data: &Value) -> String {
  data
    .get("response")
    .and_then(Value::as_str)
    .or_else(|| {
      data
        .get("message")
        .and_then(|message| message.get("content"))
        .and_then(Value::as_str)
    })
    .unwrap_or("")
    .to_string()
}

/// Turns an Ollama HTTP answer into the proof the frontend reads. Shared by
/// `ollama_generate` and `ollama_chat` so both report errors the same way.
fn ollama_reply_proof(
  base: String,
  model: String,
  code: u16,
  status_ok: bool,
  data: &Value,
  api_path: &str,
) -> OllamaGenerateProof {
  let response_text = ollama_reply_text(data);
  let done = data
    .get("done")
    .and_then(Value::as_bool)
    .unwrap_or(!response_text.is_empty());
  let error_text = data
    .get("error")
    .and_then(Value::as_str)
    .map(str::to_string);
  let success = status_ok && error_text.is_none();

  OllamaGenerateProof {
    endpoint: base,
    http_status: Some(code),
    model,
    response: response_text,
    done,
    trust: if success {
      "verified".to_string()
    } else {
      "failed".to_string()
    },
    error: if success {
      None
    } else {
      error_text.or_else(|| Some(format!("HTTP {code} from {api_path}")))
    },
  }
}

fn ollama_request_failed_proof(
  base: String,
  model: String,
  error: reqwest::Error,
) -> OllamaGenerateProof {
  OllamaGenerateProof {
    endpoint: base,
    http_status: None,
    model,
    response: String::new(),
    done: false,
    trust: "failed".to_string(),
    error: Some(if error.is_timeout() {
      "Request timeout".to_string()
    } else {
      error.to_string()
    }),
  }
}

fn ollama_base(endpoint: Option<String>) -> String {
  endpoint
    .unwrap_or_else(|| "http://localhost:11434".to_string())
    .trim_end_matches('/')
    .to_string()
}

/// POSTs a non-streaming request to one Ollama endpoint and converts the
/// answer. Requests leave from the Rust side, so a user-started Ollama that
/// rejects the desktop window's origin still answers them.
async fn ollama_post(
  base: String,
  model: String,
  api_path: &str,
  body: Value,
) -> OllamaGenerateProof {
  let url = format!("{base}{api_path}");
  let response = reqwest::Client::new()
    .post(&url)
    .json(&body)
    // A cold local model load (especially from a secondary drive) can take
    // longer than the UI stream timeout. Keep the desktop fallback alive long
    // enough for Ollama to bring the runner online.
    .timeout(Duration::from_secs(300))
    .send()
    .await;

  match response {
    Ok(response) => {
      let code = response.status().as_u16();
      let status_ok = response.status().is_success();
      let data: Value = response
        .json()
        .await
        .unwrap_or(Value::Object(serde_json::Map::new()));
      ollama_reply_proof(base, model, code, status_ok, &data, api_path)
    }
    Err(error) => ollama_request_failed_proof(base, model, error),
  }
}

#[tauri::command]
pub(crate) async fn ollama_generate(
  endpoint: Option<String>,
  model: String,
  prompt: String,
  format: Option<String>,
) -> Result<OllamaGenerateProof, String> {
  let base = ollama_base(endpoint);
  let body = ollama_generate_body(&model, &prompt, format.as_deref());
  Ok(ollama_post(base, model, "/api/generate", body).await)
}

/// Body for `/api/generate`. `format: "json"` makes Ollama constrain the
/// reply to valid JSON, which small models otherwise often get wrong when a
/// caller parses the reply (Content Studio's brief and draft). Any other
/// value is ignored rather than passed through.
pub(crate) fn ollama_generate_body(model: &str, prompt: &str, format: Option<&str>) -> Value {
  let mut body = serde_json::json!({
    "model": model,
    "prompt": prompt,
    "stream": false
  });
  if format == Some("json") {
    body["format"] = Value::String("json".to_string());
  }
  body
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OllamaUnloadReport {
  endpoint: String,
  unloaded: Vec<String>,
  error: Option<String>,
}

/// Names of the models `/api/ps` reports as loaded.
pub(crate) fn loaded_model_names(ps: &Value) -> Vec<String> {
  ps.get("models")
    .and_then(Value::as_array)
    .map(|models| {
      models
        .iter()
        .filter_map(|m| {
          m.get("name")
            .or_else(|| m.get("model"))
            .and_then(Value::as_str)
        })
        .map(str::to_string)
        .collect()
    })
    .unwrap_or_default()
}

/// Asks Ollama to unload every model it has in memory (`keep_alive: 0`), so
/// a local image job gets the GPU. On a 6 GB card a loaded 7B model left
/// ComfyUI so little memory that the first image took 445 s (QA, 2026-10-21).
/// Best effort: the report says what was unloaded and what went wrong; the
/// caller carries on either way. The next chat reloads the model.
#[tauri::command]
pub(crate) async fn ollama_unload_models(
  endpoint: Option<String>,
) -> Result<OllamaUnloadReport, String> {
  let base = ollama_base(endpoint);
  let client = reqwest::Client::new();
  let ps = match client
    .get(format!("{base}/api/ps"))
    .timeout(Duration::from_secs(10))
    .send()
    .await
  {
    Ok(response) => response.json::<Value>().await.unwrap_or(Value::Null),
    Err(error) => {
      return Ok(OllamaUnloadReport {
        endpoint: base,
        unloaded: Vec::new(),
        error: Some(error.to_string()),
      })
    }
  };
  let mut unloaded = Vec::new();
  let mut errors = Vec::new();
  for name in loaded_model_names(&ps) {
    let body = serde_json::json!({ "model": name, "keep_alive": 0 });
    match client
      .post(format!("{base}/api/generate"))
      .json(&body)
      .timeout(Duration::from_secs(30))
      .send()
      .await
    {
      Ok(response) if response.status().is_success() => unloaded.push(name),
      Ok(response) => errors.push(format!("{name}: HTTP {}", response.status().as_u16())),
      Err(error) => errors.push(format!("{name}: {error}")),
    }
  }
  Ok(OllamaUnloadReport {
    endpoint: base,
    unloaded,
    error: if errors.is_empty() {
      None
    } else {
      Some(errors.join("; "))
    },
  })
}

/// Non-streaming `/api/chat` call used as the desktop fallback for chat. It
/// keeps the real role/content turns, so the model's own chat template
/// applies instead of a flattened prompt.
#[tauri::command]
pub(crate) async fn ollama_chat(
  endpoint: Option<String>,
  model: String,
  messages: Vec<OllamaChatMessage>,
) -> Result<OllamaGenerateProof, String> {
  let base = ollama_base(endpoint);
  let body = serde_json::json!({
    "model": model,
    "messages": messages,
    "stream": false
  });
  Ok(ollama_post(base, model, "/api/chat", body).await)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn loaded_model_names_reads_api_ps() {
    let ps = serde_json::json!({ "models": [{ "name": "qwen2.5-coder:7b" }, { "model": "llama3.2:3b" }, { "size": 1 }] });
    assert_eq!(
      loaded_model_names(&ps),
      vec!["qwen2.5-coder:7b", "llama3.2:3b"]
    );
    assert!(loaded_model_names(&serde_json::json!({})).is_empty());
    assert!(loaded_model_names(&Value::Null).is_empty());
  }

  #[test]
  fn generate_body_asks_for_json_only_when_requested() {
    let plain = ollama_generate_body("llama3.2:3b", "hi", None);
    assert!(plain.get("format").is_none());
    assert_eq!(plain["stream"], serde_json::json!(false));
    let json = ollama_generate_body("llama3.2:3b", "hi", Some("json"));
    assert_eq!(json["format"], serde_json::json!("json"));
    let other = ollama_generate_body("llama3.2:3b", "hi", Some("yaml"));
    assert!(other.get("format").is_none());
  }

  #[test]
  fn reply_text_reads_generate_and_chat_shapes() {
    assert_eq!(
      ollama_reply_text(&serde_json::json!({ "response": "hi" })),
      "hi"
    );
    assert_eq!(
      ollama_reply_text(
        &serde_json::json!({ "message": { "role": "assistant", "content": "hello" } })
      ),
      "hello"
    );
    assert_eq!(ollama_reply_text(&serde_json::json!({})), "");
  }

  #[test]
  fn reply_proof_marks_success_and_done() {
    let data = serde_json::json!({ "message": { "content": "ok" }, "done": true });
    let proof = ollama_reply_proof("http://x".into(), "m".into(), 200, true, &data, "/api/chat");
    assert_eq!(proof.response, "ok");
    assert!(proof.done);
    assert_eq!(proof.trust, "verified");
    assert!(proof.error.is_none());
  }

  #[test]
  fn reply_proof_reports_http_status_without_error_body() {
    let data = serde_json::json!({});
    let proof = ollama_reply_proof(
      "http://x".into(),
      "m".into(),
      403,
      false,
      &data,
      "/api/chat",
    );
    assert_eq!(proof.trust, "failed");
    assert_eq!(proof.error.as_deref(), Some("HTTP 403 from /api/chat"));
  }

  #[test]
  fn reply_proof_prefers_ollama_error_text() {
    let data = serde_json::json!({ "error": "model 'x' not found" });
    let proof = ollama_reply_proof(
      "http://x".into(),
      "m".into(),
      404,
      false,
      &data,
      "/api/generate",
    );
    assert_eq!(proof.error.as_deref(), Some("model 'x' not found"));
  }

  #[test]
  fn chat_message_serializes_role_and_content() {
    let message = OllamaChatMessage {
      role: "user".into(),
      content: "hey".into(),
    };
    assert_eq!(
      serde_json::to_value(&message).unwrap(),
      serde_json::json!({ "role": "user", "content": "hey" })
    );
  }
}
