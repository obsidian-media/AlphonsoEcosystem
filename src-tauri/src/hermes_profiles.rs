//! Hermes gateway (2026-10-30): Hermes profiles Alphonso sets up, starts and
//! stops, one per agent. Design: docs/superpowers/specs/2026-10-30-hermes-gateway-design.md.
//!
//! A profile lives in `<runtimes>/hermes-profiles/<agent>/` (its `HERMES_HOME`)
//! and never in the user's own Hermes folder. It can use the reading toolsets
//! only; every action goes back to Alphonso's agents. Its API key is made here,
//! kept in the keychain (`hermes:<agent>:key`) and handed to the Hermes process
//! as an environment variable at start, so nothing secret is written to disk
//! and the key never reaches the window. Facts about Hermes 0.19.0 (setting
//! names, environment variables) were read from its own source.

use crate::runtime_manager::{hermes_python, is_pid_alive, kill_pid, runtimes_dir, RuntimeManager};
use crate::utils::no_window;
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::net::TcpListener;
use std::ops::RangeInclusive;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

/// Ports for Alphonso's Hermes profiles: clear of the port map in CLAUDE.md
/// and of Hermes's own default (8642), which the user's profiles use.
pub(crate) const HERMES_PORT_RANGE: RangeInclusive<u16> = 8700..=8749;

/// The only toolsets a profile Alphonso sets up may use: they read and remember.
pub(crate) const READING_TOOLSETS: &[&str] = &[
  "web",
  "vision",
  "memory",
  "session_search",
  "todo",
  "clarify",
];

/// How long Hermes waits for an approval answered on Alphonso's board.
pub(crate) const APPROVAL_TIMEOUT_SECS: u64 = 1800;

pub(crate) const HERMES_NOT_INSTALLED: &str = "Install Hermes Agent in Runtime Hub first.";
const NO_FREE_PORT: &str = "No free port for a Hermes profile.";
const BAD_AGENT: &str = "That is not an agent's name.";
const NO_PROFILE: &str = "This agent has no Hermes profile set up by Alphonso.";

/// The model a profile thinks with: the same one the agent uses in Alphonso.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum HermesModel {
  Ollama { endpoint: String, model: String },
  Openrouter { model: String },
}

/// The agent's own lines from agentPermissionTable.ts and Alphonso's ACTION line.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Persona {
  pub owns: String,
  pub never: String,
  pub action_line: String,
}

/// What is kept beside a profile (no secrets).
#[derive(Debug, Clone, Serialize, Deserialize)]
struct ProfileRecord {
  agent: String,
  port: u16,
  model: HermesModel,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileInfo {
  pub agent: String,
  pub port: u16,
  pub url: String,
  pub folder: String,
  pub running: bool,
}

/// What the window saves instead of a profile's key (`profileKeyRef()` in
/// hermesProfiles.ts). The backend swaps it for the key at the moment of a request.
const KEY_REF_PREFIX: &str = "alphonso-profile:";

/// The agent a `Bearer alphonso-profile:<agent>` header refers to, if any.
pub(crate) fn profile_ref_agent(header: &str) -> Option<&str> {
  let agent = header
    .strip_prefix("Bearer ")?
    .strip_prefix(KEY_REF_PREFIX)?;
  valid_agent(agent).then_some(agent)
}

/// True when `url` goes to this profile on this computer: the key is never
/// sent anywhere else.
pub(crate) fn url_is_profile(url: &str, port: u16) -> bool {
  let base = profile_url(port);
  url == base || url.starts_with(&format!("{base}/"))
}

/// The real Authorization header for a profile reference, read from the
/// keychain, or an error when `url` isn't that profile's own address.
pub(crate) fn resolve_profile_auth(header: &str, url: &str) -> Result<Option<String>, String> {
  let Some(agent) = profile_ref_agent(header) else {
    return Ok(None);
  };
  let record = read_record(agent).ok_or_else(|| NO_PROFILE.to_string())?;
  if !url_is_profile(url, record.port) {
    return Err("That address is not this agent's Hermes profile.".to_string());
  }
  let key = crate::os_keychain_store::secure_credential_get(key_name(agent))?
    .ok_or_else(|| NO_PROFILE.to_string())?;
  Ok(Some(format!("Bearer {key}")))
}

/// Agent ids only: lowercase letters, digits, `-` and `_`, 1 to 64 long.
pub(crate) fn valid_agent(agent: &str) -> bool {
  !agent.is_empty()
    && agent.len() <= 64
    && agent
      .chars()
      .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '_')
}

