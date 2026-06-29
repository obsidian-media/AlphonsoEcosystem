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
  )
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
    assert!(!allowed_program("pwsh.exe"), "pwsh.exe should not be allowed");
    assert!(!allowed_program("powershell"), "powershell should not be allowed");
    assert!(!allowed_program("powershell.exe"), "powershell.exe should not be allowed");
    assert!(!allowed_program("tasklist"), "tasklist should not be allowed");
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
}
