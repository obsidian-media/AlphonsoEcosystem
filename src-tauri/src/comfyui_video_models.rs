//! Video models for Miya's AI clips (content factory phase 2b): a short
//! catalogue of image-to-video models that run on ComfyUI's own nodes, the
//! one that fits this computer's graphics card, and installing one into the
//! user's ComfyUI (pinned files, size and SHA-256 checked).
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

pub(crate) struct ModelFile {
  pub url: &'static str,
  pub sha256: &'static str,
  pub size: u64,
  /// Under `<ComfyUI>/models/`.
  pub subfolder: &'static str,
  pub filename: &'static str,
}

pub(crate) struct VideoModel {
  pub id: &'static str,
  pub name: &'static str,
  pub min_vram_gb: f64,
  pub max_seconds: f64,
  pub fps: u32,
  pub license: &'static str,
  pub files: &'static [ModelFile],
}

/// Pinned 2026-10-23 from the Hugging Face API (sizes and LFS SHA-256).
pub(crate) const VIDEO_MODELS: &[VideoModel] = &[
  VideoModel {
    id: "ltx_video_2b",
    name: "LTX-Video 2B (fast, for smaller cards)",
    min_vram_gb: 6.0,
    max_seconds: 5.0,
    fps: 24,
    license: "LTX-Video Open Weights License: free; companies with $10M or more yearly revenue need Lightricks' paid license",
    files: &[
      ModelFile {
        url: "https://huggingface.co/Lightricks/LTX-Video/resolve/8984fa25007f376c1a299016d0957a37a2f797bb/ltxv-2b-0.9.8-distilled-fp8.safetensors",
        sha256: "d6d8fa8ed3a98346787c2503ac80fb5d7cebcf80e356b79a2ba361fbadf97e15",
        size: 4_461_695_684,
        subfolder: "checkpoints",
        filename: "ltxv-2b-0.9.8-distilled-fp8.safetensors",
      },
      ModelFile {
        url: "https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/6af2a98e3f615bdfa612fbd85da93d1ed5f69ef5/t5xxl_fp8_e4m3fn.safetensors",
        sha256: "7d330da4816157540d6bb7838bf63a0f02f573fc48ca4d8de34bb0cbfd514f09",
        size: 4_893_934_904,
        subfolder: "text_encoders",
        filename: "t5xxl_fp8_e4m3fn.safetensors",
      },
    ],
  },
  VideoModel {
    id: "wan22_ti2v_5b",
    name: "Wan 2.2 5B (better motion, 8 GB or more)",
    min_vram_gb: 8.0,
    max_seconds: 5.0,
    fps: 24,
    license: "Apache License 2.0",
    files: &[
      ModelFile {
        url: "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/ee6f4a40737a995bf5818954cfce6d59443b0f04/split_files/diffusion_models/wan2.2_ti2v_5B_fp16.safetensors",
        sha256: "456f901338bd9eadbded3828b819109a9b68e8a525ca5cf8d0049a69fcfeca1e",
        size: 9_999_658_848,
        subfolder: "diffusion_models",
        filename: "wan2.2_ti2v_5B_fp16.safetensors",
      },
      ModelFile {
        url: "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/ee6f4a40737a995bf5818954cfce6d59443b0f04/split_files/vae/wan2.2_vae.safetensors",
        sha256: "e40321bd36b9709991dae2530eb4ac303dd168276980d3e9bc4b6e2b75fed156",
        size: 1_409_400_960,
        subfolder: "vae",
        filename: "wan2.2_vae.safetensors",
      },
      ModelFile {
        url: "https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/123acf1cc74bccbb9bfff8ac1ee72edc08c2341d/split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors",
        sha256: "c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68",
        size: 6_735_906_897,
        subfolder: "text_encoders",
        filename: "umt5_xxl_fp8_e4m3fn_scaled.safetensors",
      },
    ],
  },
];

/// The largest model that fits the card; none without an NVIDIA card or
/// below the smallest model's need (Runway is the way then).
pub(crate) fn suggest_video_model(vram_gb: Option<f64>) -> Option<&'static str> {
  let vram = vram_gb?;
  VIDEO_MODELS
    .iter()
    .filter(|m| vram >= m.min_vram_gb)
    .max_by(|a, b| a.min_vram_gb.total_cmp(&b.min_vram_gb))
    .map(|m| m.id)
}

/// The first card's memory in MiB from
/// `nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits`.
pub(crate) fn parse_gpu_memory_mib(output: &str) -> Option<u32> {
  output
    .lines()
    .find(|l| !l.trim().is_empty())?
    .trim()
    .parse()
    .ok()
}

/// The graphics card's memory in GB, or None (no NVIDIA card, or no answer in 5 s).
pub(crate) async fn gpu_memory_gb() -> Option<f64> {
  let mut cmd = tokio::process::Command::new("nvidia-smi");
  cmd
    .args(["--query-gpu=memory.total", "--format=csv,noheader,nounits"])
    .kill_on_drop(true);
  crate::utils::no_window_async(&mut cmd);
  let output = tokio::time::timeout(std::time::Duration::from_secs(5), cmd.output())
    .await
    .ok()?
    .ok()?;
  if !output.status.success() {
    return None;
  }
  parse_gpu_memory_mib(&String::from_utf8_lossy(&output.stdout)).map(|mib| mib as f64 / 1024.0)
}

