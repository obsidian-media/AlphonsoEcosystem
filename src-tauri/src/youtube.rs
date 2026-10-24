use crate::utils::secret_or_env;
use crate::{now_ms, YouTubeUploadProof};
use serde_json::Value;
use std::fs;
use std::path::Path;
use std::time::Duration;

/// Saved OAuth values passed from the app; any that are missing fall back to
/// the environment (see `secret_or_env`).
#[derive(Default, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct YouTubeOAuth {
  pub(crate) client_id: Option<String>,
  pub(crate) client_secret: Option<String>,
  pub(crate) refresh_token: Option<String>,
}

pub(crate) async fn youtube_access_token(oauth: YouTubeOAuth) -> Result<String, String> {
  let client_id = secret_or_env(oauth.client_id, "YOUTUBE_CLIENT_ID");
  let client_secret = secret_or_env(oauth.client_secret, "YOUTUBE_CLIENT_SECRET");
  let refresh_token = secret_or_env(oauth.refresh_token, "YOUTUBE_REFRESH_TOKEN");
  if client_id.trim().is_empty()
    || client_secret.trim().is_empty()
    || refresh_token.trim().is_empty()
  {
    return Err(
      "YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, or YOUTUBE_REFRESH_TOKEN is missing.".to_string(),
    );
  }

  let client = reqwest::Client::builder()
    .timeout(Duration::from_secs(20))
    .user_agent("Alphonso-YouTube-Connector/0.1")
    .build()
    .map_err(|error| error.to_string())?;
  let response = client
    .post("https://oauth2.googleapis.com/token")
    .form(&[
      ("client_id", client_id.trim()),
      ("client_secret", client_secret.trim()),
      ("refresh_token", refresh_token.trim()),
      ("grant_type", "refresh_token"),
    ])
    .send()
    .await
    .map_err(|error| error.to_string())?;
  let status = response.status();
  let payload: Value = response.json().await.map_err(|error| error.to_string())?;
  if !status.is_success() {
    let error_text = payload
      .get("error_description")
      .and_then(|value| value.as_str())
      .or_else(|| payload.get("error").and_then(|value| value.as_str()))
      .unwrap_or("OAuth token refresh failed.");
    return Err(error_text.to_string());
  }
  let token = payload
    .get("access_token")
    .and_then(|value| value.as_str())
    .unwrap_or("")
    .trim()
    .to_string();
  if token.is_empty() {
    return Err("OAuth token refresh succeeded but access_token was missing.".to_string());
  }
  Ok(token)
}

/// Above this size the upload is resumable instead of one multipart request.
pub(crate) const RESUMABLE_ABOVE_BYTES: u64 = 100 * 1024 * 1024;

/// The upload's metadata. A scheduled publish (`publish_at`, RFC 3339) is always uploaded
/// private: YouTube makes it public at that time.
pub(crate) fn youtube_metadata(
  title: &str,
  description: &str,
  tags: &[String],
  privacy: &str,
  publish_at: Option<&str>,
) -> Value {
  let mut status = serde_json::json!({
    "privacyStatus": if publish_at.is_some() { "private" } else { privacy }
  });
  if let Some(at) = publish_at {
    status["publishAt"] = Value::String(at.to_string());
  }
  serde_json::json!({
    "snippet": { "title": title, "description": description, "tags": tags },
    "status": status
  })
}

/// Whether YouTube kept the video private when it was asked to publish it (the lock on
/// uploads from Google projects that have not passed YouTube's audit), with the note to show.
pub(crate) fn youtube_lock_check(
  asked_publish_at: bool,
  asked_privacy: &str,
  video_id: &str,
  status: &Value,
) -> (bool, Option<String>) {
  let privacy = status
    .get("privacyStatus")
    .and_then(Value::as_str)
    .unwrap_or("");
  let has_publish_at = status
    .get("publishAt")
    .and_then(Value::as_str)
    .is_some_and(|at| !at.is_empty());
  let wanted_visible = asked_publish_at || matches!(asked_privacy, "public" | "unlisted");
  if wanted_visible && privacy == "private" && !has_publish_at {
    return (
      true,
      Some(format!(
        "YouTube kept this video private: it keeps uploads private when they come from a Google project that has not passed YouTube's audit. Make it public in YouTube Studio: https://studio.youtube.com/video/{video_id}/edit"
      )),
    );
  }
  (false, None)
}

