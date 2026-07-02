use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::AppHandle;

use crate::app_data_subdir;
use crate::audit_log::append_plugin_audit_event;
use crate::now_ms;
use crate::policy_gate::allowed_program;

#[derive(Deserialize)]
pub(crate) struct PluginManifestDisk {
  id: String,
  name: Option<String>,
  version: Option<String>,
  permissions: Option<Vec<String>>,
  enabled_by_default: Option<bool>,
  manifest_version: Option<String>,
  tools: Option<Vec<PluginToolDisk>>,
  // Per-plugin program allowlist. When present, execute_plugin_tool rejects any
  // tool.program not explicitly declared here, on top of the shared system-wide
  // allowed_program() check. Optional for backward compatibility with existing
  // manifests — when absent, only the shared allowlist applies (unchanged
  // behavior). See validate_plugin_manifest_disk, which warns when this is
  // missing so plugin authors are nudged toward declaring it.
  declared_programs: Option<Vec<String>>,
}

#[derive(Deserialize, Clone)]
pub(crate) struct PluginToolDisk {
  id: String,
  program: String,
  args: Option<Vec<String>>,
  cwd: Option<String>,
  permissions: Option<Vec<String>>,
}

#[derive(Serialize, Clone)]
pub(crate) struct PluginToolDescriptor {
  id: String,
  program: String,
  args: Vec<String>,
  cwd: Option<String>,
  permissions: Vec<String>,
}

#[derive(Serialize)]
pub(crate) struct PluginManifestProof {
  id: String,
  name: String,
  version: String,
  permissions: Vec<String>,
  enabled_by_default: bool,
  manifest_version: String,
  manifest_path: String,
  tools: Vec<PluginToolDescriptor>,
  trust: String,
  error: Option<String>,
}

#[derive(Serialize)]
pub(crate) struct PluginManifestValidationProof {
  manifest_path: String,
  valid: bool,
  errors: Vec<String>,
  warnings: Vec<String>,
  trust: String,
}

#[derive(Serialize)]
pub(crate) struct PluginToolExecutionProof {
  plugin_id: String,
  tool_id: String,
  manifest_path: String,
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
  error: Option<String>,
}

fn plugin_blocked_token_present(value: &str) -> Option<&'static str> {
  const BLOCKED: [&str; 8] = ["&&", "||", ";", "|", ">", "<", "$(", "`"];
  BLOCKED
    .into_iter()
    .find(|&token| value.contains(token))
    .map(|v| v as _)
}

/// Per-plugin program allowlist check. When a manifest declares
/// `declared_programs`, a tool's program must be a member (case-insensitive) of
/// that list — this is enforced IN ADDITION TO the shared system-wide
/// `allowed_program()` check, not instead of it. When the manifest omits
/// `declared_programs` entirely (the field is `None`), this returns `true` for
/// backward compatibility with manifests written before this restriction
/// existed — those manifests still get the shared allowlist check.
fn program_allowed_by_manifest(declared_programs: Option<&Vec<String>>, program: &str) -> bool {
  match declared_programs {
    None => true,
    Some(declared) => {
      let program_lower = program.to_ascii_lowercase();
      declared
        .iter()
        .any(|entry| entry.to_ascii_lowercase() == program_lower)
    }
  }
}

pub(crate) fn validate_plugin_extra_args(extra_args: &[String]) -> Result<(), String> {
  const MAX_EXTRA_ARGS: usize = 8;
  const MAX_ARG_LEN: usize = 120;

  if extra_args.len() > MAX_EXTRA_ARGS {
    return Err(format!(
      "Plugin extra args exceed supervised limit ({MAX_EXTRA_ARGS})."
    ));
  }

  for arg in extra_args {
    if arg.len() > MAX_ARG_LEN {
      return Err(format!(
        "Plugin arg exceeds supervised length limit ({MAX_ARG_LEN})."
      ));
    }
    if let Some(token) = plugin_blocked_token_present(arg) {
      return Err(format!(
        "Plugin arg contains blocked token under supervised policy: {token}"
      ));
    }
  }

  Ok(())
}

