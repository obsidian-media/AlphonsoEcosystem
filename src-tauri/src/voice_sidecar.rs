use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::{Manager, State};

pub struct VoiceSidecar(pub Mutex<Option<Child>>);

/// Resolve which Python interpreter to launch Voice OS with.
///
/// Runtime Hub's "voice-os" ToolDef (runtime_manager.rs) is the only thing
/// that ever `pip install`s Voice OS's dependencies (faster-whisper, piper-tts,
/// fastapi, uvicorn, etc.) — and it installs them into a venv under
/// `runtimes_dir()/voice-os/venv`, NOT under the bundled app resource
/// directory. Before this fix, voice_start only ever checked for a venv
/// under the resource directory (which nothing ever creates), so even a
/// successful Runtime Hub install was invisible to the actual launch path —
/// voice_start would silently fall through to the bare system `python`,
/// which crashes on the first missing import unless the user happened to
/// have every dependency installed globally.
fn resolve_voice_python(
  backend_path: &std::path::Path,
  runtime_hub_runtimes_dir: &std::path::Path,
) -> std::path::PathBuf {
  let runtime_hub_venv = runtime_hub_runtimes_dir.join("voice-os").join("venv");
  let runtime_hub_python = if cfg!(target_os = "windows") {
    runtime_hub_venv.join("Scripts").join("python.exe")
  } else {
    runtime_hub_venv.join("bin").join("python3")
  };
  if runtime_hub_python.exists() {
    return runtime_hub_python;
  }

  let bundled_venv = backend_path.join("venv");
  let bundled_python = if cfg!(target_os = "windows") {
    bundled_venv.join("Scripts").join("python.exe")
  } else {
    bundled_venv.join("bin").join("python3")
  };
  if bundled_python.exists() {
    return bundled_python;
  }

  if cfg!(target_os = "windows") {
    std::path::PathBuf::from("python")
  } else {
    std::path::PathBuf::from("python3")
  }
}

#[tauri::command]
pub async fn voice_start(
  app: tauri::AppHandle,
  state: State<'_, VoiceSidecar>,
) -> Result<String, String> {
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
  let python_bin = resolve_voice_python(&backend_path, &crate::runtime_manager::runtimes_dir());
  let mut cmd = Command::new(&python_bin);
  cmd
    .args([
      "-m",
      "uvicorn",
      "main:app",
      "--host",
      "127.0.0.1",
      "--port",
      "8766",
      "--app-dir",
    ])
    .arg(&backend_path)
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());
  crate::utils::no_window(&mut cmd);
  let mut child = cmd
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

#[cfg(test)]
mod tests {
  use super::*;
  use std::fs;

  fn make_venv_python(venv_dir: &std::path::Path) -> std::path::PathBuf {
    let py = if cfg!(target_os = "windows") {
      venv_dir.join("Scripts").join("python.exe")
    } else {
      venv_dir.join("bin").join("python3")
    };
    fs::create_dir_all(py.parent().unwrap()).unwrap();
    fs::write(&py, b"").unwrap();
    py
  }

  #[test]
  fn prefers_the_runtime_hub_managed_venv_over_the_bundled_resource_dir_venv() {
    let tmp = std::env::temp_dir().join(format!("alphonso_voice_test_{}_a", std::process::id()));
    let _ = fs::remove_dir_all(&tmp);
    let runtime_hub_venv = tmp.join("runtime_hub").join("voice-os").join("venv");
    let bundled_venv = tmp
      .join("resource")
      .join("voice")
      .join("backend")
      .join("venv");
    let expected = make_venv_python(&runtime_hub_venv);
    make_venv_python(&bundled_venv);

    let backend_path = tmp.join("resource").join("voice").join("backend");
    let resolved = resolve_voice_python(&backend_path, &tmp.join("runtime_hub"));

    assert_eq!(resolved, expected);
    let _ = fs::remove_dir_all(&tmp);
  }

  #[test]
  fn falls_back_to_the_bundled_resource_dir_venv_when_no_runtime_hub_venv_exists() {
    let tmp = std::env::temp_dir().join(format!("alphonso_voice_test_{}_b", std::process::id()));
    let _ = fs::remove_dir_all(&tmp);
    let bundled_venv = tmp
      .join("resource")
      .join("voice")
      .join("backend")
      .join("venv");
    let expected = make_venv_python(&bundled_venv);

    let backend_path = tmp.join("resource").join("voice").join("backend");
    let resolved = resolve_voice_python(&backend_path, &tmp.join("runtime_hub"));

    assert_eq!(resolved, expected);
    let _ = fs::remove_dir_all(&tmp);
  }

  #[test]
  fn falls_back_to_bare_system_python_when_no_venv_exists_anywhere() {
    let tmp = std::env::temp_dir().join(format!("alphonso_voice_test_{}_c", std::process::id()));
    let _ = fs::remove_dir_all(&tmp);
    let backend_path = tmp.join("resource").join("voice").join("backend");

    let resolved = resolve_voice_python(&backend_path, &tmp.join("runtime_hub"));

    let expected_name = if cfg!(target_os = "windows") {
      "python"
    } else {
      "python3"
    };
    assert_eq!(resolved, std::path::PathBuf::from(expected_name));
    let _ = fs::remove_dir_all(&tmp);
  }
}
