use crate::utils::secret_or_env;
use serde_json::Value;
use std::time::Duration;

const DEFAULT_PATH_PREFIX: &str = "/api/alphonso-bridge";
const DEFAULT_TIMEOUT_MS: u64 = 15000;

fn normalize_bridge_path_prefix(raw: &str) -> String {
  let trimmed = raw.trim();
  if trimmed.is_empty() {
    DEFAULT_PATH_PREFIX.to_string()
  } else if trimmed.starts_with('/') {
    trimmed.to_string()
  } else {
    format!("/{}", trimmed)
  }
}

fn trim_trailing_slashes(raw: &str) -> String {
  raw.trim().trim_end_matches('/').to_string()
}

/// Where and how to reach ACC. The values saved in Settings (passed in by
/// the app) come first; the `ALPHONSO_BRIDGE_*` environment variables are the
/// fallback. Until 2026-10-22 only the environment was read, so a bridge set
/// up in Settings always failed here (QA Bug 64, same class as Bug 32).
#[derive(Debug, PartialEq)]
struct BridgeSettings {
  base_url: String,
  token: String,
  path_prefix: String,
  timeout_ms: u64,
}

impl BridgeSettings {
  fn resolve(
    base_url: Option<String>,
    token: Option<String>,
    path_prefix: Option<String>,
    timeout_ms: Option<u64>,
  ) -> Self {
    let prefix = secret_or_env(path_prefix, "ALPHONSO_BRIDGE_PATH_PREFIX");
    let timeout = timeout_ms.filter(|ms| *ms > 0).unwrap_or_else(|| {
      std::env::var("ALPHONSO_BRIDGE_TIMEOUT_MS")
        .ok()
        .and_then(|value| value.trim().parse::<u64>().ok())
        .unwrap_or(DEFAULT_TIMEOUT_MS)
    });
    Self {
      base_url: trim_trailing_slashes(&secret_or_env(base_url, "ALPHONSO_BRIDGE_URL")),
      token: secret_or_env(token, "ALPHONSO_BRIDGE_TOKEN"),
      path_prefix: normalize_bridge_path_prefix(&prefix),
      timeout_ms: timeout.max(1000),
    }
  }

  fn configured(&self) -> bool {
    !self.base_url.is_empty() && !self.token.is_empty()
  }

  fn url(&self, suffix: &str) -> String {
    format!("{}{}{}", self.base_url, self.path_prefix, suffix)
  }

  fn summary(&self) -> Value {
    serde_json::json!({
      "success": true,
      "configured": self.configured(),
      "enabled": self.configured(),
      "status": if self.configured() { "configured" } else { "setup_required" },
      "baseUrlConfigured": !self.base_url.is_empty(),
      "tokenConfigured": !self.token.is_empty(),
      "pathPrefix": self.path_prefix,
      "timeoutMs": self.timeout_ms
    })
  }

  fn missing(&self) -> Option<String> {
    if self.base_url.is_empty() {
      Some("ACC's address is not set (Settings, or ALPHONSO_BRIDGE_URL).".to_string())
    } else if self.token.is_empty() {
      Some("The ACC bridge token is not set (Settings, or ALPHONSO_BRIDGE_TOKEN).".to_string())
    } else {
      None
    }
  }
}

fn parse_body(text: String) -> Value {
  serde_json::from_str(&text).unwrap_or(Value::String(text))
}

/// What is set up (not whether ACC answers; see `alphonso_bridge_check`).
#[tauri::command]
#[allow(non_snake_case)]
pub(crate) fn alphonso_bridge_status(
  baseUrl: Option<String>,
  token: Option<String>,
  pathPrefix: Option<String>,
  timeoutMs: Option<u64>,
) -> Value {
  BridgeSettings::resolve(baseUrl, token, pathPrefix, timeoutMs).summary()
}

