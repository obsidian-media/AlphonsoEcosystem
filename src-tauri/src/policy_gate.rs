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
    "ollama" | "where" | "where.exe" | "tasklist" | "git" | "node" | "npm" | "npm.cmd"
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
    assert!(allowed_program("tasklist"), "tasklist should be allowed");
  }

  #[test]
  fn allowed_program_rejects_dangerous_programs() {
    assert!(!allowed_program("cmd"), "cmd should not be allowed");
    assert!(!allowed_program("cmd.exe"), "cmd.exe should not be allowed");
    assert!(!allowed_program("powershell"), "powershell should not be allowed");
    assert!(!allowed_program("bash"), "bash should not be allowed");
    assert!(!allowed_program("sh"), "sh should not be allowed");
    assert!(!allowed_program("rm"), "rm should not be allowed");
  }

  #[test]
  fn allowed_program_is_case_insensitive() {
    assert!(allowed_program("OLLAMA"), "OLLAMA (uppercase) should be allowed");
    assert!(allowed_program("Git"), "Git (mixed case) should be allowed");
    assert!(!allowed_program("CMD"), "CMD (uppercase) should not be allowed");
  }
}