pub(crate) fn use_resumable(size: u64) -> bool {
  size > RESUMABLE_ABOVE_BYTES
}

/// The thumbnail's type, if YouTube takes it (PNG or JPEG).
pub(crate) fn thumbnail_mime(path: &Path) -> Option<&'static str> {
  match path
    .extension()
    .and_then(|e| e.to_str())
    .map(|e| e.to_ascii_lowercase())
    .as_deref()
  {
    Some("png") => Some("image/png"),
    Some("jpg") | Some("jpeg") => Some("image/jpeg"),
    _ => None,
  }
}

fn api_error(payload: &Value, fallback: &str) -> String {
  payload
    .get("error")
    .and_then(|value| value.get("message"))
    .and_then(|value| value.as_str())
    .unwrap_or(fallback)
    .to_string()
}

/// Sets the custom thumbnail; `Err` says why it was not set (it never fails the upload).
async fn set_thumbnail(
  client: &reqwest::Client,
  token: &str,
  video_id: &str,
  path: &Path,
) -> Result<(), String> {
  let mime = thumbnail_mime(path).ok_or("the thumbnail must be a PNG or JPEG")?;
  let bytes = fs::read(path).map_err(|e| format!("could not read the thumbnail ({e})"))?;
  let response = client
    .post(format!(
      "https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId={video_id}"
    ))
    .bearer_auth(token)
    .header("Content-Type", mime)
    .body(bytes)
    .send()
    .await
    .map_err(|e| e.to_string())?;
  if response.status().is_success() {
    return Ok(());
  }
  let payload: Value = response.json().await.unwrap_or(Value::Null);
  Err(api_error(&payload, "YouTube refused the thumbnail"))
}

/// What YouTube says about the video now (`items[0].status`), or `None` if it could not be read.
async fn read_back_status(client: &reqwest::Client, token: &str, video_id: &str) -> Option<Value> {
  let response = client
    .get("https://www.googleapis.com/youtube/v3/videos")
    .query(&[("part", "status"), ("id", video_id)])
    .bearer_auth(token)
    .send()
    .await
    .ok()?;
  let payload: Value = response.json().await.ok()?;
  payload.get("items")?.get(0)?.get("status").cloned()
}

fn mime_for_video_path(path: &Path) -> String {
  let extension = path
    .extension()
    .and_then(|value| value.to_str())
    .map(|value| value.to_ascii_lowercase())
    .unwrap_or_default();
  match extension.as_str() {
    "mp4" => "video/mp4",
    "mov" => "video/quicktime",
    "mkv" => "video/x-matroska",
    "avi" => "video/x-msvideo",
    "webm" => "video/webm",
    "mpeg" | "mpg" => "video/mpeg",
    _ => "application/octet-stream",
  }
  .to_string()
}

