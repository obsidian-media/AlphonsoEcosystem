//! Media tools for the Miya content factory (phase 2a): the bundled ffmpeg,
//! and whether the Runtime Hub tools the video steps use are installed.
//!
//! ffmpeg ships in the Windows installer and the Linux AppImage (an LGPL build
//! staged by scripts/fetch-ffmpeg.mjs into the "ffmpeg" resource folder; on
//! Linux its programs are in ffmpeg/bin/ with their libraries in ffmpeg/lib/).
//! On macOS, or in a dev build without it, ffmpeg is found on the PATH.
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
    // Windows keeps the programs at the top; the Linux build keeps them in bin/.
    for candidate in [
      dir.join(exe_name(name)),
      dir.join("bin").join(exe_name(name)),
    ] {
      if candidate.is_file() {
        return Some(candidate);
      }
    }
  }
  lookup(name)
}

fn bundled_ffmpeg_dir() -> Option<PathBuf> {
  crate::utils::bundled_resource("ffmpeg")
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
  /// How to get ffmpeg on this computer, only while it isn't found (closing phase).
  ffmpeg_help: Option<String>,
  kokoro: bool,
  audiocraft: bool,
  whisper: bool,
}

/// How to get ffmpeg when it isn't found, for this kind of computer (closing phase,
/// owner 2026-10-30): the Windows installer and the Linux AppImage include it; a Mac
/// gets it from Homebrew.
pub(crate) fn ffmpeg_missing_for(os: &str) -> &'static str {
  match os {
    "macos" => "Install it with Homebrew (brew.sh): open Terminal and run brew install ffmpeg, then try again.",
    "windows" => "Reinstall Alphonso to put it back; the installer includes it.",
    _ => "Install it with your package manager (for example sudo apt install ffmpeg), then try again.",
  }
}

pub(crate) fn ffmpeg_not_found() -> String {
  format!(
    "ffmpeg wasn't found. {}",
    ffmpeg_missing_for(std::env::consts::OS)
  )
}

