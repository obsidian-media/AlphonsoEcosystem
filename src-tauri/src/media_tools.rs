//! Media tools for the Miya content factory (phase 2a): the bundled ffmpeg,
//! and whether the Runtime Hub tools the video steps use are installed.
//!
//! ffmpeg ships in the Windows installer (an LGPL build staged by
//! scripts/fetch-ffmpeg.mjs into the "ffmpeg" resource folder, installed next
//! to the app's .exe like the bundled Ollama). Elsewhere, or in a dev build
//! without it, ffmpeg is found on the PATH.
use serde::{Deserialize, Serialize};
use std::path::{Component, Path, PathBuf};
use tauri::{AppHandle, Manager};

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

/// A folder inside the workspace (created if needed). Refuses absolute paths,
/// `..`, and anything under `.git`; symlinks cannot lead outside.
pub(crate) fn checked_dir(workspace_root: &str, relative: &str) -> Result<PathBuf, String> {
  let root = PathBuf::from(workspace_root.trim());
  if root.as_os_str().is_empty() {
    return Err("Workspace root is required.".to_string());
  }
  let root_abs = std::fs::canonicalize(&root).map_err(|e| e.to_string())?;
  let rel = Path::new(relative.trim());
  if rel.as_os_str().is_empty()
    || rel.is_absolute()
    || rel.components().any(|c| {
      matches!(
        c,
        Component::ParentDir | Component::Prefix(_) | Component::RootDir
      )
    })
  {
    return Err("Unsafe relative path rejected.".to_string());
  }
  if crate::workspace::rel_touches_git_dir(rel) {
    return Err("Writes inside .git are not allowed.".to_string());
  }
  let dir = root_abs.join(rel);
  let resolved = crate::workspace::resolve_through_existing_ancestor(&dir);
  if !resolved.starts_with(&root_abs) {
    return Err("Path traversal detected: resolved path escapes workspace sandbox.".to_string());
  }
  std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
  Ok(dir)
}

/// A Kokoro voice id: two letters (accent and gender), an underscore, a name.
pub(crate) fn valid_voice_id(voice: &str) -> bool {
  let mut parts = voice.splitn(2, '_');
  let prefix = parts.next().unwrap_or("");
  let name = parts.next().unwrap_or("");
  prefix.len() == 2
    && prefix.chars().all(|c| c.is_ascii_lowercase())
    && !name.is_empty()
    && name.len() <= 32
    && name.chars().all(|c| c.is_ascii_lowercase())
}

/// Kokoro's model files, downloaded by Runtime Hub's install (phase 2a).
pub(crate) const KOKORO_MODEL_FILE: &str = "kokoro-v1.0.onnx";
pub(crate) const KOKORO_VOICES_FILE: &str = "voices-v1.0.bin";

/// The arguments for the speak script. The lines are in the job file, never here.
fn kokoro_args(script: &Path, job: &Path, models: &Path) -> Vec<String> {
  vec![
    script.to_string_lossy().to_string(),
    "--job".to_string(),
    job.to_string_lossy().to_string(),
    "--model".to_string(),
    models.join(KOKORO_MODEL_FILE).to_string_lossy().to_string(),
    "--voices".to_string(),
    models
      .join(KOKORO_VOICES_FILE)
      .to_string_lossy()
      .to_string(),
  ]
}

fn venv_python_of(tool: &str) -> PathBuf {
  let dir = crate::runtime_manager::tool_dir(tool);
  if cfg!(target_os = "windows") {
    dir.join("venv").join("Scripts").join("python.exe")
  } else {
    dir.join("venv").join("bin").join("python3")
  }
}

/// A bundled helper script (`voice/content/<name>`) next to Voice OS's backend.
fn content_script(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
  let path = app
    .path()
    .resource_dir()
    .map_err(|e| format!("Failed to resolve resource dir: {e}"))?
    .join("voice")
    .join("content")
    .join(name);
  if path.is_file() {
    return Ok(path);
  }
  // A dev build runs from the repository.
  let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
    .join("..")
    .join("voice")
    .join("content")
    .join(name);
  if dev.is_file() {
    Ok(dev)
  } else {
    Err(format!(
      "The helper script {name} is missing from this install."
    ))
  }
}