fn model_path(root: &Path, file: &ModelFile) -> PathBuf {
  root.join("models").join(file.subfolder).join(file.filename)
}

/// Every file is there with its pinned size.
pub(crate) fn model_installed(root: &Path, model: &VideoModel) -> bool {
  model.files.iter().all(|f| {
    std::fs::metadata(model_path(root, f))
      .map(|m| m.len() == f.size)
      .unwrap_or(false)
  })
}

/// The ComfyUI the user chose, else the best one found.
fn comfyui_root(saved_dir: Option<String>) -> Option<PathBuf> {
  crate::comfyui_installs::comfyui_find_installs(saved_dir)
    .into_iter()
    .next()
    .map(|i| PathBuf::from(i.path))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoModelInfo {
  id: &'static str,
  name: &'static str,
  min_vram_gb: f64,
  max_seconds: f64,
  fps: u32,
  license: &'static str,
  size_bytes: u64,
  installed: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoModelsInfo {
  vram_gb: Option<f64>,
  suggested: Option<&'static str>,
  comfyui_dir: Option<String>,
  models: Vec<VideoModelInfo>,
}

#[tauri::command]
pub async fn comfyui_video_models(saved_dir: Option<String>) -> VideoModelsInfo {
  let vram_gb = gpu_memory_gb().await;
  let root = comfyui_root(saved_dir);
  VideoModelsInfo {
    vram_gb,
    suggested: suggest_video_model(vram_gb),
    comfyui_dir: root.as_ref().map(|r| r.to_string_lossy().to_string()),
    models: VIDEO_MODELS
      .iter()
      .map(|m| VideoModelInfo {
        id: m.id,
        name: m.name,
        min_vram_gb: m.min_vram_gb,
        max_seconds: m.max_seconds,
        fps: m.fps,
        license: m.license,
        size_bytes: m.files.iter().map(|f| f.size).sum(),
        installed: root
          .as_ref()
          .map(|r| model_installed(r, m))
          .unwrap_or(false),
      })
      .collect(),
  }
}

/// Downloads a model's files into the user's ComfyUI (skips files already there).
#[tauri::command]
pub async fn comfyui_install_video_model(
  app: AppHandle,
  saved_dir: Option<String>,
  id: String,
) -> Result<(), String> {
  let model = VIDEO_MODELS
    .iter()
    .find(|m| m.id == id)
    .ok_or_else(|| "Unknown video model.".to_string())?;
  let root = comfyui_root(saved_dir).ok_or_else(|| {
    "No ComfyUI was found. Install it in Runtime Hub or choose yours in Settings.".to_string()
  })?;
  let count = model.files.len();
  for (index, file) in model.files.iter().enumerate() {
    let dest = model_path(&root, file);
    if std::fs::metadata(&dest)
      .map(|m| m.len() == file.size)
      .unwrap_or(false)
    {
      continue;
    }
    crate::runtime_manager::download_verified(
      &app,
      "comfyui-video",
      file.url,
      &dest,
      file.sha256,
      file.size,
      &crate::runtime_manager::DownloadNote {
        label: &format!("{} (file {} of {count})", model.name, index + 1),
        from: (index * 100 / count) as u8,
        span: (100 / count) as u8,
      },
    )
    .await?;
  }
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn reads_the_cards_memory() {
    assert_eq!(parse_gpu_memory_mib("6144\n"), Some(6144));
    assert_eq!(parse_gpu_memory_mib("\n 12288 \n8192\n"), Some(12288));
    assert_eq!(parse_gpu_memory_mib("No devices were found"), None);
    assert_eq!(parse_gpu_memory_mib(""), None);
  }

  #[test]
  fn suggests_the_largest_model_that_fits() {
    assert_eq!(suggest_video_model(Some(6.0)), Some("ltx_video_2b"));
    assert_eq!(suggest_video_model(Some(7.9)), Some("ltx_video_2b"));
    assert_eq!(suggest_video_model(Some(12.0)), Some("wan22_ti2v_5b"));
    assert_eq!(suggest_video_model(Some(24.0)), Some("wan22_ti2v_5b"));
    assert_eq!(suggest_video_model(Some(4.0)), None);
    assert_eq!(suggest_video_model(None), None);
  }

  #[test]
  fn every_file_is_pinned() {
    for model in VIDEO_MODELS {
      assert!(!model.files.is_empty());
      for f in model.files {
        assert_eq!(f.sha256.len(), 64, "{}", f.filename);
        assert!(f.sha256.chars().all(|c| c.is_ascii_hexdigit()));
        assert!(f.size > 0);
        assert!(f.url.starts_with("https://huggingface.co/"));
        assert!(f.url.ends_with(f.filename));
        assert!(
          !f.filename.contains('/') && !f.filename.contains('\\') && !f.filename.contains("..")
        );
        assert!(["checkpoints", "text_encoders", "diffusion_models", "vae"].contains(&f.subfolder));
      }
    }
  }

  #[test]
  fn installed_means_every_file_at_its_size() {
    let root = std::env::temp_dir().join(format!("alphonso-video-models-{}", std::process::id()));
    let model = &VIDEO_MODELS[0];
    assert!(!model_installed(&root, model));
    std::fs::remove_dir_all(&root).ok();
  }
}
