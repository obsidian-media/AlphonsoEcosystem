use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Listener, Manager, WindowEvent};

mod audit_log;
mod commands {
  pub(crate) mod bridge;
  pub(crate) mod clipboard;
  pub(crate) mod jose;
  pub(crate) mod notification;
  pub(crate) mod ocr;
  pub(crate) mod restore;
  pub(crate) mod system;
  pub(crate) mod updates;
  pub(crate) mod url;
}
mod companion_auth;
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
mod os_keychain_store;
mod plugin_runtime;
mod policy_gate;
mod runtime_manager;
mod runway;
mod search;
mod telegram;
mod utils;
mod voice_sidecar;
mod whatsapp_webhook;
mod workspace;
mod youtube;
use voice_sidecar::{VoiceSidecar, VoiceToken};

pub(crate) struct RateLimiter {
  calls: Mutex<HashMap<String, (u32, std::time::Instant)>>,
}

impl RateLimiter {
  fn new() -> Self {
    Self {
      calls: Mutex::new(HashMap::new()),
    }
  }

  fn check_and_record(&self, command: &str) -> Result<(), String> {
    let mut calls = self.calls.lock().map_err(|e| e.to_string())?;
    let now = std::time::Instant::now();
    let entry = calls.entry(command.to_string()).or_insert((0, now));
    if now.duration_since(entry.1).as_secs() >= 60 {
      *entry = (1, now);
      return Ok(());
    }
    if entry.0 >= 10 {
      return Err("rate_limited".to_string());
    }
    entry.0 += 1;
    Ok(())
  }
}

pub(crate) use audit_log::*;
pub(crate) use commands::bridge::*;
pub(crate) use commands::clipboard::*;
pub(crate) use commands::jose::*;
pub(crate) use commands::notification::*;
pub(crate) use commands::ocr::*;
pub(crate) use commands::restore::*;
pub(crate) use commands::system::*;
pub(crate) use commands::updates::*;
pub(crate) use commands::url::*;
pub(crate) use connector_commands::*;
pub(crate) use kv_store::{kv_delete, kv_get, kv_set, load_settings, save_settings};
pub(crate) use memory_store::*;
pub(crate) use meta_publish::*;
pub(crate) use native_proof::{
  run_native_rc0_proof, start_native_rc0_proof_if_requested, NativeProofStageProof,
};
pub(crate) use ollama::*;
pub(crate) use os_keychain_store::{
  secure_credential_delete, secure_credential_get, secure_credential_set,
};
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

fn comfyui_shared_root(dir: &Path) -> Option<PathBuf> {
  let desktop_root = dir.parent()?.parent()?.parent()?;
  let shared = desktop_root.join("ComfyUI-Shared");
  shared.exists().then_some(shared)
}

