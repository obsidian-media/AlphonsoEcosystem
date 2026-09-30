use std::collections::HashMap;

pub(crate) const ALPHONSO_RUNTIME_ENV_NAMES: &[&str] = &[
  "ALPHONSO_SELFDEV_AUTORUN",
  "ALPHONSO_SELFDEV_EXIT_ON_COMPLETE",
  "ALPHONSO_WORKSPACE_ROOT",
  "ALPHONSO_PROOF_OUTPUT_DIR",
  "USERPROFILE",
];

pub(crate) fn allowed_program(program: &str) -> bool {
  // Pre-launch audit (2026-09-30, H-2): trimmed to programs something in the
  // app actually runs. Network fetchers (curl/wget), docker, rustup, and
  // shell/URL openers were removed -- nothing invoked them through this path,
  // and each one turned "allowed program" into "arbitrary action".
  matches!(
    program.to_ascii_lowercase().as_str(),
    // LLM runtime
    "ollama" | "ollama.exe"
    // Version control
    | "git" | "git.exe"
    // Node.js ecosystem
    | "node" | "node.exe" | "npm" | "npm.cmd" | "npx" | "npx.cmd" | "yarn" | "yarn.cmd" | "pnpm" | "pnpm.cmd"
    // Python ecosystem
    | "python" | "python3" | "python.exe" | "pythonw.exe" | "pip" | "pip3" | "pip.exe"
    // Rust ecosystem
    | "cargo" | "cargo.exe" | "rustc" | "rustc.exe"
    // Media (plugins)
    | "ffmpeg" | "ffmpeg.exe" | "ffprobe" | "ffprobe.exe"
  )
}

fn first_is(args: &[String], allowed: &[&str]) -> bool {
  args
    .first()
    .map(|first| allowed.contains(&first.to_ascii_lowercase().as_str()))
    .unwrap_or(false)
}

fn is_version(args: &[String]) -> bool {
  args.len() == 1 && matches!(args[0].as_str(), "--version" | "-v" | "-V" | "version")
}

/// Git flags that turn an otherwise-harmless subcommand into command
/// execution or an arbitrary file write (`--upload-pack=<cmd>`,
/// `clone -u <cmd>`, `--output=<file>`, `-c core.sshCommand=...`, `ext::`).
fn git_arg_is_dangerous(arg: &str) -> bool {
  let lower = arg.to_ascii_lowercase();
  lower.contains("ext::")
    || lower.starts_with("--upload-pack")
    || lower.starts_with("--receive-pack")
    || lower.starts_with("--exec")
    || lower.starts_with("--output")
    || lower.starts_with("--config")
    || lower.starts_with("--template")
    || lower.starts_with("--ext-diff")
    || lower == "-c"
    || lower == "-u"
}

fn pip_args_allowed(args: &[String]) -> bool {
  first_is(args, &["install", "list", "show", "freeze", "--version"])
    && !args.iter().any(|a| {
      let lower = a.to_ascii_lowercase();
      lower.starts_with("--index-url")
        || lower.starts_with("--extra-index-url")
        || lower == "-i"
        || lower.starts_with("--trusted-host")
    })
}

