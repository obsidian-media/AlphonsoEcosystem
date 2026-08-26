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

#[tauri::command]
pub(crate) fn execute_command_verified(
  program: String,
  args: Vec<String>,
  cwd: Option<String>,
) -> Result<CommandProof, String> {
  let started = now_ms();

  if !allowed_program(&program) {
    return Err("Program is not allowed by Alphonso supervised command policy.".to_string());
  }
  if !allowed_args(&program, &args) {
    return Err(format!(
      "Arguments are not permitted for program '{}' by Alphonso policy.",
      program
    ));
  }

  let mut command = Command::new(&program);
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