fn write_comfyui_extra_model_paths_config(shared_root: &Path) -> Result<PathBuf, String> {
  let models_root = shared_root.join("models");
  let yaml = format!(
    concat!(
      "alphonso:\n",
      "  checkpoints: {}\n",
      "  classifiers: {}\n",
      "  clip_vision: {}\n",
      "  configs: {}\n",
      "  controlnet: {}\n",
      "  diffusion_models: {}\n",
      "  embeddings: {}\n",
      "  hypernetworks: {}\n",
      "  loras: {}\n",
      "  upscale_models: {}\n",
      "  vae: {}\n",
      "  vae_approx: {}\n",
      "  clip: {}\n",
      "  unet: {}\n"
    ),
    models_root.join("checkpoints").display(),
    models_root.join("classifiers").display(),
    models_root.join("clip_vision").display(),
    models_root.join("configs").display(),
    models_root.join("controlnet").display(),
    models_root.join("diffusion_models").display(),
    models_root.join("embeddings").display(),
    models_root.join("hypernetworks").display(),
    models_root.join("loras").display(),
    models_root.join("upscale_models").display(),
    models_root.join("vae").display(),
    models_root.join("vae_approx").display(),
    models_root.join("clip").display(),
    models_root.join("unet").display()
  );
  let path = std::env::temp_dir().join("alphonso-comfyui-extra-model-paths.yaml");
  fs::write(&path, yaml).map_err(|e| e.to_string())?;
  Ok(path)
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

/// Write raw audio bytes (from JS FileReader) to a temp file and return its path.
/// This lets the browser hand a File object to Whisper without needing file.path.
#[tauri::command]
fn write_temp_audio_file(filename: String, bytes: Vec<u8>) -> Result<String, String> {
  let ext = std::path::Path::new(&filename)
    .extension()
    .unwrap_or_default()
    .to_string_lossy()
    .to_lowercase();
  let safe_ext = if ["mp3", "wav", "m4a", "mp4", "ogg", "webm", "flac"].contains(&ext.as_str()) {
    ext
  } else {
    "wav".into()
  };
  let dest = std::env::temp_dir().join(format!("alphonso_audio_{}.{}", now_ms(), safe_ext));
  std::fs::write(&dest, &bytes).map_err(|e| e.to_string())?;
  Ok(dest.to_string_lossy().to_string())
}

/// Open a file-picker dialog and return the selected file path.
/// Uses tauri-plugin-dialog (native OS dialog, no PowerShell required).
#[tauri::command]
async fn pick_file(app: tauri::AppHandle, filters: Option<Vec<String>>) -> Result<String, String> {
  use tauri_plugin_dialog::DialogExt;
  let _ = filters;
  let path = app
    .dialog()
    .file()
    .add_filter(
      "Audio files",
      &["mp3", "wav", "m4a", "mp4", "ogg", "webm", "flac"],
    )
    .add_filter("All files", &["*"])
    .blocking_pick_file();
  match path {
    Some(p) => Ok(p.to_string()),
    None => Err("cancelled".to_string()),
  }
}

#[tauri::command]
async fn pick_folder(app: tauri::AppHandle) -> Result<FolderPickProof, String> {
  use tauri_plugin_dialog::DialogExt;
  let path = app.dialog().file().blocking_pick_folder();
  let picked = path.is_some();
  Ok(FolderPickProof {
    path: path.map(|p| p.to_string()).unwrap_or_default(),
    picked,
    picked_at_ms: now_ms(),
  })
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
  // Resolve the real binary (bundled vendor/ollama first, then PATH/common
  // install locations — see runtime_manager::find_ollama()) instead of
  // shelling out to a bare "ollama" command. The previous cmd/sh-wrapped
  // version relied entirely on PATH, so a clean install with only the
  // bundled binary (no system Ollama) would fail to launch here even after
  // Dependency Bundling Plan O1/O3 — detection alone doesn't help if the
  // thing that actually starts the process never asks it where to look.
  let ollama_path = runtime_manager::find_ollama().unwrap_or_else(|| "ollama".to_string());
  use std::process::Command;
  let mut cmd = Command::new(&ollama_path);
  cmd.arg("serve");
  utils::no_window(&mut cmd);
  cmd
    .spawn()
    .map_err(|e| format!("Failed to launch Ollama ({ollama_path}): {e}"))?;
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
  let bundled_python = if cfg!(target_os = "windows") {
    Path::new(&dir)
      .join(".venv")
      .join("Scripts")
      .join("python.exe")
  } else {
    Path::new(&dir).join(".venv").join("bin").join("python3")
  };
  let py = if bundled_python.exists() {
    bundled_python.to_string_lossy().to_string()
  } else if python_exe.trim().is_empty() {
    "python".to_string()
  } else {
    python_exe.trim().to_string()
  };
  let py_path = Path::new(&py);
  let py_name = py_path
    .file_name()
    .and_then(|name| name.to_str())
    .unwrap_or(py.as_str());
  if py_path != bundled_python.as_path() && !allowed_program(py_name) {
    return Err(format!(
      "'{}' is not allowed by Alphonso supervised command policy. Use python, python3, or the bundled ComfyUI venv interpreter.",
      py
    ));
  }
  use std::process::Command;
  let mut comfy_cmd = Command::new(&py);
  comfy_cmd
    .arg("main.py")
    .arg("--port")
    .arg("8188")
    .arg("--listen")
    .arg("127.0.0.1");
  if let Some(shared_root) = comfyui_shared_root(Path::new(&dir)) {
    let extra_model_paths = write_comfyui_extra_model_paths_config(&shared_root)?;
    comfy_cmd
      .arg("--extra-model-paths-config")
      .arg(extra_model_paths);
    let input_dir = shared_root.join("input");
    if input_dir.exists() {
      comfy_cmd.arg("--input-directory").arg(input_dir);
    }
    let output_dir = shared_root.join("output");
    if output_dir.exists() {
      comfy_cmd.arg("--output-directory").arg(output_dir);
    }
  }
  comfy_cmd.current_dir(&dir);
  utils::no_window(&mut comfy_cmd);
  comfy_cmd.spawn().map_err(|e| {
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
  let filename = filename.trim().to_string();
  if filename.is_empty() {
    return Err("No filename configured".to_string());
  }

  // Path traversal protection: reject any path component that is ParentDir
  if std::path::Path::new(&folder)
    .components()
    .any(|c| matches!(c, std::path::Component::ParentDir))
  {
    return Err("Unsafe folder path rejected".to_string());
  }
  if std::path::Path::new(&filename)
    .components()
    .any(|c| matches!(c, std::path::Component::ParentDir))
  {
    return Err("Unsafe filename rejected".to_string());
  }

  let raw = base64_data
    .trim_start_matches("data:image/png;base64,")
    .trim_start_matches("data:image/jpeg;base64,")
    .to_string();
  let path = std::path::Path::new(&folder).join(&filename);
  let path_str = path.to_string_lossy().to_string();
  // Decode base64 in Rust — no shell involved, eliminates injection risk on all platforms.
  use base64::Engine as _;
  let bytes = base64::engine::general_purpose::STANDARD
    .decode(raw.as_bytes())
    .map_err(|e| format!("base64 decode error: {e}"))?;
  std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
  Ok(SaveImageProof {
    path: path_str,
    saved: true,
    saved_at_ms: now_ms(),
  })
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn save_image_to_folder_rejects_parent_dir_in_folder() {
    let result = save_image_to_folder(
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8=".to_string(),
      "test.png".to_string(),
      "../output".to_string(),
    );
    assert!(result.is_err());
    match result {
      Err(msg) => assert_eq!(msg, "Unsafe folder path rejected"),
      Ok(_) => panic!("Expected error"),
    }
  }

  #[test]
  fn save_image_to_folder_rejects_parent_dir_in_filename() {
    let result = save_image_to_folder(
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8=".to_string(),
      "../test.png".to_string(),
      "output".to_string(),
    );
    assert!(result.is_err());
    match result {
      Err(msg) => assert_eq!(msg, "Unsafe filename rejected"),
      Ok(_) => panic!("Expected error"),
    }
  }

  #[test]
  fn save_image_to_folder_accepts_safe_paths() {
    let temp_dir = std::env::temp_dir();
    let temp_path = temp_dir.join("test_save");
    std::fs::create_dir_all(&temp_path).unwrap();

    let result = save_image_to_folder(
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8=".to_string(),
      "test.png".to_string(),
      temp_path.to_string_lossy().to_string(),
    );
    assert!(result.is_ok());
    let proof = result.unwrap();
    assert!(proof.path.ends_with("test.png"));
    assert!(std::path::Path::new(&proof.path).exists());
    std::fs::remove_file(&proof.path).unwrap();
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
  // Capture panics to a log file before the process exits so startup crashes
  // are diagnosable without a debugger attached.
  // Location (file + line) is always available; backtrace requires symbols.
  std::panic::set_hook(Box::new(|info| {
    let location = info
      .location()
      .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
      .unwrap_or_else(|| "unknown location".to_string());
    let payload = info
      .payload()
      .downcast_ref::<&str>()
      .copied()
      .or_else(|| info.payload().downcast_ref::<String>().map(|s| s.as_str()))
      .unwrap_or("(no message)");
    let msg = format!("[alphonso panic] {payload}\n  at {location}\n");
    eprintln!("{msg}");
    // Best-effort write to %TEMP%\alphonso_panic.log
    let mut path = std::env::temp_dir();
    path.push("alphonso_panic.log");
    let _ = std::fs::write(&path, &msg);
  }));

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
    .manage(VoiceToken(std::sync::Mutex::new(None)))
    .manage(RateLimiter::new())
    .plugin(tauri_plugin_notification::init())
    .plugin(tauri_plugin_global_shortcut::Builder::new().build())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_opener::init())
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
      let app_handle_for_companion = app.handle().clone();
      tauri::async_runtime::spawn(async move {
        if let Err(e) = companion_server.run(app_handle_for_companion).await {
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
      // Ignore "already registered" — happens when a previous dev run crashed without cleanup.
      if let Err(e) = app
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
        })
      {
        log::warn!("Global shortcut Ctrl+Shift+Space could not be registered: {e}");
      }

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
      kv_delete,
      secure_credential_set,
      secure_credential_get,
      secure_credential_delete,
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
      connector_hermes_agent_request,
      workspace::transcribe_audio_file,
      workspace::read_workspace_file,
      write_temp_audio_file,
      pick_file,
      workspace::delete_workspace_file,
      workspace::move_workspace_file,
      workspace::search_workspace_files,
      workspace::list_workspace_directory,
      workspace::watch_inbox_poll,
      workspace::mark_inbox_file_processed,
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
      companion_server::companion_broadcast,
      companion_server::companion_get_local_ip,
      voice_sidecar::voice_start,
      voice_sidecar::voice_stop,
      voice_sidecar::voice_status,
      voice_sidecar::voice_get_token
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