/// 32 random bytes, base64url without padding (43 characters).
pub(crate) fn new_key() -> String {
  let bytes: [u8; 32] = rand::random();
  base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

pub(crate) fn key_name(agent: &str) -> String {
  format!("hermes:{agent}:key")
}

fn profiles_root() -> PathBuf {
  runtimes_dir().join("hermes-profiles")
}

pub(crate) fn profile_dir(agent: &str) -> PathBuf {
  profiles_root().join(agent)
}

pub(crate) fn profile_url(port: u16) -> String {
  format!("http://127.0.0.1:{port}")
}

pub(crate) fn tool_name(agent: &str) -> String {
  format!("hermes:{agent}")
}

/// The profile's `config.yaml`, written as JSON (valid YAML): the model, the
/// reading toolsets for the API server, and approvals at Hermes's strictest
/// with every command denied as a backstop. No platform other than the API
/// server (switched on by its environment at start), no MCP servers, no cron.
pub(crate) fn profile_config(model: &HermesModel) -> serde_json::Value {
  let model_block = match model {
    HermesModel::Ollama { endpoint, model } => serde_json::json!({
      "default": model,
      "provider": "custom",
      "base_url": format!("{}/v1", endpoint.trim_end_matches('/')),
    }),
    HermesModel::Openrouter { model } => serde_json::json!({
      "default": model,
      "provider": "openrouter",
    }),
  };
  serde_json::json!({
    "model": model_block,
    "toolsets": READING_TOOLSETS,
    "platform_toolsets": { "api_server": READING_TOOLSETS },
    "approvals": {
      "mode": "manual",
      "timeout": APPROVAL_TIMEOUT_SECS,
      "cron_mode": "deny",
      "deny": ["*"],
    },
  })
}

/// The profile's `SOUL.md`: who the agent is and the hand-off rule.
pub(crate) fn profile_persona(agent: &str, persona: &Persona) -> String {
  format!(
    "You are {agent}, an agent in Alphonso.\n\n{owns}\n\n{never}\n\nYou can read, search and remember. You cannot change files, run code or send anything yourself. {action}\n",
    owns = persona.owns.trim(),
    never = persona.never.trim(),
    action = persona.action_line.trim(),
  )
}

/// The first port in `range` nothing on this computer is listening on,
/// skipping `taken` (ports other profiles have saved).
pub(crate) fn next_free_port(range: &RangeInclusive<u16>, taken: &[u16]) -> Option<u16> {
  range
    .clone()
    .filter(|p| !taken.contains(p))
    .find(|p| port_free(*p))
}

fn port_free(port: u16) -> bool {
  TcpListener::bind(("127.0.0.1", port)).is_ok()
}

/// How a profile is started: the venv's Python, Hermes's own CLI, no shell.
pub(crate) struct StartSpec {
  pub program: PathBuf,
  pub args: Vec<String>,
  pub env: Vec<(String, String)>,
}

pub(crate) fn start_command(
  python: &Path,
  folder: &Path,
  port: u16,
  key: &str,
  openrouter_key: Option<&str>,
) -> StartSpec {
  let mut env = vec![
    (
      "HERMES_HOME".to_string(),
      folder.to_string_lossy().to_string(),
    ),
    ("API_SERVER_ENABLED".to_string(), "true".to_string()),
    ("API_SERVER_HOST".to_string(), "127.0.0.1".to_string()),
    ("API_SERVER_PORT".to_string(), port.to_string()),
    ("API_SERVER_KEY".to_string(), key.to_string()),
  ];
  if let Some(k) = openrouter_key.filter(|k| !k.trim().is_empty()) {
    env.push(("OPENROUTER_API_KEY".to_string(), k.trim().to_string()));
  }
  StartSpec {
    program: python.to_path_buf(),
    args: ["-m", "hermes_cli.main", "gateway", "run"]
      .iter()
      .map(|s| s.to_string())
      .collect(),
    env,
  }
}

fn read_record(agent: &str) -> Option<ProfileRecord> {
  let text = std::fs::read_to_string(profile_dir(agent).join("profile.json")).ok()?;
  serde_json::from_str(&text).ok()
}

fn write_record(record: &ProfileRecord) -> Result<(), String> {
  let text = serde_json::to_string_pretty(record).map_err(|e| e.to_string())?;
  std::fs::write(profile_dir(&record.agent).join("profile.json"), text).map_err(|e| e.to_string())
}

fn write_config(agent: &str, model: &HermesModel) -> Result<(), String> {
  let text = serde_json::to_string_pretty(&profile_config(model)).map_err(|e| e.to_string())?;
  std::fs::write(profile_dir(agent).join("config.yaml"), text).map_err(|e| e.to_string())
}

fn saved_ports(except: &str) -> Vec<u16> {
  let Ok(entries) = std::fs::read_dir(profiles_root()) else {
    return Vec::new();
  };
  entries
    .flatten()
    .filter_map(|e| e.file_name().into_string().ok())
    .filter(|name| name != except && valid_agent(name))
    .filter_map(|name| read_record(&name).map(|r| r.port))
    .collect()
}

fn info(record: &ProfileRecord, state: &RuntimeManager) -> ProfileInfo {
  let running = state
    .spawned_pid(&tool_name(&record.agent))
    .is_some_and(is_pid_alive);
  ProfileInfo {
    agent: record.agent.clone(),
    port: record.port,
    url: profile_url(record.port),
    folder: profile_dir(&record.agent).to_string_lossy().to_string(),
    running,
  }
}

fn checked_agent(agent: &str) -> Result<(), String> {
  if valid_agent(agent) {
    Ok(())
  } else {
    Err(BAD_AGENT.to_string())
  }
}

/// Sets up (or sets up again, with a new key) the agent's Hermes profile.
#[tauri::command]
pub fn hermes_profile_setup(
  agent: String,
  model: HermesModel,
  persona: Persona,
  state: tauri::State<'_, RuntimeManager>,
) -> Result<ProfileInfo, String> {
  checked_agent(&agent)?;
  hermes_python().ok_or_else(|| HERMES_NOT_INSTALLED.to_string())?;
  let folder = profile_dir(&agent);
  std::fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
  let port = match read_record(&agent) {
    Some(r) if port_free(r.port) || state.spawned_pid(&tool_name(&agent)).is_some() => r.port,
    _ => next_free_port(&HERMES_PORT_RANGE, &saved_ports(&agent))
      .ok_or_else(|| NO_FREE_PORT.to_string())?,
  };
  write_config(&agent, &model)?;
  std::fs::write(folder.join("SOUL.md"), profile_persona(&agent, &persona))
    .map_err(|e| e.to_string())?;
  crate::os_keychain_store::secure_credential_set(key_name(&agent), new_key())?;
  let record = ProfileRecord { agent, port, model };
  write_record(&record)?;
  Ok(info(&record, &state))
}

#[tauri::command]
pub fn hermes_profile_set_model(agent: String, model: HermesModel) -> Result<(), String> {
  checked_agent(&agent)?;
  let mut record = read_record(&agent).ok_or_else(|| NO_PROFILE.to_string())?;
  write_config(&agent, &model)?;
  record.model = model;
  write_record(&record)
}

/// Starts the profile. A port taken since setup moves to the next free one.
/// `openrouterKey` is the user's saved OpenRouter key, for an OpenRouter model.
#[tauri::command]
pub fn hermes_profile_start(
  agent: String,
  openrouter_key: Option<String>,
  state: tauri::State<'_, RuntimeManager>,
) -> Result<ProfileInfo, String> {
  checked_agent(&agent)?;
  let python = hermes_python().ok_or_else(|| HERMES_NOT_INSTALLED.to_string())?;
  let mut record = read_record(&agent).ok_or_else(|| NO_PROFILE.to_string())?;
  let tool = tool_name(&agent);
  if state.spawned_pid(&tool).is_some_and(is_pid_alive) {
    return Ok(info(&record, &state));
  }
  if !port_free(record.port) {
    record.port = next_free_port(&HERMES_PORT_RANGE, &saved_ports(&agent))
      .ok_or_else(|| NO_FREE_PORT.to_string())?;
    write_record(&record)?;
  }
  let key = crate::os_keychain_store::secure_credential_get(key_name(&agent))?
    .ok_or_else(|| NO_PROFILE.to_string())?;
  let folder = profile_dir(&agent);
  let spec = start_command(
    &python,
    &folder,
    record.port,
    &key,
    openrouter_key.as_deref(),
  );
  let log = std::fs::File::create(folder.join("gateway.log")).map_err(|e| e.to_string())?;
  let log_err = log.try_clone().map_err(|e| e.to_string())?;
  let mut cmd = Command::new(&spec.program);
  cmd
    .args(&spec.args)
    .envs(spec.env.iter().map(|(k, v)| (k, v)))
    .current_dir(&folder)
    .stdin(Stdio::null())
    .stdout(log)
    .stderr(log_err);
  no_window(&mut cmd);
  let child = cmd
    .spawn()
    .map_err(|e| format!("Hermes didn't start: {e}"))?;
  state.record_pid(&tool, child.id());
  Ok(info(&record, &state))
}

#[tauri::command]
pub fn hermes_profile_stop(
  agent: String,
  state: tauri::State<'_, RuntimeManager>,
) -> Result<(), String> {
  checked_agent(&agent)?;
  let tool = tool_name(&agent);
  if let Some(pid) = state.spawned_pid(&tool) {
    kill_pid(pid);
    state.remove_pid(&tool);
  }
  Ok(())
}

/// Stops the profile, deletes its folder and its key.
#[tauri::command]
pub fn hermes_profile_remove(
  agent: String,
  state: tauri::State<'_, RuntimeManager>,
) -> Result<(), String> {
  hermes_profile_stop(agent.clone(), state)?;
  let folder = profile_dir(&agent);
  if folder.exists() {
    std::fs::remove_dir_all(&folder).map_err(|e| e.to_string())?;
  }
  crate::os_keychain_store::secure_credential_delete(key_name(&agent))
}

#[tauri::command]
pub fn hermes_profiles_list(state: tauri::State<'_, RuntimeManager>) -> Vec<ProfileInfo> {
  let Ok(entries) = std::fs::read_dir(profiles_root()) else {
    return Vec::new();
  };
  let mut list: Vec<ProfileInfo> = entries
    .flatten()
    .filter_map(|e| e.file_name().into_string().ok())
    .filter(|name| valid_agent(name))
    .filter_map(|name| read_record(&name))
    .map(|r| info(&r, &state))
    .collect();
  list.sort_by(|a, b| a.agent.cmp(&b.agent));
  list
}

// ── The user's own Hermes profiles (read only) ─────────────────────────

/// Settings files larger than this are not read.
const MAX_CONFIG_BYTES: u64 = 1_048_576;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ApiServerState {
  pub on: bool,
  pub port: Option<u16>,
}

/// What Alphonso reads from one of the user's own profiles: only these fields,
/// never a key. Settings switched on in the profile's `.env` are not read.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserProfile {
  pub name: String,
  pub folder: String,
  pub api_server: ApiServerState,
  pub platforms_on: Vec<String>,
  pub toolsets_on: Vec<String>,
  pub approvals_mode: Option<String>,
  pub readable: bool,
}