/// Ask ACC itself whether it is reachable and accepts the token
/// (`GET <prefix>/status`). `reachable` is false when nothing answered.
#[tauri::command]
#[allow(non_snake_case)]
pub(crate) async fn alphonso_bridge_check(
  state: tauri::State<'_, reqwest::Client>,
  baseUrl: Option<String>,
  token: Option<String>,
  pathPrefix: Option<String>,
  timeoutMs: Option<u64>,
) -> Result<Value, String> {
  let settings = BridgeSettings::resolve(baseUrl, token, pathPrefix, timeoutMs);
  if let Some(missing) = settings.missing() {
    return Ok(
      serde_json::json!({ "ok": false, "reachable": false, "status": "setup_required", "error": missing }),
    );
  }
  let response = state
    .inner()
    .get(settings.url("/status"))
    .bearer_auth(&settings.token)
    .timeout(Duration::from_millis(settings.timeout_ms))
    .send()
    .await;
  let response = match response {
    Ok(response) => response,
    Err(error) => {
      return Ok(serde_json::json!({
        "ok": false,
        "reachable": false,
        "status": "unreachable",
        "error": format!("ACC did not answer at {}: {}", settings.base_url, error)
      }))
    }
  };
  let http_status = response.status().as_u16();
  let body = parse_body(response.text().await.unwrap_or_default());
  let status = match http_status {
    200..=299 => "connected",
    401 | 403 => "unauthorized",
    503 => "setup_required_in_acc",
    _ => "failed",
  };
  Ok(serde_json::json!({
    "ok": status == "connected",
    "reachable": true,
    "httpStatus": http_status,
    "status": status,
    "response": body
  }))
}

#[tauri::command]
#[allow(non_snake_case)]
pub(crate) async fn alphonso_bridge_send_packet(
  state: tauri::State<'_, reqwest::Client>,
  packet: Value,
  baseUrl: Option<String>,
  token: Option<String>,
  pathPrefix: Option<String>,
  timeoutMs: Option<u64>,
) -> Result<Value, String> {
  let settings = BridgeSettings::resolve(baseUrl, token, pathPrefix, timeoutMs);
  if let Some(missing) = settings.missing() {
    return Err(missing);
  }
  // Shared reqwest::Client from managed state (connection pooling).
  let response = state
    .inner()
    .post(settings.url(""))
    .bearer_auth(&settings.token)
    .json(&packet)
    .timeout(Duration::from_millis(settings.timeout_ms))
    .send()
    .await
    .map_err(|error| error.to_string())?;

  let http_status = response.status().as_u16();
  let parsed_response = parse_body(response.text().await.map_err(|error| error.to_string())?);
  let ok = http_status < 400;

  Ok(serde_json::json!({
    "success": ok,
    "ok": ok,
    "httpStatus": http_status,
    "response": parsed_response,
    "bridge": settings.summary(),
    "status": if ok { "synced" } else { "failed" }
  }))
}

// ── Starting ACC from Settings → Bridges (owner, 2026-10-22) ─────────────────
//
// The user chooses ACC's folder once, in a native folder dialog opened here (so
// the app window can never supply a path), and the folder is checked to really
// be ACC. Start then takes no arguments: it runs `node <ACC's start script>`
// in that saved folder, with no shell. A webview compromise can at most start
// the ACC the user already chose.

const ACC_FOLDER_FILE: &str = "acc_bridge_folder.json";
const ACC_LOG_FILE: &str = "acc_bridge.log";
const ACC_PACKAGE_NAME: &str = "agent-command-center";
const ACC_RECEIVER_FILE: &str = "cloud/services/alphonsoBridgeService.js";

static ACC_PID: std::sync::Mutex<Option<u32>> = std::sync::Mutex::new(None);

fn acc_folder_file(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
  use tauri::Manager;
  app
    .path()
    .app_config_dir()
    .ok()
    .map(|dir| dir.join(ACC_FOLDER_FILE))
}

fn saved_acc_folder(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
  let raw = std::fs::read_to_string(acc_folder_file(app)?).ok()?;
  let value: Value = serde_json::from_str(&raw).ok()?;
  let folder = value.get("folder")?.as_str()?.trim().to_string();
  (!folder.is_empty()).then(|| std::path::PathBuf::from(folder))
}

/// The relative script in a `"start": "node <script>"` package script, or why
/// it can't be used. Anything beyond one plain relative path is refused: the
/// script is run without a shell, so `&&`, pipes and flags are not supported.
fn node_start_script(start: &str) -> Result<String, String> {
  let parts: Vec<&str> = start.split_whitespace().collect();
  if parts.len() != 2 || parts[0] != "node" {
    return Err(format!(
      "ACC's start script is \"{}\"; Alphonso can only start a plain \"node <file>\" script.",
      start
    ));
  }
  let script = parts[1];
  // A drive path (`C:/x.js`) is not "absolute" to Linux's Path, so refuse a
  // leading slash or any `:` directly, the same on every system.
  let bad = script.starts_with('-')
    || script.starts_with('/')
    || script.starts_with('\\')
    || script.contains("..")
    || std::path::Path::new(script).is_absolute()
    || script.chars().any(|c| {
      matches!(
        c,
        ':' | '&' | '|' | ';' | '<' | '>' | '$' | '`' | '"' | '\''
      )
    });
  if bad {
    return Err(format!(
      "ACC's start script \"{}\" isn't a plain file inside the folder.",
      start
    ));
  }
  Ok(script.to_string())
}

