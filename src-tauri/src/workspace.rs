use crate::{now_ms, write_native_proof_stage, NativeProofStageProof};
use crate::runtime_manager::runtimes_dir;
use serde::Serialize;
use serde_json::Value;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::time::UNIX_EPOCH;

#[derive(Serialize)]
pub(crate) struct WorkspaceWriteProof {
  pub(crate) file_path: String,
  pub(crate) relative_path: String,
  pub(crate) written: bool,
  pub(crate) written_at_ms: u64,
  pub(crate) bytes: usize,
  pub(crate) trust: String,
}

#[derive(Serialize)]
pub(crate) struct SymbolHit {
  pub(crate) symbol: String,
  pub(crate) count: u64,
}

#[derive(Serialize)]
pub(crate) struct WorkspaceProof {
  pub(crate) root: String,
  pub(crate) exists: bool,
  pub(crate) file_count: u64,
  pub(crate) dir_count: u64,
  pub(crate) total_bytes: u64,
  pub(crate) sampled_files: Vec<String>,
  pub(crate) symbol_hits: Vec<SymbolHit>,
  pub(crate) checked_at_ms: u64,
  pub(crate) trust: String,
  pub(crate) error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FileSymbolSummary {
  pub(crate) path: String,
  pub(crate) language: String,
  pub(crate) bytes: u64,
  pub(crate) symbol_hits: Vec<SymbolHit>,
  pub(crate) dependencies: Vec<String>,
  pub(crate) trust: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceSymbolIndex {
  pub(crate) root: String,
  pub(crate) generated_at_ms: u64,
  pub(crate) max_files: u64,
  pub(crate) files_indexed: u64,
  pub(crate) totals: Vec<SymbolHit>,
  pub(crate) dependency_edges: usize,
  pub(crate) files: Vec<FileSymbolSummary>,
  pub(crate) trust: String,
  pub(crate) error: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceReadinessFinding {
  pub(crate) id: String,
  pub(crate) path: String,
  pub(crate) line_number: u64,
  pub(crate) surface: String,
  pub(crate) kind: String,
  pub(crate) priority: String,
  pub(crate) severity: String,
  pub(crate) message: String,
  pub(crate) excerpt: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceReadinessScan {
  pub(crate) root: String,
  pub(crate) generated_at_ms: u64,
  pub(crate) files_scanned: u64,
  pub(crate) findings: Vec<WorkspaceReadinessFinding>,
  pub(crate) placeholder_count: u64,
  pub(crate) todo_count: u64,
  pub(crate) setup_required_count: u64,
  pub(crate) blocked_count: u64,
  pub(crate) failed_count: u64,
  pub(crate) partial_count: u64,
  pub(crate) trust: String,
  pub(crate) error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceFileReadProof {
  pub(crate) file_path: String,
  pub(crate) relative_path: String,
  pub(crate) content: String,
  pub(crate) bytes: usize,
  pub(crate) read_at_ms: u64,
  pub(crate) trust: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceFileDeleteProof {
  pub(crate) file_path: String,
  pub(crate) relative_path: String,
  pub(crate) deleted: bool,
  pub(crate) deleted_at_ms: u64,
  pub(crate) trust: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceFileMoveProof {
  pub(crate) from_path: String,
  pub(crate) to_path: String,
  pub(crate) from_relative: String,
  pub(crate) to_relative: String,
  pub(crate) moved: bool,
  pub(crate) moved_at_ms: u64,
  pub(crate) trust: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceSearchResultItem {
  pub(crate) file_path: String,
  pub(crate) relative_path: String,
  pub(crate) line_number: usize,
  pub(crate) line_content: String,
  pub(crate) match_count: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceSearchProof {
  pub(crate) query: String,
  pub(crate) case_sensitive: bool,
  pub(crate) results: Vec<WorkspaceSearchResultItem>,
  pub(crate) total_matches: usize,
  pub(crate) files_scanned: usize,
  pub(crate) searched_at_ms: u64,
  pub(crate) trust: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceDirEntry {
  pub(crate) name: String,
  pub(crate) path: String,
  pub(crate) relative_path: String,
  pub(crate) is_dir: bool,
  pub(crate) is_file: bool,
  pub(crate) size_bytes: u64,
  pub(crate) modified_ms: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceDirectoryProof {
  pub(crate) directory_path: String,
  pub(crate) relative_path: String,
  pub(crate) entries: Vec<WorkspaceDirEntry>,
  pub(crate) total_files: usize,
  pub(crate) total_dirs: usize,
  pub(crate) listed_at_ms: u64,
  pub(crate) trust: String,
}

#[derive(Serialize)]
pub(crate) struct ReleaseArtifactProof {
  pub(crate) bundle_dir: String,
  pub(crate) manifest_dir: String,
  pub(crate) installer_path: Option<String>,
  pub(crate) installer_found: bool,
  pub(crate) signature_path: Option<String>,
  pub(crate) signature_found: bool,
  pub(crate) latest_json_path: Option<String>,
  pub(crate) latest_json_found: bool,
  pub(crate) manifest_valid: bool,
  pub(crate) manifest_version: Option<String>,
  pub(crate) manifest_url: Option<String>,
  pub(crate) manifest_signature: Option<String>,
  pub(crate) trust: String,
  pub(crate) error: Option<String>,
}

fn symbol_counts_for_text(content: &str) -> [u64; 7] {
  let mut counts = [0_u64; 7];
  for line in content.lines() {
    let trimmed = line.trim_start();
    if trimmed.starts_with("fn ") {
      counts[0] += 1;
    }
    if trimmed.starts_with("function ") || trimmed.contains(" function ") {
      counts[1] += 1;
    }
    if trimmed.starts_with("class ") {
      counts[2] += 1;
    }
    if trimmed.starts_with("const ") || trimmed.starts_with("let ") {
      counts[3] += 1;
    }
    if trimmed.starts_with("async fn ") || trimmed.starts_with("async function ") {
      counts[4] += 1;
    }
    if trimmed.starts_with("import ") || trimmed.starts_with("use ") {
      counts[5] += 1;
    }
    if trimmed.starts_with("export ") || trimmed.starts_with("pub ") {
      counts[6] += 1;
    }
  }
  counts
}

fn language_for_extension(extension: &str) -> String {
  match extension {
    "rs" => "rust",
    "js" => "javascript",
    "jsx" => "react-jsx",
    "ts" => "typescript",
    "tsx" => "react-tsx",
    "py" => "python",
    _ => "unknown",
  }
  .to_string()
}

fn symbol_hits_from_counts(counts: [u64; 7]) -> Vec<SymbolHit> {
  vec![
    SymbolHit {
      symbol: "rust_fn".to_string(),
      count: counts[0],
    },
    SymbolHit {
      symbol: "js_function".to_string(),
      count: counts[1],
    },
    SymbolHit {
      symbol: "class".to_string(),
      count: counts[2],
    },
    SymbolHit {
      symbol: "const_or_let".to_string(),
      count: counts[3],
    },
    SymbolHit {
      symbol: "async_decl".to_string(),
      count: counts[4],
    },
    SymbolHit {
      symbol: "import_or_use".to_string(),
      count: counts[5],
    },
    SymbolHit {
      symbol: "export_or_pub".to_string(),
      count: counts[6],
    },
  ]
}

fn between_quotes(line: &str) -> Option<String> {
  let mut quote_char = '\0';
  let mut start_index: Option<usize> = None;
  for (idx, ch) in line.char_indices() {
    if start_index.is_none() {
      if ch == '"' || ch == '\'' {
        quote_char = ch;
        start_index = Some(idx + ch.len_utf8());
      }
      continue;
    }

    if ch == quote_char {
      let start = start_index.unwrap_or(0);
      if idx > start {
        return Some(line[start..idx].to_string());
      }
      break;
    }
  }
  None
}

fn extract_dependencies(content: &str, language: &str) -> Vec<String> {
  let mut deps: Vec<String> = vec![];

  for line in content.lines() {
    let trimmed = line.trim();
    if trimmed.is_empty() {
      continue;
    }

    match language {
      "javascript" | "react-jsx" | "typescript" | "react-tsx"
        if (trimmed.starts_with("import ")
          || trimmed.contains(" from ")
          || trimmed.contains("require(")) =>
      {
        if let Some(dep) = between_quotes(trimmed) {
          deps.push(dep);
        }
      }
      "rust" if trimmed.starts_with("use ") => {
        let raw = trimmed
          .trim_start_matches("use ")
          .trim_end_matches(';')
          .trim();
        if !raw.is_empty() {
          deps.push(raw.to_string());
        }
      }
      "python" => {
        if trimmed.starts_with("import ") {
          let raw = trimmed.trim_start_matches("import ").trim();
          if !raw.is_empty() {
            deps.push(raw.split_whitespace().next().unwrap_or("").to_string());
          }
        } else if trimmed.starts_with("from ") && trimmed.contains(" import ") {
          let raw = trimmed
            .trim_start_matches("from ")
            .split(" import ")
            .next()
            .unwrap_or("")
            .trim();
          if !raw.is_empty() {
            deps.push(raw.to_string());
          }
        }
      }
      _ => {}
    }
  }

  crate::dedup_strings(deps.into_iter().filter(|dep| !dep.is_empty()).collect())
}

fn readiness_surface_for_path(path: &Path) -> String {
  let lower = path.to_string_lossy().to_ascii_lowercase();
  if lower.contains("connector") || lower.contains("webhook") {
    return "connector".to_string();
  }
  if lower.contains("workflow") || lower.contains("receipt") || lower.contains("approval") {
    return "workflow".to_string();
  }
  if lower.contains("update")
    || lower.contains("release")
    || lower.contains("updater")
    || lower.contains("latest.json")
  {
    return "release".to_string();
  }
  if lower.contains("memory") || lower.contains("ledger") {
    return "memory".to_string();
  }
  if lower.contains("security")
    || lower.contains("auth")
    || lower.contains("policy")
    || lower.contains("signature")
  {
    return "security".to_string();
  }
  if lower.contains("component")
    || lower.contains("app.jsx")
    || lower.contains("panel")
    || lower.contains("view")
  {
    return "ui".to_string();
  }
  if lower.ends_with(".md") || lower.contains("docs") {
    return "docs".to_string();
  }
  "other".to_string()
}

fn readiness_file_extension(path: &Path) -> String {
  path
    .extension()
    .and_then(|value| value.to_str())
    .unwrap_or("")
    .to_ascii_lowercase()
}

fn readiness_scan_timed_out(started_at_ms: u64) -> bool {
  now_ms().saturating_sub(started_at_ms) > 90_000
}

fn readiness_path_contains_segment(path: &Path, segment: &str) -> bool {
  path.components().any(|component| {
    component
      .as_os_str()
      .to_string_lossy()
      .eq_ignore_ascii_case(segment)
  })
}

fn readiness_should_skip_path(path: &Path, file_name: &str) -> bool {
  let path_lower = path
    .to_string_lossy()
    .replace('\\', "/")
    .to_ascii_lowercase();
  matches!(
    file_name,
    ".git"
      | "node_modules"
      | "target"
      | "dist"
      | "release"
      | "package-lock.json"
      | "yarn.lock"
      | "pnpm-lock.yaml"
      | "Cargo.lock"
  ) || readiness_path_contains_segment(path, ".git")
    || readiness_path_contains_segment(path, "node_modules")
    || readiness_path_contains_segment(path, "target")
    || readiness_path_contains_segment(path, "dist")
    || path_lower.contains("/release/rc0/")
    || path_lower.contains("/docs/handoff")
    || path_lower.contains("/src-tauri/gen/")
    || path_lower.contains("/generated/")
}

fn readiness_is_allowed_top_level_dir(file_name: &str) -> bool {
  matches!(
    file_name,
    "src" | "src-tauri" | "scripts" | "gateway" | "docs"
  )
}

fn readiness_proof_scan_targets(root: &Path) -> Vec<PathBuf> {
  let targets = [
    "src/App.jsx",
    "src/components/EcosystemHub.jsx",
    "src/components/ProductionReadinessPanel.jsx",
    "src/components/SelfDevelopmentPanel.jsx",
    "src/components/OperatorDashboard.jsx",
    "src/services/nativeRc0ProofService.js",
    "src/services/nativeSelfDevelopmentAutostartService.js",
    "src/services/connectorRegistryService.js",
    "src/services/repoAuditService.js",
    "src/services/devPacketService.js",
    "src/services/selfDevelopmentService.js",
    "src/services/workflowExecutionService.js",
    "src/services/workflowReceiptService.js",
    "src/services/workflowMemoryService.js",
    "src/services/runtimeLedgerService.js",
    "src/services/productionReadinessService.js",
    "src/services/workspaceRootService.js",
    "scripts/proof-native-selfdev.mjs",
    "scripts/setup-updater-signing.mjs",
    "scripts/verify-updater-readiness.mjs",
    "src-tauri/src/lib.rs",
    "src-tauri/src/native_proof.rs",
    "gateway/whatsapp-cloud/src/server.js",
    "gateway/whatsapp-cloud/src/verify.js",
    "gateway/whatsapp-cloud/src/normalize.js",
    "gateway/whatsapp-cloud/src/forward.js",
    "docs/UPDATER_SIGNING_SETUP.md",
  ];

  targets.iter().map(|relative| root.join(relative)).collect()
}

fn scan_readiness_target_paths(
  root: &Path,
  target_paths: Vec<PathBuf>,
  generated_at_ms: u64,
  max_files: usize,
  max_findings: usize,
) -> Result<WorkspaceReadinessScan, String> {
  let mut files_scanned = 0_u64;
  let mut findings: Vec<WorkspaceReadinessFinding> = vec![];
  let mut placeholder_count = 0_u64;
  let mut todo_count = 0_u64;
  let mut setup_required_count = 0_u64;
  let mut blocked_count = 0_u64;
  let failed_count = 0_u64;
  let mut partial_count = 0_u64;
  let scan_started_at_ms = generated_at_ms;

  for path in target_paths {
    if readiness_scan_timed_out(scan_started_at_ms)
      || findings.len() >= max_findings
      || files_scanned as usize >= max_files
    {
      return Ok(WorkspaceReadinessScan {
        root: root.to_string_lossy().to_string(),
        generated_at_ms,
        files_scanned,
        findings,
        placeholder_count,
        todo_count,
        setup_required_count,
        blocked_count,
        failed_count,
        partial_count,
        trust: "partial".to_string(),
        error: Some(
          "Readiness scan time budget reached before proof surface completed.".to_string(),
        ),
      });
    }

    if !path.exists() || !path.is_file() {
      continue;
    }

    if readiness_should_skip_path(
      &path,
      path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(""),
    ) {
      continue;
    }

    let progress = NativeProofStageProof {
      stage: "08_scan_progress".to_string(),
      status: "running".to_string(),
      timestamp: format!("{}", now_ms()),
      process_id: std::process::id(),
      workspace_root: root.to_string_lossy().to_string(),
      output_dir: "release/rc0".to_string(),
      proof_request_found: true,
      window_label: None,
      note: Some(format!(
        "Scanning proof surface file: {}",
        path.to_string_lossy()
      )),
      error: None,
      duration_ms: None,
    };
    let _ = write_native_proof_stage(Path::new("release/rc0"), "08_scan_progress.json", &progress);

    let extension = readiness_file_extension(&path);
    if !matches!(
      extension.as_str(),
      "js"
        | "jsx"
        | "ts"
        | "tsx"
        | "rs"
        | "mjs"
        | "cjs"
        | "md"
        | "toml"
        | "json"
        | "yml"
        | "yaml"
        | "css"
        | "html"
    ) {
      continue;
    }

    if let Ok(metadata) = fs::metadata(&path) {
      const MAX_READY_SCAN_BYTES: u64 = 512 * 1024;
      if metadata.len() > MAX_READY_SCAN_BYTES {
        continue;
      }
    }

    files_scanned += 1;
    if files_scanned as usize > max_files {
      break;
    }

    let content = match fs::read_to_string(&path) {
      Ok(content) => content,
      Err(_) => continue,
    };

    if readiness_scan_timed_out(scan_started_at_ms) {
      return Ok(WorkspaceReadinessScan {
        root: root.to_string_lossy().to_string(),
        generated_at_ms,
        files_scanned,
        findings,
        placeholder_count,
        todo_count,
        setup_required_count,
        blocked_count,
        failed_count,
        partial_count,
        trust: "partial".to_string(),
        error: Some(
          "Readiness scan time budget reached after reading a proof surface file.".to_string(),
        ),
      });
    }

    for (line_index, line) in content.lines().enumerate() {
      if findings.len() >= max_findings {
        break;
      }

      let Some((needle, kind, priority, severity)) = readiness_keyword_match(line) else {
        continue;
      };

      let line_number = (line_index + 1) as u64;
      let message = if needle == "setup required" || needle == "setup-required" {
        "Setup-required surface should be labeled clearly and backed by real checks.".to_string()
      } else if kind == "missing_approval" {
        "Approval gate is missing or not enforced; add Jose approval or truth-label the action."
          .to_string()
      } else if kind == "missing_receipt" {
        "Receipt-backed evidence is missing for a production-facing action.".to_string()
      } else if kind == "updater_blocker" {
        "Updater or release path is blocked and should not imply completion.".to_string()
      } else if kind == "connector_blocker" {
        "Connector path is blocked and should be marked setup_required until real provider proof exists.".to_string()
      } else if kind == "not_wired" {
        "Surface is explicitly marked as not wired; keep it disabled or implement the real path."
          .to_string()
      } else if kind == "fake" || kind == "simulation" {
        "Production-facing surface should not imply fake or simulated execution.".to_string()
      } else if kind == "placeholder" || kind == "scaffold" || kind == "demo" || kind == "mock" {
        "Production-facing surface should be replaced with real behavior or explicitly setup-required state.".to_string()
      } else {
        "Code review marker remains in the workspace and should be resolved or tracked.".to_string()
      };

      findings.push(WorkspaceReadinessFinding {
        id: format!(
          "ready-{}-{}-{}",
          findings.len() + 1,
          files_scanned,
          line_number
        ),
        path: path.to_string_lossy().to_string(),
        line_number,
        surface: readiness_surface_for_path(&path),
        kind: kind.to_string(),
        priority: priority.to_string(),
        severity: severity.to_string(),
        message,
        excerpt: line.trim().chars().take(180).collect(),
      });

      match kind {
        "placeholder" | "scaffold" | "demo" | "mock" | "not_wired" | "fake" | "simulated" => {
          placeholder_count += 1;
        }
        "todo" => {
          todo_count += 1;
        }
        "setup_required" => {
          setup_required_count += 1;
        }
        _ => {}
      }

      if priority == "P0" {
        blocked_count += 1;
      } else if priority == "P1" {
        partial_count += 1;
      }
    }

    if findings.len() >= max_findings || files_scanned as usize > max_files {
      break;
    }
  }

  let trust = if blocked_count > 0 {
    "failed"
  } else if placeholder_count > 0 || setup_required_count > 0 {
    "partial"
  } else {
    "verified"
  }
  .to_string();

  Ok(WorkspaceReadinessScan {
    root: root.to_string_lossy().to_string(),
    generated_at_ms,
    files_scanned,
    findings,
    placeholder_count,
    todo_count,
    setup_required_count,
    blocked_count,
    failed_count,
    partial_count,
    trust,
    error: None,
  })
}

fn readiness_keyword_match(
  line: &str,
) -> Option<(&'static str, &'static str, &'static str, &'static str)> {
  let lower = line.to_ascii_lowercase();
  let patterns = [
    ("missing approval", "missing_approval", "P0", "P0"),
    ("approval gate", "missing_approval", "P0", "P0"),
    ("missing receipt", "missing_receipt", "P0", "P0"),
    ("receipt missing", "missing_receipt", "P0", "P0"),
    ("updater blocker", "updater_blocker", "P0", "P0"),
    ("release blocker", "updater_blocker", "P0", "P0"),
    ("connector blocker", "connector_blocker", "P0", "P0"),
    ("not wired", "not_wired", "P0", "P0"),
    ("fake success", "fake", "P0", "P0"),
    ("fake", "fake", "P0", "P0"),
    ("simulated", "simulation", "P0", "P0"),
    ("simulation", "simulation", "P0", "P0"),
    ("placeholder-only", "placeholder", "P1", "P1"),
    ("placeholder only", "placeholder", "P1", "P1"),
    ("placeholder", "placeholder", "P1", "P1"),
    ("scaffold", "scaffold", "P1", "P1"),
    ("demo-only", "demo", "P1", "P1"),
    ("demo", "demo", "P1", "P1"),
    ("mock", "mock", "P1", "P1"),
    ("setup-required", "setup_required", "P1", "P1"),
    ("setup required", "setup_required", "P1", "P1"),
    ("todo", "todo", "P2", "P2"),
    ("fixme", "fixme", "P2", "P2"),
  ];

  patterns
    .into_iter()
    .find(|(needle, _, _, _)| lower.contains(needle))
}

#[tauri::command]
pub(crate) fn write_workspace_text_file(
  workspace_root: String,
  relative_path: String,
  content: String,
) -> Result<WorkspaceWriteProof, String> {
  let root = PathBuf::from(workspace_root.trim());
  if root.as_os_str().is_empty() {
    return Err("Workspace root is required for workspace file writes.".to_string());
  }

  let root_abs = fs::canonicalize(&root).map_err(|error| error.to_string())?;
  let rel = Path::new(relative_path.trim());
  if rel.as_os_str().is_empty() {
    return Err("Relative path is required.".to_string());
  }
  if rel.is_absolute()
    || rel.components().any(|component| {
      matches!(
        component,
        Component::ParentDir | Component::Prefix(_) | Component::RootDir
      )
    })
  {
    return Err("Unsafe relative path rejected.".to_string());
  }

  let file_path = root_abs.join(rel);

  let file_abs = fs::canonicalize(&file_path).unwrap_or_else(|_| file_path.clone());
  if !file_abs.starts_with(&root_abs) {
    return Err("Path traversal detected: resolved path escapes workspace sandbox.".to_string());
  }

  if let Some(parent) = file_path.parent() {
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
  }

  let payload = content.into_bytes();
  let bytes = payload.len();
  fs::write(&file_path, payload).map_err(|error| error.to_string())?;

  Ok(WorkspaceWriteProof {
    file_path: file_path.to_string_lossy().to_string(),
    relative_path: rel.to_string_lossy().to_string(),
    written: true,
    written_at_ms: now_ms(),
    bytes,
    trust: "verified".to_string(),
  })
}

#[tauri::command]
pub(crate) fn collect_workspace_proof(
  root: String,
  max_files: Option<u64>,
) -> Result<WorkspaceProof, String> {
  let root_path = PathBuf::from(&root);
  let checked_at_ms = now_ms();

  if !root_path.exists() || !root_path.is_dir() {
    return Ok(WorkspaceProof {
      root,
      exists: false,
      file_count: 0,
      dir_count: 0,
      total_bytes: 0,
      sampled_files: vec![],
      symbol_hits: vec![],
      checked_at_ms,
      trust: "failed".to_string(),
      error: Some("Workspace root does not exist or is not a directory.".to_string()),
    });
  }

  let limit = max_files.unwrap_or(1200) as usize;
  let mut stack = vec![root_path.clone()];
  let mut file_count = 0_u64;
  let mut dir_count = 0_u64;
  let mut total_bytes = 0_u64;
  let mut sampled_files: Vec<String> = vec![];
  let mut symbol_counts = [0_u64; 7];

  while let Some(dir) = stack.pop() {
    dir_count += 1;
    let entries = match fs::read_dir(&dir) {
      Ok(entries) => entries,
      Err(_) => continue,
    };

    for entry in entries.flatten() {
      let path = entry.path();
      let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else {
        continue;
      };

      if path.is_dir() {
        if matches!(file_name, ".git" | "node_modules" | "target" | "dist") {
          continue;
        }
        stack.push(path);
        continue;
      }

      if !path.is_file() {
        continue;
      }

      file_count += 1;
      if let Ok(meta) = fs::metadata(&path) {
        total_bytes += meta.len();
      }

      if sampled_files.len() < 12 {
        sampled_files.push(path.to_string_lossy().to_string());
      }

      if (file_count as usize) > limit {
        break;
      }

      let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("");
      if !matches!(extension, "js" | "jsx" | "ts" | "tsx" | "rs" | "py") {
        continue;
      }

      if let Ok(content) = fs::read_to_string(&path) {
        let next = symbol_counts_for_text(&content);
        for (index, value) in next.iter().enumerate() {
          symbol_counts[index] += value;
        }
      }
    }

    if (file_count as usize) > limit {
      break;
    }
  }

  let symbol_hits = symbol_hits_from_counts(symbol_counts);

  Ok(WorkspaceProof {
    root,
    exists: true,
    file_count,
    dir_count,
    total_bytes,
    sampled_files,
    symbol_hits,
    checked_at_ms,
    trust: "verified".to_string(),
    error: None,
  })
}

#[tauri::command]
pub(crate) fn build_workspace_symbol_index(
  root: String,
  max_files: Option<u64>,
) -> Result<WorkspaceSymbolIndex, String> {
  let root_path = PathBuf::from(&root);
  let generated_at_ms = now_ms();
  let max_files = max_files.unwrap_or(500);

  if !root_path.exists() || !root_path.is_dir() {
    return Ok(WorkspaceSymbolIndex {
      root,
      generated_at_ms,
      max_files,
      files_indexed: 0,
      totals: vec![],
      dependency_edges: 0,
      files: vec![],
      trust: "failed".to_string(),
      error: Some("Workspace root does not exist or is not a directory.".to_string()),
    });
  }

  let mut stack = vec![root_path.clone()];
  let mut files: Vec<FileSymbolSummary> = vec![];
  let mut total_counts = [0_u64; 7];
  let mut dependency_edges = 0_usize;

  while let Some(dir) = stack.pop() {
    let entries = match fs::read_dir(&dir) {
      Ok(entries) => entries,
      Err(_) => continue,
    };

    for entry in entries.flatten() {
      let path = entry.path();
      let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else {
        continue;
      };

      if path.is_dir() {
        if matches!(file_name, ".git" | "node_modules" | "target" | "dist") {
          continue;
        }
        stack.push(path);
        continue;
      }

      if !path.is_file() {
        continue;
      }

      let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("");
      if !matches!(extension, "js" | "jsx" | "ts" | "tsx" | "rs" | "py") {
        continue;
      }

      if files.len() >= max_files as usize {
        break;
      }

      let content = match fs::read_to_string(&path) {
        Ok(content) => content,
        Err(_) => continue,
      };
      let counts = symbol_counts_for_text(&content);
      let language = language_for_extension(extension);
      let dependencies = extract_dependencies(&content, &language);
      dependency_edges += dependencies.len();
      for (index, value) in counts.iter().enumerate() {
        total_counts[index] += value;
      }

      let bytes = fs::metadata(&path).map(|meta| meta.len()).unwrap_or(0);
      files.push(FileSymbolSummary {
        path: path.to_string_lossy().to_string(),
        language,
        bytes,
        symbol_hits: symbol_hits_from_counts(counts),
        dependencies,
        trust: "verified".to_string(),
      });
    }

    if files.len() >= max_files as usize {
      break;
    }
  }

  Ok(WorkspaceSymbolIndex {
    root,
    generated_at_ms,
    max_files,
    files_indexed: files.len() as u64,
    totals: symbol_hits_from_counts(total_counts),
    dependency_edges,
    files,
    trust: "verified".to_string(),
    error: None,
  })
}

#[tauri::command]
pub(crate) fn read_workspace_file(
  workspace_root: String,
  relative_path: String,
) -> Result<WorkspaceFileReadProof, String> {
  let root = PathBuf::from(workspace_root.trim());
  if root.as_os_str().is_empty() {
    return Err("Workspace root is required.".to_string());
  }
  let root_abs = fs::canonicalize(&root).map_err(|e| e.to_string())?;
  let rel = Path::new(relative_path.trim());
  if rel.as_os_str().is_empty() {
    return Err("Relative path is required.".to_string());
  }
  if rel.is_absolute()
    || rel.components().any(|c| {
      matches!(
        c,
        Component::ParentDir | Component::Prefix(_) | Component::RootDir
      )
    })
  {
    return Err("Unsafe relative path rejected.".to_string());
  }
  let file_path = root_abs.join(rel);
  if !file_path.exists() {
    return Err(format!("File not found: {}", rel.display()));
  }
  if !file_path.is_file() {
    return Err("Path is not a file.".to_string());
  }
  let content = fs::read_to_string(&file_path).map_err(|e| e.to_string())?;
  let bytes = content.len();
  Ok(WorkspaceFileReadProof {
    file_path: file_path.to_string_lossy().to_string(),
    relative_path: rel.to_string_lossy().to_string(),
    content,
    bytes,
    read_at_ms: now_ms(),
    trust: "verified".to_string(),
  })
}

#[tauri::command]
pub(crate) fn delete_workspace_file(
  workspace_root: String,
  relative_path: String,
) -> Result<WorkspaceFileDeleteProof, String> {
  let root = PathBuf::from(workspace_root.trim());
  if root.as_os_str().is_empty() {
    return Err("Workspace root is required.".to_string());
  }
  let root_abs = fs::canonicalize(&root).map_err(|e| e.to_string())?;
  let rel = Path::new(relative_path.trim());
  if rel.as_os_str().is_empty() {
    return Err("Relative path is required.".to_string());
  }
  if rel.is_absolute()
    || rel.components().any(|c| {
      matches!(
        c,
        Component::ParentDir | Component::Prefix(_) | Component::RootDir
      )
    })
  {
    return Err("Unsafe relative path rejected.".to_string());
  }
  let file_path = root_abs.join(rel);
  if !file_path.exists() {
    return Err(format!("File not found: {}", rel.display()));
  }
  fs::remove_file(&file_path).map_err(|e| e.to_string())?;
  Ok(WorkspaceFileDeleteProof {
    file_path: file_path.to_string_lossy().to_string(),
    relative_path: rel.to_string_lossy().to_string(),
    deleted: true,
    deleted_at_ms: now_ms(),
    trust: "verified".to_string(),
  })
}

#[tauri::command]
pub(crate) fn move_workspace_file(
  workspace_root: String,
  from_relative: String,
  to_relative: String,
) -> Result<WorkspaceFileMoveProof, String> {
  let root = PathBuf::from(workspace_root.trim());
  if root.as_os_str().is_empty() {
    return Err("Workspace root is required.".to_string());
  }
  let root_abs = fs::canonicalize(&root).map_err(|e| e.to_string())?;
  let from_rel = Path::new(from_relative.trim());
  let to_rel = Path::new(to_relative.trim());
  if from_rel.as_os_str().is_empty() || to_rel.as_os_str().is_empty() {
    return Err("Both from and to paths are required.".to_string());
  }
  for rel in [&from_rel, &to_rel] {
    if rel.is_absolute()
      || rel.components().any(|c| {
        matches!(
          c,
          Component::ParentDir | Component::Prefix(_) | Component::RootDir
        )
      })
    {
      return Err("Unsafe relative path rejected.".to_string());
    }
  }
  let from_path = root_abs.join(from_rel);
  let to_path = root_abs.join(to_rel);
  if !from_path.exists() {
    return Err(format!("Source file not found: {}", from_rel.display()));
  }
  if let Some(parent) = to_path.parent() {
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
  }
  fs::rename(&from_path, &to_path).map_err(|e| e.to_string())?;
  Ok(WorkspaceFileMoveProof {
    from_path: from_path.to_string_lossy().to_string(),
    to_path: to_path.to_string_lossy().to_string(),
    from_relative: from_rel.to_string_lossy().to_string(),
    to_relative: to_rel.to_string_lossy().to_string(),
    moved: true,
    moved_at_ms: now_ms(),
    trust: "verified".to_string(),
  })
}

#[tauri::command]
pub(crate) fn search_workspace_files(
  workspace_root: String,
  query: String,
  case_sensitive: bool,
  max_results: Option<usize>,
) -> Result<WorkspaceSearchProof, String> {
  let root = PathBuf::from(workspace_root.trim());
  if root.as_os_str().is_empty() {
    return Err("Workspace root is required.".to_string());
  }
  let root_abs = fs::canonicalize(&root).map_err(|e| e.to_string())?;
  let max_results = max_results.unwrap_or(200);
  let mut results = Vec::new();
  let mut files_scanned = 0;
  let skip_dirs = [
    "node_modules",
    ".git",
    "target",
    "dist",
    "build",
    "__pycache__",
    ".next",
  ];

  fn walk_dir(
    dir: &Path,
    query: &str,
    case_sensitive: bool,
    max_results: usize,
    results: &mut Vec<WorkspaceSearchResultItem>,
    files_scanned: &mut usize,
    skip_dirs: &[&str],
  ) -> Result<(), String> {
    if results.len() >= max_results {
      return Ok(());
    }
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
      let entry = entry.map_err(|e| e.to_string())?;
      let path = entry.path();
      if path.is_dir() {
        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
          if skip_dirs.contains(&name) {
            continue;
          }
        }
        walk_dir(
          &path,
          query,
          case_sensitive,
          max_results,
          results,
          files_scanned,
          skip_dirs,
        )?;
      } else if path.is_file() {
        if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
          if ![
            "js", "jsx", "ts", "tsx", "rs", "py", "go", "json", "md", "txt", "yml", "yaml", "toml",
            "css", "html", "sh", "bat", "ps1",
          ]
          .contains(&ext)
          {
            continue;
          }
        } else {
          continue;
        }
        *files_scanned += 1;
        if let Ok(content) = fs::read_to_string(&path) {
          let rel = path
            .strip_prefix(dir.parent().unwrap_or(dir))
            .unwrap_or(&path);
          for (line_idx, line) in content.lines().enumerate() {
            let search_line = if case_sensitive {
              line.to_string()
            } else {
              line.to_lowercase()
            };
            let search_query = if case_sensitive {
              query.to_string()
            } else {
              query.to_lowercase()
            };
            if search_line.contains(&search_query) {
              let match_count = search_line.matches(&search_query).count();
              results.push(WorkspaceSearchResultItem {
                file_path: path.to_string_lossy().to_string(),
                relative_path: rel.to_string_lossy().to_string(),
                line_number: line_idx + 1,
                line_content: line.chars().take(300).collect(),
                match_count,
              });
              if results.len() >= max_results {
                return Ok(());
              }
            }
          }
        }
      }
    }
    Ok(())
  }

  walk_dir(
    &root_abs,
    &query,
    case_sensitive,
    max_results,
    &mut results,
    &mut files_scanned,
    &skip_dirs,
  )?;
  let total_matches: usize = results.iter().map(|r| r.match_count).sum();

  Ok(WorkspaceSearchProof {
    query,
    case_sensitive,
    results,
    total_matches,
    files_scanned,
    searched_at_ms: now_ms(),
    trust: "verified".to_string(),
  })
}

#[tauri::command]
pub(crate) fn list_workspace_directory(
  workspace_root: String,
  relative_path: String,
  recursive: Option<bool>,
) -> Result<WorkspaceDirectoryProof, String> {
  let root = PathBuf::from(workspace_root.trim());
  if root.as_os_str().is_empty() {
    return Err("Workspace root is required.".to_string());
  }
  let root_abs = fs::canonicalize(&root).map_err(|e| e.to_string())?;
  let rel = Path::new(relative_path.trim());
  let dir_path = if rel.as_os_str().is_empty() {
    root_abs.clone()
  } else {
    if rel.is_absolute()
      || rel.components().any(|c| {
        matches!(
          c,
          Component::ParentDir | Component::Prefix(_) | Component::RootDir
        )
      })
    {
      return Err("Unsafe relative path rejected.".to_string());
    }
    root_abs.join(rel)
  };
  if !dir_path.exists() {
    return Err(format!("Directory not found: {}", dir_path.display()));
  }
  if !dir_path.is_dir() {
    return Err("Path is not a directory.".to_string());
  }
  let recursive = recursive.unwrap_or(false);
  let mut entries = Vec::new();
  let mut total_files = 0;
  let mut total_dirs = 0;
  let skip_dirs = [
    "node_modules",
    ".git",
    "target",
    "dist",
    "build",
    "__pycache__",
    ".next",
  ];

  fn walk_dir_entries(
    dir: &Path,
    root: &Path,
    recursive: bool,
    entries: &mut Vec<WorkspaceDirEntry>,
    total_files: &mut usize,
    total_dirs: &mut usize,
    skip_dirs: &[&str],
  ) -> Result<(), String> {
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
      let entry = entry.map_err(|e| e.to_string())?;
      let path = entry.path();
      let rel = path.strip_prefix(root).unwrap_or(&path);
      let metadata = entry.metadata().ok();
      let size_bytes = metadata.as_ref().map(|m| m.len()).unwrap_or(0);
      let modified_ms = metadata.as_ref().and_then(|m| m.modified().ok()).map(|t| {
        t.duration_since(UNIX_EPOCH)
          .map(|d| d.as_millis() as u64)
          .unwrap_or(0)
      });
      let is_dir = path.is_dir();
      let is_file = path.is_file();

      if is_dir {
        *total_dirs += 1;
        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
          if skip_dirs.contains(&name) {
            continue;
          }
        }
        entries.push(WorkspaceDirEntry {
          name: entry.file_name().to_string_lossy().to_string(),
          path: path.to_string_lossy().to_string(),
          relative_path: rel.to_string_lossy().to_string(),
          is_dir: true,
          is_file: false,
          size_bytes,
          modified_ms,
        });
        if recursive {
          walk_dir_entries(
            &path,
            root,
            recursive,
            entries,
            total_files,
            total_dirs,
            skip_dirs,
          )?;
        }
      } else if is_file {
        *total_files += 1;
        entries.push(WorkspaceDirEntry {
          name: entry.file_name().to_string_lossy().to_string(),
          path: path.to_string_lossy().to_string(),
          relative_path: rel.to_string_lossy().to_string(),
          is_dir: false,
          is_file: true,
          size_bytes,
          modified_ms,
        });
      }
    }
    Ok(())
  }

  walk_dir_entries(
    &dir_path,
    &root_abs,
    recursive,
    &mut entries,
    &mut total_files,
    &mut total_dirs,
    &skip_dirs,
  )?;

  Ok(WorkspaceDirectoryProof {
    directory_path: dir_path.to_string_lossy().to_string(),
    relative_path: rel.to_string_lossy().to_string(),
    entries,
    total_files,
    total_dirs,
    listed_at_ms: now_ms(),
    trust: "verified".to_string(),
  })
}

#[tauri::command]
pub(crate) fn scan_workspace_readiness(
  root: String,
  max_files: Option<u64>,
  max_findings: Option<u64>,
  proof_mode: Option<bool>,
) -> Result<WorkspaceReadinessScan, String> {
  let root_path = PathBuf::from(&root);
  let generated_at_ms = now_ms();
  let scan_started_at_ms = generated_at_ms;
  let max_files = max_files.unwrap_or(1200) as usize;
  let max_findings = max_findings.unwrap_or(240) as usize;
  let proof_mode = proof_mode.unwrap_or(false)
    || std::env::var("ALPHONSO_RC0_PROOF")
      .map(|value| value.trim() == "1")
      .unwrap_or(false)
    || std::env::var("ALPHONSO_SELFDEV_AUTORUN")
      .map(|value| value.trim() == "1")
      .unwrap_or(false);

  if !root_path.exists() || !root_path.is_dir() {
    return Ok(WorkspaceReadinessScan {
      root,
      generated_at_ms,
      files_scanned: 0,
      findings: vec![],
      placeholder_count: 0,
      todo_count: 0,
      setup_required_count: 0,
      blocked_count: 0,
      failed_count: 0,
      partial_count: 0,
      trust: "failed".to_string(),
      error: Some("Workspace root does not exist or is not a directory.".to_string()),
    });
  }

  if proof_mode {
    let proof_start = NativeProofStageProof {
      stage: "08_scan_progress".to_string(),
      status: "running".to_string(),
      timestamp: format!("{}", now_ms()),
      process_id: std::process::id(),
      workspace_root: root_path.display().to_string(),
      output_dir: "release/rc0".to_string(),
      proof_request_found: true,
      window_label: None,
      note: Some("Native proof scan branch entered.".to_string()),
      error: None,
      duration_ms: None,
    };
    let _ = write_native_proof_stage(
      Path::new("release/rc0"),
      "08_scan_progress.json",
      &proof_start,
    );
    return scan_readiness_target_paths(
      &root_path,
      readiness_proof_scan_targets(&root_path),
      generated_at_ms,
      max_files.min(80),
      max_findings,
    );
  }

  let mut stack = vec![root_path.clone()];
  let mut files_scanned = 0_u64;
  let mut findings: Vec<WorkspaceReadinessFinding> = vec![];
  let mut placeholder_count = 0_u64;
  let mut todo_count = 0_u64;
  let mut setup_required_count = 0_u64;
  let mut blocked_count = 0_u64;
  let mut failed_count = 0_u64;
  let mut partial_count = 0_u64;

  while let Some(dir) = stack.pop() {
    if readiness_scan_timed_out(scan_started_at_ms) {
      return Ok(WorkspaceReadinessScan {
        root,
        generated_at_ms,
        files_scanned,
        findings,
        placeholder_count,
        todo_count,
        setup_required_count,
        blocked_count,
        failed_count,
        partial_count,
        trust: "partial".to_string(),
        error: Some("Readiness scan time budget reached before traversal completed.".to_string()),
      });
    }

    if files_scanned as usize >= max_files {
      return Ok(WorkspaceReadinessScan {
        root,
        generated_at_ms,
        files_scanned,
        findings,
        placeholder_count,
        todo_count,
        setup_required_count,
        blocked_count,
        failed_count,
        partial_count,
        trust: "partial".to_string(),
        error: Some(format!(
          "Readiness scan stopped after max_files={max_files}."
        )),
      });
    }

    let entries = match fs::read_dir(&dir) {
      Ok(entries) => entries,
      Err(_) => continue,
    };
    let is_root_dir = dir == root_path;

    for entry in entries.flatten() {
      if readiness_scan_timed_out(scan_started_at_ms) {
        return Ok(WorkspaceReadinessScan {
          root,
          generated_at_ms,
          files_scanned,
          findings,
          placeholder_count,
          todo_count,
          setup_required_count,
          blocked_count,
          failed_count,
          partial_count,
          trust: "partial".to_string(),
          error: Some("Readiness scan time budget reached before traversal completed.".to_string()),
        });
      }

      let path = entry.path();
      let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else {
        continue;
      };

      if let Ok(file_type) = entry.file_type() {
        if file_type.is_symlink() {
          continue;
        }
      }

      if path.is_dir() {
        if readiness_should_skip_path(&path, file_name) {
          continue;
        }
        if is_root_dir && !readiness_is_allowed_top_level_dir(file_name) {
          continue;
        }
        stack.push(path);
        continue;
      }

      if !path.is_file() {
        continue;
      }

      if readiness_should_skip_path(&path, file_name) {
        continue;
      }

      let extension = readiness_file_extension(&path);
      if !matches!(
        extension.as_str(),
        "js"
          | "jsx"
          | "ts"
          | "tsx"
          | "rs"
          | "mjs"
          | "cjs"
          | "md"
          | "toml"
          | "json"
          | "yml"
          | "yaml"
          | "css"
          | "html"
      ) {
        continue;
      }

      if let Ok(metadata) = entry.metadata() {
        const MAX_READY_SCAN_BYTES: u64 = 512 * 1024;
        if metadata.len() > MAX_READY_SCAN_BYTES {
          continue;
        }
      }

      if files_scanned as usize >= max_files {
        return Ok(WorkspaceReadinessScan {
          root,
          generated_at_ms,
          files_scanned,
          findings,
          placeholder_count,
          todo_count,
          setup_required_count,
          blocked_count,
          failed_count,
          partial_count,
          trust: "partial".to_string(),
          error: Some(format!(
            "Readiness scan stopped after max_files={max_files}."
          )),
        });
      }

      files_scanned += 1;

      let content = match fs::read_to_string(&path) {
        Ok(content) => content,
        Err(_) => continue,
      };

      if readiness_scan_timed_out(scan_started_at_ms) {
        return Ok(WorkspaceReadinessScan {
          root,
          generated_at_ms,
          files_scanned,
          findings,
          placeholder_count,
          todo_count,
          setup_required_count,
          blocked_count,
          failed_count,
          partial_count,
          trust: "partial".to_string(),
          error: Some("Readiness scan time budget reached after reading a file batch.".to_string()),
        });
      }

      for (line_index, line) in content.lines().enumerate() {
        if findings.len() >= max_findings {
          break;
        }

        let Some((needle, kind, priority, severity)) = readiness_keyword_match(line) else {
          continue;
        };

        let line_number = (line_index + 1) as u64;
        let message = if needle == "setup required" || needle == "setup-required" {
          "Setup-required surface should be labeled clearly and backed by real checks.".to_string()
        } else if kind == "missing_approval" {
          "Approval gate is missing or not enforced; add Jose approval or truth-label the action."
            .to_string()
        } else if kind == "missing_receipt" {
          "Receipt-backed evidence is missing for a production-facing action.".to_string()
        } else if kind == "updater_blocker" {
          "Updater or release path is blocked and should not imply completion.".to_string()
        } else if kind == "connector_blocker" {
          "Connector path is blocked and should be marked setup_required until real provider proof exists.".to_string()
        } else if kind == "not_wired" {
          "Surface is explicitly marked as not wired; keep it disabled or implement the real path."
            .to_string()
        } else if kind == "fake" || kind == "simulation" {
          "Production-facing surface should not imply fake or simulated execution.".to_string()
        } else if kind == "placeholder" || kind == "scaffold" || kind == "demo" || kind == "mock" {
          "Production-facing surface should be replaced with real behavior or explicitly setup-required state.".to_string()
        } else {
          "Code review marker remains in the workspace and should be resolved or tracked."
            .to_string()
        };

        findings.push(WorkspaceReadinessFinding {
          id: format!(
            "ready-{}-{}-{}",
            findings.len() + 1,
            files_scanned,
            line_number
          ),
          path: path.to_string_lossy().to_string(),
          line_number,
          surface: readiness_surface_for_path(&path),
          kind: kind.to_string(),
          priority: priority.to_string(),
          severity: severity.to_string(),
          message,
          excerpt: line.trim().chars().take(180).collect(),
        });

        match kind {
          "placeholder" | "scaffold" | "demo" | "mock" | "not_wired" | "fake" | "simulated" => {
            placeholder_count += 1;
          }
          "todo" => {
            todo_count += 1;
          }
          "setup_required" => {
            setup_required_count += 1;
          }
          _ => {}
        }

        if priority == "P0" {
          blocked_count += 1;
        } else if priority == "P1" {
          partial_count += 1;
        } else if priority == "P2" && kind == "todo" {
          failed_count += 0;
        }
      }

      if findings.len() >= max_findings || files_scanned as usize >= max_files {
        break;
      }
    }

    if findings.len() >= max_findings || files_scanned as usize >= max_files {
      break;
    }
  }

  let trust = if blocked_count > 0 {
    "failed"
  } else if placeholder_count > 0 || setup_required_count > 0 {
    "partial"
  } else {
    "verified"
  }
  .to_string();

  Ok(WorkspaceReadinessScan {
    root,
    generated_at_ms,
    files_scanned,
    findings,
    placeholder_count,
    todo_count,
    setup_required_count,
    blocked_count,
    failed_count,
    partial_count,
    trust,
    error: None,
  })
}

#[tauri::command]
pub(crate) fn inspect_updater_release(
  bundle_dir: String,
  manifest_dir: String,
) -> Result<ReleaseArtifactProof, String> {
  let bundle_path = PathBuf::from(&bundle_dir);
  let manifest_path = PathBuf::from(&manifest_dir).join("latest.json");

  if !bundle_path.exists() || !bundle_path.is_dir() {
    return Ok(ReleaseArtifactProof {
      bundle_dir,
      manifest_dir,
      installer_path: None,
      installer_found: false,
      signature_path: None,
      signature_found: false,
      latest_json_path: Some(manifest_path.to_string_lossy().to_string()),
      latest_json_found: manifest_path.exists(),
      manifest_valid: false,
      manifest_version: None,
      manifest_url: None,
      manifest_signature: None,
      trust: "failed".to_string(),
      error: Some("Updater bundle directory does not exist or is not a directory.".to_string()),
    });
  }

  let mut installer_candidates: Vec<(PathBuf, u64)> = vec![];
  for entry in fs::read_dir(&bundle_path).map_err(|error| error.to_string())? {
    let entry = entry.map_err(|error| error.to_string())?;
    let path = entry.path();
    if !path.is_file() {
      continue;
    }
    let file_name = path
      .file_name()
      .and_then(|name| name.to_str())
      .unwrap_or("");
    if !file_name.ends_with("-setup.exe") {
      continue;
    }
    let modified_at_ms = fs::metadata(&path)
      .ok()
      .and_then(|meta| meta.modified().ok())
      .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
      .map(|duration| duration.as_millis() as u64)
      .unwrap_or(0);
    installer_candidates.push((path, modified_at_ms));
  }
  installer_candidates.sort_by_key(|b| std::cmp::Reverse(b.1));

  let installer_path = installer_candidates.first().map(|(path, _)| path.clone());
  let signature_path = installer_path
    .as_ref()
    .map(|path| PathBuf::from(format!("{}.sig", path.to_string_lossy())));
  let installer_found = installer_path
    .as_ref()
    .map(|path| path.exists() && path.is_file())
    .unwrap_or(false);
  let signature_found = signature_path
    .as_ref()
    .map(|path| path.exists() && path.is_file())
    .unwrap_or(false);
  let latest_json_found = manifest_path.exists() && manifest_path.is_file();

  let mut manifest_valid = false;
  let mut manifest_version = None;
  let mut manifest_url = None;
  let mut manifest_signature = None;
  let mut manifest_error = None;

  if latest_json_found {
    match fs::read_to_string(&manifest_path) {
      Ok(raw) => match serde_json::from_str::<Value>(&raw) {
        Ok(json) => {
          manifest_version = json
            .get("version")
            .and_then(|value| value.as_str())
            .map(|value| value.to_string());
          let platform = json
            .get("platforms")
            .and_then(|value| value.get("windows-x86_64"));
          manifest_signature = platform
            .and_then(|value| value.get("signature"))
            .and_then(|value| value.as_str())
            .map(|value| value.to_string());
          manifest_url = platform
            .and_then(|value| value.get("url"))
            .and_then(|value| value.as_str())
            .map(|value| value.to_string());
          manifest_valid = manifest_version.is_some()
            && manifest_signature
              .as_ref()
              .map(|value| !value.trim().is_empty())
              .unwrap_or(false)
            && manifest_url
              .as_ref()
              .map(|value| !value.trim().is_empty())
              .unwrap_or(false);
          if !manifest_valid {
            manifest_error = Some(
              "latest.json is present but missing required version, url, or signature fields."
                .to_string(),
            );
          }
        }
        Err(error) => {
          manifest_error = Some(format!("latest.json could not be parsed: {error}"));
        }
      },
      Err(error) => {
        manifest_error = Some(format!("latest.json could not be read: {error}"));
      }
    }
  }

  let trust = if installer_found && signature_found && manifest_valid {
    "verified"
  } else if latest_json_found || installer_found || signature_found {
    "partial"
  } else {
    "failed"
  }
  .to_string();

  Ok(ReleaseArtifactProof {
    bundle_dir,
    manifest_dir,
    installer_path: installer_path.map(|path| path.to_string_lossy().to_string()),
    installer_found,
    signature_path: signature_path.map(|path| path.to_string_lossy().to_string()),
    signature_found,
    latest_json_path: Some(manifest_path.to_string_lossy().to_string()),
    latest_json_found,
    manifest_valid,
    manifest_version,
    manifest_url,
    manifest_signature,
    trust,
    error: manifest_error,
  })
}

/// Transcribe an audio file using the locally installed Whisper CLI.
/// Whisper must be installed via Runtime Hub (pip install openai-whisper).
/// Returns the full transcript text.
#[tauri::command]
pub(crate) async fn transcribe_audio_file(
  audio_path: String,
  model: Option<String>,
) -> Result<String, String> {
  let model_name = model.as_deref().unwrap_or("base");

  // Resolve whisper exe: prefer venv inside runtimes/whisper/, then PATH
  let whisper_dir = runtimes_dir().join("whisper");
  let whisper_exe = {
    let venv_bin = if cfg!(target_os = "windows") {
      whisper_dir.join("venv").join("Scripts").join("whisper.exe")
    } else {
      whisper_dir.join("venv").join("bin").join("whisper")
    };
    if venv_bin.exists() {
      venv_bin.to_string_lossy().to_string()
    } else {
      "whisper".to_string() // fall back to PATH
    }
  };

  let out_dir = std::env::temp_dir();

  let output = tokio::process::Command::new(&whisper_exe)
    .args([
      &audio_path,
      "--model", model_name,
      "--output_format", "txt",
      "--output_dir", out_dir.to_str().unwrap_or("."),
    ])
    .output()
    .await
    .map_err(|e| format!("Failed to run whisper: {e}. Install it via Runtime Hub."))?;

  if !output.status.success() {
    let stderr = String::from_utf8_lossy(&output.stderr);
    return Err(format!("Whisper error: {stderr}"));
  }

  // Whisper writes {stem}.txt next to the output dir
  let audio_stem = Path::new(&audio_path)
    .file_stem()
    .unwrap_or_default()
    .to_string_lossy()
    .to_string();
  let txt_path = out_dir.join(format!("{audio_stem}.txt"));
  std::fs::read_to_string(&txt_path)
    .map_err(|e| format!("Could not read whisper output at {}: {e}", txt_path.display()))
}

// ── Inbox file watcher commands ───────────────────────────────────────────────

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct InboxFileProof {
  pub(crate) relative_path: String,
  pub(crate) filename: String,
  pub(crate) bytes: u64,
  pub(crate) modified_at_ms: u64,
  pub(crate) trust: String,
}

/// Poll the inbox directory and return a list of unprocessed files.
/// A file is considered "unprocessed" if it does NOT have a .processed suffix.
#[tauri::command]
pub(crate) fn watch_inbox_poll(
  workspace_root: String,
  inbox_path: String,
) -> Result<Vec<InboxFileProof>, String> {
  let root = PathBuf::from(&workspace_root);
  let inbox = if Path::new(&inbox_path).is_absolute() {
    PathBuf::from(&inbox_path)
  } else {
    root.join(&inbox_path)
  };

  if !inbox.exists() {
    return Ok(vec![]);
  }

  let mut files = Vec::new();
  let entries = fs::read_dir(&inbox).map_err(|e| format!("Failed to read inbox: {e}"))?;

  for entry in entries.flatten() {
    let path = entry.path();
    if !path.is_file() { continue; }

    let filename = path.file_name().unwrap_or_default().to_string_lossy().to_string();

    // Skip already-processed files
    if filename.ends_with(".processed") { continue; }

    let meta = fs::metadata(&path).map_err(|e| format!("Failed to stat {}: {e}", path.display()))?;
    let modified_at_ms = meta
      .modified()
      .ok()
      .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
      .map(|d| d.as_millis() as u64)
      .unwrap_or(0);

    let relative_path = path
      .strip_prefix(&root)
      .unwrap_or(&path)
      .to_string_lossy()
      .to_string();

    files.push(InboxFileProof {
      relative_path,
      filename,
      bytes: meta.len(),
      modified_at_ms,
      trust: "verified".to_string(),
    });
  }

  Ok(files)
}

/// Mark an inbox file as processed by renaming it with a .processed suffix.
#[tauri::command]
pub(crate) fn mark_inbox_file_processed(
  workspace_root: String,
  inbox_path: String,
  relative_path: String,
) -> Result<WorkspaceWriteProof, String> {
  let root = PathBuf::from(&workspace_root);
  let source = if Path::new(&relative_path).is_absolute() {
    PathBuf::from(&relative_path)
  } else {
    root.join(&relative_path)
  };

  if !source.exists() {
    return Err(format!("File not found: {}", source.display()));
  }

  let new_name = format!("{}.processed", source.file_name().unwrap_or_default().to_string_lossy());
  let dest = source.with_file_name(new_name);

  fs::rename(&source, &dest).map_err(|e| format!("Failed to rename {}: {e}", source.display()))?;

  let now = now_ms();
  Ok(WorkspaceWriteProof {
    file_path: dest.to_string_lossy().to_string(),
    relative_path: dest.strip_prefix(&root).unwrap_or(&dest).to_string_lossy().to_string(),
    written: true,
    written_at_ms: now,
    bytes: 0,
    trust: "verified".to_string(),
  })
}