#[tauri::command]
pub(crate) fn discover_plugins_from_disk(
  app: AppHandle,
  workspace_root: Option<String>,
) -> Result<Vec<PluginManifestProof>, String> {
  let mut search_roots: Vec<PathBuf> = vec![];

  if let Some(root) = workspace_root {
    let root = PathBuf::from(root);
    search_roots.push(root.join("plugins"));
    search_roots.push(root.join("alphonso-plugins"));
    search_roots.push(root);
  }

  let app_plugins_dir = app_data_subdir(&app, "plugins")?;
  search_roots.push(app_plugins_dir);

  let mut manifest_paths: Vec<PathBuf> = vec![];
  for root in search_roots {
    if !root.exists() || !root.is_dir() {
      continue;
    }

    if let Ok(entries) = fs::read_dir(&root) {
      for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() && path.file_name().and_then(|name| name.to_str()) == Some("plugin.json")
        {
          manifest_paths.push(path.clone());
        }
        if path.is_dir() {
          let direct_manifest = path.join("plugin.json");
          if direct_manifest.exists() {
            manifest_paths.push(direct_manifest);
          }
          let codex_manifest = path.join(".codex-plugin").join("plugin.json");
          if codex_manifest.exists() {
            manifest_paths.push(codex_manifest);
          }
        }
      }
    }
  }

  manifest_paths.sort();
  manifest_paths.dedup();

  let mut discovered: Vec<PluginManifestProof> = vec![];
  for manifest_path in manifest_paths {
    let encoded = fs::read_to_string(&manifest_path).map_err(|error| error.to_string())?;
    match serde_json::from_str::<PluginManifestDisk>(&encoded) {
      Ok(parsed) => {
        let tools = parsed
          .tools
          .unwrap_or_default()
          .into_iter()
          .map(|tool| PluginToolDescriptor {
            id: tool.id,
            program: tool.program,
            args: tool.args.unwrap_or_default(),
            cwd: tool.cwd,
            permissions: tool.permissions.unwrap_or_default(),
          })
          .collect::<Vec<PluginToolDescriptor>>();

        discovered.push(PluginManifestProof {
          id: parsed.id.clone(),
          name: parsed.name.unwrap_or_else(|| parsed.id.clone()),
          version: parsed.version.unwrap_or_else(|| "0.0.0".to_string()),
          permissions: parsed.permissions.unwrap_or_default(),
          enabled_by_default: parsed.enabled_by_default.unwrap_or(false),
          manifest_version: parsed
            .manifest_version
            .unwrap_or_else(|| "1.0.0".to_string()),
          manifest_path: manifest_path.to_string_lossy().to_string(),
          tools,
          trust: "verified".to_string(),
          error: None,
        });
      }
      Err(error) => {
        discovered.push(PluginManifestProof {
          id: "invalid-manifest".to_string(),
          name: "Invalid Plugin Manifest".to_string(),
          version: "0.0.0".to_string(),
          permissions: vec![],
          enabled_by_default: false,
          manifest_version: "unknown".to_string(),
          manifest_path: manifest_path.to_string_lossy().to_string(),
          tools: vec![],
          trust: "failed".to_string(),
          error: Some(error.to_string()),
        });
      }
    }
  }

  Ok(discovered)
}

