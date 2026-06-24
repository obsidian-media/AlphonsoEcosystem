use serde::Serialize;
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Listener, Manager, WindowEvent};
use tauri_plugin_updater::UpdaterExt;

mod audit_log;
mod companion_auth;
mod runtime_manager;
mod companion_discovery;
mod companion_router;
mod companion_server;
mod companion_types;
mod connector_commands;
mod kv_store;
mod memory_store;
mod meta_publish;
mod native_proof;
mod ollama;
mod plugin_runtime;
mod policy_gate;
mod runway;
mod search;
mod telegram;
mod utils;
mod voice_sidecar;
mod whatsapp_webhook;
mod workspace;
mod youtube;
use voice_sidecar::VoiceSidecar;

pub(crate) use audit_log::*;
pub(crate) use connector_commands::*;
pub(crate) use kv_store::{kv_get, kv_set, load_settings, save_settings};
pub(crate) use memory_store::*;
pub(crate) use meta_publish::*;
pub(crate) use native_proof::{
  run_native_rc0_proof, start_native_rc0_proof_if_requested, NativeProofStageProof,
};
pub(crate) use ollama::*;
pub(crate) use plugin_runtime::*;
pub(crate) use policy_gate::*;
pub(crate) use runway::{runway_generate_video, runway_list_pending_jobs, runway_resume_task};
pub(crate) use workspace::*;
pub(crate) use youtube::connector_upload_youtube;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConnectorInboundMessage {
  pub(crate) update_id: i64,
  pub(crate) chat_id: String,
  pub(crate) from_id: Option<String>,
  pub(crate) text: String,
  pub(crate) date_unix: Option<i64>,
  pub(crate) received_at_ms: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct YouTubeUploadProof {
  pub(crate) connector_id: String,
  pub(crate) ok: bool,
  pub(crate) video_id: Option<String>,
  pub(crate) url: Option<String>,
  pub(crate) privacy_status: String,
  pub(crate) file_path: String,
  pub(crate) uploaded_at_ms: u64,
  pub(crate) trust: String,
  pub(crate) error: Option<String>,
}

#[derive(Serialize)]
struct CommandProof {
  program: String,
  args: Vec<String>,
  cwd: Option<String>,
  started_at_ms: u64,
  finished_at_ms: u64,
  success: bool,
  exit_code: Option<i32>,
  stdout: String,
  stderr: String,
  trust: String,
}

#[derive(Serialize, Clone)]
struct PathProof {
  path: String,
  exists: bool,
  is_file: bool,
  is_dir: bool,
  modified_at_ms: Option<u64>,
  trust: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeEnvValueProof {
  name: String,
  present: bool,
  value: Option<String>,
  checked_at_ms: u64,
  trust: String,
  error: Option<String>,
}

#[derive(Serialize)]
struct ProcessMatch {
  name: String,
  pid: Option<u32>,
}

#[derive(Serialize)]
struct ProcessProof {
  query: String,
  running: bool,
  matches: Vec<ProcessMatch>,
  trust: String,
}

#[derive(Serialize)]
struct RestorePointProof {
  snapshot_id: String,
  file_path: String,
  written: bool,
  written_at_ms: u64,
  trust: String,
}

#[derive(Serialize)]
struct HandoffExportProof {
  file_path: String,
  written: bool,
  written_at_ms: u64,
  bytes: usize,
  trust: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ConnectorPollProof {
  connector_id: String,
  ok: bool,
  count: usize,
  cursor: Option<i64>,
  messages: Vec<ConnectorInboundMessage>,
  checked_at_ms: u64,
  trust: String,
  error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ConnectorSendProof {
  connector_id: String,
  ok: bool,
  target: String,
  external_id: Option<String>,
  sent_at_ms: u64,
  trust: String,
  error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OcrCapabilityProof {
  available: bool,
  engine: String,
  message: String,
  checked_at_ms: u64,
  trust: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OcrAdapterProof {
  adapter: String,
  engine_path: String,
  image_path: Option<String>,
  started_at_ms: u64,
  finished_at_ms: u64,
  success: bool,
  exit_code: Option<i32>,
  stdout: String,
  stderr: String,
  trust: String,
  error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct JoseAssignmentProof {
  agent: String,
  title: String,
  rationale: String,
  action_type: String,
  risk_level: String,
  requires_approval: bool,
  command_preview: String,
  decomposition: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppUpdateCheckProof {
  configured: bool,
  available: bool,
  current_version: String,
  latest_version: Option<String>,
  notes: Option<String>,
  pub_date: Option<String>,
  download_url: Option<String>,
  checked_at_ms: u64,
  trust: String,
  error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UrlOpenProof {
  url: String,
  opened: bool,
  opened_at_ms: u64,
  trust: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UrlFetchProof {
  url: String,
  status: u16,
  content: String,
  title: String,
  fetched_at_ms: u64,
  trust: String,
  error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ClipboardProof {
  action: String,
  content: String,
  performed_at_ms: u64,
  trust: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FolderPickProof {
  path: String,
  picked: bool,
  picked_at_ms: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ServiceLaunchProof {
  service: String,
  launched: bool,
  already_running: bool,
  message: String,
  launched_at_ms: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SaveImageProof {
  path: String,
  saved: bool,
  saved_at_ms: u64,
}

pub(crate) fn now_ms() -> u64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|duration| duration.as_millis() as u64)
    .unwrap_or(0)
}

pub(crate) fn to_hex(bytes: &[u8]) -> String {
  let mut out = String::with_capacity(bytes.len() * 2);
  for byte in bytes {
    out.push_str(&format!("{:02x}", byte));
  }
  out
}

pub(crate) fn unix_now_iso() -> String {
  let seconds = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|duration| duration.as_secs())
    .unwrap_or(0);
  format!("unix:{}", seconds)
}

pub(crate) fn app_data_subdir(app: &tauri::AppHandle, subdir: &str) -> Result<PathBuf, String> {
  let mut dir = app
    .path()
    .app_data_dir()
    .map_err(|error| error.to_string())?;
  dir.push(subdir);
  fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
  Ok(dir)
}

pub(crate) fn dedup_strings(mut values: Vec<String>) -> Vec<String> {
  values.sort();
  values.dedup();
  values
}

fn load_dotenv() {
  dotenvy::dotenv().ok();
}

fn native_proof_output_dir() -> PathBuf {
  std::env::var("ALPHONSO_PROOF_OUTPUT_DIR")
    .map(PathBuf::from)
    .unwrap_or_else(|_| PathBuf::from("release/rc0"))
}

fn native_workspace_root() -> String {
  std::env::var("ALPHONSO_WORKSPACE_ROOT")
    .or_else(|_| std::env::current_dir().map(|path| path.display().to_string()))
    .unwrap_or_else(|_| String::new())
}

fn read_native_proof_request(output_dir: &Path) -> Option<Value> {
  let path = output_dir.join("proof-request.json");
  let content = fs::read_to_string(path).ok()?;
  serde_json::from_str::<Value>(&content).ok()
}

fn write_native_proof_stage(
  output_dir: &Path,
  file_name: &str,
  payload: &NativeProofStageProof,
) -> Result<(), String> {
  let proof_dir = output_dir.join("proof");
  fs::create_dir_all(&proof_dir).map_err(|error| error.to_string())?;
  let file_path = proof_dir.join(file_name);
  let content = serde_json::to_string_pretty(payload).map_err(|error| error.to_string())?;
  fs::write(&file_path, format!("{content}\n")).map_err(|error| error.to_string())?;
  Ok(())
}

fn write_native_startup_trace(stage: &str, workspace_root: &str, note: Option<&str>) {
  let trace_path = std::env::temp_dir().join("alphonso-startup-trace.json");
  let payload = serde_json::json!({
    "timestamp": now_ms(),
    "stage": stage,
    "processId": std::process::id(),
    "workspaceRoot": workspace_root,
    "note": note,
  });
  if let Ok(content) = serde_json::to_string_pretty(&payload) {
    let _ = fs::write(trace_path, format!("{content}\n"));
  }
}

fn write_native_proof_event(output_dir: &Path, payload: &Value) -> Result<(), String> {
  let proof_dir = output_dir.join("proof");
  fs::create_dir_all(&proof_dir).map_err(|error| error.to_string())?;

  let file_name = if let Some(file_name) = payload.get("fileName").and_then(Value::as_str) {
    file_name.to_string()
  } else if let Some(stage) = payload.get("stage").and_then(Value::as_str) {
    if stage.ends_with(".json") {
      stage.to_string()
    } else {
      format!("{stage}.json")
    }
  } else {
    "native-proof-event.json".to_string()
  };

  let file_path = proof_dir.join(file_name);
  let content = serde_json::to_string_pretty(payload).map_err(|error| error.to_string())?;
  fs::write(&file_path, format!("{content}\n")).map_err(|error| error.to_string())?;
  Ok(())
}

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
fn execute_command_verified(
  program: String,
  args: Vec<String>,
  cwd: Option<String>,
) -> Result<CommandProof, String> {
  let started = now_ms();

  if !allowed_program(&program) {
    return Err("Program is not allowed by Alphonso supervised command policy.".to_string());
  }

  let mut command = Command::new(&program);
  command.args(&args);

  if let Some(path) = &cwd {
    command.current_dir(path);
  }

  let output = command.output().map_err(|error| error.to_string())?;
  let finished = now_ms();
  let success = output.status.success();

  Ok(CommandProof {
    program,
    args,
    cwd,
    started_at_ms: started,
    finished_at_ms: finished,
    success,
    exit_code: output.status.code(),
    stdout: String::from_utf8_lossy(&output.stdout).to_string(),
    stderr: String::from_utf8_lossy(&output.stderr).to_string(),
    trust: if success {
      "verified".to_string()
    } else {
      "failed".to_string()
    },
  })
}

#[tauri::command]
fn verify_paths(paths: Vec<String>) -> Vec<PathProof> {
  paths
    .into_iter()
    .map(|path| {
      let path_buf = PathBuf::from(&path);
      let metadata = fs::metadata(&path_buf).ok();
      let modified_at_ms = metadata
        .as_ref()
        .and_then(|meta| meta.modified().ok())
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64);

      PathProof {
        path,
        exists: metadata.is_some(),
        is_file: metadata
          .as_ref()
          .map(|meta| meta.is_file())
          .unwrap_or(false),
        is_dir: metadata.as_ref().map(|meta| meta.is_dir()).unwrap_or(false),
        modified_at_ms,
        trust: if metadata.is_some() {
          "verified".to_string()
        } else {
          "failed".to_string()
        },
      }
    })
    .collect()
}

#[tauri::command]
fn read_runtime_env_value(name: String) -> Result<RuntimeEnvValueProof, String> {
  if !ALPHONSO_RUNTIME_ENV_NAMES.contains(&name.as_str()) {
    return Err("Environment variable is not exposed through this command.".to_string());
  }

  let checked_at_ms = now_ms();
  match std::env::var(&name) {
    Ok(value) => {
      let trimmed = value.trim().to_string();
      Ok(RuntimeEnvValueProof {
        name,
        present: !trimmed.is_empty(),
        value: if trimmed.is_empty() {
          None
        } else {
          Some(trimmed)
        },
        checked_at_ms,
        trust: "verified".to_string(),
        error: None,
      })
    }
    Err(error) => {
      let reason = match error {
        std::env::VarError::NotPresent => "missing".to_string(),
        std::env::VarError::NotUnicode(_) => "not unicode".to_string(),
      };
      Ok(RuntimeEnvValueProof {
        name,
        present: false,
        value: None,
        checked_at_ms,
        trust: "failed".to_string(),
        error: Some(reason),
      })
    }
  }
}

#[tauri::command]
fn alphonso_bridge_status() -> Value {
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
async fn alphonso_bridge_send_packet(packet: Value) -> Result<Value, String> {
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
  let client = reqwest::Client::builder()
    .timeout(Duration::from_millis(timeout_ms))
    .build()
    .map_err(|error| error.to_string())?;

  let response = client
    .post(&url)
    .bearer_auth(token.trim())
    .json(&packet)
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

#[tauri::command]
fn check_processes(names: Vec<String>) -> Result<Vec<ProcessProof>, String> {
  #[cfg(target_os = "windows")]
  let tasklist_output = {
    let output = Command::new("tasklist")
      .args(["/FO", "CSV", "/NH"])
      .output()
      .map_err(|error| error.to_string())?;

    String::from_utf8_lossy(&output.stdout).to_string()
  };

  #[cfg(not(target_os = "windows"))]
  let tasklist_output = {
    let output = Command::new("ps")
      .args(["-axo", "pid,comm"])
      .output()
      .map_err(|error| error.to_string())?;

    String::from_utf8_lossy(&output.stdout).to_string()
  };

  let proofs = names
    .into_iter()
    .map(|name| {
      let matches = parse_tasklist(&tasklist_output, &name);
      let running = !matches.is_empty();
      ProcessProof {
        query: name,
        running,
        matches,
        trust: if running {
          "verified".to_string()
        } else {
          "failed".to_string()
        },
      }
    })
    .collect();

  Ok(proofs)
}

fn parse_tasklist(tasklist_output: &str, query: &str) -> Vec<ProcessMatch> {
  let lower_query = query.to_ascii_lowercase();
  #[cfg(target_os = "windows")]
  {
    tasklist_output
      .lines()
      .filter_map(|line| {
        let trimmed = line.trim();
        if !trimmed.contains(",") {
          return None;
        }

        let clean = trimmed.trim_matches('"');
        let parts: Vec<&str> = clean.split("\",\"").collect();
        if parts.len() < 2 {
          return None;
        }

        let process_name = parts[0].to_string();
        if !process_name.to_ascii_lowercase().contains(&lower_query) {
          return None;
        }

        let pid = parts[1].parse::<u32>().ok();
        Some(ProcessMatch {
          name: process_name,
          pid,
        })
      })
      .collect()
  }

  #[cfg(not(target_os = "windows"))]
  {
    tasklist_output
      .lines()
      .skip(1)
      .filter_map(|line| {
        let trimmed = line.trim();
        if trimmed.is_empty() {
          return None;
        }

        let mut parts = trimmed.split_whitespace();
        let pid = parts.next().and_then(|value| value.parse::<u32>().ok());
        let name = parts.collect::<Vec<&str>>().join(" ");
        if name.is_empty() || !name.to_ascii_lowercase().contains(&lower_query) {
          return None;
        }
        Some(ProcessMatch { name, pid })
      })
      .collect()
  }
}

#[tauri::command]
fn record_restore_point(
  app: tauri::AppHandle,
  snapshot_id: String,
  payload: String,
) -> Result<RestorePointProof, String> {
  let dir = app_data_subdir(&app, "recovery")?;

  let mut file_path = dir.clone();
  file_path.push(format!("{snapshot_id}.json"));
  fs::write(&file_path, payload).map_err(|error| error.to_string())?;

  Ok(RestorePointProof {
    snapshot_id,
    file_path: file_path.to_string_lossy().to_string(),
    written: true,
    written_at_ms: now_ms(),
    trust: "verified".to_string(),
  })
}

#[tauri::command]
fn write_handoff_export_file(
  workspace_root: String,
  file_name: String,
  content: String,
) -> Result<HandoffExportProof, String> {
  let safe_name = Path::new(file_name.trim())
    .file_name()
    .and_then(|value| value.to_str())
    .filter(|value| !value.trim().is_empty())
    .unwrap_or("alphonso-self-development.md")
    .replace(['/', '\\'], "_");
  let proof = workspace::write_workspace_text_file(
    workspace_root,
    format!("docs/handoff/{safe_name}"),
    content,
  )?;
  Ok(HandoffExportProof {
    file_path: proof.file_path,
    written: proof.written,
    written_at_ms: proof.written_at_ms,
    bytes: proof.bytes,
    trust: proof.trust,
  })
}

#[tauri::command]
fn run_ocr_adapter(
  adapter: Option<String>,
  engine_path: String,
  image_path: Option<String>,
  extra_args: Option<Vec<String>>,
) -> Result<OcrAdapterProof, String> {
  let started = now_ms();
  let adapter = adapter.unwrap_or_else(|| "version_check".to_string());
  let engine = PathBuf::from(&engine_path);
  if !engine.exists() || !engine.is_file() {
    return Ok(OcrAdapterProof {
      adapter,
      engine_path,
      image_path,
      started_at_ms: started,
      finished_at_ms: now_ms(),
      success: false,
      exit_code: None,
      stdout: String::new(),
      stderr: String::new(),
      trust: "failed".to_string(),
      error: Some("OCR engine binary path is invalid.".to_string()),
    });
  }

  let mut args = vec![];
  match adapter.as_str() {
    "version_check" => {
      args.push("--version".to_string());
    }
    "tesseract_cli" => {
      let image = image_path
        .clone()
        .ok_or_else(|| "Image path is required for tesseract_cli adapter.".to_string())?;
      let image_file = PathBuf::from(&image);
      if !image_file.exists() || !image_file.is_file() {
        return Err("Image path does not exist.".to_string());
      }
      args.push(image);
      args.push("stdout".to_string());
      args.push("--dpi".to_string());
      args.push("70".to_string());
    }
    _ => {
      return Err(
        "Unsupported OCR adapter. Supported adapters: version_check, tesseract_cli.".to_string(),
      );
    }
  }

  if let Some(extra) = extra_args {
    args.extend(extra);
  }

  let output = Command::new(&engine_path)
    .args(&args)
    .output()
    .map_err(|error| error.to_string())?;
  let finished = now_ms();
  let success = output.status.success();

  Ok(OcrAdapterProof {
    adapter,
    engine_path,
    image_path,
    started_at_ms: started,
    finished_at_ms: finished,
    success,
    exit_code: output.status.code(),
    stdout: String::from_utf8_lossy(&output.stdout).to_string(),
    stderr: String::from_utf8_lossy(&output.stderr).to_string(),
    trust: if success {
      "verified".to_string()
    } else {
      "failed".to_string()
    },
    error: None,
  })
}

#[tauri::command]
fn check_ocr_capability(engine_path: Option<String>) -> OcrCapabilityProof {
  let checked_at_ms = now_ms();
  if let Some(path) = engine_path {
    let path_buf = PathBuf::from(&path);
    if path_buf.exists() && path_buf.is_file() {
      return OcrCapabilityProof {
        available: true,
        engine: "custom".to_string(),
        message: format!("OCR engine binary detected at {path}"),
        checked_at_ms,
        trust: "verified".to_string(),
      };
    }

    return OcrCapabilityProof {
      available: false,
      engine: "custom".to_string(),
      message: format!("OCR engine path does not exist: {path}"),
      checked_at_ms,
      trust: "failed".to_string(),
    };
  }

  OcrCapabilityProof {
    available: false,
    engine: "unconfigured".to_string(),
    message: "OCR engine is not configured yet. Set an engine path explicitly.".to_string(),
    checked_at_ms,
    trust: "unverified".to_string(),
  }
}

#[tauri::command]
fn decompose_jose_command_backend(command_text: String) -> Vec<JoseAssignmentProof> {
  let clean = command_text.trim().to_string();
  if clean.is_empty() {
    return vec![];
  }
  let lower = clean.to_ascii_lowercase();
  let fragments = split_command_fragments(&lower);
  let mut assignments: Vec<JoseAssignmentProof> = vec![];

  let research = text_has_any(
    &lower,
    &[
      "research", "lookup", "docs", "source", "citation", "latest", "pricing", "market",
    ],
  );
  let creative = text_has_any(
    &lower,
    &[
      "video",
      "script",
      "brand",
      "campaign",
      "thumbnail",
      "storyboard",
      "prompt",
      "creative",
    ],
  );
  let local_execution = text_has_any(
    &lower,
    &[
      "build",
      "runtime",
      "ollama",
      "verify",
      "diagnostic",
      "fix",
      "test",
      "package",
      "file",
    ],
  );
  let publishing = text_has_any(
    &lower,
    &[
      "upload",
      "publish",
      "post",
      "youtube",
      "tiktok",
      "instagram",
    ],
  );
  let risky_local = text_has_any(
    &lower,
    &["delete", "remove", "deploy", "write", "modify", "execute"],
  );

  if research {
    assignments.push(JoseAssignmentProof {
      agent: "hector".to_string(),
      title: format!(
        "Hector research task: {}",
        clean.chars().take(64).collect::<String>()
      ),
      rationale: "Research language detected. Hector should gather and verify sources.".to_string(),
      action_type: "research".to_string(),
      risk_level: "low".to_string(),
      requires_approval: true,
      command_preview: "Research and citation proof only. No uploads or account actions."
        .to_string(),
      decomposition: fragments.clone(),
    });
  }

  if publishing {
    assignments.push(JoseAssignmentProof {
      agent: "hector".to_string(),
      title: format!(
        "Hector publish safety check: {}",
        clean.chars().take(64).collect::<String>()
      ),
      rationale: "Publishing language detected. Jose approval required before any external action."
        .to_string(),
      action_type: "external_publish_handoff".to_string(),
      risk_level: "high".to_string(),
      requires_approval: true,
      command_preview: "No automatic posting. Requires explicit approval and connector auth."
        .to_string(),
      decomposition: fragments.clone(),
    });
  }

  if creative {
    assignments.push(JoseAssignmentProof {
      agent: "miya".to_string(),
      title: format!(
        "Miya creative task: {}",
        clean.chars().take(64).collect::<String>()
      ),
      rationale: "Creative language detected. Miya produces script/storyboard/prompt packages."
        .to_string(),
      action_type: "creative_package".to_string(),
      risk_level: "low".to_string(),
      requires_approval: true,
      command_preview: "Creative package generation only.".to_string(),
      decomposition: fragments.clone(),
    });
  }

  if local_execution {
    assignments.push(JoseAssignmentProof {
      agent: "alphonso".to_string(),
      title: format!(
        "Alphonso operator task: {}",
        clean.chars().take(64).collect::<String>()
      ),
      rationale: "Runtime/build/verification language detected.".to_string(),
      action_type: "local_operation".to_string(),
      risk_level: if risky_local {
        "high".to_string()
      } else {
        "medium".to_string()
      },
      requires_approval: true,
      command_preview: if risky_local {
        "Potential local/system action. Explicit approval required.".to_string()
      } else {
        "Local diagnostics/verification only.".to_string()
      },
      decomposition: fragments.clone(),
    });
  }

  if assignments.is_empty() {
    assignments.push(JoseAssignmentProof {
      agent: "jose".to_string(),
      title: format!(
        "Jose planning task: {}",
        clean.chars().take(64).collect::<String>()
      ),
      rationale: "No specialist match detected.".to_string(),
      action_type: "orchestration_review".to_string(),
      risk_level: "low".to_string(),
      requires_approval: false,
      command_preview: "Planning only.".to_string(),
      decomposition: fragments,
    });
  }

  assignments
}

fn text_has_any(text: &str, terms: &[&str]) -> bool {
  terms.iter().any(|term| text.contains(term))
}

fn split_command_fragments(input: &str) -> Vec<String> {
  input
    .split([',', '.'])
    .flat_map(|part| part.split(" then "))
    .flat_map(|part| part.split(" and "))
    .map(|part| part.trim().to_string())
    .filter(|part| !part.is_empty())
    .take(10)
    .collect()
}

#[tauri::command]
async fn check_app_update(
  app: tauri::AppHandle,
  endpoint: Option<String>,
  pubkey: Option<String>,
  target: Option<String>,
) -> AppUpdateCheckProof {
  let checked_at_ms = now_ms();
  let endpoint = endpoint.unwrap_or_default().trim().to_string();
  let pubkey = pubkey.unwrap_or_default().trim().to_string();

  if endpoint.is_empty() || pubkey.is_empty() {
    return AppUpdateCheckProof {
      configured: false,
      available: false,
      current_version: app.package_info().version.to_string(),
      latest_version: None,
      notes: None,
      pub_date: None,
      download_url: None,
      checked_at_ms,
      trust: "unverified".to_string(),
      error: Some("Updater is not configured. Provide both endpoint and public key.".to_string()),
    };
  }

  let builder = app.updater_builder();
  let endpoint_url = match reqwest::Url::parse(&endpoint) {
    Ok(url) => url,
    Err(error) => {
      return AppUpdateCheckProof {
        configured: true,
        available: false,
        current_version: app.package_info().version.to_string(),
        latest_version: None,
        notes: None,
        pub_date: None,
        download_url: None,
        checked_at_ms,
        trust: "failed".to_string(),
        error: Some(format!("Invalid updater endpoint URL: {error}")),
      };
    }
  };

  let builder = match builder.endpoints(vec![endpoint_url]) {
    Ok(next) => next,
    Err(error) => {
      return AppUpdateCheckProof {
        configured: true,
        available: false,
        current_version: app.package_info().version.to_string(),
        latest_version: None,
        notes: None,
        pub_date: None,
        download_url: None,
        checked_at_ms,
        trust: "failed".to_string(),
        error: Some(error.to_string()),
      };
    }
  };

  let mut builder = builder.pubkey(pubkey);

  if let Some(custom_target) = target {
    let clean = custom_target.trim();
    if !clean.is_empty() {
      builder = builder.target(clean.to_string());
    }
  }

  let updater = match builder.build() {
    Ok(updater) => updater,
    Err(error) => {
      return AppUpdateCheckProof {
        configured: true,
        available: false,
        current_version: app.package_info().version.to_string(),
        latest_version: None,
        notes: None,
        pub_date: None,
        download_url: None,
        checked_at_ms,
        trust: "failed".to_string(),
        error: Some(error.to_string()),
      };
    }
  };

  match updater.check().await {
    Ok(Some(update)) => AppUpdateCheckProof {
      configured: true,
      available: true,
      current_version: update.current_version,
      latest_version: Some(update.version),
      notes: update.body,
      pub_date: update.date.map(|date| date.to_string()),
      download_url: Some(update.download_url.to_string()),
      checked_at_ms,
      trust: "verified".to_string(),
      error: None,
    },
    Ok(None) => AppUpdateCheckProof {
      configured: true,
      available: false,
      current_version: app.package_info().version.to_string(),
      latest_version: None,
      notes: None,
      pub_date: None,
      download_url: None,
      checked_at_ms,
      trust: "verified".to_string(),
      error: None,
    },
    Err(error) => AppUpdateCheckProof {
      configured: true,
      available: false,
      current_version: app.package_info().version.to_string(),
      latest_version: None,
      notes: None,
      pub_date: None,
      download_url: None,
      checked_at_ms,
      trust: "failed".to_string(),
      error: Some(error.to_string()),
    },
  }
}

#[tauri::command]
fn send_app_notification(app: tauri::AppHandle, title: String, body: String) -> Result<(), String> {
  use tauri_plugin_notification::NotificationExt;
  app
    .notification()
    .builder()
    .title(&title)
    .body(&body)
    .show()
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn open_url(url: String) -> Result<UrlOpenProof, String> {
  if !url.starts_with("http://") && !url.starts_with("https://") {
    return Err("URL must start with http:// or https://".to_string());
  }
  if cfg!(target_os = "windows") {
    Command::new("cmd")
      .args(["/C", "start", &url])
      .spawn()
      .map_err(|e| e.to_string())?;
  } else if cfg!(target_os = "macos") {
    Command::new("open")
      .arg(&url)
      .spawn()
      .map_err(|e| e.to_string())?;
  } else {
    Command::new("xdg-open")
      .arg(&url)
      .spawn()
      .map_err(|e| e.to_string())?;
  }
  Ok(UrlOpenProof {
    url,
    opened: true,
    opened_at_ms: now_ms(),
    trust: "verified".to_string(),
  })
}

#[tauri::command]
async fn fetch_url_content(
  state: tauri::State<'_, reqwest::Client>,
  url: String,
) -> Result<UrlFetchProof, String> {
  if !url.starts_with("http://") && !url.starts_with("https://") {
    return Err("URL must start with http:// or https://".to_string());
  }
  let response = state
    .get(&url)
    .header(reqwest::header::USER_AGENT, "Alphonso/1.0")
    .send()
    .await
    .map_err(|e| e.to_string())?;
  let status = response.status().as_u16();
  let html = response.text().await.map_err(|e| e.to_string())?;

  let title = html
    .lines()
    .find(|line| line.to_lowercase().contains("<title>"))
    .and_then(|line| {
      let start = line.to_lowercase().find("<title>")? + 7;
      let end = line.to_lowercase().find("</title>")?;
      Some(line[start..end].trim().to_string())
    })
    .unwrap_or_default();

  let mut content = String::new();
  let mut in_tag = false;
  for ch in html.chars() {
    if ch == '<' {
      in_tag = true;
      continue;
    }
    if ch == '>' {
      in_tag = false;
      continue;
    }
    if !in_tag {
      content.push(ch);
    }
  }
  let content = content
    .lines()
    .map(|l| l.trim())
    .filter(|l| !l.is_empty())
    .take(200)
    .collect::<Vec<_>>()
    .join("\n")
    .chars()
    .take(10000)
    .collect();

  Ok(UrlFetchProof {
    url,
    status,
    content,
    title,
    fetched_at_ms: now_ms(),
    trust: "verified".to_string(),
    error: None,
  })
}

#[tauri::command]
fn read_clipboard() -> Result<ClipboardProof, String> {
  #[cfg(target_os = "windows")]
  {
    use std::process::Command;
    let output = Command::new("powershell")
      .args(["-Command", "Get-Clipboard"])
      .output()
      .map_err(|e| e.to_string())?;
    let content = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(ClipboardProof {
      action: "read".to_string(),
      content,
      performed_at_ms: now_ms(),
      trust: "verified".to_string(),
    })
  }
  #[cfg(not(target_os = "windows"))]
  {
    Err("Clipboard read not supported on this platform".to_string())
  }
}

#[tauri::command]
fn write_clipboard(_content: String) -> Result<ClipboardProof, String> {
  #[cfg(target_os = "windows")]
  {
    use std::process::Command;
    let mut child = Command::new("powershell")
      .args(["-Command", "Set-Clipboard"])
      .stdin(std::process::Stdio::piped())
      .spawn()
      .map_err(|e| e.to_string())?;
    if let Some(mut stdin) = child.stdin.take() {
      use std::io::Write;
      stdin
        .write_all(_content.as_bytes())
        .map_err(|e| e.to_string())?;
    }
    child.wait().map_err(|e| e.to_string())?;
    Ok(ClipboardProof {
      action: "write".to_string(),
      content: _content.chars().take(100).collect(),
      performed_at_ms: now_ms(),
      trust: "verified".to_string(),
    })
  }
  #[cfg(not(target_os = "windows"))]
  {
    Err("Clipboard write not supported on this platform".to_string())
  }
}

#[tauri::command]
fn pick_folder() -> Result<FolderPickProof, String> {
  #[cfg(target_os = "windows")]
  {
    use std::process::Command;
    let script = concat!(
      "Add-Type -AssemblyName System.Windows.Forms; ",
      "$b = New-Object System.Windows.Forms.FolderBrowserDialog; ",
      "$b.Description = 'Select output folder'; ",
      "if ($b.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $b.SelectedPath } else { '' }"
    );
    let output = Command::new("powershell")
      .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", script])
      .output()
      .map_err(|e| e.to_string())?;
    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let picked = !path.is_empty();
    return Ok(FolderPickProof {
      path,
      picked,
      picked_at_ms: now_ms(),
    });
  }
  #[allow(unreachable_code)]
  Err("Folder picker is Windows-only".to_string())
}

#[tauri::command]
async fn launch_ollama() -> Result<ServiceLaunchProof, String> {
  let client = reqwest::Client::builder()
    .timeout(std::time::Duration::from_millis(800))
    .build()
    .map_err(|e| e.to_string())?;
  if client
    .get("http://localhost:11434/api/tags")
    .send()
    .await
    .is_ok()
  {
    return Ok(ServiceLaunchProof {
      service: "ollama".to_string(),
      launched: false,
      already_running: true,
      message: "Ollama is already running on localhost:11434".to_string(),
      launched_at_ms: now_ms(),
    });
  }
  use std::process::Command;
  if cfg!(target_os = "windows") {
    Command::new("cmd")
      .args(["/C", "start", "/B", "ollama", "serve"])
      .spawn()
      .map_err(|e| format!("Failed to launch Ollama: {}", e))?;
  } else {
    Command::new("sh")
      .args(["-c", "ollama serve &"])
      .spawn()
      .map_err(|e| format!("Failed to launch Ollama: {}", e))?;
  }
  Ok(ServiceLaunchProof {
    service: "ollama".to_string(),
    launched: true,
    already_running: false,
    message: "Ollama launch requested — allow a few seconds.".to_string(),
    launched_at_ms: now_ms(),
  })
}

#[tauri::command]
async fn launch_comfyui(
  comfyui_dir: String,
  python_exe: String,
) -> Result<ServiceLaunchProof, String> {
  let dir = comfyui_dir.trim().to_string();
  if dir.is_empty() {
    return Err(
      "ComfyUI directory is not configured. Set it in Settings → Local Services.".to_string(),
    );
  }
  let client = reqwest::Client::builder()
    .timeout(std::time::Duration::from_millis(800))
    .build()
    .map_err(|e| e.to_string())?;
  if client
    .get("http://localhost:8188/system_stats")
    .send()
    .await
    .is_ok()
  {
    return Ok(ServiceLaunchProof {
      service: "comfyui".to_string(),
      launched: false,
      already_running: true,
      message: "ComfyUI is already running on localhost:8188".to_string(),
      launched_at_ms: now_ms(),
    });
  }
  let py = if python_exe.trim().is_empty() {
    "python".to_string()
  } else {
    python_exe.trim().to_string()
  };
  use std::process::Command;
  Command::new(&py)
    .arg("main.py")
    .current_dir(&dir)
    .spawn()
    .map_err(|e| {
      format!(
        "Failed to launch ComfyUI from '{}' using '{}': {}",
        dir, py, e
      )
    })?;
  Ok(ServiceLaunchProof {
    service: "comfyui".to_string(),
    launched: true,
    already_running: false,
    message: format!(
      "ComfyUI launched from '{}'. Allow 10–20 seconds to start.",
      dir
    ),
    launched_at_ms: now_ms(),
  })
}

#[tauri::command]
fn save_image_to_folder(
  base64_data: String,
  filename: String,
  folder: String,
) -> Result<SaveImageProof, String> {
  let folder = folder.trim().to_string();
  if folder.is_empty() {
    return Err("No output folder configured".to_string());
  }
  let raw = base64_data
    .trim_start_matches("data:image/png;base64,")
    .trim_start_matches("data:image/jpeg;base64,")
    .to_string();
  let path = std::path::Path::new(&folder).join(&filename);
  let path_str = path.to_string_lossy().to_string();
  #[cfg(target_os = "windows")]
  {
    use std::process::Command;
    let escaped_path = path_str.replace('\'', "''");
    let script = format!(
      "[System.IO.File]::WriteAllBytes('{}', [Convert]::FromBase64String('{}'))",
      escaped_path, raw
    );
    Command::new("powershell")
      .args(["-NoProfile", "-Command", &script])
      .output()
      .map_err(|e| e.to_string())?;
    return Ok(SaveImageProof {
      path: path_str,
      saved: true,
      saved_at_ms: now_ms(),
    });
  }
  #[allow(unreachable_code)]
  {
    use std::process::Command;
    let script = format!("printf '%s' '{}' | base64 -d > '{}'", raw, path_str);
    Command::new("sh")
      .args(["-c", &script])
      .output()
      .map_err(|e| e.to_string())?;
    Ok(SaveImageProof {
      path: path_str,
      saved: true,
      saved_at_ms: now_ms(),
    })
  }
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

  #[test]
  fn to_hex_produces_correct_lowercase_hex() {
    assert_eq!(to_hex(&[0x00, 0xff, 0xab, 0x12]), "00ffab12");
    assert_eq!(to_hex(&[]), "");
    assert_eq!(to_hex(&[0x0a]), "0a");
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  load_dotenv();
  let http_client = reqwest::Client::builder()
    .timeout(std::time::Duration::from_secs(30))
    .build()
    .expect("Failed to build shared HTTP client");
  let runtime_mgr_autostart = std::sync::Arc::new(runtime_manager::RuntimeManager::new());
  let runtime_mgr_state = std::sync::Arc::clone(&runtime_mgr_autostart);

  tauri::Builder::default()
    .manage(http_client)
    .manage(runtime_manager::RuntimeManager::new())
    .manage(VoiceSidecar(std::sync::Mutex::new(None)))
    .plugin(tauri_plugin_notification::init())
    .plugin(tauri_plugin_global_shortcut::Builder::new().build())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .setup(|app| {
      let proof_output_dir = native_proof_output_dir();
      let proof_request = read_native_proof_request(&proof_output_dir);
      let workspace_root = native_workspace_root();
      let process_id = std::process::id();
      let timestamp = now_ms();
      let autorun_enabled = std::env::var("ALPHONSO_SELFDEV_AUTORUN")
        .map(|value| value.trim() == "1")
        .unwrap_or(false);
      let rc0_proof_enabled = std::env::var("ALPHONSO_RC0_PROOF")
        .map(|value| value.trim() == "1")
        .unwrap_or(false);
      let proof_requested = autorun_enabled || rc0_proof_enabled || proof_request.is_some();
      let env_missing_note = if autorun_enabled {
        None
      } else {
        Some(
          "ALPHONSO_SELFDEV_AUTORUN is missing or not enabled in the native runtime.".to_string(),
        )
      };

      write_native_startup_trace(
        "setup_started",
        &workspace_root,
        Some("Rust setup hook executed before the webview loads."),
      );

      let process_started = NativeProofStageProof {
        stage: "01_process_started".to_string(),
        status: "running".to_string(),
        timestamp: format!("{}", timestamp),
        process_id,
        workspace_root: workspace_root.clone(),
        output_dir: proof_output_dir.display().to_string(),
        proof_request_found: proof_request.is_some(),
        window_label: None,
        note: None,
        error: None,
        duration_ms: None,
      };
      let env_detected = NativeProofStageProof {
        stage: "02_env_detected".to_string(),
        status: if proof_requested {
          "ready".to_string()
        } else {
          "setup_required".to_string()
        },
        timestamp: format!("{}", timestamp),
        process_id,
        workspace_root: workspace_root.clone(),
        output_dir: proof_output_dir.display().to_string(),
        proof_request_found: proof_request.is_some(),
        window_label: None,
        note: if proof_requested {
          Some("Native proof mode is enabled for this Tauri runtime.".to_string())
        } else {
          env_missing_note.clone()
        },
        error: if proof_requested {
          None
        } else {
          env_missing_note.clone()
        },
        duration_ms: None,
      };
      let tauri_started = NativeProofStageProof {
        stage: "03_tauri_started".to_string(),
        status: "running".to_string(),
        timestamp: format!("{}", now_ms()),
        process_id,
        workspace_root: workspace_root.clone(),
        output_dir: proof_output_dir.display().to_string(),
        proof_request_found: proof_request.is_some(),
        window_label: None,
        note: None,
        error: None,
        duration_ms: None,
      };
      let _ = write_native_proof_stage(
        &proof_output_dir,
        "01_process_started.json",
        &process_started,
      );
      let _ = write_native_proof_stage(&proof_output_dir, "02_env_detected.json", &env_detected);
      let _ = write_native_proof_stage(&proof_output_dir, "03_tauri_started.json", &tauri_started);

      if proof_requested {
        let proof_output_dir_clone = proof_output_dir.clone();
        let workspace_root_clone = workspace_root.clone();
        tauri::async_runtime::spawn(async move {
          let native_proof_started = NativeProofStageProof {
            stage: "05_native_proof_engine_started".to_string(),
            status: "running".to_string(),
            timestamp: format!("{}", now_ms()),
            process_id,
            workspace_root: workspace_root_clone.clone(),
            output_dir: proof_output_dir_clone.display().to_string(),
            proof_request_found: true,
            window_label: None,
            note: Some("Rust startup hook requested the native RC0 proof engine.".to_string()),
            error: None,
            duration_ms: None,
          };
          let _ = write_native_proof_stage(
            &proof_output_dir_clone,
            "05_native_proof_engine_started.json",
            &native_proof_started,
          );

          let validation_paths = vec![
            workspace_root_clone.clone(),
            format!("{}/package.json", workspace_root_clone),
            format!("{}/src", workspace_root_clone),
            format!("{}/src-tauri", workspace_root_clone),
            format!("{}/docs", workspace_root_clone),
          ];
          let validation_proofs = verify_paths(validation_paths);
          let root_proof = validation_proofs.first().cloned();
          let entry_proofs = validation_proofs.into_iter().skip(1).collect::<Vec<_>>();
          let missing_entries = ["package.json", "src", "src-tauri", "docs"]
            .iter()
            .zip(entry_proofs.iter())
            .filter_map(|(entry, proof)| {
              if proof.exists {
                None
              } else {
                Some((*entry).to_string())
              }
            })
            .collect::<Vec<_>>();
          let workspace_ok = root_proof
            .map(|proof| proof.exists && proof.is_dir)
            .unwrap_or(false)
            && missing_entries.is_empty();
          let native_workspace_validated = NativeProofStageProof {
            stage: "06_workspace_validated".to_string(),
            status: if workspace_ok {
              "ready".to_string()
            } else {
              "setup_required".to_string()
            },
            timestamp: format!("{}", now_ms()),
            process_id,
            workspace_root: workspace_root_clone.clone(),
            output_dir: proof_output_dir_clone.display().to_string(),
            proof_request_found: true,
            window_label: None,
            note: Some(if workspace_ok {
              "Workspace root validated from the Rust startup hook.".to_string()
            } else {
              format!(
                "Workspace validation is setup_required; missing entries: {}",
                missing_entries.join(", ")
              )
            }),
            error: if workspace_ok {
              None
            } else {
              Some(format!(
                "Workspace validation is setup_required; missing entries: {}",
                missing_entries.join(", ")
              ))
            },
            duration_ms: None,
          };
          let _ = write_native_proof_stage(
            &proof_output_dir_clone,
            "06_workspace_validated.json",
            &native_workspace_validated,
          );
          let native_scan_started = NativeProofStageProof {
            stage: "07_scan_started".to_string(),
            status: if workspace_ok {
              "running".to_string()
            } else {
              "setup_required".to_string()
            },
            timestamp: format!("{}", now_ms()),
            process_id,
            workspace_root: workspace_root_clone.clone(),
            output_dir: proof_output_dir_clone.display().to_string(),
            proof_request_found: true,
            window_label: None,
            note: Some(if workspace_ok {
              "Rust startup hook scheduled the repository scan phase.".to_string()
            } else {
              "Repository scan remains setup_required until workspace validation passes."
                .to_string()
            }),
            error: if workspace_ok {
              None
            } else {
              Some("Workspace validation is setup_required.".to_string())
            },
            duration_ms: None,
          };
          let _ = write_native_proof_stage(
            &proof_output_dir_clone,
            "07_scan_started.json",
            &native_scan_started,
          );
          start_native_rc0_proof_if_requested(
            workspace_root_clone,
            proof_output_dir_clone.display().to_string(),
            "automated".to_string(),
            Some(80),
          );
        });
      }

      let proof_event_dir = proof_output_dir.clone();
      let _proof_event_listener_id =
        app
          .handle()
          .listen("alphonso-native-proof-stage", move |event| {
            let payload = event.payload();
            if let Ok(value) = serde_json::from_str::<Value>(payload) {
              let _ = write_native_proof_event(&proof_event_dir, &value);
            }
          });

      let show_main_item =
        MenuItem::with_id(app, "show_main", "Open Alphonso", true, None::<&str>)?;
      let new_chat_item = MenuItem::with_id(app, "new_chat", "New Chat", true, None::<&str>)?;
      let show_coach_item = MenuItem::with_id(app, "show_coach", "Show Coach", true, None::<&str>)?;
      let toggle_coach_item =
        MenuItem::with_id(app, "toggle_coach", "Toggle Coach", true, None::<&str>)?;
      let quit_item = MenuItem::with_id(app, "quit_app", "Quit Alphonso", true, None::<&str>)?;
      let tray_menu = Menu::with_items(
        app,
        &[
          &show_main_item,
          &new_chat_item,
          &show_coach_item,
          &toggle_coach_item,
          &quit_item,
        ],
      )?;

      TrayIconBuilder::new()
        .menu(&tray_menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app_handle, event| {
          let event_id = event.id.as_ref();
          let _ = app_handle.emit("alphonso://tray_menu", event_id.to_string());

          match event_id {
            "show_main" => {
              if let Some(main_window) = app_handle.get_webview_window("main") {
                let _ = main_window.unminimize();
                let _ = main_window.show();
                let _ = main_window.set_focus();
              }
            }
            "new_chat" => {
              if let Some(main_window) = app_handle.get_webview_window("main") {
                let _ = main_window.unminimize();
                let _ = main_window.show();
                let _ = main_window.set_focus();
              }
              let _ = app_handle.emit("alphonso://new_chat", "tray");
            }
            "show_coach" => {
              if let Some(coach_window) = app_handle.get_webview_window("coach") {
                let _ = coach_window.show();
                let _ = coach_window.set_focus();
              }
            }
            "toggle_coach" => {
              let _ = app_handle.emit("alphonso://coach_toggle", "toggle".to_string());
            }
            "quit_app" => {
              app_handle.exit(0);
            }
            _ => {}
          }
        })
        .on_tray_icon_event(|tray, event| {
          if let TrayIconEvent::Click {
            button: MouseButton::Left,
            button_state: MouseButtonState::Up,
            ..
          } = event
          {
            let app_handle = tray.app_handle();

            if let Some(main_window) = app_handle.get_webview_window("main") {
              let _ = main_window.unminimize();
              let _ = main_window.show();
              let _ = main_window.set_focus();
            }

            if let Some(coach_window) = app_handle.get_webview_window("coach") {
              let _ = coach_window.show();
              let _ = coach_window.set_focus();
            }
          }
        })
        .build(app)?;

      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // Auto-start AI runtimes (Ollama always; others if already installed)
      runtime_manager::autostart_all(runtime_mgr_state, app.handle().clone());

      // Start companion WebSocket server
      let config = crate::companion_types::CompanionConfig::default();
      let (server, _rx) = crate::companion_server::CompanionServer::new(config);
      let companion_server = std::sync::Arc::new(server);
      let companion_server_clone = std::sync::Arc::clone(&companion_server);
      app.manage(companion_server_clone);
      tauri::async_runtime::spawn(async move {
        if let Err(e) = companion_server.run().await {
          log::error!("Companion server error: {}", e);
        }
      });

      use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
      let shortcut: Shortcut = "Ctrl+Shift+Space".parse().unwrap_or_else(|_| {
        "CommandOrControl+Shift+Space"
          .parse()
          .expect("fallback hotkey parse")
      });
      let app_handle_hs = app.handle().clone();
      app
        .handle()
        .global_shortcut()
        .on_shortcut(shortcut, move |_, _, event| {
          if event.state == ShortcutState::Pressed {
            if let Some(win) = app_handle_hs.get_webview_window("main") {
              let _ = win.unminimize();
              let _ = win.show();
              let _ = win.set_focus();
            }
            let _ = app_handle_hs.emit("alphonso://voice_start", "hotkey");
          }
        })?;

      Ok(())
    })
    .on_page_load(|window, _payload| {
      let proof_output_dir = native_proof_output_dir();
      let payload = NativeProofStageProof {
        stage: "04_frontend_loaded".to_string(),
        status: "ready".to_string(),
        timestamp: now_ms().to_string(),
        process_id: std::process::id(),
        workspace_root: native_workspace_root(),
        output_dir: proof_output_dir.display().to_string(),
        proof_request_found: read_native_proof_request(&proof_output_dir).is_some(),
        window_label: Some(window.label().to_string()),
        note: Some("Page load observed for the native window.".to_string()),
        error: None,
        duration_ms: None,
      };
      write_native_startup_trace(
        "page_load",
        &window
          .app_handle()
          .path()
          .app_data_dir()
          .map(|path| path.display().to_string())
          .unwrap_or_else(|_| native_workspace_root()),
        Some("Tauri on_page_load observed the frontend mount."),
      );
      let _ = write_native_proof_stage(&proof_output_dir, "04_frontend_loaded.json", &payload);
    })
    .on_window_event(|window, event| match event {
      WindowEvent::CloseRequested { .. } if window.label() == "main" => {
        std::process::exit(0);
      }
      WindowEvent::Focused(true) | WindowEvent::Resized(_) => {
        let proof_output_dir = native_proof_output_dir();
        let payload = NativeProofStageProof {
          stage: "04_frontend_loaded".to_string(),
          status: "window_ready".to_string(),
          timestamp: now_ms().to_string(),
          process_id: std::process::id(),
          workspace_root: native_workspace_root(),
          output_dir: proof_output_dir.display().to_string(),
          proof_request_found: read_native_proof_request(&proof_output_dir).is_some(),
          window_label: Some(window.label().to_string()),
          note: Some("Window-ready fallback observed before page-load confirmation.".to_string()),
          error: None,
          duration_ms: None,
        };
        let _ = write_native_proof_stage(&proof_output_dir, "04_frontend_loaded.json", &payload);
      }
      _ => {}
    })
    .invoke_handler(tauri::generate_handler![
      execute_command_verified,
      run_native_rc0_proof,
      runway_generate_video,
      runway_list_pending_jobs,
      runway_resume_task,
      send_app_notification,
      save_settings,
      load_settings,
      kv_set,
      kv_get,
      verify_paths,
      read_runtime_env_value,
      alphonso_bridge_status,
      alphonso_bridge_send_packet,
      check_processes,
      check_ollama_runtime,
      ollama_list_models,
      ollama_generate,
      record_restore_point,
      write_handoff_export_file,
      workspace::write_workspace_text_file,
      append_audit_log,
      read_audit_log,
      verify_audit_chain,
      discover_plugins_from_disk,
      validate_plugin_manifest_disk,
      execute_plugin_tool,
      run_ocr_adapter,
      workspace::collect_workspace_proof,
      check_ocr_capability,
      get_memory_store_status,
      upsert_memory_records,
      list_memory_records,
      upsert_runtime_ledger_records,
      list_runtime_ledger_records,
      record_event,
      list_events_command,
      list_event_dedup_command,
      get_event_store_status,
      search::fetch_research_sources,
      search::search_research_sources,
      search::search_brave_sources,
      decompose_jose_command_backend,
      workspace::build_workspace_symbol_index,
      workspace::scan_workspace_readiness,
      workspace::inspect_updater_release,
      check_app_update,
      check_env_vars_presence,
      telegram::connector_poll_telegram,
      connector_poll_whatsapp,
      whatsapp_webhook::verify_whatsapp_cloud_webhook_challenge,
      whatsapp_webhook::verify_whatsapp_cloud_webhook_signature,
      whatsapp_webhook::normalize_whatsapp_cloud_inbound,
      telegram::connector_send_telegram,
      connector_send_whatsapp,
      connector_github_action,
      connector_slack_send,
      connector_send_chatgpt,
      connector_send_claude,
      connector_send_qwen,
      connector_send_notion,
      connector_send_clickup,
      connector_upload_youtube,
      meta_publish_content,
      tool_connection_post_webhook,
      connector_generate_sdwebui_image,
      connector_queue_comfyui_video,
      connector_get_comfyui_history,
      connector_check_local_runtime_health,
      workspace::read_workspace_file,
      workspace::delete_workspace_file,
      workspace::move_workspace_file,
      workspace::search_workspace_files,
      workspace::list_workspace_directory,
      open_url,
      fetch_url_content,
      read_clipboard,
      write_clipboard,
      pick_folder,
      launch_ollama,
      launch_comfyui,
      runtime_manager::runtime_get_all_status,
      runtime_manager::runtime_install_tool,
      runtime_manager::runtime_start_tool,
      runtime_manager::runtime_stop_tool,
      runtime_manager::runtime_list_tools,
      runtime_manager::runtime_check_prerequisites,
      runtime_manager::runtime_install_prerequisite,
      runtime_manager::runtime_get_autostart_prefs,
      runtime_manager::runtime_save_autostart_pref,
      save_image_to_folder,
      companion_server::companion_get_pin,
      companion_server::companion_get_status,
      companion_server::companion_start_discovery,
      voice_sidecar::voice_start,
      voice_sidecar::voice_stop,
      voice_sidecar::voice_status
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
