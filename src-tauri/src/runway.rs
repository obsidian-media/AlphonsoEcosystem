use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const DEFAULT_RUNWAY_BASE_URL: &str = "https://api.dev.runwayml.com";
const DEFAULT_RUNWAY_VERSION: &str = "2024-11-06";
const DEFAULT_RUNWAY_MODEL: &str = "gen4.5";
const DEFAULT_RUNWAY_RATIO: &str = "1280:720";
const DEFAULT_RUNWAY_DURATION: u32 = 5;
const DEFAULT_RUNWAY_TIMEOUT_SECS: u64 = 600;
const DEFAULT_OUTPUT_DIR: &str = "release/miya/runway";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunwayVideoRequest {
  pub prompt_text: String,
  pub prompt_image: Option<String>,
  pub model: Option<String>,
  pub ratio: Option<String>,
  pub duration: Option<u32>,
  pub output_dir: Option<String>,
  pub timeout_seconds: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunwayVideoProof {
  pub provider: String,
  pub ok: bool,
  pub task_id: Option<String>,
  pub status: String,
  pub model: String,
  pub ratio: String,
  pub duration: u32,
  pub output_dir: String,
  pub output_urls: Vec<String>,
  pub output_files: Vec<String>,
  pub setup_required: bool,
  pub trust: String,
  pub message: String,
  pub error: Option<String>,
  pub started_at_ms: u64,
  pub finished_at_ms: u64,
}

#[tauri::command]
pub async fn runway_generate_video(request: RunwayVideoRequest) -> RunwayVideoProof {
  let started_at_ms = now_ms();
  let api_secret = match std::env::var("RUNWAYML_API_SECRET") {
    Ok(value) if !value.trim().is_empty() => value,
    _ => {
      return RunwayVideoProof {
        provider: "runway".to_string(),
        ok: false,
        task_id: None,
        status: "setup_required".to_string(),
        model: request.model.unwrap_or_else(|| DEFAULT_RUNWAY_MODEL.to_string()),
        ratio: request.ratio.unwrap_or_else(|| DEFAULT_RUNWAY_RATIO.to_string()),
        duration: request.duration.unwrap_or(DEFAULT_RUNWAY_DURATION),
        output_dir: request.output_dir.unwrap_or_else(|| DEFAULT_OUTPUT_DIR.to_string()),
        output_urls: Vec::new(),
        output_files: Vec::new(),
        setup_required: true,
        trust: "setup_required".to_string(),
        message: "RUNWAYML_API_SECRET is required for Runway generation.".to_string(),
        error: Some("RUNWAYML_API_SECRET missing".to_string()),
        started_at_ms,
        finished_at_ms: now_ms(),
      };
    }
  };

  if request.prompt_text.trim().is_empty() {
    return RunwayVideoProof {
      provider: "runway".to_string(),
      ok: false,
      task_id: None,
      status: "failed".to_string(),
      model: request.model.unwrap_or_else(|| DEFAULT_RUNWAY_MODEL.to_string()),
      ratio: request.ratio.unwrap_or_else(|| DEFAULT_RUNWAY_RATIO.to_string()),
      duration: request.duration.unwrap_or(DEFAULT_RUNWAY_DURATION),
      output_dir: request.output_dir.unwrap_or_else(|| DEFAULT_OUTPUT_DIR.to_string()),
      output_urls: Vec::new(),
      output_files: Vec::new(),
      setup_required: false,
      trust: "failed".to_string(),
      message: "Runway prompt text is required.".to_string(),
      error: Some("prompt_text missing".to_string()),
      started_at_ms,
      finished_at_ms: now_ms(),
    };
  }

  let model = request.model.unwrap_or_else(|| DEFAULT_RUNWAY_MODEL.to_string());
  let ratio = request.ratio.unwrap_or_else(|| DEFAULT_RUNWAY_RATIO.to_string());
  let duration = request.duration.unwrap_or(DEFAULT_RUNWAY_DURATION);
  let timeout_seconds = request.timeout_seconds.unwrap_or(DEFAULT_RUNWAY_TIMEOUT_SECS);
  let output_dir = request.output_dir.unwrap_or_else(|| DEFAULT_OUTPUT_DIR.to_string());
  let base_url = std::env::var("RUNWAYML_API_BASE_URL").unwrap_or_else(|_| DEFAULT_RUNWAY_BASE_URL.to_string());
  let version = std::env::var("RUNWAYML_API_VERSION").unwrap_or_else(|_| DEFAULT_RUNWAY_VERSION.to_string());
  let client = reqwest::Client::new();
  let auth_header = format!("Bearer {api_secret}");
  let endpoint = format!("{}/v1/image_to_video", base_url.trim_end_matches('/'));
  let mut body = json!({
    "model": model,
    "promptText": request.prompt_text,
    "ratio": ratio,
    "duration": duration,
  });
  if let Some(prompt_image) = request.prompt_image.as_ref().filter(|value| !value.trim().is_empty()) {
    body["promptImage"] = json!(prompt_image);
  }

  let create_response = match client
    .post(&endpoint)
    .header("Authorization", auth_header.clone())
    .header("X-Runway-Version", version.clone())
    .json(&body)
    .send()
    .await
  {
    Ok(response) => response,
    Err(error) => {
      return failed_proof(
        started_at_ms,
        output_dir,
        model,
        ratio,
        duration,
        false,
        format!("Runway create request failed: {error}"),
        Some(error.to_string()),
      );
    }
  };

  if !create_response.status().is_success() {
    let status = create_response.status().as_u16();
    let text = create_response.text().await.unwrap_or_default();
    return failed_proof(
      started_at_ms,
      output_dir,
      model,
      ratio,
      duration,
      false,
      format!("Runway create request returned HTTP {status}."),
      Some(text),
    );
  }

  let create_json: Value = match create_response.json().await {
    Ok(value) => value,
    Err(error) => {
      return failed_proof(
        started_at_ms,
        output_dir,
        model,
        ratio,
        duration,
        false,
        format!("Runway create response could not be parsed: {error}"),
        Some(error.to_string()),
      );
    }
  };

  let task_id = create_json
    .get("id")
    .and_then(Value::as_str)
    .map(ToString::to_string);
  let Some(task_id) = task_id else {
    return failed_proof(
      started_at_ms,
      output_dir,
      model,
      ratio,
      duration,
      false,
      "Runway create response did not include a task id.".to_string(),
      Some(create_json.to_string()),
    );
  };

  let task_endpoint = format!("{}/v1/tasks/{}", base_url.trim_end_matches('/'), task_id);
  let deadline = SystemTime::now()
    .checked_add(Duration::from_secs(timeout_seconds))
    .unwrap_or(SystemTime::now());
  let mut last_status = "PENDING".to_string();
  let task_json = loop {
    if SystemTime::now() >= deadline {
      return failed_proof(
        started_at_ms,
        output_dir,
        model,
        ratio,
        duration,
        false,
        format!("Runway task timed out after {timeout_seconds}s."),
        Some(format!("task_id={task_id}, last_status={last_status}")),
      );
    }

    let task_response = match client
      .get(&task_endpoint)
      .header("Authorization", auth_header.clone())
      .header("X-Runway-Version", version.clone())
      .send()
      .await
    {
      Ok(response) => response,
      Err(error) => {
        return failed_proof(
          started_at_ms,
          output_dir,
          model,
          ratio,
          duration,
          false,
          format!("Runway task lookup failed: {error}"),
          Some(error.to_string()),
        );
      }
    };

    if !task_response.status().is_success() {
      let status = task_response.status().as_u16();
      let text = task_response.text().await.unwrap_or_default();
      return failed_proof(
        started_at_ms,
        output_dir,
        model,
        ratio,
        duration,
        false,
        format!("Runway task lookup returned HTTP {status}."),
          Some(text),
      );
    }

    let current_task_json: Value = match task_response.json().await {
      Ok(value) => value,
      Err(error) => {
        return failed_proof(
          started_at_ms,
          output_dir,
          model,
          ratio,
          duration,
          false,
          format!("Runway task response could not be parsed: {error}"),
          Some(error.to_string()),
        );
      }
    };
    last_status = current_task_json
      .get("status")
      .and_then(Value::as_str)
      .unwrap_or("UNKNOWN")
      .to_string();

    match last_status.to_uppercase().as_str() {
      "SUCCEEDED" => break current_task_json,
      "FAILED" | "CANCELED" => {
        return failed_proof(
          started_at_ms,
          output_dir,
          model,
          ratio,
          duration,
          false,
          format!("Runway task ended with status {last_status}."),
          Some(current_task_json.to_string()),
        );
      }
      _ => {
        tokio::time::sleep(Duration::from_secs(5)).await;
      }
    }
  };

  let output_urls = task_json
    .get("output")
    .and_then(Value::as_array)
    .map(|entries| {
      entries
        .iter()
        .filter_map(|entry| entry.as_str().map(ToString::to_string))
        .collect::<Vec<_>>()
    })
    .unwrap_or_default();

  let mut output_files = Vec::new();
  let mut saved_dir = PathBuf::from(&output_dir);
  if !saved_dir.is_absolute() {
    if let Ok(current_dir) = std::env::current_dir() {
      saved_dir = current_dir.join(saved_dir);
    }
  }
  if let Err(error) = fs::create_dir_all(&saved_dir) {
    return failed_proof(
      started_at_ms,
      output_dir,
      model,
      ratio,
      duration,
      false,
      format!("Runway output directory could not be created: {error}"),
      Some(error.to_string()),
    );
  }

  for (index, output_url) in output_urls.iter().enumerate() {
    let file_path = saved_dir.join(format!("runway-{task_id}-{index}.mp4"));
    match client.get(output_url).send().await {
      Ok(response) if response.status().is_success() => match response.bytes().await {
        Ok(bytes) => {
          if fs::write(&file_path, &bytes).is_ok() {
            output_files.push(file_path.display().to_string());
          }
        }
        Err(error) => {
          return failed_proof(
            started_at_ms,
            output_dir,
            model,
            ratio,
            duration,
            false,
            format!("Runway output download failed: {error}"),
            Some(error.to_string()),
          );
        }
      },
      Ok(response) => {
        return failed_proof(
          started_at_ms,
          output_dir,
          model,
          ratio,
          duration,
          false,
          format!("Runway output download returned HTTP {}.", response.status().as_u16()),
          Some(output_url.clone()),
        );
      }
      Err(error) => {
        return failed_proof(
          started_at_ms,
          output_dir,
          model,
          ratio,
          duration,
          false,
          format!("Runway output download request failed: {error}"),
          Some(error.to_string()),
        );
      }
    }
  }

  let proof = RunwayVideoProof {
    provider: "runway".to_string(),
    ok: true,
    task_id: Some(task_id.clone()),
    status: "SUCCEEDED".to_string(),
    model,
    ratio,
    duration,
    output_dir: saved_dir.display().to_string(),
    output_urls: output_urls.clone(),
    output_files: output_files.clone(),
    setup_required: false,
    trust: "confirmed".to_string(),
    message: if output_files.is_empty() {
      "Runway task succeeded, but no outputs were downloaded.".to_string()
    } else {
      "Runway task succeeded and output was saved locally.".to_string()
    },
    error: None,
    started_at_ms,
    finished_at_ms: now_ms(),
  };

  let receipt_path = saved_dir.join(format!("runway-{task_id}.json"));
  let _ = fs::write(
    &receipt_path,
    serde_json::to_string_pretty(&proof).unwrap_or_else(|_| "{}".to_string()),
  );

  proof
}

fn failed_proof(
  started_at_ms: u64,
  output_dir: String,
  model: String,
  ratio: String,
  duration: u32,
  setup_required: bool,
  message: String,
  error: Option<String>,
) -> RunwayVideoProof {
  RunwayVideoProof {
    provider: "runway".to_string(),
    ok: false,
    task_id: None,
    status: if setup_required { "setup_required".to_string() } else { "failed".to_string() },
    model,
    ratio,
    duration,
    output_dir,
    output_urls: Vec::new(),
    output_files: Vec::new(),
    setup_required,
    trust: if setup_required { "setup_required".to_string() } else { "failed".to_string() },
    message,
    error,
    started_at_ms,
    finished_at_ms: now_ms(),
  }
}

fn now_ms() -> u64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|duration| duration.as_millis() as u64)
    .unwrap_or(0)
}
