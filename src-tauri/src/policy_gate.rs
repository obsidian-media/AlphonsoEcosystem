use std::collections::HashMap;

pub(crate) const ALPHONSO_RUNTIME_ENV_NAMES: &[&str] = &[
  "ALPHONSO_SELFDEV_AUTORUN",
  "ALPHONSO_SELFDEV_EXIT_ON_COMPLETE",
  "ALPHONSO_WORKSPACE_ROOT",
  "ALPHONSO_PROOF_OUTPUT_DIR",
];

pub(crate) fn allowed_program(program: &str) -> bool {
  matches!(
    program.to_ascii_lowercase().as_str(),
    // LLM runtime
    "ollama"
    // Version control
    | "git"
    // Node.js ecosystem
    | "node" | "npm" | "npm.cmd" | "npx" | "npx.cmd" | "node.exe" | "yarn" | "yarn.cmd" | "pnpm" | "pnpm.cmd"
    // Python ecosystem
    | "python" | "python3" | "python.exe" | "pythonw.exe" | "pip" | "pip3" | "pip.exe"
    // Rust ecosystem
    | "cargo" | "cargo.exe" | "rustc" | "rustc.exe" | "rustup" | "rustup.exe"
    // Network / web
    | "curl" | "curl.exe" | "wget" | "wget.exe"
    // Media / video
    | "ffmpeg" | "ffmpeg.exe" | "ffprobe" | "ffprobe.exe"
    // Container / deployment
    | "docker" | "docker.exe" | "docker-compose" | "docker-compose.exe"
    // Windows utilities
    | "explorer" | "explorer.exe" | "start" | "msedge" | "msedge.exe" | "chrome" | "chrome.exe"
    // macOS / Linux file & URL openers
    | "open" | "xdg-open"
  )
}

/// Validate that the arguments passed to a program are on its allowed argument prefix list.
/// Returns `true` if all args are permitted; `false` if any suspicious arg is found.
/// Programs not in the per-program list are allowed unrestricted (defense-in-depth — program
/// allowlist is the primary gate; this is a secondary argument-level guard for sensitive tools).
pub(crate) fn allowed_args(program: &str, args: &[String]) -> bool {
  let prog = program.to_ascii_lowercase();
  match prog.as_str() {
    "git" | "git.exe" => {
      // Allow non-destructive git subcommands: read-only inspection (status, log, diff,
      // show, ls-files, ls-tree, rev-parse, branch, tag, remote, describe, shortlog) plus
      // network sync commands that write to disk/working tree but do not discard local
      // history or force-overwrite state (fetch, pull, clone, stash). Excludes destructive
      // commands like push --force, reset --hard, and clean.
      let allowed = [
        "status",
        "log",
        "diff",
        "show",
        "ls-files",
        "ls-tree",
        "rev-parse",
        "branch",
        "tag",
        "fetch",
        "pull",
        "clone",
        "remote",
        "describe",
        "shortlog",
        "stash",
      ];
      args
        .first()
        .map(|first| allowed.contains(&first.to_ascii_lowercase().as_str()))
        .unwrap_or(true) // no args → allowed
    }
    "cargo" | "cargo.exe" => {
      let allowed = [
        "build", "check", "test", "clippy", "fmt", "run", "install", "update", "audit", "doc",
        "clean", "bench",
      ];
      args
        .first()
        .map(|first| allowed.contains(&first.to_ascii_lowercase().as_str()))
        .unwrap_or(true)
    }
    "docker" | "docker.exe" => {
      let allowed = [
        "build", "run", "ps", "images", "pull", "push", "stop", "start", "rm", "rmi", "logs",
        "inspect", "compose",
      ];
      args
        .first()
        .map(|first| allowed.contains(&first.to_ascii_lowercase().as_str()))
        .unwrap_or(true)
    }
    "npm" | "npm.cmd" => {
      let allowed = [
        "install", "ci", "run", "test", "audit", "build", "start", "lint", "pack", "publish",
        "outdated", "update",
      ];
      args
        .first()
        .map(|first| allowed.contains(&first.to_ascii_lowercase().as_str()))
        .unwrap_or(true)
    }
    // Programs without a per-program argument restriction pass through
    _ => true,
  }
}