#[tauri::command]
pub(crate) fn validate_plugin_manifest_disk(
  app: AppHandle,
  manifest_path: String,
) -> Result<PluginManifestValidationProof, String> {
  let path = PathBuf::from(&manifest_path);
  if !path.exists() || !path.is_file() {
    let proof = PluginManifestValidationProof {
      manifest_path,
      valid: false,
      errors: vec!["Manifest path does not exist.".to_string()],
      warnings: vec![],
      trust: "failed".to_string(),
    };
    let _ = append_plugin_audit_event(
      &app,
      "plugin_manifest_validation",
      serde_json::json!({
        "manifestPath": &proof.manifest_path,
        "valid": proof.valid,
        "errors": &proof.errors,
        "warnings": &proof.warnings,
        "trust": &proof.trust
      }),
    );
    return Ok(proof);
  }

  let encoded = fs::read_to_string(&path).map_err(|error| error.to_string())?;
  let mut errors: Vec<String> = vec![];
  let mut warnings: Vec<String> = vec![];

  match serde_json::from_str::<PluginManifestDisk>(&encoded) {
    Ok(parsed) => {
      if parsed.id.trim().is_empty() {
        errors.push("Plugin id is empty.".to_string());
      }
      if parsed.manifest_version.as_deref() != Some("1.0.0") {
        warnings.push(
          "Plugin manifest_version is not 1.0.0. Compatibility is not guaranteed.".to_string(),
        );
      }
      if parsed
        .permissions
        .as_ref()
        .map(|p| p.is_empty())
        .unwrap_or(true)
      {
        warnings.push("Plugin permissions are missing or empty.".to_string());
      }
      if parsed
        .tools
        .as_ref()
        .map(|tools| tools.is_empty())
        .unwrap_or(true)
      {
        warnings.push("Plugin has no declared tools.".to_string());
      }
      if parsed
        .declared_programs
        .as_ref()
        .map(|d| d.is_empty())
        .unwrap_or(true)
      {
        warnings.push(
          "Plugin manifest has no declared_programs allowlist — execute_plugin_tool will only \
           enforce the shared system-wide program allowlist, not a per-plugin restriction. \
           Add declared_programs to scope this plugin to only the programs it actually needs."
            .to_string(),
        );
      }
      if let Some(tools) = parsed.tools {
        for tool in tools {
          if tool.id.trim().is_empty() {
            errors.push("Plugin tool id is empty.".to_string());
          }
          if tool.program.trim().is_empty() {
            errors.push(format!("Plugin tool {} has empty program.", tool.id));
          }
          if !allowed_program(&tool.program) {
            warnings.push(format!(
              "Plugin tool {} program '{}' is outside supervised allowlist.",
              tool.id, tool.program
            ));
          }
          if !program_allowed_by_manifest(parsed.declared_programs.as_ref(), &tool.program) {
            errors.push(format!(
              "Plugin tool {} program '{}' is not listed in declared_programs.",
              tool.id, tool.program
            ));
          }
        }
      }
    }
    Err(error) => {
      errors.push(format!("Invalid JSON manifest: {error}"));
    }
  }

  let valid = errors.is_empty();
  let proof = PluginManifestValidationProof {
    manifest_path,
    valid,
    errors,
    warnings,
    trust: if valid {
      "verified".to_string()
    } else {
      "failed".to_string()
    },
  };
  let _ = append_plugin_audit_event(
    &app,
    "plugin_manifest_validation",
    serde_json::json!({
      "manifestPath": &proof.manifest_path,
      "valid": proof.valid,
      "errors": &proof.errors,
      "warnings": &proof.warnings,
      "trust": &proof.trust
    }),
  );
  Ok(proof)
}

fn resolve_plugin_cwd(
  manifest_path: &Path,
  tool_cwd: &Option<String>,
  workspace_root: &Option<String>,
) -> Result<Option<PathBuf>, String> {
  let Some(tool_cwd) = tool_cwd else {
    return Ok(None);
  };

  let base_dir = manifest_path
    .parent()
    .ok_or_else(|| "Plugin manifest path has no parent directory.".to_string())?;
  let candidate = PathBuf::from(tool_cwd);
  let resolved = if candidate.is_absolute() {
    candidate
  } else {
    base_dir.join(candidate)
  };

  if let Some(root) = workspace_root {
    let root_path = PathBuf::from(root);
    if root_path.exists() {
      let resolved_abs = fs::canonicalize(&resolved).map_err(|error| error.to_string())?;
      let root_abs = fs::canonicalize(&root_path).map_err(|error| error.to_string())?;
      if !resolved_abs.starts_with(&root_abs) {
        return Err("Resolved plugin cwd is outside workspace root.".to_string());
      }
      return Ok(Some(resolved_abs));
    }
  }

  Ok(Some(resolved))
}

