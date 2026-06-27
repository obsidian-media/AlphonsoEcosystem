use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::{Manager, State};

pub struct VoiceSidecar(pub Mutex<Option<Child>>);

#[tauri::command]
pub async fn voice_start(app: tauri::AppHandle, state: State<'_, VoiceSidecar>) -> Result<String, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if guard.is_some() {
        return Ok("already_running".into());
    }
    // Resolve voice/backend relative to the app resource directory so it works in production installs
    let backend_path = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Failed to resolve resource dir: {e}"))?
        .join("voice")
        .join("backend");
    let mut child = Command::new("python")
        .args([
            "-m",
            "uvicorn",
            "main:app",
            "--host",
            "127.0.0.1",
            "--port",
            "8765",
            "--app-dir",
        ])
        .arg(&backend_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start voice server: {e}"))?;
    if let Some(stdout) = child.stdout.take() {
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                log::info!("[voice-os] {}", line);
            }
        });
    }
    if let Some(stderr) = child.stderr.take() {
        std::thread::spawn(move || {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                log::warn!("[voice-os] {}", line);
            }
        });
    }
    *guard = Some(child);
    Ok("started".into())
}

#[tauri::command]
pub async fn voice_stop(state: State<'_, VoiceSidecar>) -> Result<String, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(mut child) = guard.take() {
        child.kill().map_err(|e| e.to_string())?;
    }
    Ok("stopped".into())
}

#[tauri::command]
pub async fn voice_status(state: State<'_, VoiceSidecar>) -> Result<String, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(ref mut child) = *guard {
        match child.try_wait() {
            Ok(None) => Ok("running".into()),
            _ => {
                *guard = None;
                Ok("stopped".into())
            }
        }
    } else {
        Ok("stopped".into())
    }
}