#[tauri::command]
// The arguments are the command's interface to the app (Tauri passes them by name).
#[allow(clippy::too_many_arguments)]
pub(crate) async fn connector_upload_youtube(
  rate_limiter: tauri::State<'_, crate::RateLimiter>,
  file_path: String,
  title: String,
  description: Option<String>,
  tags: Option<Vec<String>>,
  privacy_status: Option<String>,
  oauth: Option<YouTubeOAuth>,
  publish_at: Option<String>,
  thumbnail_path: Option<String>,
) -> Result<YouTubeUploadProof, String> {
  rate_limiter.check_and_record("connector_upload_youtube")?;
  let uploaded_at_ms = now_ms();
  let path = std::path::PathBuf::from(file_path.trim());
  let clean_title = title.trim().to_string();
  let clean_description = description.unwrap_or_default().trim().to_string();
  let clean_privacy = privacy_status
    .unwrap_or_else(|| "private".to_string())
    .trim()
    .to_ascii_lowercase();
  let privacy = match clean_privacy.as_str() {
    "private" | "unlisted" | "public" => clean_privacy,
    _ => "private".to_string(),
  };

  if clean_title.is_empty() {
    return Ok(YouTubeUploadProof {
      connector_id: "youtube".to_string(),
      ok: false,
      video_id: None,
      url: None,
      privacy_status: privacy,
      file_path: file_path.trim().to_string(),
      uploaded_at_ms,
      trust: "failed".to_string(),
      error: Some("title is required.".to_string()),
      ..Default::default()
    });
  }
  if !path.exists() || !path.is_file() {
    return Ok(YouTubeUploadProof {
      connector_id: "youtube".to_string(),
      ok: false,
      video_id: None,
      url: None,
      privacy_status: privacy,
      file_path: file_path.trim().to_string(),
      uploaded_at_ms,
      trust: "failed".to_string(),
      error: Some("video file path does not exist.".to_string()),
      ..Default::default()
    });
  }

  let access_token = match youtube_access_token(oauth.unwrap_or_default()).await {
    Ok(token) => token,
    Err(error) => {
      return Ok(YouTubeUploadProof {
        connector_id: "youtube".to_string(),
        ok: false,
        video_id: None,
        url: None,
        privacy_status: privacy,
        file_path: path.to_string_lossy().to_string(),
        uploaded_at_ms,
        trust: "unverified".to_string(),
        error: Some(error),
        ..Default::default()
      });
    }
  };

  let file_bytes = fs::read(&path).map_err(|error| error.to_string())?;
  let tags = tags
    .unwrap_or_default()
    .into_iter()
    .map(|value| value.trim().to_string())
    .filter(|value| !value.is_empty())
    .take(25)
    .collect::<Vec<_>>();
  let publish_at = publish_at
    .map(|value| value.trim().to_string())
    .filter(|value| !value.is_empty());
  let metadata = youtube_metadata(
    &clean_title,
    &clean_description,
    &tags,
    &privacy,
    publish_at.as_deref(),
  );
  let metadata_bytes = serde_json::to_vec(&metadata).map_err(|error| error.to_string())?;
  let boundary = format!("alphonso-youtube-{}", uploaded_at_ms);
  let mime = mime_for_video_path(&path);

  let mut body: Vec<u8> = Vec::with_capacity(metadata_bytes.len() + file_bytes.len() + 1024);
  body.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
  body.extend_from_slice(b"Content-Type: application/json; charset=UTF-8\r\n\r\n");
  body.extend_from_slice(&metadata_bytes);
  body.extend_from_slice(b"\r\n");
  body.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
  body.extend_from_slice(format!("Content-Type: {}\r\n", mime).as_bytes());
  body.extend_from_slice(b"Content-Transfer-Encoding: binary\r\n\r\n");
  body.extend_from_slice(&file_bytes);
  // (When the file is large the resumable path sends `file_bytes` and this body is unused.)
  body.extend_from_slice(b"\r\n");
  body.extend_from_slice(format!("--{}--\r\n", boundary).as_bytes());

  let client = reqwest::Client::builder()
    .timeout(Duration::from_secs(1800))
    .user_agent("Alphonso-YouTube-Connector/0.2")
    .build()
    .map_err(|error| error.to_string())?;
  let response = if use_resumable(file_bytes.len() as u64) {
    // Large files: open a resumable session, then send the file to it.
    let session = client
      .post("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status")
      .bearer_auth(&access_token)
      .header("X-Upload-Content-Type", mime.clone())
      .header("X-Upload-Content-Length", file_bytes.len().to_string())
      .json(&metadata)
      .send()
      .await
      .map_err(|error| error.to_string())?;
    let location = session
      .headers()
      .get("location")
      .and_then(|value| value.to_str().ok())
      .map(str::to_string);
    let Some(location) = location.filter(|l| l.starts_with("https://www.googleapis.com/")) else {
      let payload: Value = session.json().await.unwrap_or(Value::Null);
      return Ok(YouTubeUploadProof {
        connector_id: "youtube".to_string(),
        ok: false,
        video_id: None,
        url: None,
        privacy_status: privacy,
        file_path: path.to_string_lossy().to_string(),
        uploaded_at_ms,
        trust: "failed".to_string(),
        error: Some(api_error(
          &payload,
          "YouTube did not open an upload session.",
        )),
        ..Default::default()
      });
    };
    client
      .put(location)
      .bearer_auth(&access_token)
      .header("Content-Type", mime.clone())
      .body(file_bytes)
      .send()
      .await
      .map_err(|error| error.to_string())?
  } else {
    client
      .post("https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status&uploadType=multipart")
      .bearer_auth(&access_token)
      .header("Content-Type", format!("multipart/related; boundary={}", boundary))
      .body(body)
      .send()
      .await
      .map_err(|error| error.to_string())?
  };
  let status = response.status();
  let payload: Value = response.json().await.map_err(|error| error.to_string())?;
  if !status.is_success() {
    let error_message = payload
      .get("error")
      .and_then(|value| value.get("message"))
      .and_then(|value| value.as_str())
      .unwrap_or("YouTube upload failed.");
    return Ok(YouTubeUploadProof {
      connector_id: "youtube".to_string(),
      ok: false,
      video_id: None,
      url: None,
      privacy_status: privacy,
      file_path: path.to_string_lossy().to_string(),
      uploaded_at_ms,
      trust: "failed".to_string(),
      error: Some(error_message.to_string()),
      ..Default::default()
    });
  }

  let video_id = payload
    .get("id")
    .and_then(|value| value.as_str())
    .map(|value| value.to_string());
  let url = video_id
    .as_ref()
    .map(|value| format!("https://www.youtube.com/watch?v={}", value));
  let mut notes: Vec<String> = Vec::new();
  let mut thumbnail_set = false;
  if let (Some(id), Some(thumb)) = (
    video_id.as_deref(),
    thumbnail_path
      .as_deref()
      .map(str::trim)
      .filter(|t| !t.is_empty()),
  ) {
    match set_thumbnail(&client, &access_token, id, Path::new(thumb)).await {
      Ok(()) => thumbnail_set = true,
      Err(reason) => notes.push(format!("Thumbnail not set: {reason}.")),
    }
  }
  // Read back what YouTube did; never report a schedule or visibility it did not keep.
  let mut real_privacy = privacy.clone();
  let mut real_publish_at = None;
  let mut locked_private = false;
  match video_id.as_deref() {
    Some(id) => match read_back_status(&client, &access_token, id).await {
      Some(status) => {
        if let Some(p) = status.get("privacyStatus").and_then(Value::as_str) {
          real_privacy = p.to_string();
        }
        real_publish_at = status
          .get("publishAt")
          .and_then(Value::as_str)
          .map(str::to_string);
        let (locked, note) = youtube_lock_check(publish_at.is_some(), &privacy, id, &status);
        locked_private = locked;
        notes.extend(note);
      }
      None => notes.push(
        "Uploaded, but YouTube's status could not be read back; check YouTube Studio.".to_string(),
      ),
    },
    None => notes.push("YouTube did not return the video's id.".to_string()),
  }
  Ok(YouTubeUploadProof {
    connector_id: "youtube".to_string(),
    ok: true,
    video_id,
    url,
    privacy_status: real_privacy,
    file_path: path.to_string_lossy().to_string(),
    uploaded_at_ms,
    trust: "verified".to_string(),
    error: None,
    publish_at: real_publish_at,
    locked_private,
    thumbnail_set,
    note: if notes.is_empty() {
      None
    } else {
      Some(notes.join(" "))
    },
  })
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::ffi::OsString;
  use std::sync::{Mutex, OnceLock};

  struct EnvSnapshot {
    entries: Vec<(String, Option<OsString>)>,
  }

  impl EnvSnapshot {
    fn capture(keys: &[&str]) -> Self {
      let entries = keys
        .iter()
        .map(|key| ((*key).to_string(), std::env::var_os(key)))
        .collect();
      Self { entries }
    }
  }

  impl Drop for EnvSnapshot {
    fn drop(&mut self) {
      for (key, value) in self.entries.iter().rev() {
        match value {
          Some(existing) => std::env::set_var(key, existing),
          None => std::env::remove_var(key),
        }
      }
    }
  }

  fn env_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
  }

  #[test]
  fn mime_for_video_path_maps_known_extensions() {
    assert_eq!(mime_for_video_path(Path::new("clip.mp4")), "video/mp4");
    assert_eq!(
      mime_for_video_path(Path::new("clip.MOV")),
      "video/quicktime"
    );
    assert_eq!(
      mime_for_video_path(Path::new("clip.mkv")),
      "video/x-matroska"
    );
    assert_eq!(
      mime_for_video_path(Path::new("clip.avi")),
      "video/x-msvideo"
    );
    assert_eq!(mime_for_video_path(Path::new("clip.mpeg")), "video/mpeg");
    assert_eq!(mime_for_video_path(Path::new("clip.mpg")), "video/mpeg");
    assert_eq!(mime_for_video_path(Path::new("clip.webm")), "video/webm");
    assert_eq!(
      mime_for_video_path(Path::new("clip.bin")),
      "application/octet-stream"
    );
  }

  #[test]
  fn youtube_access_token_rejects_missing_credentials() {
    let _guard = env_lock().lock().unwrap();
    let _env = EnvSnapshot::capture(&[
      "YOUTUBE_CLIENT_ID",
      "YOUTUBE_CLIENT_SECRET",
      "YOUTUBE_REFRESH_TOKEN",
    ]);
    std::env::remove_var("YOUTUBE_CLIENT_ID");
    std::env::remove_var("YOUTUBE_CLIENT_SECRET");
    std::env::remove_var("YOUTUBE_REFRESH_TOKEN");

    let runtime = tokio::runtime::Builder::new_current_thread()
      .enable_all()
      .build()
      .unwrap();
    let result = runtime.block_on(youtube_access_token(YouTubeOAuth::default()));

    assert!(result.is_err());
    assert!(result
      .err()
      .unwrap()
      .contains("YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, or YOUTUBE_REFRESH_TOKEN is missing"));
  }

  #[test]
  fn a_scheduled_upload_is_private_with_publish_at() {
    let tags = vec!["a".to_string()];
    let meta = youtube_metadata("T", "D", &tags, "public", Some("2026-11-01T18:00:00Z"));
    assert_eq!(meta["status"]["privacyStatus"], "private");
    assert_eq!(meta["status"]["publishAt"], "2026-11-01T18:00:00Z");
    assert_eq!(meta["snippet"]["title"], "T");
    assert_eq!(meta["snippet"]["tags"][0], "a");
    let now = youtube_metadata("T", "", &[], "unlisted", None);
    assert_eq!(now["status"]["privacyStatus"], "unlisted");
    assert!(now["status"].get("publishAt").is_none());
  }

  #[test]
  fn a_channel_that_youtube_keeps_private_is_noticed() {
    // Asked to schedule; YouTube kept it private with no publish time: locked.
    let locked = serde_json::json!({ "privacyStatus": "private", "uploadStatus": "uploaded" });
    let (is_locked, note) = youtube_lock_check(true, "private", "abc", &locked);
    assert!(is_locked);
    let note = note.unwrap();
    assert!(
      note.contains("https://studio.youtube.com/video/abc/edit"),
      "{note}"
    );
    assert!(note.contains("audit"), "{note}");
    // Scheduled as asked.
    let scheduled =
      serde_json::json!({ "privacyStatus": "private", "publishAt": "2026-11-01T18:00:00Z" });
    assert_eq!(
      youtube_lock_check(true, "private", "abc", &scheduled),
      (false, None)
    );
    // Asked public, kept private: locked.
    let kept = serde_json::json!({ "privacyStatus": "private" });
    assert!(youtube_lock_check(false, "public", "abc", &kept).0);
    // Asked private: private is fine.
    assert_eq!(
      youtube_lock_check(false, "private", "abc", &kept),
      (false, None)
    );
    // Public as asked.
    let public = serde_json::json!({ "privacyStatus": "public" });
    assert_eq!(
      youtube_lock_check(false, "public", "abc", &public),
      (false, None)
    );
  }

  #[test]
  fn big_files_use_the_resumable_upload() {
    assert!(!use_resumable(RESUMABLE_ABOVE_BYTES));
    assert!(use_resumable(RESUMABLE_ABOVE_BYTES + 1));
  }

  #[test]
  fn thumbnails_are_png_or_jpeg() {
    assert_eq!(thumbnail_mime(Path::new("t.png")), Some("image/png"));
    assert_eq!(thumbnail_mime(Path::new("t.JPG")), Some("image/jpeg"));
    assert_eq!(thumbnail_mime(Path::new("t.jpeg")), Some("image/jpeg"));
    assert_eq!(thumbnail_mime(Path::new("t.webp")), None);
  }
}
