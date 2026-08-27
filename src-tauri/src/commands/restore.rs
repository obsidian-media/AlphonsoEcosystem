use crate::workspace;
use crate::{app_data_subdir, now_ms};
use serde::Serialize;
use std::fs;
use std::path::Path;

#[derive(Serialize)]
pub(crate) struct RestorePointProof {
  snapshot_id: String,
  file_path: String,
  written: bool,
  written_at_ms: u64,
  trust: String,
}

#[derive(Serialize)]
pub(crate) struct HandoffExportProof {
  file_path: String,
  written: bool,
  written_at_ms: u64,
  bytes: usize,
  trust: String,
}

#[tauri::command]
pub(crate) fn record_restore_point(
  app: tauri::AppHandle,
  snapshot_id: String,
  payload: String,
) -> Result<RestorePointProof, String> {
  let dir = app_data_subdir(&app, "recovery")?;

  let mut file_path = dir.clone();
  file_path.push(format!("{snapshot_id}.json"));
  fs::write(&file_path, payload).map_err(|error| error.to_string())?;

  Ok(RestorePointProof {
    snapshot_id,
    file_path: file_path.to_string_lossy().to_string(),
    written: true,
    written_at_ms: now_ms(),
    trust: "verified".to_string(),
  })
}

#[tauri::command]
pub(crate) fn write_handoff_export_file(
  workspace_root: String,
  file_name: String,
  content: String,
) -> Result<HandoffExportProof, String> {
  let safe_name = Path::new(file_name.trim())
    .file_name()
    .and_then(|value| value.to_str())
    .filter(|value| !value.trim().is_empty())
    .unwrap_or("alphonso-self-development.md")
    .replace(['/', '\\'], "_");
  let proof = workspace::write_workspace_text_file(
    workspace_root,
    format!("docs/handoff/{safe_name}"),
    content,
  )?;
  Ok(HandoffExportProof {
    file_path: proof.file_path,
    written: proof.written,
    written_at_ms: proof.written_at_ms,
    bytes: proof.bytes,
    trust: proof.trust,
  })
}
