use crate::{now_ms, YouTubeUploadProof};
use serde_json::Value;
use std::fs;
use std::path::Path;
use std::time::Duration;

pub(crate) async fn youtube_access_token() -> Result<String, String> {
  let client_id = std::env::var("YOUTUBE_CLIENT_ID").unwrap_or_default();
  let client_secret = std::env::var("YOUTUBE_CLIENT_SECRET").unwrap_or_default();
  let refresh_token = std::env::var("YOUTUBE_REFRESH_TOKEN").unwrap_or_default();
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
pub(crate) async fn connector_upload_youtube(
  rate_limiter: tauri::State<'_, crate::RateLimiter>,
  file_path: String,
  title: String,
  description: Option<String>,
  tags: Option<Vec<String>>,
  privacy_status: Option<String>,
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
    });
  }

  let access_token = match youtube_access_token().await {
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
  let metadata = serde_json::json!({
    "snippet": {
      "title": clean_title,
      "description": clean_description,
      "tags": tags
    },
    "status": {
      "privacyStatus": privacy
    }
  });
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
  body.extend_from_slice(b"\r\n");
  body.extend_from_slice(format!("--{}--\r\n", boundary).as_bytes());

  let client = reqwest::Client::builder()
    .timeout(Duration::from_secs(300))
    .user_agent("Alphonso-YouTube-Connector/0.1")
    .build()
    .map_err(|error| error.to_string())?;
  let response = client
    .post("https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status&uploadType=multipart")
    .bearer_auth(access_token)
    .header("Content-Type", format!("multipart/related; boundary={}", boundary))
    .body(body)
    .send()
    .await
    .map_err(|error| error.to_string())?;
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
    });
  }

  let video_id = payload
    .get("id")
    .and_then(|value| value.as_str())
    .map(|value| value.to_string());
  let url = video_id
    .as_ref()
    .map(|value| format!("https://www.youtube.com/watch?v={}", value));
  Ok(YouTubeUploadProof {
    connector_id: "youtube".to_string(),
    ok: true,
    video_id,
    url,
    privacy_status: privacy,
    file_path: path.to_string_lossy().to_string(),
    uploaded_at_ms,
    trust: "verified".to_string(),
    error: None,
  })
}
