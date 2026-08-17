use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::{Manager, State};

/// Holds the per-session token generated when Voice OS starts.
/// Exposed to the frontend via `voice_get_token` so the WebSocket URL can
/// carry `?token=<value>`. A new token is generated on every `voice_start`.
pub struct VoiceToken(pub Mutex<Option<String>>);

const VOICE_HEALTH_URL: &str = "http://127.0.0.1:8766/health";
const VOICE_STARTUP_ATTEMPTS: usize = 25;
const VOICE_STARTUP_RETRY_DELAY_MS: u64 = 200;

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

/// Generate a cryptographically random 128-bit (32 hex char) token.
///
/// Uses `rand::rng()` (the crate-level CSPRNG) rather than `DefaultHasher`
/// which is a non-cryptographic hash seeded from a predictable source.
pub(crate) fn random_hex_token() -> String {
  use rand::RngCore;
  let mut bytes = [0u8; 16];
  rand::rng().fill_bytes(&mut bytes);
  bytes.iter().map(|b| format!("{b:02x}")).collect()
}

#[tauri::command]
pub async fn voice_start(
  app: tauri::AppHandle,
  state: State<'_, VoiceSidecar>,
  token_state: State<'_, VoiceToken>,
) -> Result<String, String> {
  // Another launch path (Runtime Hub's "voice-os" ToolDef in runtime_manager.rs)
  // can independently spawn the same uvicorn process on this port with its own
  // PID tracking. Checking only this module's local Mutex missed that case, so
  // both paths could believe they owned the process and race to bind :8766.
  // A live health check catches "already running" regardless of which path
  // started it.
  let already_healthy = match reqwest::Client::builder()
    .timeout(std::time::Duration::from_millis(
      VOICE_STARTUP_RETRY_DELAY_MS,
    ))
    .build()
  {
    Ok(client) => client
      .get(VOICE_HEALTH_URL)
      .send()
      .await
      .map(|response| response.status().is_success())
      .unwrap_or(false),
    Err(_) => false,
  };
  if already_healthy {
    // If the session token is still held, Voice OS is fully usable — return early.
    // If the token was lost (e.g. the Tauri process restarted while Voice OS kept
    // running), kill the orphaned process and fall through to restart it with a
    // fresh token so WebSocket connections can authenticate.
    let has_token = token_state.0.lock().map(|g| g.is_some()).unwrap_or(false);
    if has_token {
      return Ok("already_running".into());
    }
    // Token was lost — evict the stale tracked child (if any) so the spawn path
    // below does not see a live entry and return early again.
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(mut child) = guard.take() {
      let _ = child.kill();
    }
    // Fall through to spawn fresh.
  }

  {
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
    let runtimes_dir = crate::runtime_manager::runtimes_dir();
    let python_bin = resolve_voice_python(&backend_path, &runtimes_dir);
    let token = random_hex_token();
    *token_state.0.lock().map_err(|e| e.to_string())? = Some(token.clone());

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
        // Suppress access logs so the ?token= query param is never written to
        // the Tauri log stream or any other sink.
        "--no-access-log",
        "--app-dir",
      ])
      .arg(&backend_path)
      .env("VOICE_PIPER_MODEL_DIR", runtimes_dir.join("voice-os"))
      .env("VOICE_OS_TOKEN", &token)
      .stdout(Stdio::piped())
      .stderr(Stdio::piped());
    crate::utils::no_window(&mut cmd);
    let mut child = match cmd.spawn() {
      Ok(c) => c,
      Err(e) => {
        // Clear the token — Voice OS did not start, so no valid socket session exists.
        *token_state.0.lock().map_err(|e| e.to_string())? = None;
        return Err(format!("Failed to start voice server: {e}"));
      }
    };
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
  }

  let health_client = reqwest::Client::builder()
    .timeout(std::time::Duration::from_millis(
      VOICE_STARTUP_RETRY_DELAY_MS,
    ))
    .build()
    .map_err(|e| format!("Failed to build voice health-check client: {e}"))?;

  for _ in 0..VOICE_STARTUP_ATTEMPTS {
    let ready = health_client
      .get(VOICE_HEALTH_URL)
      .send()
      .await
      .map(|response| response.status().is_success())
      .unwrap_or(false);
    if ready {
      return Ok("started".into());
    }
    tokio::time::sleep(std::time::Duration::from_millis(
      VOICE_STARTUP_RETRY_DELAY_MS,
    ))
    .await;
  }

  let mut guard = state.0.lock().map_err(|e| e.to_string())?;
  if let Some(mut child) = guard.take() {
    let _ = child.kill();
  }
  // Clear the token so stale tokens from this failed start attempt cannot be
  // replayed against a future (successful) Voice OS start.
  *token_state.0.lock().map_err(|e| e.to_string())? = None;
  Err("Voice server did not become ready within 5 seconds. Check Python, Voice OS dependencies, and the local port 8766.".into())
}

/// Returns the per-session token that must be appended to the WebSocket URL as
/// `?token=<value>`. Returns an error if Voice OS has not been started yet.
#[tauri::command]
pub async fn voice_get_token(token_state: State<'_, VoiceToken>) -> Result<String, String> {
  let guard = token_state.0.lock().map_err(|e| e.to_string())?;
  guard
    .clone()
    .ok_or_else(|| "Voice OS is not running".to_string())
}

#[tauri::command]
pub async fn voice_stop(
  state: State<'_, VoiceSidecar>,
  token_state: State<'_, VoiceToken>,
) -> Result<String, String> {
  let kill_result = {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(mut child) = guard.take() {
      child.kill().map_err(|e| e.to_string())
    } else {
      Ok(())
    }
  };
  // Always clear the token regardless of kill outcome — the process state is
  // uncertain after a failed kill, so a stale token must not be reused.
  *token_state.0.lock().map_err(|e| e.to_string())? = None;
  kill_result.map(|_| "stopped".into())
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