/// Hermes's own rule for its home folder: `HERMES_HOME` (a profile folder's
/// `profiles/<name>` points back at its root), else the platform default.
pub(crate) fn user_hermes_root(
  env_home: Option<String>,
  local_app_data: Option<String>,
  home: Option<String>,
  windows: bool,
) -> Option<PathBuf> {
  let clean = |v: Option<String>| v.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
  if let Some(h) = clean(env_home) {
    let path = PathBuf::from(h);
    if path
      .parent()
      .and_then(|p| p.file_name())
      .is_some_and(|n| n == "profiles")
    {
      return path
        .parent()
        .and_then(|p| p.parent())
        .map(Path::to_path_buf);
    }
    return Some(path);
  }
  let home = clean(home);
  if windows {
    let local = clean(local_app_data)
      .map(PathBuf::from)
      .or_else(|| home.map(|h| PathBuf::from(h).join("AppData").join("Local")))?;
    return Some(local.join("hermes"));
  }
  home.map(|h| PathBuf::from(h).join(".hermes"))
}

fn yaml_str_list(value: &yaml_rust2::Yaml) -> Option<Vec<String>> {
  value.as_vec().map(|items| {
    items
      .iter()
      .filter_map(|i| i.as_str().map(str::to_string))
      .collect()
  })
}