/// Checks that `folder` is ACC and returns the start script to run.
fn validate_acc_folder(folder: &std::path::Path) -> Result<String, String> {
  let raw = std::fs::read_to_string(folder.join("package.json"))
    .map_err(|_| "That folder has no package.json, so it isn't ACC.".to_string())?;
  let package: Value =
    serde_json::from_str(&raw).map_err(|_| "ACC's package.json couldn't be read.".to_string())?;
  if package.get("name").and_then(|v| v.as_str()) != Some(ACC_PACKAGE_NAME) {
    return Err(format!(
      "That folder isn't ACC (its package.json is not \"{}\").",
      ACC_PACKAGE_NAME
    ));
  }
  if !folder.join(ACC_RECEIVER_FILE).exists() {
    return Err("This copy of ACC has no Alphonso bridge receiver.".to_string());
  }
  let start = package
    .pointer("/scripts/start")
    .and_then(|v| v.as_str())
    .ok_or("ACC's package.json has no start script.")?;
  let script = node_start_script(start)?;
  if !folder.join(&script).exists() {
    return Err(format!("ACC's start script {} is missing.", script));
  }
  Ok(script)
}

fn acc_running() -> Option<u32> {
  let mut guard = ACC_PID.lock().ok()?;
  match *guard {
    Some(pid) if crate::runtime_manager::is_pid_alive(pid) => Some(pid),
    _ => {
      *guard = None;
      None
    }
  }
}

fn acc_state(app: &tauri::AppHandle) -> Value {
  let folder = saved_acc_folder(app);
  let problem = folder.as_deref().and_then(|f| validate_acc_folder(f).err());
  let pid = acc_running();
  serde_json::json!({
    "folder": folder.map(|f| f.display().to_string()),
    "folderProblem": problem,
    "startedByAlphonso": pid.is_some(),
    "pid": pid,
  })
}

/// Where ACC is on this computer (if chosen) and whether Alphonso started it.
#[tauri::command]
pub(crate) fn bridge_acc_state(app: tauri::AppHandle) -> Value {
  acc_state(&app)
}

/// Opens a folder dialog, checks the chosen folder is ACC, and saves it.
#[tauri::command]
pub(crate) async fn bridge_acc_choose_folder(app: tauri::AppHandle) -> Result<Value, String> {
  use tauri_plugin_dialog::DialogExt;
  let picked = app.dialog().file().blocking_pick_folder();
  let Some(picked) = picked else {
    return Ok(serde_json::json!({ "ok": false, "cancelled": true, "state": acc_state(&app) }));
  };
  let folder = std::path::PathBuf::from(picked.to_string());
  if let Err(error) = validate_acc_folder(&folder) {
    return Ok(serde_json::json!({ "ok": false, "error": error, "state": acc_state(&app) }));
  }
  let file = acc_folder_file(&app).ok_or("App settings folder unavailable")?;
  if let Some(parent) = file.parent() {
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
  }
  std::fs::write(
    &file,
    serde_json::json!({ "folder": folder.display().to_string() }).to_string(),
  )
  .map_err(|e| e.to_string())?;
  Ok(serde_json::json!({ "ok": true, "state": acc_state(&app) }))
}

/// Starts the ACC chosen with `bridge_acc_choose_folder`. Takes no path or
/// command from the window. Output goes to acc_bridge.log in the app folder.
#[tauri::command]
pub(crate) fn bridge_acc_start(app: tauri::AppHandle) -> Result<Value, String> {
  use tauri::Manager;
  if let Some(pid) = acc_running() {
    return Ok(serde_json::json!({ "ok": true, "alreadyRunning": true, "pid": pid }));
  }
  let folder = saved_acc_folder(&app).ok_or("Choose ACC's folder first.")?;
  let script = validate_acc_folder(&folder)?;
  let node = crate::runtime_manager::find_node()
    .ok_or("Node.js isn't installed, and ACC needs it. Install Node.js, then try again.")?;
  let log_path = app
    .path()
    .app_config_dir()
    .map_err(|e| e.to_string())?
    .join(ACC_LOG_FILE);
  if let Some(parent) = log_path.parent() {
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
  }
  let log = std::fs::File::create(&log_path).map_err(|e| e.to_string())?;
  let log_err = log.try_clone().map_err(|e| e.to_string())?;
  let mut cmd = std::process::Command::new(node);
  cmd
    .arg(&script)
    .current_dir(&folder)
    .stdin(std::process::Stdio::null())
    .stdout(log)
    .stderr(log_err);
  crate::utils::no_window(&mut cmd);
  let child = cmd
    .spawn()
    .map_err(|e| format!("ACC couldn't be started: {}", e))?;
  let pid = child.id();
  if let Ok(mut guard) = ACC_PID.lock() {
    *guard = Some(pid);
  }
  Ok(serde_json::json!({ "ok": true, "pid": pid, "log": log_path.display().to_string() }))
}