/// Runs a helper script with a tool's Python and reads its one JSON line.
async fn run_script(
  python: &Path,
  args: &[String],
  limit_secs: u64,
) -> Result<serde_json::Value, String> {
  let mut cmd = tokio::process::Command::new(python);
  cmd.args(args).kill_on_drop(true);
  crate::utils::no_window_async(&mut cmd);
  let output = tokio::time::timeout(std::time::Duration::from_secs(limit_secs), cmd.output())
    .await
    .map_err(|_| format!("Stopped after {} minutes.", limit_secs / 60))?
    .map_err(|e| e.to_string())?;
  let stdout = String::from_utf8_lossy(&output.stdout);
  let last = stdout
    .lines()
    .rev()
    .find(|l| l.trim_start().starts_with('{'))
    .unwrap_or("");
  serde_json::from_str(last).map_err(|_| {
    let err = String::from_utf8_lossy(&output.stderr);
    let tail: String = err.lines().rev().take(3).collect::<Vec<_>>().join(" | ");
    format!("The helper script gave no result. {tail}")
  })
}

#[derive(Deserialize, Serialize)]
pub struct SpeakLine {
  id: String,
  text: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeakRequest {
  workspace_root: String,
  out_dir: String,
  voice_id: String,
  speed: Option<f64>,
  lines: Vec<SpeakLine>,
}

/// The project's voice-over (phase 2a): one WAV per line, read by Kokoro.
#[tauri::command]
pub async fn content_tts_kokoro(
  app: AppHandle,
  request: SpeakRequest,
) -> Result<serde_json::Value, String> {
  if !valid_voice_id(&request.voice_id) {
    return Err("That is not a Kokoro voice name.".to_string());
  }
  let python = venv_python_of("kokoro");
  let models = crate::runtime_manager::tool_dir("kokoro").join("models");
  if !python.is_file() || !models.join(KOKORO_MODEL_FILE).is_file() {
    return Ok(
      serde_json::json!({ "ok": false, "error": "Kokoro is not installed. Install it in Runtime Hub." }),
    );
  }
  let out = checked_dir(&request.workspace_root, &request.out_dir)?;
  let job = out.join(".kokoro-job.json");
  let body = serde_json::json!({
    "voice": request.voice_id,
    "speed": request.speed.unwrap_or(1.0).clamp(0.5, 2.0),
    "outDir": out.to_string_lossy(),
    "lines": request.lines,
  });
  std::fs::write(&job, body.to_string()).map_err(|e| e.to_string())?;
  let script = content_script(&app, "kokoro_speak.py")?;
  let result = run_script(&python, &kokoro_args(&script, &job, &models), 600).await;
  let _ = std::fs::remove_file(&job);
  result
}

/// A file path inside the workspace with one of `extensions`; its folder is
/// checked (and created) like `checked_dir`.
pub(crate) fn checked_file(
  workspace_root: &str,
  relative: &str,
  extensions: &[&str],
) -> Result<PathBuf, String> {
  let rel = Path::new(relative.trim());
  let name = rel
    .file_name()
    .and_then(|n| n.to_str())
    .ok_or_else(|| "A file name is required.".to_string())?;
  let ext = Path::new(name)
    .extension()
    .and_then(|e| e.to_str())
    .map(|e| e.to_ascii_lowercase())
    .unwrap_or_default();
  if !extensions.contains(&ext.as_str()) {
    return Err(format!(
      "Only {} files can be written here.",
      extensions.join(", ")
    ));
  }
  let parent = rel
    .parent()
    .filter(|p| !p.as_os_str().is_empty())
    .ok_or_else(|| "A folder is required.".to_string())?;
  Ok(checked_dir(workspace_root, &parent.to_string_lossy())?.join(name))
}

pub(crate) const AUDIOCRAFT_MISSING: &str =
  "AudioCraft is not installed. Install it in Runtime Hub to add music.";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicRequest {
  workspace_root: String,
  out_path: String,
  prompt: String,
  seconds: f64,
}

/// A music bed for the video (phase 2a), from MusicGen small in AudioCraft's
/// Runtime Hub environment. The app frees Ollama's graphics memory first.
#[tauri::command]
pub async fn content_music_generate(
  app: AppHandle,
  request: MusicRequest,
) -> Result<serde_json::Value, String> {
  let python = venv_python_of("audiocraft");
  if !python.is_file() {
    return Ok(serde_json::json!({ "ok": false, "missing": true, "error": AUDIOCRAFT_MISSING }));
  }
  let out = checked_file(&request.workspace_root, &request.out_path, &["wav"])?;
  let job = out.with_extension("job.json");
  let prompt: String = request.prompt.chars().take(300).collect();
  let body = serde_json::json!({ "prompt": prompt, "seconds": request.seconds.clamp(5.0, 300.0), "outPath": out.to_string_lossy() });
  std::fs::write(&job, body.to_string()).map_err(|e| e.to_string())?;
  let script = content_script(&app, "musicgen_generate.py")?;
  let args = vec![
    script.to_string_lossy().to_string(),
    "--job".to_string(),
    job.to_string_lossy().to_string(),
  ];
  let result = run_script(&python, &args, 1200).await;
  let _ = std::fs::remove_file(&job);
  result
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

  fn temp_root(tag: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("alphonso-media-{tag}-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    dir
  }

  #[test]
  fn refuses_a_folder_outside_the_workspace() {
    let root = temp_root("outside");
    let root_s = root.to_string_lossy().to_string();
    assert!(checked_dir(&root_s, "../elsewhere").is_err());
    assert!(checked_dir(&root_s, "C:\\Windows").is_err() || cfg!(not(windows)));
    assert!(checked_dir(&root_s, ".git/hooks").is_err());
    std::fs::remove_dir_all(&root).ok();
  }

  #[test]
  fn makes_a_folder_with_spaces_and_accents() {
    let root = temp_root("accents");
    let dir = checked_dir(&root.to_string_lossy(), "My Brand/Café ideas/audio").unwrap();
    assert!(dir.is_dir());
    std::fs::remove_dir_all(&root).ok();
  }

  #[test]
  fn accepts_only_plain_voice_names() {
    assert!(valid_voice_id("af_heart"));
    assert!(valid_voice_id("bm_george"));
    assert!(!valid_voice_id("af_heart --model x"));
    assert!(!valid_voice_id("../af"));
    assert!(!valid_voice_id("heart"));
  }

  #[test]
  fn the_line_text_is_never_an_argument() {
    let args = kokoro_args(
      Path::new("speak.py"),
      Path::new("job.json"),
      Path::new("models"),
    );
    assert_eq!(args[1..3], ["--job".to_string(), "job.json".to_string()]);
    assert!(args.iter().all(|a| !a.contains("Hello")));
    assert!(args.last().unwrap().ends_with(KOKORO_VOICES_FILE));
  }

  #[test]
  fn a_written_file_must_be_inside_the_workspace_and_of_the_right_kind() {
    let root = temp_root("files");
    let root_s = root.to_string_lossy().to_string();
    assert!(
      checked_file(&root_s, "brand/p/audio/music-v1.wav", &["wav"])
        .unwrap()
        .ends_with("music-v1.wav")
    );
    assert!(checked_file(&root_s, "brand/p/audio/music-v1.exe", &["wav"]).is_err());
    assert!(checked_file(&root_s, "../music.wav", &["wav"]).is_err());
    assert!(checked_file(&root_s, "music.wav", &["wav"]).is_err());
    std::fs::remove_dir_all(&root).ok();
  }
}