#[tauri::command]
pub(crate) fn check_env_vars_presence(names: Vec<String>) -> HashMap<String, bool> {
  let mut result = HashMap::new();
  for name in names.into_iter().take(80) {
    let trimmed = name.trim().to_string();
    if trimmed.is_empty() {
      continue;
    }
    let present = std::env::var_os(&trimmed)
      .map(|value| !value.is_empty())
      .unwrap_or(false);
    result.insert(trimmed, present);
  }
  result
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn allowed_program_accepts_known_safe_programs() {
    assert!(allowed_program("ollama"), "ollama should be allowed");
    assert!(allowed_program("git"), "git should be allowed");
    assert!(allowed_program("node"), "node should be allowed");
    assert!(allowed_program("npm"), "npm should be allowed");
    assert!(allowed_program("npm.cmd"), "npm.cmd should be allowed");
    assert!(allowed_program("python"), "python should be allowed");
    assert!(allowed_program("python3"), "python3 should be allowed");
    assert!(allowed_program("pip"), "pip should be allowed");
    assert!(allowed_program("cargo"), "cargo should be allowed");
    assert!(allowed_program("npx"), "npx should be allowed");
    assert!(allowed_program("curl"), "curl should be allowed");
    assert!(allowed_program("ffmpeg"), "ffmpeg should be allowed");
    assert!(allowed_program("docker"), "docker should be allowed");
    assert!(allowed_program("explorer"), "explorer should be allowed");
  }

  #[test]
  fn allowed_program_rejects_dangerous_programs() {
    assert!(!allowed_program("cmd"), "cmd should not be allowed");
    assert!(!allowed_program("cmd.exe"), "cmd.exe should not be allowed");
    assert!(!allowed_program("pwsh"), "pwsh should not be allowed");
    assert!(
      !allowed_program("pwsh.exe"),
      "pwsh.exe should not be allowed"
    );
    assert!(
      !allowed_program("powershell"),
      "powershell should not be allowed"
    );
    assert!(
      !allowed_program("powershell.exe"),
      "powershell.exe should not be allowed"
    );
    assert!(
      !allowed_program("tasklist"),
      "tasklist should not be allowed"
    );
    assert!(!allowed_program("dir"), "dir should not be allowed");
    assert!(!allowed_program("del"), "del should not be allowed");
    assert!(!allowed_program("rm"), "rm should not be allowed");
    assert!(
      !allowed_program("shutdown"),
      "shutdown should not be allowed"
    );
    assert!(!allowed_program("format"), "format should not be allowed");
    assert!(!allowed_program("net"), "net should not be allowed");
    assert!(!allowed_program("reg"), "reg should not be allowed");
  }

  #[test]
  fn allowed_program_is_case_insensitive() {
    assert!(
      allowed_program("OLLAMA"),
      "OLLAMA (uppercase) should be allowed"
    );
    assert!(allowed_program("Git"), "Git (mixed case) should be allowed");
    assert!(
      !allowed_program("CMD"),
      "CMD (uppercase) should not be allowed"
    );
    assert!(
      allowed_program("Python"),
      "Python (mixed case) should be allowed"
    );
    assert!(
      allowed_program("CARGO"),
      "CARGO (uppercase) should be allowed"
    );
  }

  #[test]
  fn allowed_args_git_safe_subcommands() {
    let status_args = vec!["status".to_string()];
    let log_args = vec!["log".to_string(), "--oneline".to_string()];
    assert!(
      allowed_args("git", &status_args),
      "git status should be allowed"
    );
    assert!(allowed_args("git", &log_args), "git log should be allowed");
  }

  #[test]
  fn allowed_args_git_blocks_dangerous_subcommands() {
    let push_args = vec!["push".to_string(), "--force".to_string()];
    let reset_args = vec!["reset".to_string(), "--hard".to_string()];
    let clean_args = vec!["clean".to_string(), "-fd".to_string()];
    assert!(
      !allowed_args("git", &push_args),
      "git push should be blocked"
    );
    assert!(
      !allowed_args("git", &reset_args),
      "git reset should be blocked"
    );
    assert!(
      !allowed_args("git", &clean_args),
      "git clean should be blocked"
    );
  }

  #[test]
  fn allowed_args_cargo_safe_subcommands() {
    let build_args = vec!["build".to_string()];
    let test_args = vec!["test".to_string()];
    let check_args = vec!["check".to_string()];
    assert!(
      allowed_args("cargo", &build_args),
      "cargo build should be allowed"
    );
    assert!(
      allowed_args("cargo", &test_args),
      "cargo test should be allowed"
    );
    assert!(
      allowed_args("cargo", &check_args),
      "cargo check should be allowed"
    );
  }

  #[test]
  fn allowed_args_unrestricted_programs_pass_through() {
    let any_args = vec!["--some-flag".to_string(), "value".to_string()];
    assert!(
      allowed_args("ollama", &any_args),
      "ollama has no arg restriction"
    );
    assert!(
      allowed_args("python", &any_args),
      "python has no arg restriction"
    );
    assert!(
      allowed_args("ffmpeg", &any_args),
      "ffmpeg has no arg restriction"
    );
  }

  #[test]
  fn allowed_args_no_args_is_allowed() {
    assert!(
      allowed_args("git", &[]),
      "git with no args should be allowed"
    );
    assert!(
      allowed_args("cargo", &[]),
      "cargo with no args should be allowed"
    );
  }
}