#[tauri::command]
pub(crate) fn execute_plugin_tool(
  app: AppHandle,
  manifest_path: String,
  plugin_id: String,
  tool_id: String,
  extra_args: Option<Vec<String>>,
  workspace_root: Option<String>,
) -> Result<PluginToolExecutionProof, String> {
  let started = now_ms();
  let extra = extra_args.unwrap_or_default();
  if let Err(error) = validate_plugin_extra_args(&extra) {
    let _ = append_plugin_audit_event(
      &app,
      "plugin_tool_execution_blocked",
      serde_json::json!({
        "pluginId": plugin_id,
        "toolId": tool_id,
        "manifestPath": manifest_path,
        "reason": error,
        "trust": "failed"
      }),
    );
    return Err(error);
  }

  let manifest_path_buf = PathBuf::from(&manifest_path);
  if !manifest_path_buf.exists() || !manifest_path_buf.is_file() {
    let reason = "Plugin manifest path does not exist.".to_string();
    let _ = append_plugin_audit_event(
      &app,
      "plugin_tool_execution_blocked",
      serde_json::json!({
        "pluginId": plugin_id,
        "toolId": tool_id,
        "manifestPath": manifest_path,
        "reason": reason,
        "trust": "failed"
      }),
    );
    return Err(reason);
  }

  let encoded = fs::read_to_string(&manifest_path_buf).map_err(|error| error.to_string())?;
  let parsed: PluginManifestDisk =
    serde_json::from_str(&encoded).map_err(|error| error.to_string())?;

  if parsed.id != plugin_id {
    let reason = "Plugin id does not match manifest id.".to_string();
    let _ = append_plugin_audit_event(
      &app,
      "plugin_tool_execution_blocked",
      serde_json::json!({
        "pluginId": plugin_id,
        "toolId": tool_id,
        "manifestPath": manifest_path,
        "reason": reason,
        "trust": "failed"
      }),
    );
    return Err(reason);
  }

  let plugin_permissions = parsed.permissions.unwrap_or_default();
  if !plugin_permissions
    .iter()
    .any(|permission| permission == "tools.execute")
  {
    let reason = "Plugin manifest missing tools.execute permission.".to_string();
    let _ = append_plugin_audit_event(
      &app,
      "plugin_tool_execution_blocked",
      serde_json::json!({
        "pluginId": plugin_id,
        "toolId": tool_id,
        "manifestPath": manifest_path,
        "reason": reason,
        "trust": "failed"
      }),
    );
    return Err(reason);
  }

  let tools = parsed.tools.unwrap_or_default();
  let tool = tools
    .into_iter()
    .find(|item| item.id == tool_id)
    .ok_or_else(|| "Tool id not found in manifest.".to_string())?;
  let tool_permissions = tool.permissions.unwrap_or_default();
  if !tool_permissions
    .iter()
    .any(|permission| permission == "command.execute")
  {
    let reason = "Plugin tool missing command.execute permission.".to_string();
    let _ = append_plugin_audit_event(
      &app,
      "plugin_tool_execution_blocked",
      serde_json::json!({
        "pluginId": plugin_id,
        "toolId": tool_id,
        "manifestPath": manifest_path,
        "reason": reason,
        "trust": "failed"
      }),
    );
    return Err(reason);
  }

  if !allowed_program(&tool.program) {
    let reason = "Plugin tool program is blocked by supervised command policy.".to_string();
    let _ = append_plugin_audit_event(
      &app,
      "plugin_tool_execution_blocked",
      serde_json::json!({
        "pluginId": plugin_id,
        "toolId": tool_id,
        "manifestPath": manifest_path,
        "program": tool.program,
        "reason": reason,
        "trust": "failed"
      }),
    );
    return Err(reason);
  }

  if !program_allowed_by_manifest(parsed.declared_programs.as_ref(), &tool.program) {
    let reason = format!(
      "Plugin tool program '{}' is not in this plugin's declared_programs allowlist.",
      tool.program
    );
    let _ = append_plugin_audit_event(
      &app,
      "plugin_tool_execution_blocked",
      serde_json::json!({
        "pluginId": plugin_id,
        "toolId": tool_id,
        "manifestPath": manifest_path,
        "program": tool.program,
        "declaredPrograms": parsed.declared_programs,
        "reason": reason,
        "trust": "failed"
      }),
    );
    return Err(reason);
  }

  let mut args = tool.args.unwrap_or_default();
  args.extend(extra);
  let cwd = resolve_plugin_cwd(&manifest_path_buf, &tool.cwd, &workspace_root)?;

  let mut command = Command::new(&tool.program);
  command.args(&args);
  if let Some(dir) = &cwd {
    command.current_dir(dir);
  }

  let output = command.output().map_err(|error| error.to_string())?;
  let finished = now_ms();
  let success = output.status.success();

  let proof = PluginToolExecutionProof {
    plugin_id,
    tool_id,
    manifest_path,
    program: tool.program,
    args,
    cwd: cwd.map(|value| value.to_string_lossy().to_string()),
    started_at_ms: started,
    finished_at_ms: finished,
    success,
    exit_code: output.status.code(),
    stdout: String::from_utf8_lossy(&output.stdout).to_string(),
    stderr: String::from_utf8_lossy(&output.stderr).to_string(),
    trust: if success {
      "verified".to_string()
    } else {
      "failed".to_string()
    },
    error: None,
  };

  let _ = append_plugin_audit_event(
    &app,
    "plugin_tool_execution",
    serde_json::json!({
      "pluginId": &proof.plugin_id,
      "toolId": &proof.tool_id,
      "manifestPath": &proof.manifest_path,
      "program": &proof.program,
      "args": &proof.args,
      "cwd": &proof.cwd,
      "success": proof.success,
      "exitCode": proof.exit_code,
      "startedAtMs": proof.started_at_ms,
      "finishedAtMs": proof.finished_at_ms,
      "trust": &proof.trust
    }),
  );

  Ok(proof)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn validate_plugin_extra_args_accepts_safe_args() {
    let args = vec!["--flag".to_string(), "value".to_string()];
    assert!(validate_plugin_extra_args(&args).is_ok());
  }

  #[test]
  fn validate_plugin_extra_args_rejects_too_many() {
    let args: Vec<String> = (0..9).map(|i| format!("a{i}")).collect();
    assert!(validate_plugin_extra_args(&args).is_err());
  }

  #[test]
  fn validate_plugin_extra_args_rejects_oversized_arg() {
    let big = "x".repeat(121);
    assert!(validate_plugin_extra_args(&[big]).is_err());
  }

  #[test]
  fn validate_plugin_extra_args_rejects_blocked_tokens() {
    assert!(validate_plugin_extra_args(&["foo;bar".to_string()]).is_err());
    assert!(validate_plugin_extra_args(&["a && b".to_string()]).is_err());
    assert!(validate_plugin_extra_args(&["$(rm -rf)".to_string()]).is_err());
    assert!(validate_plugin_extra_args(&["`whoami`".to_string()]).is_err());
    assert!(validate_plugin_extra_args(&["a > b".to_string()]).is_err());
    assert!(validate_plugin_extra_args(&["a | b".to_string()]).is_err());
  }

  #[test]
  fn plugin_blocked_token_present_detects_all() {
    assert!(plugin_blocked_token_present("&&").is_some());
    assert!(plugin_blocked_token_present("||").is_some());
    assert!(plugin_blocked_token_present(";").is_some());
    assert!(plugin_blocked_token_present("|").is_some());
    assert!(plugin_blocked_token_present(">").is_some());
    assert!(plugin_blocked_token_present("<").is_some());
    assert!(plugin_blocked_token_present("$(").is_some());
    assert!(plugin_blocked_token_present("`").is_some());
    assert!(plugin_blocked_token_present("safe_arg").is_none());
  }

  #[test]
  fn program_allowed_by_manifest_allows_when_declared_programs_absent() {
    assert!(program_allowed_by_manifest(None, "npm"));
    assert!(program_allowed_by_manifest(None, "anything"));
  }

  #[test]
  fn program_allowed_by_manifest_enforces_allowlist_when_present() {
    let declared = vec!["npm".to_string(), "git".to_string()];
    assert!(program_allowed_by_manifest(Some(&declared), "npm"));
    assert!(program_allowed_by_manifest(Some(&declared), "git"));
    assert!(!program_allowed_by_manifest(Some(&declared), "docker"));
  }

  #[test]
  fn program_allowed_by_manifest_is_case_insensitive() {
    let declared = vec!["NPM".to_string()];
    assert!(program_allowed_by_manifest(Some(&declared), "npm"));
    assert!(program_allowed_by_manifest(Some(&declared), "Npm"));
  }

  #[test]
  fn program_allowed_by_manifest_rejects_all_when_declared_list_empty() {
    let declared: Vec<String> = vec![];
    assert!(!program_allowed_by_manifest(Some(&declared), "npm"));
  }
}