/// Stops the ACC that Alphonso started (the whole process tree). An ACC you
/// started yourself is never touched.
#[tauri::command]
pub(crate) fn bridge_acc_stop() -> Value {
  match acc_running() {
    Some(pid) => {
      crate::runtime_manager::kill_pid(pid);
      if let Ok(mut guard) = ACC_PID.lock() {
        *guard = None;
      }
      serde_json::json!({ "ok": true, "stopped": true })
    }
    None => serde_json::json!({ "ok": true, "stopped": false }),
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

  // QA Bug 64: values from Settings must be used, not only the environment.
  #[test]
  fn settings_values_are_used_and_normalized() {
    let settings = BridgeSettings::resolve(
      Some(" http://localhost:4000/ ".to_string()),
      Some(" abc ".to_string()),
      Some("api/alphonso-bridge".to_string()),
      Some(5000),
    );
    assert_eq!(
      settings,
      BridgeSettings {
        base_url: "http://localhost:4000".to_string(),
        token: "abc".to_string(),
        path_prefix: "/api/alphonso-bridge".to_string(),
        timeout_ms: 5000,
      }
    );
    assert!(settings.configured());
    assert_eq!(
      settings.url("/status"),
      "http://localhost:4000/api/alphonso-bridge/status"
    );
    assert_eq!(settings.missing(), None);
  }

  #[test]
  fn missing_values_are_named() {
    let no_token = BridgeSettings {
      base_url: "http://localhost:4000".to_string(),
      token: String::new(),
      path_prefix: DEFAULT_PATH_PREFIX.to_string(),
      timeout_ms: DEFAULT_TIMEOUT_MS,
    };
    assert!(!no_token.configured());
    assert!(no_token.missing().unwrap().contains("token"));
    assert_eq!(no_token.summary()["status"], "setup_required");
  }

  #[test]
  fn timeout_has_a_floor() {
    let settings = BridgeSettings::resolve(
      Some("http://x".to_string()),
      Some("t".to_string()),
      None,
      Some(10),
    );
    assert_eq!(settings.timeout_ms, 1000);
  }

  #[test]
  fn acc_start_script_must_be_plain_node_file() {
    assert_eq!(
      node_start_script("node scripts/start.js").unwrap(),
      "scripts/start.js"
    );
    for bad in [
      "npm run dev",
      "node scripts/start.js && calc",
      "node -e process.exit()",
      "node ../outside.js",
      "node C:/evil.js",
      "node a.js b.js",
      "node $(evil).js",
    ] {
      assert!(node_start_script(bad).is_err(), "should refuse {bad}");
    }
  }

  #[test]
  fn acc_folder_is_checked_before_use() {
    let dir = std::env::temp_dir().join(format!("alphonso-acc-test-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(dir.join("cloud/services")).unwrap();
    std::fs::create_dir_all(dir.join("scripts")).unwrap();
    assert!(validate_acc_folder(&dir)
      .unwrap_err()
      .contains("no package.json"));
    std::fs::write(
      dir.join("package.json"),
      r#"{"name":"something-else","scripts":{"start":"node scripts/start.js"}}"#,
    )
    .unwrap();
    assert!(validate_acc_folder(&dir).unwrap_err().contains("isn't ACC"));
    std::fs::write(
      dir.join("package.json"),
      r#"{"name":"agent-command-center","scripts":{"start":"node scripts/start.js"}}"#,
    )
    .unwrap();
    assert!(validate_acc_folder(&dir)
      .unwrap_err()
      .contains("bridge receiver"));
    std::fs::write(dir.join(ACC_RECEIVER_FILE), "").unwrap();
    assert!(validate_acc_folder(&dir).unwrap_err().contains("missing"));
    std::fs::write(dir.join("scripts/start.js"), "").unwrap();
    assert_eq!(validate_acc_folder(&dir).unwrap(), "scripts/start.js");
    let _ = std::fs::remove_dir_all(&dir);
  }
}
