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
}