fn yaml_port(value: &yaml_rust2::Yaml) -> Option<u16> {
  value
    .as_i64()
    .and_then(|p| u16::try_from(p).ok())
    .or_else(|| value.as_str().and_then(|p| p.trim().parse().ok()))
}

fn read_user_profile(name: &str, folder: &Path) -> UserProfile {
  let mut profile = UserProfile {
    name: name.to_string(),
    folder: folder.to_string_lossy().to_string(),
    api_server: ApiServerState {
      on: false,
      port: None,
    },
    platforms_on: Vec::new(),
    toolsets_on: Vec::new(),
    approvals_mode: None,
    readable: false,
  };
  let path = folder.join("config.yaml");
  if !std::fs::metadata(&path).is_ok_and(|m| m.len() <= MAX_CONFIG_BYTES) {
    return profile;
  }
  let Ok(text) = std::fs::read_to_string(&path) else {
    return profile;
  };
  let Ok(docs) = yaml_rust2::YamlLoader::load_from_str(&text) else {
    return profile;
  };
  let empty = yaml_rust2::Yaml::Hash(Default::default());
  let doc = docs.first().unwrap_or(&empty);
  if doc.as_hash().is_none() && !doc.is_null() {
    return profile;
  }
  profile.readable = true;
  // Top-level `platforms` wins over `gateway.platforms`, as in Hermes.
  let mut platforms: Vec<(String, bool, Option<u16>)> = Vec::new();
  for source in [&doc["gateway"]["platforms"], &doc["platforms"]] {
    let Some(map) = source.as_hash() else {
      continue;
    };
    for (key, block) in map {
      let Some(name) = key.as_str() else { continue };
      let enabled = block["enabled"].as_bool();
      let port = yaml_port(&block["extra"]["port"]).or_else(|| yaml_port(&block["port"]));
      match platforms.iter_mut().find(|(n, _, _)| n == name) {
        Some(entry) => {
          if let Some(e) = enabled {
            entry.1 = e;
          }
          if port.is_some() {
            entry.2 = port;
          }
        }
        None => platforms.push((name.to_string(), enabled.unwrap_or(false), port)),
      }
    }
  }
  for (name, enabled, port) in platforms {
    if name == "api_server" {
      profile.api_server = ApiServerState { on: enabled, port };
    } else if enabled {
      profile.platforms_on.push(name);
    }
  }
  profile.toolsets_on = yaml_str_list(&doc["platform_toolsets"]["api_server"])
    .or_else(|| yaml_str_list(&doc["toolsets"]))
    .unwrap_or_default();
  profile.approvals_mode = doc["approvals"]["mode"].as_str().map(str::to_string);
  profile
}

