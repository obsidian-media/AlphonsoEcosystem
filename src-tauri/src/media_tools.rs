//! Media tools for the Miya content factory (phase 2a): the bundled ffmpeg,
//! and whether the Runtime Hub tools the video steps use are installed.
//!
//! ffmpeg ships in the Windows installer (an LGPL build staged by
//! scripts/fetch-ffmpeg.mjs into the "ffmpeg" resource folder, installed next
//! to the app's .exe like the bundled Ollama). Elsewhere, or in a dev build
//! without it, ffmpeg is found on the PATH.
use serde::Serialize;
use std::path::{Path, PathBuf};

fn exe_name(name: &str) -> String {
  if cfg!(target_os = "windows") {
    format!("{name}.exe")
  } else {
    name.to_string()
  }
}

/// The first `name` executable on the PATH (no process is started).
fn on_path(name: &str) -> Option<PathBuf> {
  let file = exe_name(name);
  std::env::var_os("PATH").and_then(|paths| {
    std::env::split_paths(&paths)
      .map(|dir| dir.join(&file))
      .find(|candidate| candidate.is_file())
  })
}

/// The bundled copy in `bundled_dir` first, then whatever `lookup` finds.
fn resolve_media_tool(
  bundled_dir: Option<&Path>,
  name: &str,
  lookup: impl Fn(&str) -> Option<PathBuf>,
) -> Option<PathBuf> {
  if let Some(dir) = bundled_dir {
    let candidate = dir.join(exe_name(name));
    if candidate.is_file() {
      return Some(candidate);
    }
  }
  lookup(name)
}

fn bundled_ffmpeg_dir() -> Option<PathBuf> {
  let exe_dir = std::env::current_exe().ok()?.parent()?.to_path_buf();
  Some(exe_dir.join("ffmpeg"))
}

pub(crate) fn ffmpeg_path() -> Option<PathBuf> {
  resolve_media_tool(bundled_ffmpeg_dir().as_deref(), "ffmpeg", on_path)
}

pub(crate) fn ffprobe_path() -> Option<PathBuf> {
  resolve_media_tool(bundled_ffmpeg_dir().as_deref(), "ffprobe", on_path)
}

fn venv_installed(tool: &str) -> bool {
  let dir = crate::runtime_manager::tool_dir(tool);
  let python = if cfg!(target_os = "windows") {
    dir.join("venv").join("Scripts").join("python.exe")
  } else {
    dir.join("venv").join("bin").join("python3")
  };
  python.is_file()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaToolsStatus {
  ffmpeg: Option<String>,
  ffprobe: Option<String>,
  kokoro: bool,
  audiocraft: bool,
  whisper: bool,
}

/// What the video steps can use right now.
#[tauri::command]
pub fn media_tools_status() -> MediaToolsStatus {
  MediaToolsStatus {
    ffmpeg: ffmpeg_path().map(|p| p.to_string_lossy().to_string()),
    ffprobe: ffprobe_path().map(|p| p.to_string_lossy().to_string()),
    kokoro: venv_installed("kokoro"),
    audiocraft: venv_installed("audiocraft"),
    whisper: venv_installed("whisper"),
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn prefers_the_bundled_copy() {
    let dir = std::env::temp_dir().join(format!("alphonso-media-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let bundled = dir.join(exe_name("ffmpeg"));
    std::fs::write(&bundled, b"x").unwrap();
    let found = resolve_media_tool(Some(&dir), "ffmpeg", |_| Some(PathBuf::from("elsewhere")));
    assert_eq!(found, Some(bundled));
    std::fs::remove_dir_all(&dir).ok();
  }

  #[test]
  fn falls_back_to_the_path_when_not_bundled() {
    let dir = std::env::temp_dir().join(format!("alphonso-media-empty-{}", std::process::id()));
    let found = resolve_media_tool(Some(&dir), "ffprobe", |name| {
      Some(PathBuf::from(format!("path/{name}")))
    });
    assert_eq!(found, Some(PathBuf::from("path/ffprobe")));
  }

  #[test]
  fn none_when_neither_has_it() {
    assert_eq!(resolve_media_tool(None, "ffmpeg", |_| None), None);
  }
}