/// Validate a program's arguments against its allowlist. Every allowed program
/// has an explicit rule; anything else is refused (fail closed). Interpreters
/// are the critical case: `node -e`, `python -c`, and `npx <anything>` are
/// arbitrary code execution -- and LLM-planned commands reach this function --
/// so only the specific non-evaluating forms the app uses are permitted
/// (pre-launch audit H-2).
pub(crate) fn allowed_args(program: &str, args: &[String]) -> bool {
  let prog = program.to_ascii_lowercase();
  if args.is_empty() {
    // Bare invocations print usage; harmless except for the interpreters,
    // which would open a REPL waiting on stdin.
    return !matches!(
      prog.as_str(),
      "node" | "node.exe" | "python" | "python3" | "python.exe" | "pythonw.exe"
    );
  }
  match prog.as_str() {
    "git" | "git.exe" => {
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
        "add",
        "commit",
        "revert",
        "--version",
      ];
      first_is(args, &allowed) && !args.iter().any(|a| git_arg_is_dangerous(a))
    }
    "node" | "node.exe" => {
      // Only version checks and syntax checks (`node --check <file>`).
      is_version(args)
        || (args.len() == 2
          && matches!(args[0].as_str(), "--check" | "-c")
          && !args[1].starts_with('-'))
    }
    "python" | "python3" | "python.exe" | "pythonw.exe" => {
      if is_version(args) {
        return true;
      }
      if args.len() < 2 || args[0] != "-m" {
        return false;
      }
      match args[1].to_ascii_lowercase().as_str() {
        "py_compile" | "compileall" | "pytest" | "venv" => true,
        "pip" => pip_args_allowed(&args[2..]),
        _ => false,
      }
    }
    "pip" | "pip3" | "pip.exe" => pip_args_allowed(args),
    "npm" | "npm.cmd" | "yarn" | "yarn.cmd" | "pnpm" | "pnpm.cmd" => {
      // `publish` removed: an agent must never publish a package.
      let allowed = [
        "install",
        "ci",
        "run",
        "test",
        "audit",
        "build",
        "start",
        "lint",
        "pack",
        "outdated",
        "update",
        "add",
        "--version",
        "-v",
      ];
      first_is(args, &allowed)
    }
    "npx" | "npx.cmd" => {
      // Only well-known local project binaries; never an arbitrary package.
      first_is(args, &["tsc", "eslint", "vitest", "prettier", "vite"])
        && !args.iter().any(|a| a.starts_with("--package") || a == "-p")
    }
    "cargo" | "cargo.exe" => {
      let allowed = [
        "build",
        "check",
        "test",
        "clippy",
        "fmt",
        "run",
        "update",
        "audit",
        "doc",
        "clean",
        "bench",
        "--version",
      ];
      first_is(args, &allowed)
    }
    "rustc" | "rustc.exe" => is_version(args),
    "ollama" | "ollama.exe" => first_is(
      args,
      &["list", "ps", "show", "pull", "run", "--version", "-v"],
    ),
    "ffmpeg" | "ffmpeg.exe" | "ffprobe" | "ffprobe.exe" => true,
    _ => false,
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
    for program in [
      "ollama", "git", "node", "npm", "npm.cmd", "python", "python3", "pip", "cargo", "npx",
      "ffmpeg",
    ] {
      assert!(allowed_program(program), "{program} should be allowed");
    }
  }

  #[test]
  fn allowed_program_rejects_removed_programs() {
    for program in [
      "curl",
      "wget",
      "docker",
      "explorer",
      "start",
      "open",
      "xdg-open",
      "chrome.exe",
      "rustup",
    ] {
      assert!(
        !allowed_program(program),
        "{program} should no longer be allowed"
      );
    }
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

  fn v(items: &[&str]) -> Vec<String> {
    items.iter().map(|s| s.to_string()).collect()
  }

  #[test]
  fn interpreters_cannot_evaluate_inline_code() {
    assert!(!allowed_args(
      "node",
      &v(&["-e", "require('child_process')"])
    ));
    assert!(!allowed_args("node", &v(&["--eval", "1"])));
    assert!(!allowed_args("node", &v(&["-p", "1"])));
    assert!(!allowed_args("node", &v(&["script.js"])));
    assert!(!allowed_args("python", &v(&["-c", "import os"])));
    assert!(!allowed_args("python", &v(&["-m", "http.server"])));
    assert!(!allowed_args("python", &v(&["evil.py"])));
    assert!(!allowed_args("npx", &v(&["some-random-package"])));
    assert!(!allowed_args("npx", &v(&["tsc", "--package", "evil"])));
  }

  #[test]
  fn interpreters_allow_the_forms_the_app_uses() {
    assert!(allowed_args("node", &v(&["--check", "src/index.js"])));
    assert!(allowed_args("node", &v(&["-c", "src/index.js"])));
    assert!(allowed_args("node", &v(&["--version"])));
    assert!(allowed_args("python", &v(&["-m", "py_compile", "main.py"])));
    assert!(allowed_args(
      "python",
      &v(&["-m", "pip", "install", "requests"])
    ));
    assert!(allowed_args("npx", &v(&["tsc", "--noEmit"])));
  }

  #[test]
  fn git_blocks_exec_and_write_flags() {
    assert!(!allowed_args(
      "git",
      &v(&["clone", "--upload-pack=touch /tmp/x", "repo"])
    ));
    assert!(!allowed_args("git", &v(&["clone", "-u", "sh", "repo"])));
    assert!(!allowed_args("git", &v(&["clone", "ext::sh -c id", "x"])));
    assert!(!allowed_args("git", &v(&["log", "--output=/etc/passwd"])));
    assert!(!allowed_args(
      "git",
      &v(&["-c", "core.sshCommand=sh", "fetch"])
    ));
    assert!(allowed_args(
      "git",
      &v(&["commit", "-m", "Alphonso: update"])
    ));
    assert!(allowed_args("git", &v(&["add", "-A"])));
    assert!(allowed_args("git", &v(&["revert", "HEAD", "--no-edit"])));
  }

  #[test]
  fn npm_cannot_publish_and_pip_cannot_switch_index() {
    assert!(!allowed_args("npm", &v(&["publish"])));
    assert!(!allowed_args("npm", &v(&["exec", "x"])));
    assert!(!allowed_args(
      "pip",
      &v(&["install", "--index-url", "https://evil", "x"])
    ));
    assert!(allowed_args("npm", &v(&["run", "build"])));
  }

  #[test]
  fn unknown_programs_fail_closed() {
    assert!(!allowed_args("curl", &v(&["https://example.com"])));
    assert!(!allowed_args("bash", &v(&["-c", "id"])));
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
    assert!(
      !allowed_args("node", &[]),
      "bare node opens a REPL and is refused"
    );
  }
}
