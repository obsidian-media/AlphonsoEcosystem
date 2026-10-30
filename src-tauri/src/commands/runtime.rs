use crate::commands::filesystem::{comfyui_shared_root, write_comfyui_extra_model_paths_config};
use crate::{allowed_program, now_ms, runtime_manager, utils};
use serde::Serialize;
use std::path::Path;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ServiceLaunchProof {
  service: String,
  launched: bool,
  already_running: bool,
  message: String,
  launched_at_ms: u64,
}

#[tauri::command]
pub(crate) async fn launch_ollama() -> Result<ServiceLaunchProof, String> {
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
pub(crate) async fn launch_comfyui(
  comfyui_dir: String,
  python_exe: String,
  runtime: tauri::State<'_, crate::runtime_manager::RuntimeManager>,
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
  // The Python next to this ComfyUI (its .venv/venv, a venv beside it, or the
  // portable build's python_embeded). It used to look only in <dir>\.venv, so
  // other layouts fell back to a bare `python` without ComfyUI's packages
  // (QA Bug 31). A Python chosen in Settings still wins.
  let chosen = python_exe.trim();
  let detected = crate::comfyui_installs::python_for_root(Path::new(&dir));
  let py = if !chosen.is_empty() && !chosen.eq_ignore_ascii_case("python") {
    chosen.to_string()
  } else if let Some(found) = detected.as_ref() {
    found.to_string_lossy().to_string()
  } else {
    "python".to_string()
  };
  let py_path = Path::new(&py);
  let py_name = py_path
    .file_name()
    .and_then(|name| name.to_str())
    .unwrap_or(py.as_str());
  if detected.as_deref() != Some(py_path) && !allowed_program(py_name) {
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
  let child = comfy_cmd.spawn().map_err(|e| {
    format!(
      "Failed to launch ComfyUI from '{}' using '{}': {}",
      dir, py, e
    )
  })?;
  // Recorded as started by Alphonso (owner, 2026-10-30), so the idle stop, Runtime Hub's Stop
  // and the Memory section treat it like Alphonso's own copy. A ComfyUI you start stays yours.
  runtime.record_pid("comfyui", child.id());
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
