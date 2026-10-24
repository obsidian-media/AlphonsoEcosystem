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

/// A card with under 8 GB makes smaller, shorter clips (phase 3d), unless the user chooses full size.
pub(crate) fn small_card(vram_gb: Option<f64>) -> bool {
  vram_gb.is_some_and(|v| v < 8.0)
}

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
  small_card: bool,
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
    small_card: small_card(vram_gb),
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

/// A model that isn't a video model but is installed the same way (phase 4c): the character
/// reference model, and later the local motion model.
pub(crate) struct ExtraModel {
  pub id: &'static str,
  pub name: &'static str,
  pub min_vram_gb: f64,
  pub license: &'static str,
  pub files: &'static [ModelFile],
}

/// Keeps a brand's character with ComfyUI (phase 4c): Stable Diffusion 2.1 unCLIP (the smaller
/// ViT-L one) runs on ComfyUI's own nodes (unCLIPCheckpointLoader, CLIPVisionEncode,
/// unCLIPConditioning) from reference pictures. Pinned 2026-10-24 from the Hugging Face API
/// (Comfy-Org/stable-diffusion-2.1-unclip at a fixed commit, size and LFS SHA-256).
pub(crate) const CHARACTER_REFERENCE_MODEL: ExtraModel = ExtraModel {
  id: "sd21_unclip_l",
  name: "Character reference (Stable Diffusion 2.1 unCLIP)",
  min_vram_gb: 4.0,
  license: "CreativeML Open RAIL++-M",
  files: &[ModelFile {
    url: "https://huggingface.co/Comfy-Org/stable-diffusion-2.1-unclip/resolve/e1d3c1d908a938cafccd1c915b76c11f0d6639e7/sd21-unclip-l.ckpt",
    sha256: "ed12098385701c1850defd3d2bc20905c7c64dad3ccad895a7f13b406aab7602",
    size: 6_161_550_731,
    subfolder: "checkpoints",
    filename: "sd21-unclip-l.ckpt",
  }],
};

