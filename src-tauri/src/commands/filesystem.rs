use crate::now_ms;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FolderPickProof {
  path: String,
  picked: bool,
  picked_at_ms: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SaveImageProof {
  path: String,
  saved: bool,
  saved_at_ms: u64,
}

pub(crate) fn comfyui_shared_root(dir: &Path) -> Option<PathBuf> {
  let desktop_root = dir.parent()?.parent()?.parent()?;
  let shared = desktop_root.join("ComfyUI-Shared");
  shared.exists().then_some(shared)
}

pub(crate) fn write_comfyui_extra_model_paths_config(
  shared_root: &Path,
) -> Result<PathBuf, String> {
  let models_root = shared_root.join("models");
  let yaml = format!(
    concat!(
      "alphonso:\n",
      "  checkpoints: {}\n",
      "  classifiers: {}\n",
      "  clip_vision: {}\n",
      "  configs: {}\n",
      "  controlnet: {}\n",
      "  diffusion_models: {}\n",
      "  embeddings: {}\n",
      "  hypernetworks: {}\n",
      "  loras: {}\n",
      "  upscale_models: {}\n",
      "  vae: {}\n",
      "  vae_approx: {}\n",
      "  clip: {}\n",
      "  unet: {}\n"
    ),
    models_root.join("checkpoints").display(),
    models_root.join("classifiers").display(),
    models_root.join("clip_vision").display(),
    models_root.join("configs").display(),
    models_root.join("controlnet").display(),
    models_root.join("diffusion_models").display(),
    models_root.join("embeddings").display(),
    models_root.join("hypernetworks").display(),
    models_root.join("loras").display(),
    models_root.join("upscale_models").display(),
    models_root.join("vae").display(),
    models_root.join("vae_approx").display(),
    models_root.join("clip").display(),
    models_root.join("unet").display()
  );
  let path = std::env::temp_dir().join("alphonso-comfyui-extra-model-paths.yaml");
  fs::write(&path, yaml).map_err(|e| e.to_string())?;
  Ok(path)
}

#[tauri::command]
pub(crate) fn write_temp_audio_file(filename: String, bytes: Vec<u8>) -> Result<String, String> {
  let ext = std::path::Path::new(&filename)
    .extension()
    .unwrap_or_default()
    .to_string_lossy()
    .to_lowercase();
  let safe_ext = if ["mp3", "wav", "m4a", "mp4", "ogg", "webm", "flac"].contains(&ext.as_str()) {
    ext
  } else {
    "wav".into()
  };
  let dest = std::env::temp_dir().join(format!("alphonso_audio_{}.{}", now_ms(), safe_ext));
  std::fs::write(&dest, &bytes).map_err(|e| e.to_string())?;
  Ok(dest.to_string_lossy().to_string())
}

/// Open a file-picker dialog and return the selected file path.
/// Uses tauri-plugin-dialog (native OS dialog, no PowerShell required).
#[tauri::command]
pub(crate) async fn pick_file(
  app: tauri::AppHandle,
  filters: Option<Vec<String>>,
) -> Result<String, String> {
  use tauri_plugin_dialog::DialogExt;
  let _ = filters;
  let path = app
    .dialog()
    .file()
    .add_filter(
      "Audio files",
      &["mp3", "wav", "m4a", "mp4", "ogg", "webm", "flac"],
    )
    .add_filter("All files", &["*"])
    .blocking_pick_file();
  match path {
    Some(p) => Ok(p.to_string()),
    None => Err("cancelled".to_string()),
  }
}

#[tauri::command]
pub(crate) async fn pick_folder(app: tauri::AppHandle) -> Result<FolderPickProof, String> {
  use tauri_plugin_dialog::DialogExt;
  let path = app.dialog().file().blocking_pick_folder();
  let picked = path.is_some();
  Ok(FolderPickProof {
    path: path.map(|p| p.to_string()).unwrap_or_default(),
    picked,
    picked_at_ms: now_ms(),
  })
}

#[tauri::command]
pub(crate) fn save_image_to_folder(
  base64_data: String,
  filename: String,
  folder: String,
) -> Result<SaveImageProof, String> {
  let folder = folder.trim().to_string();
  if folder.is_empty() {
    return Err("No output folder configured".to_string());
  }
  let filename = filename.trim().to_string();
  if filename.is_empty() {
    return Err("No filename configured".to_string());
  }

  // Path traversal protection: reject any path component that is ParentDir
  if std::path::Path::new(&folder)
    .components()
    .any(|c| matches!(c, std::path::Component::ParentDir))
  {
    return Err("Unsafe folder path rejected".to_string());
  }
  if std::path::Path::new(&filename)
    .components()
    .any(|c| matches!(c, std::path::Component::ParentDir))
  {
    return Err("Unsafe filename rejected".to_string());
  }

  let raw = base64_data
    .trim_start_matches("data:image/png;base64,")
    .trim_start_matches("data:image/jpeg;base64,")
    .to_string();
  let path = std::path::Path::new(&folder).join(&filename);
  let path_str = path.to_string_lossy().to_string();
  // Decode base64 in Rust — no shell involved, eliminates injection risk on all platforms.
  use base64::Engine as _;
  let bytes = base64::engine::general_purpose::STANDARD
    .decode(raw.as_bytes())
    .map_err(|e| format!("base64 decode error: {e}"))?;
  std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
  Ok(SaveImageProof {
    path: path_str,
    saved: true,
    saved_at_ms: now_ms(),
  })
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn save_image_to_folder_rejects_parent_dir_in_folder() {
    let result = save_image_to_folder(
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8=".to_string(),
      "test.png".to_string(),
      "../output".to_string(),
    );
    assert!(result.is_err());
    match result {
      Err(msg) => assert_eq!(msg, "Unsafe folder path rejected"),
      Ok(_) => panic!("Expected error"),
    }
  }

  #[test]
  fn save_image_to_folder_rejects_parent_dir_in_filename() {
    let result = save_image_to_folder(
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8=".to_string(),
      "../test.png".to_string(),
      "output".to_string(),
    );
    assert!(result.is_err());
    match result {
      Err(msg) => assert_eq!(msg, "Unsafe filename rejected"),
      Ok(_) => panic!("Expected error"),
    }
  }

  #[test]
  fn save_image_to_folder_accepts_safe_paths() {
    let temp_dir = std::env::temp_dir();
    let temp_path = temp_dir.join("test_save");
    std::fs::create_dir_all(&temp_path).unwrap();

    let result = save_image_to_folder(
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8=".to_string(),
      "test.png".to_string(),
      temp_path.to_string_lossy().to_string(),
    );
    assert!(result.is_ok());
    let proof = result.unwrap();
    assert!(proof.path.ends_with("test.png"));
    assert!(std::path::Path::new(&proof.path).exists());
    std::fs::remove_file(&proof.path).unwrap();
  }
}