/// The default profile (the root's own `config.yaml`) and every folder in
/// `profiles/`. Nothing is written.
pub(crate) fn find_user_profiles(root: &Path) -> Vec<UserProfile> {
  let mut found = Vec::new();
  if root.join("config.yaml").is_file() {
    found.push(read_user_profile("default", root));
  }
  if let Ok(entries) = std::fs::read_dir(root.join("profiles")) {
    let mut names: Vec<String> = entries
      .flatten()
      .filter(|e| e.path().is_dir())
      .filter_map(|e| e.file_name().into_string().ok())
      .collect();
    names.sort();
    for name in names {
      found.push(read_user_profile(&name, &root.join("profiles").join(&name)));
    }
  }
  found
}

fn user_root_now() -> Option<PathBuf> {
  let home_var = if cfg!(target_os = "windows") {
    "USERPROFILE"
  } else {
    "HOME"
  };
  user_hermes_root(
    std::env::var("HERMES_HOME").ok(),
    std::env::var("LOCALAPPDATA").ok(),
    std::env::var(home_var).ok(),
    cfg!(target_os = "windows"),
  )
}

#[tauri::command]
pub fn hermes_find_user_profiles() -> Vec<UserProfile> {
  user_root_now()
    .map(|r| find_user_profiles(&r))
    .unwrap_or_default()
}

pub(crate) const USER_HERMES_NOT_FOUND: &str = "Your Hermes install wasn't found.";
const USER_PROFILE_GONE: &str = "That Hermes profile is no longer there.";