fn files_installed(root: &Path, files: &[ModelFile]) -> bool {
  files.iter().all(|f| {
    std::fs::metadata(model_path(root, f))
      .map(|m| m.len() == f.size)
      .unwrap_or(false)
  })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtraModelInfo {
  id: &'static str,
  name: &'static str,
  min_vram_gb: f64,
  license: &'static str,
  size_bytes: u64,
  installed: bool,
  vram_gb: Option<f64>,
  comfyui_dir: Option<String>,
}

pub(crate) async fn extra_model_info(
  model: &ExtraModel,
  saved_dir: Option<String>,
) -> ExtraModelInfo {
  let root = comfyui_root(saved_dir);
  ExtraModelInfo {
    id: model.id,
    name: model.name,
    min_vram_gb: model.min_vram_gb,
    license: model.license,
    size_bytes: model.files.iter().map(|f| f.size).sum(),
    installed: root
      .as_ref()
      .map(|r| files_installed(r, model.files))
      .unwrap_or(false),
    vram_gb: gpu_memory_gb().await,
    comfyui_dir: root.as_ref().map(|r| r.to_string_lossy().to_string()),
  }
}

/// Downloads a model's files into the user's ComfyUI (skips files already there with the pinned size).
pub(crate) async fn install_files(
  app: &AppHandle,
  saved_dir: Option<String>,
  tool: &str,
  name: &str,
  files: &[ModelFile],
) -> Result<(), String> {
  let root = comfyui_root(saved_dir).ok_or_else(|| {
    "No ComfyUI was found. Install it in Runtime Hub or choose yours in Settings.".to_string()
  })?;
  let count = files.len();
  for (index, file) in files.iter().enumerate() {
    let dest = model_path(&root, file);
    if std::fs::metadata(&dest)
      .map(|m| m.len() == file.size)
      .unwrap_or(false)
    {
      continue;
    }
    crate::runtime_manager::download_verified(
      app,
      tool,
      file.url,
      &dest,
      file.sha256,
      file.size,
      &crate::runtime_manager::DownloadNote {
        label: &format!("{name} (file {} of {count})", index + 1),
        from: (index * 100 / count) as u8,
        span: (100 / count) as u8,
      },
    )
    .await?;
  }
  Ok(())
}

#[tauri::command]
pub async fn comfyui_reference_model(saved_dir: Option<String>) -> ExtraModelInfo {
  extra_model_info(&CHARACTER_REFERENCE_MODEL, saved_dir).await
}

#[tauri::command]
pub async fn comfyui_install_reference_model(
  app: AppHandle,
  saved_dir: Option<String>,
) -> Result<(), String> {
  install_files(
    &app,
    saved_dir,
    "comfyui-reference",
    CHARACTER_REFERENCE_MODEL.name,
    CHARACTER_REFERENCE_MODEL.files,
  )
  .await
}

/// Motion transfer on this computer (phase 4c): Wan 2.1 VACE 1.3B follows a control video
/// (the motion clip's edges, from ComfyUI's own Canny node) with the scene picture as its
/// reference, on ComfyUI's own nodes (WanVaceToVideo). Pinned 2026-10-24 from the Hugging Face
/// API (Comfy-Org/Wan-2.1, the Wan_2.1_ComfyUI_repackaged files at a fixed commit, Apache-2.0);
/// the text encoder is the same file the Wan 2.2 clip model uses.
pub(crate) const LOCAL_MOTION_MODEL: ExtraModel = ExtraModel {
  id: "wan21_vace_1_3b",
  name: "Motion transfer (Wan 2.1 VACE 1.3B)",
  min_vram_gb: 8.0,
  license: "Apache-2.0",
  files: &[
    ModelFile {
      url: "https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/123acf1cc74bccbb9bfff8ac1ee72edc08c2341d/split_files/diffusion_models/wan2.1_vace_1.3B_fp16.safetensors",
      sha256: "640ccc0577e6a5d4bb15cd91b11b699ef914fc55f126c5a1c544e152130784f2",
      size: 4_309_519_800,
      subfolder: "diffusion_models",
      filename: "wan2.1_vace_1.3B_fp16.safetensors",
    },
    ModelFile {
      url: "https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/123acf1cc74bccbb9bfff8ac1ee72edc08c2341d/split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors",
      sha256: "c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68",
      size: 6_735_906_897,
      subfolder: "text_encoders",
      filename: "umt5_xxl_fp8_e4m3fn_scaled.safetensors",
    },
    ModelFile {
      url: "https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/123acf1cc74bccbb9bfff8ac1ee72edc08c2341d/split_files/vae/wan_2.1_vae.safetensors",
      sha256: "2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b",
      size: 253_815_318,
      subfolder: "vae",
      filename: "wan_2.1_vae.safetensors",
    },
  ],
};

#[tauri::command]
pub async fn comfyui_motion_model(saved_dir: Option<String>) -> ExtraModelInfo {
  extra_model_info(&LOCAL_MOTION_MODEL, saved_dir).await
}

#[tauri::command]
pub async fn comfyui_install_motion_model(
  app: AppHandle,
  saved_dir: Option<String>,
) -> Result<(), String> {
  install_files(
    &app,
    saved_dir,
    "comfyui-motion",
    LOCAL_MOTION_MODEL.name,
    LOCAL_MOTION_MODEL.files,
  )
  .await
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

  #[test]
  fn small_card_under_8gb() {
    assert!(small_card(Some(6.0)));
    assert!(small_card(Some(7.9)));
    assert!(!small_card(Some(8.0)));
    assert!(!small_card(None));
  }

  #[test]
  fn the_character_reference_model_is_pinned() {
    let m = &CHARACTER_REFERENCE_MODEL;
    assert_eq!(m.files.len(), 1);
    for f in m.files {
      assert_eq!(f.sha256.len(), 64);
      assert!(f.sha256.chars().all(|c| c.is_ascii_hexdigit()));
      assert!(f.size > 1_000_000_000);
      assert!(
        f.url.starts_with("https://huggingface.co/")
          && f
            .url
            .contains("/resolve/e1d3c1d908a938cafccd1c915b76c11f0d6639e7/")
      );
      assert!(f.url.ends_with(f.filename));
      assert_eq!(f.subfolder, "checkpoints");
    }
  }

  #[test]
  fn the_local_motion_model_is_pinned_and_shares_the_text_encoder() {
    let m = &LOCAL_MOTION_MODEL;
    assert_eq!(m.files.len(), 3);
    for f in m.files {
      assert_eq!(f.sha256.len(), 64);
      assert!(
        f.url
          .contains("/resolve/123acf1cc74bccbb9bfff8ac1ee72edc08c2341d/")
          && f.url.ends_with(f.filename)
      );
    }
    let shared = VIDEO_MODELS
      .iter()
      .flat_map(|v| v.files.iter())
      .find(|f| f.filename == "umt5_xxl_fp8_e4m3fn_scaled.safetensors")
      .unwrap();
    let ours = m
      .files
      .iter()
      .find(|f| f.filename == shared.filename)
      .unwrap();
    assert_eq!(
      (ours.sha256, ours.size, ours.subfolder),
      (shared.sha256, shared.size, shared.subfolder)
    );
  }
}
