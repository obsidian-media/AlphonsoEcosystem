use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::State;

pub struct VoiceSidecar(pub Mutex<Option<Child>>);

#[tauri::command]
pub async fn voice_start(state: State<'_, VoiceSidecar>) -> Result<String, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if guard.is_some() {
        return Ok("already_running".into());
    }
    let child = Command::new("python")
        .args([
            "-m",
            "uvicorn",
            "main:app",
            "--host",
            "127.0.0.1",
            "--port",
            "8765",
            "--app-dir",
            "voice/backend",
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to start voice server: {e}"))?;
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