/// What the video steps can use right now.
#[tauri::command]
pub fn media_tools_status() -> MediaToolsStatus {
  MediaToolsStatus {
    ffmpeg: ffmpeg_path().map(|p| p.to_string_lossy().to_string()),
    ffprobe: ffprobe_path().map(|p| p.to_string_lossy().to_string()),
    ffmpeg_help: ffmpeg_path()
      .is_none()
      .then(|| ffmpeg_missing_for(std::env::consts::OS).to_string()),
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
#[serde(rename_all = "camelCase")]
pub struct SpeakLine {
  id: String,
  text: String,
  /// A scene with nothing to say: this much silence in the full track.
  #[serde(default)]
  pause_sec: Option<f64>,
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
    return Ok(kokoro_missing());
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

pub(crate) const KOKORO_MISSING: &str = "Kokoro is not installed. Install Kokoro in Runtime Hub.";

/// Kokoro isn't installed (agent roles Part C2): the voice step reads the `missing` flag, not the words.
pub(crate) fn kokoro_missing() -> serde_json::Value {
  serde_json::json!({ "ok": false, "missing": true, "error": KOKORO_MISSING })
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

/// A search address and the header (name, value) that carries its key, if any.
type StockSearchCall = (reqwest::Url, Option<(&'static str, String)>);

/// The search request for one stock source (phase 2a). Fixed endpoints only;
/// the key goes in the source's own place (a header, or Pixabay's query).
fn stock_search_request(
  source: &str,
  query: &str,
  orientation: &str,
  api_key: &str,
) -> Result<StockSearchCall, String> {
  let query: String = query.chars().take(100).collect();
  let portrait = orientation == "portrait";
  match source {
    "pexels" => {
      let url = reqwest::Url::parse_with_params(
        "https://api.pexels.com/v1/videos/search",
        &[
          ("query", query.as_str()),
          (
            "orientation",
            if portrait { "portrait" } else { "landscape" },
          ),
          ("per_page", "15"),
        ],
      )
      .map_err(|e| e.to_string())?;
      Ok((url, Some(("Authorization", api_key.to_string()))))
    }
    "pixabay" => {
      let url = reqwest::Url::parse_with_params(
        "https://pixabay.com/api/videos/",
        &[
          ("key", api_key),
          ("q", query.as_str()),
          ("per_page", "15"),
          ("safesearch", "true"),
        ],
      )
      .map_err(|e| e.to_string())?;
      Ok((url, None))
    }
    "coverr" => {
      let url = reqwest::Url::parse_with_params(
        "https://api.coverr.co/videos",
        &[
          ("query", query.as_str()),
          ("page_size", "15"),
          ("urls", "true"),
        ],
      )
      .map_err(|e| e.to_string())?;
      Ok((url, Some(("Authorization", format!("Bearer {api_key}")))))
    }
    _ => Err("Unknown stock footage source.".to_string()),
  }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StockSearchRequest {
  source: String,
  query: String,
  orientation: String,
  api_key: Option<String>,
}

/// Searches one stock footage source (the app window cannot reach them).
#[tauri::command]
pub async fn content_stock_search(
  request: StockSearchRequest,
) -> Result<serde_json::Value, String> {
  let env_name = match request.source.as_str() {
    "pexels" => "PEXELS_API_KEY",
    "pixabay" => "PIXABAY_API_KEY",
    "coverr" => "COVERR_API_KEY",
    _ => return Err("Unknown stock footage source.".to_string()),
  };
  let key = crate::utils::secret_or_env(request.api_key, env_name);
  if key.is_empty() {
    return Err(format!("No {} key is set.", request.source));
  }
  let (url, header) =
    stock_search_request(&request.source, &request.query, &request.orientation, &key)?;
  let client = reqwest::Client::builder()
    .timeout(std::time::Duration::from_secs(30))
    .build()
    .map_err(|e| e.to_string())?;
  let mut call = client.get(url);
  if let Some((name, value)) = header {
    call = call.header(name, value);
  }
  let response = call.send().await.map_err(|e| e.to_string())?;
  if !response.status().is_success() {
    return Err(format!(
      "{} answered HTTP {}.",
      request.source,
      response.status().as_u16()
    ));
  }
  response.json().await.map_err(|e| e.to_string())
}

/// Where stock clips may be downloaded from (each redirect is checked too).
pub(crate) fn allowed_media_host(host: &str) -> bool {
  let host = host.to_ascii_lowercase();
  [
    "pexels.com",
    "vimeo.com",
    "vimeocdn.com",
    "pixabay.com",
    "coverr.co",
  ]
  .iter()
  .any(|domain| host == *domain || host.ends_with(&format!(".{domain}")))
}

pub(crate) const MAX_MEDIA_BYTES: u64 = 300 * 1024 * 1024;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadRequest {
  workspace_root: String,
  url: String,
  rel_path: String,
  /// For Coverr: the clip id, so the download is counted as Coverr requires.
  coverr_id: Option<String>,
  api_key: Option<String>,
}

/// Downloads a stock clip into the project folder (https, the stock hosts
/// only, at most 300 MB; written as .part, then renamed).
#[tauri::command]
pub async fn content_download_media(request: DownloadRequest) -> Result<serde_json::Value, String> {
  use tokio::io::AsyncWriteExt;
  let dest = checked_file(
    &request.workspace_root,
    &request.rel_path,
    &["mp4", "mov", "webm"],
  )?;
  let client = reqwest::Client::builder()
    .redirect(reqwest::redirect::Policy::none())
    .timeout(std::time::Duration::from_secs(600))
    .build()
    .map_err(|e| e.to_string())?;
  let mut current = reqwest::Url::parse(&request.url).map_err(|e| e.to_string())?;
  let mut response = None;
  for _ in 0..6 {
    if current.scheme() != "https" || !current.host_str().map(allowed_media_host).unwrap_or(false) {
      return Err("That address is not an allowed stock footage host.".to_string());
    }
    let reply = client
      .get(current.clone())
      .send()
      .await
      .map_err(|e| e.to_string())?;
    if reply.status().is_redirection() {
      let next = reply
        .headers()
        .get(reqwest::header::LOCATION)
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| "A redirect had no address.".to_string())?;
      current = current.join(next).map_err(|e| e.to_string())?;
      continue;
    }
    response = Some(reply);
    break;
  }
  let response = response.ok_or_else(|| "Too many redirects.".to_string())?;
  if !response.status().is_success() {
    return Err(format!(
      "The download answered HTTP {}.",
      response.status().as_u16()
    ));
  }
  if response.content_length().unwrap_or(0) > MAX_MEDIA_BYTES {
    return Err("The clip is larger than 300 MB.".to_string());
  }
  let part = dest.with_extension("part");
  let mut file = tokio::fs::File::create(&part)
    .await
    .map_err(|e| e.to_string())?;
  let mut response = response;
  let mut bytes: u64 = 0;
  while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
    bytes += chunk.len() as u64;
    if bytes > MAX_MEDIA_BYTES {
      drop(file);
      let _ = tokio::fs::remove_file(&part).await;
      return Err("The clip is larger than 300 MB.".to_string());
    }
    file.write_all(&chunk).await.map_err(|e| e.to_string())?;
  }
  file.flush().await.map_err(|e| e.to_string())?;
  drop(file);
  tokio::fs::rename(&part, &dest)
    .await
    .map_err(|e| e.to_string())?;
  // Coverr requires each download to be counted.
  if let Some(id) = request.coverr_id.filter(|id| {
    id.chars()
      .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
  }) {
    let key = crate::utils::secret_or_env(request.api_key, "COVERR_API_KEY");
    if !key.is_empty() {
      let _ = reqwest::Client::new()
        .patch(format!("https://api.coverr.co/videos/{id}/stats/downloads"))
        .header("Authorization", format!("Bearer {key}"))
        .send()
        .await;
    }
  }
  Ok(serde_json::json!({ "ok": true, "path": dest.to_string_lossy(), "bytes": bytes }))
}

// ── Assembly (phase 2a) ────────────────────────────────────────────────────

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AssemblyScene {
  /// A stock clip, relative to the workspace.
  clip: Option<String>,
  /// The scene's picture, relative to the workspace.
  picture: Option<String>,
  /// The brand colour for a scene with neither (#rrggbb).
  card_color: Option<String>,
  seconds: f64,
  /// An AI clip (phase 2b), relative to the workspace: plays first, for `ai_seconds`.
  #[serde(default)]
  ai_clip: Option<String>,
  #[serde(default)]
  ai_seconds: Option<f64>,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AssemblySpec {
  workspace_root: String,
  /// The project's output folder, relative to the workspace.
  out_dir: String,
  version: u32,
  scenes: Vec<AssemblyScene>,
  /// The full voice track, relative to the workspace.
  voice: String,
  voice_seconds: f64,
  music: Option<String>,
  /// The captions (SRT), relative to the workspace.
  srt: String,
  caption_color: Option<String>,
  outline_color: Option<String>,
  /// Which shapes to make (phase 3d: a Short is `["9x16"]`); both when not given.
  #[serde(default)]
  aspects: Option<Vec<String>>,
  /// A Short's file name without the shape (`v1` → `v1.mp4`) when one shape is made.
  #[serde(default)]
  output_stem: Option<String>,
  /// The brand's font for the captions (phase 4a); Arial when not set or not installed.
  #[serde(default)]
  font: Option<String>,
  /// Sound effects (phase 4b): each starts at its scene's start, about 12 dB under the voice.
  #[serde(default)]
  sfx: Vec<AssemblySfx>,
}

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AssemblySfx {
  path: String,
  at_sec: f64,
}

/// The shapes this assembly makes, in the usual order.
pub(crate) fn chosen_aspects(spec: &AssemblySpec) -> Vec<(&'static str, u32, u32)> {
  match &spec.aspects {
    None => ASPECTS.to_vec(),
    Some(wanted) => ASPECTS
      .iter()
      .copied()
      .filter(|(a, _, _)| wanted.iter().any(|w| w == a))
      .collect(),
  }
}

/// The finished file's name (and its frames' prefix) for one shape.
pub(crate) fn output_stem(spec: &AssemblySpec, aspect: &str) -> String {
  let single = chosen_aspects(spec).len() == 1;
  match spec.output_stem.as_deref().map(str::trim) {
    Some(stem)
      if single
        && !stem.is_empty()
        && stem
          .chars()
          .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') =>
    {
      stem.to_string()
    }
    _ => format!("v{}-{aspect}", spec.version),
  }
}

/// One ffmpeg run: its arguments and the folder it runs in.
#[derive(Debug, PartialEq)]
pub(crate) struct FfmpegRun {
  pub(crate) cwd: PathBuf,
  pub(crate) args: Vec<String>,
}

const FPS: u32 = 30;
const ASPECTS: [(&str, u32, u32); 2] = [("16x9", 1920, 1080), ("9x16", 1080, 1920)];

/// "#rrggbb" → "0xrrggbb" for ffmpeg's colour source; anything else → a dark grey.
fn ffmpeg_color(hex: Option<&str>) -> String {
  match hex.map(str::trim) {
    Some(h)
      if h.len() == 7 && h.starts_with('#') && h[1..].chars().all(|c| c.is_ascii_hexdigit()) =>
    {
      format!("0x{}", &h[1..])
    }
    _ => "0x202020".to_string(),
  }
}

/// "#rrggbb" → ASS's "&H00BBGGRR".
fn ass_color(hex: Option<&str>, fallback: &str) -> String {
  match hex.map(str::trim) {
    Some(h)
      if h.len() == 7 && h.starts_with('#') && h[1..].chars().all(|c| c.is_ascii_hexdigit()) =>
    {
      format!("&H00{}{}{}", &h[5..7], &h[3..5], &h[1..3]).to_uppercase()
    }
    _ => fallback.to_string(),
  }
}

fn s(value: impl ToString) -> String {
  value.to_string()
}

pub(crate) enum SegmentSource<'a> {
  Clip(&'a str),
  Picture(&'a str),
  Card(Option<&'a str>),
}

pub(crate) struct Segment<'a> {
  pub(crate) name: String,
  pub(crate) source: SegmentSource<'a>,
  pub(crate) seconds: f64,
}

/// What each scene is made of, in order: an AI clip first (phase 2b) for its
/// length, then the stock clip, picture or colour card for the rest.
pub(crate) fn assembly_segments(spec: &AssemblySpec) -> Vec<Segment<'_>> {
  let mut segments = Vec::new();
  for (i, scene) in spec.scenes.iter().enumerate() {
    let base = if let Some(clip) = &scene.clip {
      SegmentSource::Clip(clip)
    } else if let Some(picture) = &scene.picture {
      SegmentSource::Picture(picture)
    } else {
      SegmentSource::Card(scene.card_color.as_deref())
    };
    let mut rest = scene.seconds;
    if let (Some(ai), Some(ai_seconds)) = (&scene.ai_clip, scene.ai_seconds) {
      if ai_seconds > 0.0 {
        let first = ai_seconds.min(scene.seconds);
        segments.push(Segment {
          name: format!("seg-{i:03}-ai.mp4"),
          source: SegmentSource::Clip(ai),
          seconds: first,
        });
        rest = scene.seconds - first;
      }
    }
    if rest >= 0.05 {
      segments.push(Segment {
        name: format!("seg-{i:03}.mp4"),
        source: base,
        seconds: rest,
      });
    }
  }
  segments
}

/// The first input that is not an existing file inside the workspace, if any.
pub(crate) fn missing_input(root: &Path, spec: &AssemblySpec) -> Option<String> {
  spec
    .scenes
    .iter()
    .flat_map(|sc| [sc.clip.as_ref(), sc.picture.as_ref(), sc.ai_clip.as_ref()])
    .flatten()
    .chain([&spec.voice, &spec.srt])
    .chain(spec.music.iter())
    .chain(spec.sfx.iter().map(|fx| &fx.path))
    .find(|rel| {
      let path = root.join(rel);
      !path.is_file()
        || !crate::workspace::resolve_through_existing_ancestor(&path).starts_with(root)
    })
    .cloned()
}

/// Every ffmpeg run for one output, in order: one segment per scene, the
/// join, then the final mix with captions. Inputs are absolute paths (each
/// its own argument, so spaces and accents are safe); the final run uses the
/// work folder as its current folder so the subtitle file is a plain name.
pub(crate) fn build_assembly_runs(
  root: &Path,
  work: &Path,
  output_name: &str,
  spec: &AssemblySpec,
  width: u32,
  height: u32,
) -> Vec<FfmpegRun> {
  let size = format!("{width}x{height}");
  let mut runs = Vec::new();
  for segment in assembly_segments(spec) {
    let seconds = format!("{:.3}", segment.seconds.max(0.5));
    let mut args: Vec<String> = vec![s("-y"), s("-hide_banner"), s("-loglevel"), s("error")];
    let filter = match segment.source {
      SegmentSource::Clip(clip) => {
        // Looped if shorter than the segment, then trimmed to it.
        args.extend([
          s("-stream_loop"),
          s("-1"),
          s("-i"),
          root.join(clip).to_string_lossy().to_string(),
        ]);
        format!("scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height},fps={FPS},format=yuv420p")
      }
      SegmentSource::Picture(picture) => {
        args.extend([
          s("-loop"),
          s("1"),
          s("-i"),
          root.join(picture).to_string_lossy().to_string(),
        ]);
        let frames = (segment.seconds.max(0.5) * FPS as f64).round() as u32;
        // A slow zoom (about 12 % over the segment) on a picture twice the size.
        format!(
          "scale={w2}:{h2}:force_original_aspect_ratio=increase,crop={w2}:{h2},zoompan=z='min(zoom+0.0008,1.12)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={frames}:s={size}:fps={FPS},format=yuv420p",
          w2 = width * 2,
          h2 = height * 2,
        )
      }
      SegmentSource::Card(color) => {
        args.extend([
          s("-f"),
          s("lavfi"),
          s("-i"),
          format!("color=c={}:s={size}:r={FPS}", ffmpeg_color(color)),
        ]);
        s("format=yuv420p")
      }
    };
    args.extend([
      s("-t"),
      seconds,
      s("-vf"),
      filter,
      s("-an"),
      s("-c:v"),
      s("libopenh264"),
      s("-b:v"),
      s("6M"),
      work.join(&segment.name).to_string_lossy().to_string(),
    ]);
    runs.push(FfmpegRun {
      cwd: work.to_path_buf(),
      args,
    });
  }
  runs.push(FfmpegRun {
    cwd: work.to_path_buf(),
    args: vec![
      s("-y"),
      s("-hide_banner"),
      s("-loglevel"),
      s("error"),
      s("-f"),
      s("concat"),
      s("-safe"),
      s("0"),
      s("-i"),
      s("segments.txt"),
      s("-c"),
      s("copy"),
      s("joined.mp4"),
    ],
  });
  let caption_style = format!(
    "FontName={},FontSize={},PrimaryColour={},OutlineColour={},BorderStyle=1,Outline=2,Shadow=0,Alignment=2,MarginV={}",
    caption_font(spec.font.as_deref()),
    if width > height { 18 } else { 14 },
    ass_color(spec.caption_color.as_deref(), "&H00FFFFFF"),
    ass_color(spec.outline_color.as_deref(), "&H00000000"),
    if width > height { 40 } else { 160 },
  );
  let mut args = vec![
    s("-y"),
    s("-hide_banner"),
    s("-loglevel"),
    s("error"),
    s("-i"),
    s("joined.mp4"),
    s("-i"),
    root.join(&spec.voice).to_string_lossy().to_string(),
  ];
  if let Some(music) = &spec.music {
    args.extend([
      s("-stream_loop"),
      s("-1"),
      s("-i"),
      root.join(music).to_string_lossy().to_string(),
    ]);
  }
  // Sound effects (phase 4b) go under the voice first, each at its start, about 12 dB down.
  let first_sfx = if spec.music.is_some() { 3 } else { 2 };
  let mut sfx_chain = String::new();
  for (i, fx) in spec.sfx.iter().enumerate() {
    args.extend([s("-i"), root.join(&fx.path).to_string_lossy().to_string()]);
    let ms = (fx.at_sec.max(0.0) * 1000.0).round() as u64;
    sfx_chain.push_str(&format!(
      "[{}:a]adelay={ms}|{ms},volume=0.25[fx{i}];",
      first_sfx + i
    ));
  }
  let voice = if spec.sfx.is_empty() {
    s("[1:a]")
  } else {
    let labels: String = (0..spec.sfx.len()).map(|i| format!("[fx{i}]")).collect();
    sfx_chain.push_str(&format!(
      "[1:a]{labels}amix=inputs={}:duration=first:normalize=0[vo];",
      spec.sfx.len() + 1
    ));
    s("[vo]")
  };
  let audio = if spec.music.is_some() {
    // The music sits about 12 dB under the voice and ducks further while it speaks.
    format!("{sfx_chain}{voice}asplit=2[voice][key];[2:a]volume=0.25[bed];[bed][key]sidechaincompress=threshold=0.05:ratio=8:attack=20:release=400[ducked];[voice][ducked]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[a]")
  } else {
    format!("{sfx_chain}{voice}loudnorm=I=-14:TP=-1.5:LRA=11[a]")
  };
  let filter = format!("[0:v]subtitles=captions.srt:force_style='{caption_style}'[v];{audio}");
  args.extend([
    s("-filter_complex"),
    filter,
    s("-map"),
    s("[v]"),
    s("-map"),
    s("[a]"),
    s("-c:v"),
    s("libopenh264"),
    s("-b:v"),
    s("6M"),
    s("-c:a"),
    s("aac"),
    s("-b:a"),
    s("192k"),
    s("-t"),
    format!("{:.3}", spec.voice_seconds),
    s("-movflags"),
    s("+faststart"),
    work.join(output_name).to_string_lossy().to_string(),
  ]);
  runs.push(FfmpegRun {
    cwd: work.to_path_buf(),
    args,
  });
  runs
}

/// Said when Windows refuses to run the bundled ffmpeg. Its files aren't code-signed yet
/// (owner decision 2026-10-29), so Smart App Control blocks them on PCs that have it on.
pub(crate) const FFMPEG_BLOCKED: &str = "Windows blocked ffmpeg, the video tool Alphonso uses, because its files aren't signed yet (Smart App Control). Voice-overs, the finished video, Shorts and motion clips need it. You can turn Smart App Control off in Windows Security → App & browser control, but Windows can't turn it back on without a reset.";

/// Whether a run failed because Windows blocked the program: it refused to start
/// (OS error 4551), or it started and a blocked DLL stopped it (exit code 0xC0E90002).
pub(crate) fn windows_block(exit_code: Option<i32>, os_error: Option<i32>) -> Option<&'static str> {
  const POLICY_REFUSED_START: i32 = 4551;
  const POLICY_STOPPED_RUN: i32 = 0xC0E9_0002_u32 as i32;
  (os_error == Some(POLICY_REFUSED_START) || exit_code == Some(POLICY_STOPPED_RUN))
    .then_some(FFMPEG_BLOCKED)
}

/// A start error in plain words when Windows blocked the program.
fn start_error(e: std::io::Error) -> String {
  windows_block(None, e.raw_os_error())
    .map(str::to_string)
    .unwrap_or_else(|| e.to_string())
}

pub(crate) async fn run_ffmpeg(tool: &Path, run: &FfmpegRun) -> Result<(), String> {
  let mut cmd = tokio::process::Command::new(tool);
  cmd.args(&run.args).current_dir(&run.cwd).kill_on_drop(true);
  crate::utils::no_window_async(&mut cmd);
  let output = tokio::time::timeout(std::time::Duration::from_secs(1800), cmd.output())
    .await
    .map_err(|_| "ffmpeg took longer than 30 minutes.".to_string())?
    .map_err(start_error)?;
  if output.status.success() {
    Ok(())
  } else if let Some(blocked) = windows_block(output.status.code(), None) {
    Err(blocked.to_string())
  } else {
    let err = String::from_utf8_lossy(&output.stderr);
    Err(format!(
      "ffmpeg failed: {}",
      err.lines().rev().take(3).collect::<Vec<_>>().join(" | ")
    ))
  }
}

/// Duration (seconds) and whether the file has a video and an audio stream.
async fn probe(ffprobe: &Path, file: &Path) -> Result<(f64, bool, bool), String> {
  let mut cmd = tokio::process::Command::new(ffprobe);
  cmd
    .args([
      "-v",
      "error",
      "-show_entries",
      "format=duration:stream=codec_type",
      "-of",
      "json",
    ])
    .arg(file)
    .kill_on_drop(true);
  crate::utils::no_window_async(&mut cmd);
  let output = cmd.output().await.map_err(start_error)?;
  if let Some(blocked) = windows_block(output.status.code(), None) {
    return Err(blocked.to_string());
  }
  let info: serde_json::Value = serde_json::from_slice(&output.stdout)
    .map_err(|_| "ffprobe could not read the video.".to_string())?;
  let duration = info["format"]["duration"]
    .as_str()
    .and_then(|d| d.parse::<f64>().ok())
    .unwrap_or(0.0);
  let kinds: Vec<&str> = info["streams"]
    .as_array()
    .map(|a| a.iter().filter_map(|s| s["codec_type"].as_str()).collect())
    .unwrap_or_default();
  Ok((duration, kinds.contains(&"video"), kinds.contains(&"audio")))
}

/// Builds the finished video (16:9 and 9:16), checks each with ffprobe, and
/// grabs three frames. A new version never overwrites an older one.
#[tauri::command]
pub async fn content_assemble_video(mut spec: AssemblySpec) -> Result<serde_json::Value, String> {
  let font_note = resolve_font(&mut spec.font);
  let ffmpeg = ffmpeg_path().ok_or_else(ffmpeg_not_found)?;
  let ffprobe = ffprobe_path().ok_or_else(|| {
    format!(
      "ffprobe wasn't found. {}",
      ffmpeg_missing_for(std::env::consts::OS)
    )
  })?;
  if spec.scenes.is_empty() {
    return Err("The video has no scenes.".to_string());
  }
  let out = checked_dir(&spec.workspace_root, &spec.out_dir)?;
  let root = std::fs::canonicalize(&spec.workspace_root).map_err(|e| e.to_string())?;
  // Every input must be an existing file inside the workspace.
  if let Some(rel) = missing_input(&root, &spec) {
    return Err(format!("A file for the video is missing: {rel}"));
  }
  if chosen_aspects(&spec).is_empty() {
    return Err("Choose 16x9 or 9x16 for the video.".to_string());
  }
  for (aspect, _, _) in chosen_aspects(&spec) {
    if out
      .join(format!("{}.mp4", output_stem(&spec, aspect)))
      .exists()
    {
      return Err(format!(
        "Version {} already exists; nothing was overwritten.",
        spec.version
      ));
    }
  }
  // Every file this run writes; a failure removes them, so Retry can use the same version.
  let mut written: Vec<PathBuf> = Vec::new();
  let result = assemble_outputs(&spec, &ffmpeg, &ffprobe, &root, &out, &mut written).await;
  if result.is_err() {
    for file in &written {
      let _ = std::fs::remove_file(file);
    }
  }
  Ok(serde_json::json!({ "ok": true, "outputs": result?, "fontNote": font_note }))
}

async fn assemble_outputs(
  spec: &AssemblySpec,
  ffmpeg: &Path,
  ffprobe: &Path,
  root: &Path,
  out: &Path,
  written: &mut Vec<PathBuf>,
) -> Result<Vec<serde_json::Value>, String> {
  let mut outputs = Vec::new();
  for (aspect, width, height) in chosen_aspects(spec) {
    let stem = output_stem(spec, aspect);
    let name = format!("{stem}.mp4");
    let work = out.join(format!(".work-{stem}"));
    std::fs::create_dir_all(&work).map_err(|e| e.to_string())?;
    let runs = build_assembly_runs(root, &work, &name, spec, width, height);
    let list: String = assembly_segments(spec)
      .iter()
      .map(|g| format!("file '{}'\n", g.name))
      .collect();
    std::fs::write(work.join("segments.txt"), list).map_err(|e| e.to_string())?;
    std::fs::copy(root.join(&spec.srt), work.join("captions.srt")).map_err(|e| e.to_string())?;
    let result = async {
      for run in &runs {
        run_ffmpeg(ffmpeg, run).await?;
      }
      std::fs::rename(work.join(&name), out.join(&name)).map_err(|e| e.to_string())
    }
    .await;
    let _ = std::fs::remove_dir_all(&work);
    result?;
    let file = out.join(&name);
    written.push(file.clone());
    let (duration, has_video, has_audio) = probe(ffprobe, &file).await?;
    if !has_video || !has_audio {
      return Err(format!(
        "The {aspect} video is missing its {}.",
        if has_video { "sound" } else { "picture" }
      ));
    }
    if (duration - spec.voice_seconds).abs() > 1.0 {
      return Err(format!(
        "The {aspect} video is {duration:.1} s long; the voice-over is {:.1} s.",
        spec.voice_seconds
      ));
    }
    let mut frames = Vec::new();
    for pct in [10, 50, 90] {
      let frame = format!("{stem}-{pct}.jpg");
      let at = format!("{:.2}", duration * pct as f64 / 100.0);
      let grab = FfmpegRun {
        cwd: out.to_path_buf(),
        args: vec![
          s("-y"),
          s("-hide_banner"),
          s("-loglevel"),
          s("error"),
          s("-ss"),
          at,
          s("-i"),
          name.clone(),
          s("-frames:v"),
          s("1"),
          s("-q:v"),
          s("3"),
          frame.clone(),
        ],
      };
      run_ffmpeg(ffmpeg, &grab).await?;
      written.push(out.join(&frame));
      frames.push(frame);
    }
    outputs.push(serde_json::json!({ "aspect": aspect, "path": name, "durationSec": duration, "frames": frames }));
  }
  Ok(outputs)
}

// ── The brand's font in burned-in text (phase 4a) ───────────────────────────

/// The first font family named, with only letters, digits, spaces and `-`
/// (so nothing can break out of ffmpeg's filter text), at most 64 characters;
/// Arial when nothing usable is left.
pub(crate) fn caption_font(name: Option<&str>) -> String {
  let first = name.unwrap_or("").split(',').next().unwrap_or("");
  let cleaned: String = first
    .chars()
    .filter(|c| c.is_ascii_alphanumeric() || *c == ' ' || *c == '-')
    .collect::<String>()
    .split_whitespace()
    .collect::<Vec<_>>()
    .join(" ");
  if cleaned.is_empty() {
    "Arial".to_string()
  } else {
    cleaned.chars().take(64).collect()
  }
}

/// Whether Windows' fonts list (`reg query` output) has this family:
/// a value name that is the family, then a space or "(".
// Used by the Windows font check; other systems only test it.
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn font_listed(reg_output: &str, family: &str) -> bool {
  let want = family.trim().to_lowercase();
  if want.is_empty() {
    return false;
  }
  reg_output.lines().any(|line| {
    let name = line.trim_start().to_lowercase();
    name
      .strip_prefix(&want)
      .is_some_and(|rest| rest.starts_with(' ') || rest.starts_with('('))
  })
}

/// Whether a font is installed (Windows: the machine's and the user's fonts lists).
fn font_installed(family: &str) -> bool {
  #[cfg(windows)]
  {
    let mut listed = String::new();
    for hive in ["HKLM", "HKCU"] {
      let mut cmd = std::process::Command::new("reg");
      cmd.args([
        "query",
        &format!("{hive}\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts"),
      ]);
      crate::utils::no_window(&mut cmd);
      if let Ok(out) = cmd.output() {
        listed.push_str(&String::from_utf8_lossy(&out.stdout));
      }
    }
    font_listed(&listed, family)
  }
  #[cfg(not(windows))]
  {
    let _ = family;
    true
  }
}

/// Keeps the brand font when it is installed; otherwise Arial, with a note.
fn resolve_font(font: &mut Option<String>) -> Option<String> {
  let wanted = font.as_deref().map(|f| caption_font(Some(f)))?;
  if wanted == "Arial" || font_installed(&wanted) {
    *font = Some(wanted);
    None
  } else {
    *font = None;
    Some(format!(
      "The brand font {wanted} isn't installed on this computer; the captions use Arial."
    ))
  }
}

// ── Highlight and cut Shorts (phase 3d) ─────────────────────────────────────

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CutShortSpec {
  workspace_root: String,
  /// The finished 9:16 video, relative to the workspace.
  source: String,
  source_seconds: f64,
  start_sec: f64,
  end_sec: f64,
  /// The Short's file, relative to the workspace (`.mp4`, never written over).
  out_path: String,
  /// A highlight's hook line (a WAV), spoken over the start.
  #[serde(default)]
  hook_voice: Option<String>,
  #[serde(default)]
  hook_seconds: Option<f64>,
  /// The hook's on-screen text (an SRT), shown for the hook's length.
  #[serde(default)]
  hook_srt: Option<String>,
  #[serde(default)]
  caption_color: Option<String>,
  #[serde(default)]
  outline_color: Option<String>,
  /// The brand's font for the hook text (phase 4a).
  #[serde(default)]
  font: Option<String>,
}

/// The part of the video to use, kept inside it; under 3 seconds is refused.
pub(crate) fn clamp_moment(
  start: f64,
  end: f64,
  source_seconds: f64,
) -> Result<(f64, f64), String> {
  let start = start.max(0.0);
  let end = end.min(source_seconds);
  // NaN (a broken length) fails too.
  if (end - start).is_nan() || end - start < 3.0 {
    return Err(
      "That part of the finished video is under 3 seconds; choose a longer moment.".to_string(),
    );
  }
  Ok((start, end))
}

/// The ffmpeg run for a cut (a plain trim) or a highlight (the original about 12 dB
/// lower under the hook line, the hook text burned in from its file by a plain name).
pub(crate) fn build_cut_runs(
  root: &Path,
  work: &Path,
  spec: &CutShortSpec,
  start: f64,
  end: f64,
) -> Vec<FfmpegRun> {
  let mut args = vec![
    s("-y"),
    s("-hide_banner"),
    s("-loglevel"),
    s("error"),
    s("-ss"),
    format!("{start:.3}"),
    s("-t"),
    format!("{:.3}", end - start),
    s("-i"),
    root.join(&spec.source).to_string_lossy().to_string(),
  ];
  match (&spec.hook_voice, spec.hook_seconds) {
    (Some(voice), Some(hook)) => {
      args.extend([s("-i"), root.join(voice).to_string_lossy().to_string()]);
      let style = format!(
        "FontName={},FontSize=22,PrimaryColour={},OutlineColour={},BorderStyle=1,Outline=3,Shadow=0,Alignment=8,MarginV=260",
        caption_font(spec.font.as_deref()),
        ass_color(spec.caption_color.as_deref(), "&H00FFFFFF"),
        ass_color(spec.outline_color.as_deref(), "&H00000000"),
      );
      let video = if spec.hook_srt.is_some() {
        format!("[0:v]subtitles=hook.srt:force_style='{style}'[v]")
      } else {
        s("[0:v]null[v]")
      };
      args.extend([
        s("-filter_complex"),
        format!(
          "{video};[0:a]volume=0.25:enable='between(t,0,{hook:.3})'[orig];[orig][1:a]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[a]"
        ),
        s("-map"),
        s("[v]"),
        s("-map"),
        s("[a]"),
      ]);
    }
    _ => args.extend([s("-map"), s("0:v"), s("-map"), s("0:a")]),
  }
  args.extend([
    s("-c:v"),
    s("libopenh264"),
    s("-b:v"),
    s("6M"),
    s("-c:a"),
    s("aac"),
    s("-b:a"),
    s("192k"),
    s("-movflags"),
    s("+faststart"),
    work.join("short.mp4").to_string_lossy().to_string(),
  ]);
  vec![FfmpegRun {
    cwd: work.to_path_buf(),
    args,
  }]
}

/// Makes a highlight or a cut Short from the finished 9:16 video.
#[tauri::command]
pub async fn content_cut_short(mut spec: CutShortSpec) -> Result<serde_json::Value, String> {
  let font_note = resolve_font(&mut spec.font);
  let out_file = checked_file(&spec.workspace_root, &spec.out_path, &["mp4"])?;
  if out_file.exists() {
    return Err("That Short's file already exists; nothing was overwritten.".to_string());
  }
  let (start, end) = clamp_moment(spec.start_sec, spec.end_sec, spec.source_seconds)?;
  let root = std::fs::canonicalize(&spec.workspace_root).map_err(|e| e.to_string())?;
  for rel in [
    Some(&spec.source),
    spec.hook_voice.as_ref(),
    spec.hook_srt.as_ref(),
  ]
  .into_iter()
  .flatten()
  {
    let path = checked_file(&spec.workspace_root, rel, &["mp4", "wav", "srt"])?;
    if !path.is_file() {
      return Err(format!("A file for the Short is missing: {rel}"));
    }
  }
  let ffmpeg = ffmpeg_path().ok_or_else(ffmpeg_not_found)?;
  let ffprobe = ffprobe_path().ok_or_else(|| {
    format!(
      "ffprobe wasn't found. {}",
      ffmpeg_missing_for(std::env::consts::OS)
    )
  })?;
  let out = out_file
    .parent()
    .map(Path::to_path_buf)
    .ok_or_else(|| "The Short needs a folder.".to_string())?;
  let stem = out_file
    .file_stem()
    .and_then(|x| x.to_str())
    .unwrap_or("short")
    .to_string();
  let work = out.join(format!(".work-{stem}"));
  std::fs::create_dir_all(&work).map_err(|e| e.to_string())?;
  let result = async {
    if let Some(srt) = &spec.hook_srt {
      std::fs::copy(root.join(srt), work.join("hook.srt")).map_err(|e| e.to_string())?;
    }
    for run in build_cut_runs(&root, &work, &spec, start, end) {
      run_ffmpeg(&ffmpeg, &run).await?;
    }
    std::fs::rename(work.join("short.mp4"), &out_file).map_err(|e| e.to_string())
  }
  .await;
  let _ = std::fs::remove_dir_all(&work);
  result?;
  let (duration, has_video, has_audio) = probe(&ffprobe, &out_file).await?;
  let mut written = vec![out_file.clone()];
  let checked: Result<Vec<String>, String> = async {
    if !has_video || !has_audio {
      return Err(format!(
        "The Short is missing its {}.",
        if has_video { "sound" } else { "picture" }
      ));
    }
    if (duration - (end - start)).abs() > 1.0 {
      return Err(format!(
        "The Short is {duration:.1} s long; it should be {:.1} s.",
        end - start
      ));
    }
    let mut frames = Vec::new();
    for pct in [10, 50, 90] {
      let frame = format!("{stem}-{pct}.jpg");
      let grab = FfmpegRun {
        cwd: out.clone(),
        args: vec![
          s("-y"),
          s("-hide_banner"),
          s("-loglevel"),
          s("error"),
          s("-ss"),
          format!("{:.2}", duration * pct as f64 / 100.0),
          s("-i"),
          format!("{stem}.mp4"),
          s("-frames:v"),
          s("1"),
          s("-q:v"),
          s("3"),
          frame.clone(),
        ],
      };
      run_ffmpeg(&ffmpeg, &grab).await?;
      written.push(out.join(&frame));
      frames.push(frame);
    }
    Ok(frames)
  }
  .await;
  match checked {
    Ok(frames) => Ok(
      serde_json::json!({ "ok": true, "path": spec.out_path, "durationSec": duration, "frames": frames, "fontNote": font_note }),
    ),
    Err(reason) => {
      for file in &written {
        let _ = std::fs::remove_file(file);
      }
      Err(reason)
    }
  }
}

// ── Word timings for the captions (phase 2a) ────────────────────────────────

/// The words Whisper heard, with their times, from its JSON output.
pub(crate) fn whisper_words(json: &serde_json::Value) -> Vec<serde_json::Value> {
  json["segments"]
    .as_array()
    .into_iter()
    .flatten()
    .flat_map(|seg| seg["words"].as_array().cloned().unwrap_or_default())
    .filter_map(|w| {
      let word = w["word"].as_str()?.trim().to_string();
      let (start, end) = (w["start"].as_f64()?, w["end"].as_f64()?);
      (!word.is_empty()).then(|| serde_json::json!({ "word": word, "start": start, "end": end }))
    })
    .collect()
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WordTimesRequest {
  workspace_root: String,
  /// The voice track, relative to the workspace.
  audio_path: String,
}

/// Whisper's word times on the voice track (the words shown always come from
/// the script). Not installed → `{ ok: false, missing: true }`.
#[tauri::command]
pub async fn content_whisper_words(request: WordTimesRequest) -> Result<serde_json::Value, String> {
  let dir = crate::runtime_manager::tool_dir("whisper");
  let exe = if cfg!(target_os = "windows") {
    dir.join("venv").join("Scripts").join("whisper.exe")
  } else {
    dir.join("venv").join("bin").join("whisper")
  };
  if !exe.is_file() {
    return Ok(serde_json::json!({ "ok": false, "missing": true }));
  }
  let audio = checked_file(&request.workspace_root, &request.audio_path, &["wav"])?;
  if !audio.is_file() {
    return Err("The voice track is missing.".to_string());
  }
  let out = audio.with_file_name(".whisper-words");
  std::fs::create_dir_all(&out).map_err(|e| e.to_string())?;
  let mut cmd = tokio::process::Command::new(&exe);
  cmd
    .arg(&audio)
    .args([
      "--model",
      "tiny.en",
      "--language",
      "en",
      "--word_timestamps",
      "True",
      "--output_format",
      "json",
      "--output_dir",
    ])
    .arg(&out)
    .kill_on_drop(true);
  crate::utils::no_window_async(&mut cmd);
  let result = tokio::time::timeout(std::time::Duration::from_secs(900), cmd.output()).await;
  let json_path = out.join(format!(
    "{}.json",
    audio
      .file_stem()
      .map(|s| s.to_string_lossy().to_string())
      .unwrap_or_default()
  ));
  let parsed = std::fs::read_to_string(&json_path)
    .ok()
    .and_then(|t| serde_json::from_str::<serde_json::Value>(&t).ok());
  let _ = std::fs::remove_dir_all(&out);
  match (result, parsed) {
    (Ok(Ok(_)), Some(json)) => Ok(serde_json::json!({ "ok": true, "words": whisper_words(&json) })),
    (Err(_), _) => {
      Ok(serde_json::json!({ "ok": false, "error": "Whisper took longer than 15 minutes." }))
    }
    _ => Ok(serde_json::json!({ "ok": false, "error": "Whisper could not time the voice track." })),
  }
}

// ── Playing the finished video in the app (phase 2a) ───────────────────────

/// A folder the window may play media from: it exists and is not a drive's root.
pub(crate) fn media_folder_ok(path: &Path) -> bool {
  path.is_dir() && path.parent().is_some()
}

/// Lets the app window play files from the Settings output folder (the asset
/// protocol's scope starts empty). Only that folder, never a drive root.
#[tauri::command]
pub fn content_allow_media_folder(app: AppHandle, folder: String) -> Result<(), String> {
  let path =
    std::fs::canonicalize(folder.trim()).map_err(|_| "That folder does not exist.".to_string())?;
  if !media_folder_ok(&path) {
    return Err("Choose a folder, not a whole drive, as the output folder.".to_string());
  }
  app
    .asset_protocol_scope()
    .allow_directory(&path, true)
    .map_err(|e| e.to_string())
}

/// A ready-to-post file's name: slides keep their order (`01-…`), a single file its own name.
pub(crate) fn ready_file_name(index: usize, total: usize, name: &str) -> String {
  if total <= 1 {
    name.to_string()
  } else {
    format!("{:02}-{name}", index + 1)
  }
}

/// `folder`, or `folder-2`, `folder-3`… the first that does not exist yet.
pub(crate) fn free_folder(exists: impl Fn(&str) -> bool, folder: &str) -> Option<String> {
  (1..=50)
    .map(|n| {
      if n == 1 {
        folder.to_string()
      } else {
        format!("{folder}-{n}")
      }
    })
    .find(|candidate| !exists(candidate))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ReadyToPost {
  ok: bool,
  folder: Option<String>,
  files: Vec<String>,
  reason: Option<String>,
}

/// "Post by hand" (content factory phase 3c): copies a post's files and its caption
/// (`caption.txt`) into a new folder in the project. Never overwrites anything.
#[tauri::command]
pub(crate) async fn content_ready_to_post(
  workspace_root: String,
  folder: String,
  files: Vec<String>,
  caption: String,
) -> ReadyToPost {
  let failed = |reason: &str| ReadyToPost {
    ok: false,
    folder: None,
    files: Vec::new(),
    reason: Some(reason.to_string()),
  };
  if files.is_empty() || files.len() > 10 {
    return failed("A post has 1 to 10 files.");
  }
  let root = workspace_root.trim().to_string();
  let Some(chosen) = free_folder(|rel| Path::new(&root).join(rel).exists(), folder.trim()) else {
    return failed("Too many ready-to-post folders for this post already.");
  };
  let dir = match checked_dir(&root, &chosen) {
    Ok(dir) => dir,
    Err(reason) => return failed(&reason),
  };
  let mut copied = Vec::with_capacity(files.len());
  for (i, file) in files.iter().enumerate() {
    let src = match checked_file(&root, file, &["mp4", "mov", "jpg", "jpeg", "png", "webp"]) {
      Ok(src) => src,
      Err(reason) => return failed(&reason),
    };
    let Some(name) = src.file_name().and_then(|n| n.to_str()) else {
      return failed("A file name is required.");
    };
    let target = ready_file_name(i, files.len(), name);
    if std::fs::copy(&src, dir.join(&target)).is_err() {
      return failed("A file was not found or could not be copied.");
    }
    copied.push(format!("{chosen}/{target}"));
  }
  if std::fs::write(dir.join("caption.txt"), caption.as_bytes()).is_err() {
    return failed("The caption could not be saved.");
  }
  ReadyToPost {
    ok: true,
    folder: Some(chosen),
    files: copied,
    reason: None,
  }
}

// ---- A scene's motion clip (content factory phase 4c) ----

pub(crate) const MOTION_MAX_SECONDS: f64 = 10.0;
pub(crate) const MOTION_TOO_LONG: &str = "The clip is longer than 10 seconds.";
pub(crate) const MOTION_NOT_VIDEO: &str = "That file isn't a video.";

/// Why a recorded or chosen clip can't be used as a motion, or None.
pub(crate) fn motion_clip_problem(duration: f64, has_video: bool) -> Option<&'static str> {
  if !has_video || duration <= 0.0 {
    Some(MOTION_NOT_VIDEO)
  } else if duration > MOTION_MAX_SECONDS + 0.5 {
    Some(MOTION_TOO_LONG)
  } else {
    None
  }
}

/// The run that turns a recording or a chosen file into the motion MP4 (no sound; the voice-over is the sound).
pub(crate) fn motion_clip_run(cwd: &Path, source: &Path, part: &Path) -> FfmpegRun {
  let s = |v: &str| v.to_string();
  FfmpegRun {
    cwd: cwd.to_path_buf(),
    args: vec![
      s("-y"),
      s("-i"),
      source.to_string_lossy().to_string(),
      s("-t"),
      format!("{MOTION_MAX_SECONDS}"),
      s("-an"),
      s("-c:v"),
      s("libopenh264"),
      s("-pix_fmt"),
      s("yuv420p"),
      s("-movflags"),
      s("+faststart"),
      s("-f"),
      s("mp4"),
      part.to_string_lossy().to_string(),
    ],
  }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MotionClipRequest {
  workspace_root: String,
  out_path: String,
  /// A recording from the window's camera (WebM, base64).
  #[serde(default)]
  base64: Option<String>,
  /// Choose a video file in a dialog the backend opens (the window never supplies a path).
  #[serde(default)]
  choose: Option<bool>,
}

/// Saves a scene's motion clip as `<project>/motion/<scene>-v<n>.mp4`: a recording, or a file
/// chosen in a dialog (copied, the original untouched). At most 10 seconds, a video, never over a file.
#[tauri::command]
pub async fn content_save_motion_clip(
  app: tauri::AppHandle,
  request: MotionClipRequest,
) -> serde_json::Value {
  use base64::Engine;
  let fail = |r: &str| serde_json::json!({ "ok": false, "reason": r });
  let out = match checked_file(&request.workspace_root, &request.out_path, &["mp4"]) {
    Ok(p) => p,
    Err(r) => return serde_json::json!({ "ok": false, "reason": r }),
  };
  if out.exists() {
    return fail("That file already exists; nothing was overwritten.");
  }
  let (Some(ffmpeg), Some(ffprobe)) = (ffmpeg_path(), ffprobe_path()) else {
    return fail("FFmpeg isn't available on this computer.");
  };
  let dir = out.parent().map(Path::to_path_buf).unwrap_or_default();
  let mut temp: Option<PathBuf> = None;
  let source: PathBuf = if let Some(b64) = request.base64.as_deref() {
    let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(b64.trim()) else {
      return fail(MOTION_NOT_VIDEO);
    };
    let recorded = out.with_extension("recording.webm");
    if std::fs::write(&recorded, &bytes).is_err() {
      return fail("The recording could not be saved.");
    }
    temp = Some(recorded.clone());
    recorded
  } else if request.choose == Some(true) {
    use tauri_plugin_dialog::DialogExt;
    let picked = app
      .dialog()
      .file()
      .add_filter("Video", &["mp4", "mov", "webm", "m4v", "mkv", "avi"])
      .blocking_pick_file();
    let Some(path) = picked.and_then(|p| p.into_path().ok()) else {
      return serde_json::json!({ "ok": false, "cancelled": true });
    };
    path
  } else {
    return fail("Record a clip or choose a file.");
  };
  let cleanup = |temp: &Option<PathBuf>| {
    if let Some(t) = temp {
      let _ = std::fs::remove_file(t);
    }
  };
  match probe(&ffprobe, &source).await {
    Ok((duration, has_video, _)) => {
      if let Some(problem) = motion_clip_problem(duration, has_video) {
        cleanup(&temp);
        return fail(problem);
      }
    }
    Err(_) => {
      cleanup(&temp);
      return fail(MOTION_NOT_VIDEO);
    }
  }
  let part = out.with_extension("part.mp4");
  let result = run_ffmpeg(&ffmpeg, &motion_clip_run(&dir, &source, &part)).await;
  cleanup(&temp);
  if result.is_err() || std::fs::rename(&part, &out).is_err() {
    let _ = std::fs::remove_file(&part);
    return fail("The clip could not be turned into a video for the scene.");
  }
  serde_json::json!({ "ok": true, "path": request.out_path })
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn kokoro_missing_says_so_by_flag() {
    let v = kokoro_missing();
    assert_eq!(v["ok"], false);
    assert_eq!(v["missing"], true);
    assert_eq!(v["error"], KOKORO_MISSING);
  }

  #[test]
  fn a_brand_font_name_is_cleaned_before_it_reaches_the_filter() {
    assert_eq!(caption_font(Some("\"Montserrat\", Inter")), "Montserrat");
    assert_eq!(caption_font(Some("Bad:Name,'x'\\")), "BadName");
    assert_eq!(caption_font(Some("Open Sans")), "Open Sans");
    assert_eq!(caption_font(Some("")), "Arial");
    assert_eq!(caption_font(None), "Arial");
    assert_eq!(caption_font(Some(&"A".repeat(90))).len(), 64);
  }

  #[test]
  fn an_installed_font_is_found_in_the_fonts_list() {
    let listed = "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts\r\n    Montserrat Bold (TrueType)    REG_SZ    Montserrat-Bold.ttf\r\n    Arial (TrueType)    REG_SZ    arial.ttf\r\n";
    assert!(font_listed(listed, "Montserrat"));
    assert!(font_listed(listed, "arial"));
    assert!(!font_listed(listed, "Mont"));
    assert!(!font_listed(listed, "Inter"));
  }

  #[test]
  fn captions_use_the_brand_font() {
    let filter = |args: &[String]| {
      args
        .iter()
        .skip_while(|a| *a != "-filter_complex")
        .nth(1)
        .cloned()
        .unwrap_or_default()
    };
    let mut spec = cut_spec(true);
    spec.font = Some("Montserrat".into());
    let runs = build_cut_runs(Path::new("R"), Path::new("W"), &spec, 10.0, 50.0);
    assert!(filter(&runs[0].args).contains("FontName=Montserrat,"));
    spec.font = None;
    let runs = build_cut_runs(Path::new("R"), Path::new("W"), &spec, 10.0, 50.0);
    assert!(filter(&runs[0].args).contains("FontName=Arial,"));
  }

  fn cut_spec(hook: bool) -> CutShortSpec {
    CutShortSpec {
      workspace_root: "R".into(),
      source: "b/p/output/v1-9x16.mp4".into(),
      source_seconds: 120.0,
      start_sec: 10.0,
      end_sec: 50.0,
      out_path: "b/p/shorts/sh1/v1.mp4".into(),
      hook_voice: hook.then(|| "b/p/shorts/sh1/hook.wav".into()),
      hook_seconds: hook.then_some(2.5),
      hook_srt: hook.then(|| "b/p/shorts/sh1/hook.srt".into()),
      caption_color: None,
      outline_color: None,
      font: None,
    }
  }

  #[test]
  fn a_moment_past_the_end_is_clamped_and_under_3_seconds_refused() {
    assert_eq!(clamp_moment(-2.0, 30.0, 120.0).unwrap(), (0.0, 30.0));
    assert_eq!(clamp_moment(100.0, 160.0, 120.0).unwrap(), (100.0, 120.0));
    assert!(clamp_moment(118.0, 160.0, 120.0)
      .unwrap_err()
      .contains("under 3 seconds"));
    assert!(clamp_moment(40.0, 20.0, 120.0).is_err());
  }

  #[test]
  fn a_cut_is_a_plain_trim() {
    let runs = build_cut_runs(Path::new("R"), Path::new("W"), &cut_spec(false), 10.0, 50.0);
    assert_eq!(runs.len(), 1);
    let args = &runs[0].args;
    assert!(args.windows(2).any(|w| w[0] == "-ss" && w[1] == "10.000"));
    assert!(args.windows(2).any(|w| w[0] == "-t" && w[1] == "40.000"));
    assert!(!args.iter().any(|a| a == "-filter_complex"));
  }

  #[test]
  fn a_highlight_lowers_the_original_under_the_hook_and_burns_the_hook_text_from_its_file() {
    let runs = build_cut_runs(Path::new("R"), Path::new("W"), &cut_spec(true), 10.0, 50.0);
    let filter = runs[0]
      .args
      .iter()
      .skip_while(|a| *a != "-filter_complex")
      .nth(1)
      .unwrap();
    assert!(filter.contains("volume=0.25:enable='between(t,0,2.500)'"));
    assert!(filter.contains("subtitles=hook.srt"));
    assert!(filter.contains("amix=inputs=2"));
  }

  #[test]
  fn no_hook_text_reaches_the_command_line() {
    let runs = build_cut_runs(Path::new("R"), Path::new("W"), &cut_spec(true), 10.0, 50.0);
    // The hook's words live only in hook.srt; no argument carries free text.
    assert!(runs[0].args.iter().all(|a| !a.contains("Your coffee")));
    assert!(runs[0].args.iter().all(|a| !a.contains('\n')));
  }

  #[tokio::test]
  async fn the_shorts_file_is_never_written_over() {
    let root = std::env::temp_dir().join(format!("alphonso-cut-{}", std::process::id()));
    std::fs::create_dir_all(root.join("b/p/shorts/sh1")).unwrap();
    std::fs::write(root.join("b/p/shorts/sh1/v1.mp4"), b"old").unwrap();
    let spec = CutShortSpec {
      workspace_root: root.to_string_lossy().to_string(),
      ..cut_spec(false)
    };
    let err = content_cut_short(spec).await.unwrap_err();
    assert!(err.contains("already exists"));
    assert_eq!(
      std::fs::read(root.join("b/p/shorts/sh1/v1.mp4")).unwrap(),
      b"old"
    );
    std::fs::remove_dir_all(&root).ok();
  }

  #[test]
  fn ready_files_keep_their_order() {
    assert_eq!(ready_file_name(0, 1, "v1.mp4"), "v1.mp4");
    assert_eq!(ready_file_name(0, 3, "a.png"), "01-a.png");
    assert_eq!(ready_file_name(9, 10, "j.png"), "10-j.png");
  }

  #[test]
  fn a_ready_folder_never_overwrites() {
    let taken = ["p/ready-to-post/ig-v1", "p/ready-to-post/ig-v1-2"];
    assert_eq!(
      free_folder(|f| taken.contains(&f), "p/ready-to-post/ig-v1").as_deref(),
      Some("p/ready-to-post/ig-v1-3")
    );
    assert_eq!(free_folder(|_| false, "x").as_deref(), Some("x"));
    assert_eq!(free_folder(|_| true, "x"), None);
  }

  #[test]
  fn tells_when_windows_blocks_ffmpeg() {
    // The program refused to start (Smart App Control): OS error 4551.
    assert_eq!(windows_block(None, Some(4551)), Some(FFMPEG_BLOCKED));
    // It started, then a blocked DLL stopped it: exit code 0xC0E90002.
    assert_eq!(
      windows_block(Some(0xC0E9_0002_u32 as i32), None),
      Some(FFMPEG_BLOCKED)
    );
    // An ordinary failure is not a block.
    assert_eq!(windows_block(Some(1), None), None);
    assert_eq!(windows_block(None, Some(2)), None);
    assert!(FFMPEG_BLOCKED.contains("Smart App Control"));
  }

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
  fn says_how_to_get_ffmpeg_on_each_computer() {
    assert!(ffmpeg_missing_for("macos").contains("brew install ffmpeg"));
    assert!(ffmpeg_missing_for("linux").contains("package manager"));
    assert!(ffmpeg_missing_for("windows").contains("Reinstall Alphonso"));
  }

  #[test]
  fn finds_the_linux_build_in_its_bin_folder() {
    let dir = std::env::temp_dir().join(format!("alphonso-media-bin-{}", std::process::id()));
    std::fs::create_dir_all(dir.join("bin")).unwrap();
    let bundled = dir.join("bin").join(exe_name("ffprobe"));
    std::fs::write(&bundled, b"x").unwrap();
    let found = resolve_media_tool(Some(&dir), "ffprobe", |_| None);
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

  #[test]
  fn each_stock_source_has_a_fixed_endpoint_and_its_own_key_place() {
    let (url, header) = stock_search_request("pexels", "coffee & cake", "portrait", "pk").unwrap();
    assert_eq!(url.host_str(), Some("api.pexels.com"));
    assert!(url.query().unwrap().contains("orientation=portrait"));
    assert!(
      url.query().unwrap().contains("coffee+%26+cake")
        || url.query().unwrap().contains("coffee%20%26%20cake")
    );
    assert_eq!(header, Some(("Authorization", "pk".to_string())));
    let (url, header) = stock_search_request("pixabay", "tea", "landscape", "xk").unwrap();
    assert!(url.query().unwrap().contains("key=xk"));
    assert_eq!(header, None);
    let (_, header) = stock_search_request("coverr", "tea", "landscape", "ck").unwrap();
    assert_eq!(header, Some(("Authorization", "Bearer ck".to_string())));
    assert!(stock_search_request("example", "tea", "landscape", "k").is_err());
  }

  #[test]
  fn downloads_only_from_the_stock_hosts() {
    assert!(allowed_media_host("videos.pexels.com"));
    assert!(allowed_media_host("player.vimeo.com"));
    assert!(allowed_media_host("cdn.pixabay.com"));
    assert!(allowed_media_host("storage.coverr.co"));
    assert!(!allowed_media_host("pexels.com.evil.example"));
    assert!(!allowed_media_host("169.254.169.254"));
    assert!(!allowed_media_host("localhost"));
  }

  fn spec(scenes: Vec<AssemblyScene>, music: bool) -> AssemblySpec {
    AssemblySpec {
      workspace_root: "R".into(),
      out_dir: "brand/p/output".into(),
      version: 1,
      scenes,
      voice: "brand/p/audio/voice-v1.wav".into(),
      voice_seconds: 9.5,
      music: music.then(|| "brand/p/audio/music-v1.wav".into()),
      srt: "brand/p/output/v1.srt".into(),
      caption_color: Some("#ffeecc".into()),
      outline_color: None,
      aspects: None,
      output_stem: None,
      font: None,
      sfx: vec![],
    }
  }

  #[test]
  fn assembly_can_make_only_the_9x16_version() {
    let both = spec(vec![], false);
    assert_eq!(chosen_aspects(&both).len(), 2);
    let short = AssemblySpec {
      aspects: Some(vec!["9x16".into()]),
      ..spec(vec![], false)
    };
    assert_eq!(chosen_aspects(&short), vec![("9x16", 1080, 1920)]);
    let none = AssemblySpec {
      aspects: Some(vec!["4x3".into()]),
      ..spec(vec![], false)
    };
    assert!(chosen_aspects(&none).is_empty());
  }

  #[test]
  fn assembly_names_a_shorts_file() {
    let short = AssemblySpec {
      aspects: Some(vec!["9x16".into()]),
      output_stem: Some("v2".into()),
      ..spec(vec![], false)
    };
    assert_eq!(output_stem(&short, "9x16"), "v2");
    // Both shapes keep their usual names; an odd stem is ignored.
    let both = AssemblySpec {
      output_stem: Some("v2".into()),
      ..spec(vec![], false)
    };
    assert_eq!(output_stem(&both, "16x9"), "v1-16x9");
    let odd = AssemblySpec {
      aspects: Some(vec!["9x16".into()]),
      output_stem: Some("../x".into()),
      ..spec(vec![], false)
    };
    assert_eq!(output_stem(&odd, "9x16"), "v1-9x16");
  }

  fn scene(clip: Option<&str>, picture: Option<&str>, seconds: f64) -> AssemblyScene {
    AssemblyScene {
      clip: clip.map(Into::into),
      picture: picture.map(Into::into),
      card_color: Some("#112233".into()),
      seconds,
      ai_clip: None,
      ai_seconds: None,
    }
  }

  #[test]
  fn a_clip_is_looped_trimmed_and_cropped_to_the_shape() {
    let root = Path::new("C:/My Work/Café");
    let runs = build_assembly_runs(
      root,
      Path::new("W"),
      "v1-9x16.mp4",
      &spec(vec![scene(Some("brand/p/broll/s1.mp4"), None, 4.0)], false),
      1080,
      1920,
    );
    let a = &runs[0].args;
    assert!(a.windows(2).any(|w| w[0] == "-stream_loop" && w[1] == "-1"));
    assert!(
      a.contains(
        &root
          .join("brand/p/broll/s1.mp4")
          .to_string_lossy()
          .to_string()
      ),
      "the path is one argument, spaces and accents kept"
    );
    assert!(a.windows(2).any(|w| w[0] == "-t" && w[1] == "4.000"));
    assert!(a.iter().any(|x| x.contains("crop=1080:1920")));
  }

  #[test]
  fn a_picture_gets_a_slow_zoom_and_a_scene_with_neither_a_colour_card() {
    let runs = build_assembly_runs(
      Path::new("R"),
      Path::new("W"),
      "v1-16x9.mp4",
      &spec(
        vec![scene(None, Some("p/s1.png"), 3.0), scene(None, None, 2.0)],
        false,
      ),
      1920,
      1080,
    );
    assert!(runs[0]
      .args
      .iter()
      .any(|x| x.contains("zoompan") && x.contains("d=90")));
    assert!(runs[1]
      .args
      .iter()
      .any(|x| x == "color=c=0x112233:s=1920x1080:r=30"));
  }

  #[test]
  fn effects_are_mixed_under_the_voice_at_their_start() {
    let mut with = spec(vec![scene(None, Some("p.png"), 3.0)], true);
    with.sfx = vec![
      AssemblySfx {
        path: "brand/p/audio/sfx-v1-s1.wav".into(),
        at_sec: 0.0,
      },
      AssemblySfx {
        path: "brand/p/audio/sfx-v1-s2.wav".into(),
        at_sec: 2.5,
      },
    ];
    let runs = build_assembly_runs(
      Path::new("R"),
      Path::new("W"),
      "v1-16x9.mp4",
      &with,
      1920,
      1080,
    );
    let last = runs.last().unwrap();
    let filter = &last.args[last
      .args
      .iter()
      .position(|x| x == "-filter_complex")
      .unwrap()
      + 1];
    assert!(
      filter.contains("[3:a]adelay=0|0,volume=0.25[fx0]"),
      "{filter}"
    );
    assert!(
      filter.contains("[4:a]adelay=2500|2500,volume=0.25[fx1]"),
      "{filter}"
    );
    assert!(
      filter.contains("[1:a][fx0][fx1]amix=inputs=3:duration=first:normalize=0[vo]"),
      "{filter}"
    );
    assert!(filter.contains("[vo]asplit=2[voice][key]"), "{filter}");
    assert!(last.args.iter().any(|a| a.ends_with("sfx-v1-s2.wav")));
    // Without effects the voice goes in as it is.
    let plain = build_assembly_runs(
      Path::new("R"),
      Path::new("W"),
      "v1-16x9.mp4",
      &spec(vec![scene(None, Some("p.png"), 3.0)], true),
      1920,
      1080,
    );
    let f2 = &plain.last().unwrap().args[plain
      .last()
      .unwrap()
      .args
      .iter()
      .position(|x| x == "-filter_complex")
      .unwrap()
      + 1];
    assert!(f2.contains("[1:a]asplit=2[voice][key]") && !f2.contains("adelay"));
  }

  #[test]
  fn music_is_ducked_under_the_voice_and_the_mix_normalised() {
    let runs = build_assembly_runs(
      Path::new("R"),
      Path::new("W"),
      "v1-16x9.mp4",
      &spec(vec![scene(None, Some("p.png"), 3.0)], true),
      1920,
      1080,
    );
    let last = runs.last().unwrap();
    let at = last
      .args
      .iter()
      .position(|x| x == "-filter_complex")
      .unwrap();
    let filter = &last.args[at + 1];
    assert!(filter.contains("sidechaincompress") && filter.contains("loudnorm=I=-14"));
    let without = build_assembly_runs(
      Path::new("R"),
      Path::new("W"),
      "v1-16x9.mp4",
      &spec(vec![scene(None, Some("p.png"), 3.0)], false),
      1920,
      1080,
    );
    assert!(without
      .last()
      .unwrap()
      .args
      .iter()
      .any(|x| x.contains("[1:a]loudnorm=I=-14")));
  }

  #[test]
  fn captions_come_from_the_srt_file_by_a_plain_name_in_the_work_folder() {
    let runs = build_assembly_runs(
      Path::new("R"),
      Path::new("W"),
      "v1-16x9.mp4",
      &spec(vec![scene(None, Some("p.png"), 3.0)], false),
      1920,
      1080,
    );
    let last = runs.last().unwrap();
    assert_eq!(last.cwd, PathBuf::from("W"));
    assert!(last.args.iter().any(
      |x| x.starts_with("[0:v]subtitles=captions.srt:force_style='")
        && x.contains("PrimaryColour=&H00CCEEFF")
    ));
    assert!(last
      .args
      .windows(2)
      .any(|w| w[0] == "-t" && w[1] == "9.500"));
  }

  #[test]
  fn colours_are_checked() {
    assert_eq!(ffmpeg_color(Some("#A1b2C3")), "0xA1b2C3");
    assert_eq!(ffmpeg_color(Some("red; drop")), "0x202020");
    assert_eq!(ass_color(Some("#ff0000"), "x"), "&H000000FF");
    assert_eq!(ass_color(None, "&H00FFFFFF"), "&H00FFFFFF");
  }

  /// A real run with ffmpeg on the PATH (run by hand: `cargo test real_assembly -- --ignored`).
  #[tokio::test]
  #[ignore]
  async fn real_assembly_makes_two_checked_videos() {
    let ffmpeg = ffmpeg_path().expect("ffmpeg on the PATH");
    let root = temp_root("real");
    let project = root.join("My Brand").join("Café ideas");
    std::fs::create_dir_all(project.join("scenes")).unwrap();
    std::fs::create_dir_all(project.join("audio")).unwrap();
    let make = |args: &[&str]| {
      let mut cmd = std::process::Command::new(&ffmpeg);
      cmd.args(args).current_dir(&project);
      crate::utils::no_window(&mut cmd);
      let ok = cmd.status().unwrap().success();
      assert!(ok, "{args:?}");
    };
    make(&[
      "-y",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc=s=1280x720",
      "-frames:v",
      "1",
      "scenes/s1.png",
    ]);
    make(&[
      "-y",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "sine=f=440:d=6",
      "audio/voice-v1.wav",
    ]);
    make(&[
      "-y",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "sine=f=220:d=10",
      "audio/music-v1.wav",
    ]);
    std::fs::create_dir_all(project.join("clips")).unwrap();
    make(&[
      "-y",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=s=1280x720:d=2",
      "-pix_fmt",
      "yuv420p",
      "-c:v",
      "libopenh264",
      "clips/v1-s1.mp4",
    ]);
    std::fs::write(
      project.join("audio").join("v1.srt"),
      "1\n00:00:00,000 --> 00:00:02,000\nNote: \"quoted\" café\n",
    )
    .unwrap();
    let spec = AssemblySpec {
      workspace_root: root.to_string_lossy().to_string(),
      out_dir: "My Brand/Café ideas/output".into(),
      version: 1,
      scenes: vec![
        AssemblyScene {
          clip: None,
          picture: Some("My Brand/Café ideas/scenes/s1.png".into()),
          card_color: None,
          seconds: 3.0,
          // An AI clip for the first 2 s, then the picture for the last second.
          ai_clip: Some("My Brand/Café ideas/clips/v1-s1.mp4".into()),
          ai_seconds: Some(2.0),
        },
        AssemblyScene {
          clip: None,
          picture: None,
          card_color: Some("#334455".into()),
          seconds: 3.0,
          ai_clip: None,
          ai_seconds: None,
        },
      ],
      voice: "My Brand/Café ideas/audio/voice-v1.wav".into(),
      voice_seconds: 6.0,
      music: Some("My Brand/Café ideas/audio/music-v1.wav".into()),
      srt: "My Brand/Café ideas/audio/v1.srt".into(),
      caption_color: Some("#ffffff".into()),
      outline_color: Some("#000000".into()),
      aspects: None,
      output_stem: None,
      font: None,
      sfx: vec![],
    };
    // A run that fails its check (the voice is said to be 20 s) leaves no file behind...
    let wrong = AssemblySpec {
      voice_seconds: 20.0,
      ..spec.clone()
    };
    assert!(content_assemble_video(wrong)
      .await
      .unwrap_err()
      .contains("long"));
    assert!(!project.join("output").join("v1-16x9.mp4").exists());
    // ...so the retry with the same version works.
    let result = content_assemble_video(spec.clone())
      .await
      .expect("assembled");
    assert_eq!(result["outputs"].as_array().unwrap().len(), 2);
    for out in result["outputs"].as_array().unwrap() {
      let file = project.join("output").join(out["path"].as_str().unwrap());
      assert!(file.is_file());
      assert!((out["durationSec"].as_f64().unwrap() - 6.0).abs() <= 1.0);
      assert_eq!(out["frames"].as_array().unwrap().len(), 3);
    }
    // A second run of the same version overwrites nothing.
    assert!(content_assemble_video(spec)
      .await
      .unwrap_err()
      .contains("already exists"));
    std::fs::remove_dir_all(&root).ok();
  }

  #[test]
  fn whisper_words_are_read_from_every_segment() {
    let json = serde_json::json!({ "segments": [
      { "words": [{ "word": " Their", "start": 0.0, "end": 0.3 }, { "word": " coffee", "start": 0.3, "end": 0.7 }] },
      { "words": [{ "word": " ", "start": 0.7, "end": 0.8 }, { "word": "great.", "start": 0.8, "end": 1.2 }] },
      { "text": "no words here" }
    ] });
    let words = whisper_words(&json);
    assert_eq!(words.len(), 3);
    assert_eq!(words[0]["word"], "Their");
    assert_eq!(words[2]["end"], 1.2);
  }

  #[test]
  fn a_speak_line_reads_its_pause() {
    let line: SpeakLine = serde_json::from_str(r#"{"id":"s2","text":"","pauseSec":1.5}"#).unwrap();
    assert_eq!(line.pause_sec, Some(1.5));
    let plain: SpeakLine = serde_json::from_str(r#"{"id":"s1","text":"Hi"}"#).unwrap();
    assert_eq!(
      serde_json::to_value(&plain).unwrap()["pauseSec"],
      serde_json::Value::Null
    );
  }

  #[test]
  fn media_can_play_from_a_folder_but_not_a_drive_root() {
    let root = temp_root("media-folder");
    assert!(media_folder_ok(&root));
    assert!(!media_folder_ok(&root.join("missing")));
    let drive = root.ancestors().last().unwrap().to_path_buf();
    assert!(!media_folder_ok(&drive));
    std::fs::remove_dir_all(&root).ok();
  }

  #[test]
  fn an_ai_clip_plays_first_then_the_scene_continues() {
    let mut sc = scene(Some("b/p/broll/s1.mp4"), None, 7.0);
    sc.ai_clip = Some("b/p/clips/v1-s1.mp4".into());
    sc.ai_seconds = Some(4.0);
    let spec = spec(vec![sc, scene(None, Some("p.png"), 3.0)], false);
    let names: Vec<String> = assembly_segments(&spec)
      .into_iter()
      .map(|g| g.name)
      .collect();
    assert_eq!(names, ["seg-000-ai.mp4", "seg-000.mp4", "seg-001.mp4"]);
    let root = Path::new("R");
    let runs = build_assembly_runs(root, Path::new("W"), "v1-16x9.mp4", &spec, 1920, 1080);
    assert!(runs[0].args.contains(
      &root
        .join("b/p/clips/v1-s1.mp4")
        .to_string_lossy()
        .to_string()
    ));
    assert!(runs[0]
      .args
      .windows(2)
      .any(|w| w[0] == "-t" && w[1] == "4.000"));
    assert!(runs[1]
      .args
      .contains(&root.join("b/p/broll/s1.mp4").to_string_lossy().to_string()));
    assert!(runs[1]
      .args
      .windows(2)
      .any(|w| w[0] == "-t" && w[1] == "3.000"));
    assert!(runs[2].args.iter().any(|x| x.contains("zoompan")));
  }

  #[test]
  fn an_ai_clip_as_long_as_the_scene_is_the_whole_scene() {
    let mut sc = scene(None, Some("p.png"), 5.0);
    sc.ai_clip = Some("c.mp4".into());
    sc.ai_seconds = Some(6.0);
    let spec = spec(vec![sc], false);
    let segments = assembly_segments(&spec);
    assert_eq!(segments.len(), 1);
    assert_eq!(segments[0].name, "seg-000-ai.mp4");
    assert!((segments[0].seconds - 5.0).abs() < 1e-9);
  }

  #[test]
  fn every_input_including_ai_clips_must_be_in_the_workspace() {
    let root = temp_root("ai-inputs");
    std::fs::create_dir_all(root.join("p")).unwrap();
    for f in ["p/voice.wav", "p/v1.srt", "p/s1.png"] {
      std::fs::write(root.join(f), b"x").unwrap();
    }
    let root = std::fs::canonicalize(&root).unwrap();
    let mut sc = scene(None, Some("p/s1.png"), 3.0);
    sc.ai_clip = Some("p/missing.mp4".into());
    sc.ai_seconds = Some(2.0);
    let mut sp = spec(vec![sc], false);
    sp.voice = "p/voice.wav".into();
    sp.srt = "p/v1.srt".into();
    assert_eq!(missing_input(&root, &sp), Some("p/missing.mp4".to_string()));
    std::fs::write(root.join("p/missing.mp4"), b"x").unwrap();
    assert_eq!(missing_input(&root, &sp), None);
    std::fs::remove_dir_all(&root).ok();
  }

  #[test]
  fn a_motion_clip_is_a_video_of_at_most_ten_seconds() {
    assert_eq!(motion_clip_problem(11.0, true), Some(MOTION_TOO_LONG));
    assert_eq!(MOTION_TOO_LONG, "The clip is longer than 10 seconds.");
    assert_eq!(motion_clip_problem(10.4, true), None);
    assert_eq!(motion_clip_problem(4.0, false), Some(MOTION_NOT_VIDEO));
    assert_eq!(MOTION_NOT_VIDEO, "That file isn't a video.");
    assert_eq!(motion_clip_problem(0.0, true), Some(MOTION_NOT_VIDEO));
  }

  #[test]
  fn a_motion_clip_drops_its_sound_and_is_cut_at_ten_seconds() {
    let run = motion_clip_run(
      Path::new("W"),
      Path::new("W/in.webm"),
      Path::new("W/s1-v1.part.mp4"),
    );
    let joined = run.args.join(" ");
    assert!(joined.contains("-t 10"), "{joined}");
    assert!(joined.contains("-an"));
    assert!(joined.contains("-c:v libopenh264"));
    assert!(joined.ends_with("s1-v1.part.mp4"));
  }
}
