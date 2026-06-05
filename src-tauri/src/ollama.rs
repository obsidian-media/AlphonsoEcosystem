use serde::Serialize;
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
pub(crate) async fn check_ollama_runtime(endpoint: Option<String>) -> Result<OllamaRuntimeProof, String> {
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
pub(crate) async fn ollama_list_models(endpoint: Option<String>) -> Result<OllamaModelsProof, String> {
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
              let modified_at = item.get("modified_at").and_then(Value::as_str).map(str::to_string);
              let digest = item.get("digest").and_then(Value::as_str).map(str::to_string);
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
      reason: Some(if error.is_timeout() { "Request timeout".to_string() } else { error.to_string() }),
    }),
  }
}

#[tauri::command]
pub(crate) async fn ollama_generate(
  endpoint: Option<String>,
  model: String,
  prompt: String,
) -> Result<OllamaGenerateProof, String> {
  let base = endpoint
    .unwrap_or_else(|| "http://localhost:11434".to_string())
    .trim_end_matches('/')
    .to_string();
  let url = format!("{base}/api/generate");

  let client = reqwest::Client::new();
  let body = serde_json::json!({
    "model": model,
    "prompt": prompt,
    "stream": false
  });

  let response = client
    .post(&url)
    .json(&body)
    .timeout(Duration::from_secs(35))
    .send()
    .await;

  match response {
    Ok(response) => {
      let code = response.status().as_u16();
      let status = response.status();
      let data: Value = response
        .json()
        .await
        .unwrap_or(Value::Object(serde_json::Map::new()));
      let response_text = data
        .get("response")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
      let done = data
        .get("done")
        .and_then(Value::as_bool)
        .unwrap_or(!response_text.is_empty());
      let error_text = data
        .get("error")
        .and_then(Value::as_str)
        .map(str::to_string);
      let success = status.is_success() && error_text.is_none();

      Ok(OllamaGenerateProof {
        endpoint: base,
        http_status: Some(code),
        model,
        response: response_text,
        done,
        trust: if success { "verified".to_string() } else { "failed".to_string() },
        error: if success {
          None
        } else {
          error_text.or_else(|| Some(format!("HTTP {code} from /api/generate")))
        },
      })
    }
    Err(error) => Ok(OllamaGenerateProof {
      endpoint: base,
      http_status: None,
      model,
      response: String::new(),
      done: false,
      trust: "failed".to_string(),
      error: Some(if error.is_timeout() { "Request timeout".to_string() } else { error.to_string() }),
    }),
  }
}