/// A profile's folder from its name, inside the user's Hermes folder only:
/// "default" is the root, any other name one folder in `profiles/`.
pub(crate) fn user_profile_folder(root: &Path, name: &str) -> Option<PathBuf> {
  if name == "default" {
    return root
      .join("config.yaml")
      .is_file()
      .then(|| root.to_path_buf());
  }
  let plain = !name.is_empty()
    && name.len() <= 64
    && !name.starts_with('.')
    && name
      .chars()
      .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.');
  let folder = root.join("profiles").join(name);
  (plain && folder.is_dir()).then_some(folder)
}

/// The Python of the user's own Hermes, where Hermes's installer puts it
/// (`<hermes home>/hermes-agent/venv`).
pub(crate) fn user_hermes_python(root: &Path, windows: bool) -> Option<PathBuf> {
  let install = root.join("hermes-agent");
  ["venv", ".venv"]
    .iter()
    .map(|v| {
      if windows {
        install.join(v).join("Scripts").join("python.exe")
      } else {
        install.join(v).join("bin").join("python")
      }
    })
    .find(|p| p.is_file())
}

/// Starts one of the user's own profiles, connected to `agent`, with the
/// user's own Hermes and the profile's own settings (its API server, port and
/// key come from the profile, never from Alphonso). Recorded as the agent's
/// Hermes tool, so the resource manager can stop it after it sits idle.
#[tauri::command]
pub fn hermes_user_profile_start(
  agent: String,
  name: String,
  state: tauri::State<'_, RuntimeManager>,
) -> Result<(), String> {
  checked_agent(&agent)?;
  let tool = tool_name(&agent);
  if state.spawned_pid(&tool).is_some_and(is_pid_alive) {
    return Ok(());
  }
  let root = user_root_now().ok_or_else(|| USER_HERMES_NOT_FOUND.to_string())?;
  let folder = user_profile_folder(&root, &name).ok_or_else(|| USER_PROFILE_GONE.to_string())?;
  let python = user_hermes_python(&root, cfg!(target_os = "windows"))
    .ok_or_else(|| USER_HERMES_NOT_FOUND.to_string())?;
  let logs = runtimes_dir().join("hermes-logs");
  std::fs::create_dir_all(&logs).map_err(|e| e.to_string())?;
  let log = std::fs::File::create(logs.join(format!("{agent}.log"))).map_err(|e| e.to_string())?;
  let log_err = log.try_clone().map_err(|e| e.to_string())?;
  let mut cmd = Command::new(&python);
  cmd
    .args(["-m", "hermes_cli.main", "gateway", "run"])
    .env("HERMES_HOME", &folder)
    .current_dir(&folder)
    .stdin(Stdio::null())
    .stdout(log)
    .stderr(log_err);
  no_window(&mut cmd);
  let child = cmd
    .spawn()
    .map_err(|e| format!("Hermes didn't start: {e}"))?;
  state.record_pid(&tool, child.id());
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;

  fn ollama() -> HermesModel {
    HermesModel::Ollama {
      endpoint: "http://127.0.0.1:11434/".into(),
      model: "qwen2.5:7b".into(),
    }
  }

  #[test]
  fn keys_differ_and_are_43_chars() {
    let a = new_key();
    let b = new_key();
    assert_ne!(a, b);
    for k in [&a, &b] {
      assert_eq!(k.len(), 43);
      assert!(k
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'));
    }
  }

  #[test]
  fn agent_name_checked() {
    assert!(valid_agent("hector"));
    assert!(valid_agent("agent_2"));
    for bad in ["../x", "Hector", "", "a b", "x\\y"] {
      assert!(!valid_agent(bad), "{bad}");
    }
    assert!(!valid_agent(&"a".repeat(65)));
  }

  #[test]
  fn config_has_only_reading() {
    let config = profile_config(&ollama());
    let reading: Vec<serde_json::Value> = READING_TOOLSETS.iter().map(|s| (*s).into()).collect();
    assert_eq!(
      config["platform_toolsets"]["api_server"],
      serde_json::json!(reading)
    );
    assert_eq!(config["toolsets"], serde_json::json!(reading));
    assert_eq!(config["approvals"]["mode"], "manual");
    assert_eq!(config["approvals"]["deny"], serde_json::json!(["*"]));
    assert_eq!(config["approvals"]["timeout"], 1800);
    assert_eq!(config["approvals"]["cron_mode"], "deny");
    let keys: Vec<&String> = config.as_object().unwrap().keys().collect();
    for absent in ["platforms", "mcp_servers", "cron"] {
      assert!(!keys.iter().any(|k| k.as_str() == absent), "{absent}");
    }
    assert_eq!(config["model"]["provider"], "custom");
    assert_eq!(config["model"]["base_url"], "http://127.0.0.1:11434/v1");
    assert_eq!(config["model"]["default"], "qwen2.5:7b");
    let or = profile_config(&HermesModel::Openrouter {
      model: "openrouter/free".into(),
    });
    assert_eq!(or["model"]["provider"], "openrouter");
  }

  #[test]
  fn key_only_in_the_start_environment() {
    let key = new_key();
    let config = serde_json::to_string(&profile_config(&ollama())).unwrap();
    assert!(!config.contains(&key));
    let spec = start_command(
      Path::new("/venv/python"),
      Path::new("/profiles/hector"),
      8701,
      &key,
      Some("sk-or-test"),
    );
    let env: std::collections::HashMap<_, _> = spec.env.iter().cloned().collect();
    assert_eq!(env["API_SERVER_KEY"], key);
    assert_eq!(env["API_SERVER_PORT"], "8701");
    assert_eq!(env["API_SERVER_HOST"], "127.0.0.1");
    assert_eq!(env["OPENROUTER_API_KEY"], "sk-or-test");
  }

  #[test]
  fn persona_has_handoff() {
    let persona = Persona {
      owns: "Hector owns finding facts.".into(),
      never: "Hector never sends.".into(),
      action_line: "End with ACTION: send … to hand it over.".into(),
    };
    let text = profile_persona("hector", &persona);
    for part in [&persona.owns, &persona.never, &persona.action_line] {
      assert!(text.contains(part.as_str()));
    }
  }

  #[test]
  fn next_free_port_skips_taken() {
    let start = *HERMES_PORT_RANGE.start();
    let held = TcpListener::bind(("127.0.0.1", start));
    let saved = [start + 1];
    let port = next_free_port(&HERMES_PORT_RANGE, &saved).unwrap();
    assert!(HERMES_PORT_RANGE.contains(&port));
    assert_ne!(port, start + 1);
    if held.is_ok() {
      assert_ne!(port, start);
    }
  }

  #[test]
  fn start_command_has_no_shell() {
    let spec = start_command(
      Path::new("/venv/python"),
      Path::new("/profiles/hector"),
      8701,
      "k",
      None,
    );
    assert_eq!(spec.program, PathBuf::from("/venv/python"));
    assert_eq!(spec.args, ["-m", "hermes_cli.main", "gateway", "run"]);
    let env: std::collections::HashMap<_, _> = spec.env.iter().cloned().collect();
    assert_eq!(
      env["HERMES_HOME"],
      PathBuf::from("/profiles/hector").to_string_lossy()
    );
    assert!(!env.contains_key("OPENROUTER_API_KEY"));
  }

  #[test]
  fn key_reference_names_the_agent() {
    assert_eq!(
      profile_ref_agent("Bearer alphonso-profile:hector"),
      Some("hector")
    );
    assert_eq!(profile_ref_agent("Bearer alphonso-profile:../x"), None);
    assert_eq!(profile_ref_agent("Bearer sk-real-key"), None);
    assert_eq!(profile_ref_agent("alphonso-profile:hector"), None);
  }

  #[test]
  fn key_only_for_the_profile_address() {
    assert!(url_is_profile("http://127.0.0.1:8700/v1/runs", 8700));
    assert!(url_is_profile("http://127.0.0.1:8700", 8700));
    assert!(!url_is_profile("http://127.0.0.1:87001/v1", 8700));
    assert!(!url_is_profile("http://127.0.0.1:8701/v1", 8700));
    assert!(!url_is_profile(
      "https://evil.example/?u=http://127.0.0.1:8700/",
      8700
    ));
    assert!(!url_is_profile("http://127.0.0.1:8700@evil.example/", 8700));
  }

  fn temp_root(tag: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("alphonso-hermes-{tag}-{}", new_key()));
    std::fs::create_dir_all(&dir).unwrap();
    dir
  }

  #[test]
  fn finds_profiles_read_only() {
    let root = temp_root("find");
    let a = root.join("profiles").join("a");
    let b = root.join("profiles").join("b");
    std::fs::create_dir_all(&a).unwrap();
    std::fs::create_dir_all(&b).unwrap();
    std::fs::write(
      a.join("config.yaml"),
      "platforms:
  api_server:
    enabled: true
    extra:
      port: 9100
  telegram:
    enabled: true
  discord:
    enabled: false
platform_toolsets:
  api_server: [web, terminal]
approvals:
  mode: smart
",
    )
    .unwrap();
    std::fs::write(
      b.join("config.yaml"),
      "platforms: [unclosed
  : :",
    )
    .unwrap();
    std::fs::write(
      root.join("config.yaml"),
      "toolsets: [web]
",
    )
    .unwrap();
    let before = std::fs::metadata(a.join("config.yaml"))
      .unwrap()
      .modified()
      .unwrap();
    let found = find_user_profiles(&root);
    let names: Vec<&str> = found.iter().map(|p| p.name.as_str()).collect();
    assert_eq!(names, ["default", "a", "b"]);
    let pa = &found[1];
    assert!(pa.readable);
    assert!(pa.api_server.on);
    assert_eq!(pa.api_server.port, Some(9100));
    assert_eq!(pa.platforms_on, ["telegram"]);
    assert_eq!(pa.toolsets_on, ["web", "terminal"]);
    assert_eq!(pa.approvals_mode.as_deref(), Some("smart"));
    assert!(!found[2].readable);
    assert!(found[0].readable);
    assert_eq!(found[0].toolsets_on, ["web"]);
    let after = std::fs::metadata(a.join("config.yaml"))
      .unwrap()
      .modified()
      .unwrap();
    assert_eq!(before, after);
    let _ = std::fs::remove_dir_all(&root);
  }

  #[test]
  fn home_from_env_else_default() {
    let set = user_hermes_root(Some("D:/h/profiles/x".into()), None, None, true);
    assert_eq!(set, Some(PathBuf::from("D:/h")));
    let plain = user_hermes_root(Some("D:/myhermes".into()), None, None, true);
    assert_eq!(plain, Some(PathBuf::from("D:/myhermes")));
    let win = user_hermes_root(None, Some("C:/Users/u/AppData/Local".into()), None, true);
    assert_eq!(
      win,
      Some(PathBuf::from("C:/Users/u/AppData/Local").join("hermes"))
    );
    let unix = user_hermes_root(None, None, Some("/home/u".into()), false);
    assert_eq!(unix, Some(PathBuf::from("/home/u").join(".hermes")));
    assert_eq!(user_hermes_root(None, None, None, false), None);
  }

  #[test]
  fn port_range_clear_of_known_ports() {
    for known in [8085u16, 8086, 8087, 8088, 8188, 8642, 8765, 8766, 11434] {
      assert!(!HERMES_PORT_RANGE.contains(&known), "{known}");
    }
  }

  #[test]
  fn user_profile_folder_stays_inside_the_hermes_folder() {
    let root = std::env::temp_dir().join(format!("alphonso-hermes-user-{}", std::process::id()));
    std::fs::create_dir_all(root.join("profiles").join("work")).unwrap();
    std::fs::write(root.join("config.yaml"), "model: {}\n").unwrap();
    assert_eq!(user_profile_folder(&root, "default"), Some(root.clone()));
    assert_eq!(
      user_profile_folder(&root, "work"),
      Some(root.join("profiles").join("work"))
    );
    for bad in ["../work", "..", "", "a/b", "a\\b", ".hidden", "missing"] {
      assert_eq!(user_profile_folder(&root, bad), None, "{bad}");
    }
    let _ = std::fs::remove_dir_all(&root);
  }

  #[test]
  fn user_hermes_python_is_the_installers_venv() {
    let root = std::env::temp_dir().join(format!("alphonso-hermes-py-{}", std::process::id()));
    assert_eq!(user_hermes_python(&root, true), None);
    let exe = root.join("hermes-agent").join("venv").join("Scripts");
    std::fs::create_dir_all(&exe).unwrap();
    std::fs::write(exe.join("python.exe"), "").unwrap();
    assert_eq!(
      user_hermes_python(&root, true),
      Some(exe.join("python.exe"))
    );
    assert_eq!(user_hermes_python(&root, false), None);
    let _ = std::fs::remove_dir_all(&root);
  }
}
