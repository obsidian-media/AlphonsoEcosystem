use crate::utils;
use crate::{allowed_args, allowed_program, now_ms, ALPHONSO_RUNTIME_ENV_NAMES};
use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::time::UNIX_EPOCH;

#[derive(Serialize)]
pub(crate) struct CommandProof {
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
pub(crate) struct PathProof {
  pub(crate) path: String,
  pub(crate) exists: bool,
  pub(crate) is_file: bool,
  pub(crate) is_dir: bool,
  pub(crate) modified_at_ms: Option<u64>,
  pub(crate) trust: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RuntimeEnvValueProof {
  name: String,
  present: bool,
  value: Option<String>,
  checked_at_ms: u64,
  trust: String,
  error: Option<String>,
}

#[derive(Serialize)]
pub(crate) struct ProcessMatch {
  name: String,
  pid: Option<u32>,
}

#[derive(Serialize)]
pub(crate) struct ProcessProof {
  query: String,
  running: bool,
  matches: Vec<ProcessMatch>,
  trust: String,
}

/// Why the command policy refuses a command, or None when it may run. The one place both
/// `execute_command_verified` and `command_allowed` ask, so a preview never offers a command
/// that would be refused when it runs.
pub(crate) fn command_policy_refusal(program: &str, args: &[String]) -> Option<String> {
  if !allowed_program(program) {
    return Some("Program is not allowed by Alphonso supervised command policy.".to_string());
  }
  if !allowed_args(program, args) {
    return Some(format!(
      "Arguments are not permitted for program '{}' by Alphonso policy.",
      program
    ));
  }
  None
}

/// The name to start a program by: on Windows the package managers are `.cmd` files, which a
/// plain `npm` can't be started as (agent phase 6, live run: "program not found").
pub(crate) fn spawn_name(program: &str, windows: bool) -> String {
  if windows && matches!(program, "npm" | "npx" | "yarn" | "pnpm") {
    return format!("{program}.cmd");
  }
  program.to_string()
}

/// Read-only: whether a command would be allowed to run (agent phase 6). Runs nothing.
#[tauri::command]
pub(crate) fn command_allowed(program: String, args: Vec<String>) -> serde_json::Value {
  match command_policy_refusal(&program, &args) {
    Some(reason) => serde_json::json!({ "allowed": false, "reason": reason }),
    None => serde_json::json!({ "allowed": true }),
  }
}

#[tauri::command]
pub(crate) fn execute_command_verified(
  program: String,
  args: Vec<String>,
  cwd: Option<String>,
) -> Result<CommandProof, String> {
  let started = now_ms();

  if let Some(reason) = command_policy_refusal(&program, &args) {
    return Err(reason);
  }

  let mut command = Command::new(spawn_name(&program, cfg!(windows)));
  command.args(&args);
  utils::no_window(&mut command);

  if let Some(path) = &cwd {
    command.current_dir(path);
  }

  let output = command.output().map_err(|error| error.to_string())?;
  let finished = now_ms();

  let stdout = String::from_utf8_lossy(&output.stdout).to_string();
  let stderr = String::from_utf8_lossy(&output.stderr).to_string();

  let sanitize = |raw: String| -> String {
    // Redact secret-looking values using a line-by-line scan (no regex dep).
    // Patterns: KEY=value, "key": "value", Bearer <token>
    raw
      .lines()
      .map(|line| {
        let lower = line.to_ascii_lowercase();
        let is_sensitive = lower.contains("api_key")
          || lower.contains("api_secret")
          || lower.contains("access_token")
          || lower.contains("refresh_token")
          || lower.contains("client_secret")
          || lower.contains("password")
          || lower.contains("authorization: bearer")
          || lower.contains("bearer ");
        if is_sensitive {
          // Replace token-like values: anything after = or ": that is >8 chars
          let mut redacted = line.to_string();
          // Redact KEY=VALUE patterns
          if let Some(eq) = redacted.find('=') {
            let val = redacted[eq + 1..].trim();
            if val.len() > 8 {
              redacted = format!("{}=***REDACTED***", &redacted[..eq]);
            }
          // Redact JSON "key": "value" patterns
          } else if let Some(colon) = redacted.rfind(": ") {
            let val = redacted[colon + 2..]
              .trim()
              .trim_matches('"')
              .trim_matches(',');
            if val.len() > 8 {
              redacted = format!("{}***REDACTED***", &redacted[..colon + 2]);
            }
          }
          redacted
        } else {
          line.to_string()
        }
      })
      .collect::<Vec<_>>()
      .join("\n")
  };

  let success = output.status.success();

  Ok(CommandProof {
    program,
    args,
    cwd,
    started_at_ms: started,
    finished_at_ms: finished,
    success,
    exit_code: output.status.code(),
    stdout: sanitize(stdout),
    stderr: sanitize(stderr),
    trust: if success {
      "verified".to_string()
    } else {
      "failed".to_string()
    },
  })
}

#[tauri::command]
pub(crate) fn verify_paths(paths: Vec<String>) -> Vec<PathProof> {
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
pub(crate) fn read_runtime_env_value(name: String) -> Result<RuntimeEnvValueProof, String> {
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
pub(crate) fn check_processes(names: Vec<String>) -> Result<Vec<ProcessProof>, String> {
  #[cfg(target_os = "windows")]
  let tasklist_output = {
    let mut cmd = Command::new("tasklist");
    cmd.args(["/FO", "CSV", "/NH"]);
    utils::no_window(&mut cmd);
    let output = cmd.output().map_err(|error| error.to_string())?;

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

#[cfg(test)]
mod command_policy_tests {
  use super::*;

  fn v(items: &[&str]) -> Vec<String> {
    items.iter().map(|s| s.to_string()).collect()
  }

  #[test]
  fn command_allowed_reports_the_policy_without_running_anything() {
    assert_eq!(command_allowed("npm".into(), v(&["test"]))["allowed"], true);
    // `node hello.js` is allowed since Jose phase 7; inline code never is.
    let refused = command_allowed("node".into(), v(&["-e", "1"]));
    assert_eq!(refused["allowed"], false);
    assert_eq!(
      refused["reason"],
      "Arguments are not permitted for program 'node' by Alphonso policy."
    );
    let unknown = command_allowed("hello.js".into(), v(&[]));
    assert_eq!(unknown["allowed"], false);
    assert_eq!(
      unknown["reason"],
      "Program is not allowed by Alphonso supervised command policy."
    );
  }

  // Live run (2026-10-26): `npm test` failed with "program not found" on Windows.
  #[test]
  fn package_managers_start_as_their_cmd_files_on_windows() {
    assert_eq!(spawn_name("npm", true), "npm.cmd");
    assert_eq!(spawn_name("npx", true), "npx.cmd");
    assert_eq!(spawn_name("yarn", true), "yarn.cmd");
    assert_eq!(spawn_name("pnpm", true), "pnpm.cmd");
    assert_eq!(spawn_name("npm.cmd", true), "npm.cmd");
    assert_eq!(spawn_name("git", true), "git");
    assert_eq!(spawn_name("npm", false), "npm");
  }

  #[test]
  fn execute_refuses_with_the_same_reason() {
    let err = execute_command_verified("node".into(), v(&["hello.js"]), None).err();
    assert_eq!(
      err.as_deref(),
      command_policy_refusal("node", &v(&["hello.js"])).as_deref()
    );
  }
}
