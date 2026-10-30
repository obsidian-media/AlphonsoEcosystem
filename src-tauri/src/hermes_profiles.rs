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
  fn port_range_clear_of_known_ports() {
    for known in [8085u16, 8086, 8087, 8088, 8188, 8642, 8765, 8766, 11434] {
      assert!(!HERMES_PORT_RANGE.contains(&known), "{known}");
    }
  }
}
