//! Posting a video saved on this computer to Instagram or Facebook as a Reel
//! (Miya content factory phase 3a). Both use Meta's resumable upload
//! (`rupload.facebook.com`); Instagram cannot be scheduled through the API,
//! Facebook Reels can (more than 10 minutes and at most 29 days ahead).

use crate::meta_publish::{
  graph_error_message, meta_appsecret_proof_with, meta_graph_api_version, resolve_meta_credentials,
  MetaCredentials,
};
use crate::now_ms;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;

/// Largest video this sends (read into memory; Reels are short).
pub(crate) const MAX_VIDEO_BYTES: u64 = 1024 * 1024 * 1024;

/// How long to wait for Meta to finish processing a Reel.
pub(crate) const PROCESSING_WAIT_SECS: u64 = 600;

/// What a Meta upload is doing, from its status.
#[derive(Debug, PartialEq, Eq)]
pub(crate) enum UploadState {
  Waiting,
  Ready,
  Failed(String),
}

/// When to publish a Facebook Reel: `None` = now, `Some(unix seconds)` = scheduled on Meta.
/// A time less than 11 minutes ahead (or past) posts now; more than 29 days ahead is refused.
pub(crate) fn facebook_schedule(now_ms: u64, at_ms: Option<u64>) -> Result<Option<u64>, String> {
  const MINUTE: u64 = 60_000;
  let Some(at) = at_ms else { return Ok(None) };
  if at < now_ms + 11 * MINUTE {
    return Ok(None);
  }
  if at > now_ms + 29 * 24 * 60 * MINUTE {
    return Err(
      "Facebook can schedule a Reel at most 29 days ahead. Pick an earlier time.".to_string(),
    );
  }
  Ok(Some(at / 1000))
}

/// An Instagram container's `status_code` as a state.
pub(crate) fn instagram_container_state(status_code: &str) -> UploadState {
  match status_code.trim().to_ascii_uppercase().as_str() {
    "FINISHED" | "PUBLISHED" => UploadState::Ready,
    "ERROR" => UploadState::Failed("Instagram could not process the video.".to_string()),
    "EXPIRED" => {
      UploadState::Failed("Instagram's upload expired before it was published.".to_string())
    }
    _ => UploadState::Waiting,
  }
}

/// A Facebook Reel's `status` object as a state.
pub(crate) fn facebook_reel_state(status: &Value) -> UploadState {
  let phase_error = ["uploading_phase", "processing_phase", "publishing_phase"]
    .iter()
    .find_map(|phase| {
      let p = status.get(*phase)?;
      if p.get("status").and_then(Value::as_str) != Some("error") {
        return None;
      }
      Some(
        p.get("errors")
          .and_then(|e| e.get(0))
          .and_then(|e| e.get("message"))
          .and_then(Value::as_str)
          .unwrap_or("Facebook could not process the video.")
          .to_string(),
      )
    });
  if let Some(message) = phase_error {
    return UploadState::Failed(message);
  }
  match status
    .get("video_status")
    .and_then(Value::as_str)
    .unwrap_or("")
  {
    "error" | "upload_failed" | "expired" => {
      return UploadState::Failed("Facebook could not process the video.".to_string())
    }
    _ => {}
  }
  let publishing = status.get("publishing_phase");
  let done = publishing
    .and_then(|p| p.get("status"))
    .and_then(Value::as_str)
    == Some("completed");
  let state = publishing
    .and_then(|p| p.get("publish_status"))
    .and_then(Value::as_str)
    .unwrap_or("");
  if done && matches!(state, "published" | "scheduled") {
    UploadState::Ready
  } else {
    UploadState::Waiting
  }
}

/// The headers for one whole-file upload to `rupload.facebook.com`.
pub(crate) fn rupload_headers(token: &str, size: u64) -> Vec<(String, String)> {
  vec![
    (
      "Authorization".to_string(),
      format!("OAuth {}", token.trim()),
    ),
    ("offset".to_string(), "0".to_string()),
    ("file_size".to_string(), size.to_string()),
  ]
}

/// The form that opens an Instagram Reel upload.
pub(crate) fn instagram_reel_form(caption: &str) -> Vec<(String, String)> {
  vec![
    ("media_type".to_string(), "REELS".to_string()),
    ("caption".to_string(), caption.trim().to_string()),
  ]
}

/// Checks the file exists, is an MP4 or MOV, and fits; returns its size.
pub(crate) fn check_video_file(path: &std::path::Path) -> Result<u64, String> {
  let ext = path
    .extension()
    .and_then(|e| e.to_str())
    .map(|e| e.to_ascii_lowercase())
    .unwrap_or_default();
  if !path.exists() {
    return Err(format!("The video was not found: {}", path.display()));
  }
  if !matches!(ext.as_str(), "mp4" | "mov") {
    return Err("Meta takes an MP4 or MOV video.".to_string());
  }
  let size = std::fs::metadata(path).map_err(|e| e.to_string())?.len();
  if size == 0 {
    return Err("The video file is empty.".to_string());
  }
  if size > MAX_VIDEO_BYTES {
    return Err("The video is larger than 1 GB; Meta Reels are short videos.".to_string());
  }
  Ok(size)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MetaVideoRequest {
  approved: bool,
  platform: String,
  local_file_path: String,
  caption: Option<String>,
  title: Option<String>,
  scheduled_at_ms: Option<u64>,
  #[serde(default)]
  credentials: Option<MetaCredentials>,
}

/// What Meta did. `status`: `posted`, `scheduled`, `failed` or `setup_required`.
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MetaVideoProof {
  ok: bool,
  platform: String,
  status: String,
  post_id: Option<String>,
  url: Option<String>,
  publish_at_ms: Option<u64>,
  message: String,
}

fn proof(platform: &str, status: &str, message: impl Into<String>) -> MetaVideoProof {
  MetaVideoProof {
    ok: matches!(status, "posted" | "scheduled"),
    platform: platform.to_string(),
    status: status.to_string(),
    post_id: None,
    url: None,
    publish_at_ms: None,
    message: message.into(),
  }
}

fn auth_query(token: &str, app_secret: &str) -> Vec<(String, String)> {
  let mut q = vec![("access_token".to_string(), token.trim().to_string())];
  if let Some(p) = meta_appsecret_proof_with(app_secret, token.trim()) {
    q.push(("appsecret_proof".to_string(), p));
  }
  q
}

async fn json_or_error(response: reqwest::Response, fallback: &str) -> Result<Value, String> {
  let ok = response.status().is_success();
  let body: Value = response.json().await.unwrap_or(Value::Null);
  if ok {
    Ok(body)
  } else {
    Err(graph_error_message(&body, fallback))
  }
}

async fn rupload(
  client: &reqwest::Client,
  url: &str,
  token: &str,
  bytes: Vec<u8>,
) -> Result<(), String> {
  let mut request = client
    .post(url)
    .header("Content-Type", "application/octet-stream");
  for (k, v) in rupload_headers(token, bytes.len() as u64) {
    request = request.header(k, v);
  }
  let response = request
    .body(bytes)
    .send()
    .await
    .map_err(|e| e.to_string())?;
  json_or_error(response, "Meta refused the video upload.")
    .await
    .map(|_| ())
}

/// Posts a video file from this computer as an Instagram Reel (now) or a Facebook Reel
/// (now or scheduled on Meta), waits for Meta to finish, and says what Meta did.
#[tauri::command]
pub(crate) async fn meta_publish_video(
  rate_limiter: tauri::State<'_, crate::RateLimiter>,
  request: MetaVideoRequest,
) -> Result<MetaVideoProof, String> {
  rate_limiter.check_and_record("meta_publish_video")?;
  let platform = request.platform.trim().to_ascii_lowercase();
  if !matches!(platform.as_str(), "instagram" | "facebook") {
    return Ok(proof(&platform, "failed", "Use 'instagram' or 'facebook'."));
  }
  if !request.approved {
    return Ok(proof(
      &platform,
      "failed",
      "Not posted: this needs your approval.",
    ));
  }
  let path = std::path::PathBuf::from(request.local_file_path.trim());
  let size = match check_video_file(&path) {
    Ok(size) => size,
    Err(message) => return Ok(proof(&platform, "failed", message)),
  };
  let keys = resolve_meta_credentials(request.credentials.clone());
  let caption = request.caption.clone().unwrap_or_default();
  let client = reqwest::Client::builder()
    .timeout(Duration::from_secs(900))
    .user_agent("Alphonso-Meta-Publish/0.2")
    .build()
    .map_err(|e| e.to_string())?;
  let version = meta_graph_api_version();
  let base = format!("https://graph.facebook.com/{version}");
  let result = if platform == "instagram" {
    if keys.access_token.trim().is_empty() || keys.ig_user_id.trim().is_empty() {
      return Ok(proof(&platform, "setup_required", "Add the Meta access token and Instagram Business Account ID in Settings → Connectors → Meta."));
    }
    let _ = size;
    post_instagram(
      &client,
      &base,
      &version,
      &keys.access_token,
      &keys.app_secret,
      &keys.ig_user_id,
      &caption,
      &path,
    )
    .await
  } else {
    if keys.page_token.trim().is_empty() || keys.page_id.trim().is_empty() {
      return Ok(proof(
        &platform,
        "setup_required",
        "Add the Meta access token and Page ID in Settings → Connectors → Meta.",
      ));
    }
    let schedule = match facebook_schedule(now_ms(), request.scheduled_at_ms) {
      Ok(s) => s,
      Err(message) => return Ok(proof(&platform, "failed", message)),
    };
    post_facebook(
      &client,
      &base,
      &version,
      &keys.page_token,
      &keys.app_secret,
      &keys.page_id,
      &caption,
      request.title.as_deref().unwrap_or(""),
      schedule,
      &path,
    )
    .await
  };
  Ok(result.unwrap_or_else(|message| proof(&platform, "failed", message)))
}

#[allow(clippy::too_many_arguments)]
async fn post_instagram(
  client: &reqwest::Client,
  base: &str,
  version: &str,
  token: &str,
  app_secret: &str,
  ig_user: &str,
  caption: &str,
  path: &std::path::Path,
) -> Result<MetaVideoProof, String> {
  let auth = auth_query(token, app_secret);
  let created = json_or_error(
    client
      .post(format!("{base}/{}/media", ig_user.trim()))
      .query(&auth)
      .query(&[("upload_type", "resumable")])
      .form(&instagram_reel_form(caption))
      .send()
      .await
      .map_err(|e| e.to_string())?,
    "Instagram refused to start the upload.",
  )
  .await?;
  let container = created
    .get("id")
    .and_then(Value::as_str)
    .unwrap_or("")
    .to_string();
  if container.is_empty() {
    return Err("Instagram did not return an upload id.".to_string());
  }
  let bytes = tokio::fs::read(path).await.map_err(|e| e.to_string())?;
  rupload(
    client,
    &format!("https://rupload.facebook.com/ig-api-upload/{version}/{container}"),
    token,
    bytes,
  )
  .await?;
  let deadline = std::time::Instant::now() + Duration::from_secs(PROCESSING_WAIT_SECS);
  loop {
    let status = json_or_error(
      client
        .get(format!("{base}/{container}"))
        .query(&auth)
        .query(&[("fields", "status_code,status")])
        .send()
        .await
        .map_err(|e| e.to_string())?,
      "Could not read Instagram's processing status.",
    )
    .await?;
    match instagram_container_state(
      status
        .get("status_code")
        .and_then(Value::as_str)
        .unwrap_or(""),
    ) {
      UploadState::Ready => break,
      UploadState::Failed(message) => {
        let detail = status.get("status").and_then(Value::as_str).unwrap_or("");
        return Err(if detail.is_empty() {
          message
        } else {
          format!("{message} ({detail})")
        });
      }
      UploadState::Waiting if std::time::Instant::now() > deadline => {
        return Err(
          "Instagram was still processing the video after 10 minutes; nothing was posted."
            .to_string(),
        )
      }
      UploadState::Waiting => tokio::time::sleep(Duration::from_secs(5)).await,
    }
  }
  let published = json_or_error(
    client
      .post(format!("{base}/{}/media_publish", ig_user.trim()))
      .query(&auth)
      .form(&[("creation_id", container.as_str())])
      .send()
      .await
      .map_err(|e| e.to_string())?,
    "Instagram refused to publish the Reel.",
  )
  .await?;
  let media_id = published
    .get("id")
    .and_then(Value::as_str)
    .unwrap_or("")
    .to_string();
  if media_id.is_empty() {
    return Err("Instagram did not confirm the post.".to_string());
  }
  let permalink = client
    .get(format!("{base}/{media_id}"))
    .query(&auth)
    .query(&[("fields", "permalink")])
    .send()
    .await
    .ok();
  let url = match permalink {
    Some(r) => r.json::<Value>().await.ok().and_then(|v| {
      v.get("permalink")
        .and_then(Value::as_str)
        .map(str::to_string)
    }),
    None => None,
  };
  Ok(MetaVideoProof {
    post_id: Some(media_id),
    url,
    ..proof("instagram", "posted", "Posted on Instagram.")
  })
}

#[allow(clippy::too_many_arguments)]
async fn post_facebook(
  client: &reqwest::Client,
  base: &str,
  version: &str,
  token: &str,
  app_secret: &str,
  page_id: &str,
  caption: &str,
  title: &str,
  schedule: Option<u64>,
  path: &std::path::Path,
) -> Result<MetaVideoProof, String> {
  let auth = auth_query(token, app_secret);
  let reels = format!("{base}/{}/video_reels", page_id.trim());
  let started = json_or_error(
    client
      .post(&reels)
      .query(&auth)
      .form(&[("upload_phase", "start")])
      .send()
      .await
      .map_err(|e| e.to_string())?,
    "Facebook refused to start the upload.",
  )
  .await?;
  let video_id = started
    .get("video_id")
    .and_then(Value::as_str)
    .unwrap_or("")
    .to_string();
  if video_id.is_empty() {
    return Err("Facebook did not return an upload id.".to_string());
  }
  let upload_url = started
    .get("upload_url")
    .and_then(Value::as_str)
    .filter(|u| u.starts_with("https://rupload.facebook.com/"))
    .map(str::to_string)
    .unwrap_or_else(|| format!("https://rupload.facebook.com/video-upload/{version}/{video_id}"));
  let bytes = tokio::fs::read(path).await.map_err(|e| e.to_string())?;
  rupload(client, &upload_url, token, bytes).await?;
  let mut finish: Vec<(String, String)> = vec![
    ("upload_phase".into(), "finish".into()),
    ("video_id".into(), video_id.clone()),
    (
      "video_state".into(),
      if schedule.is_some() {
        "SCHEDULED"
      } else {
        "PUBLISHED"
      }
      .into(),
    ),
    ("description".into(), caption.trim().to_string()),
  ];
  if !title.trim().is_empty() {
    finish.push(("title".into(), title.trim().to_string()));
  }
  if let Some(at) = schedule {
    finish.push(("scheduled_publish_time".into(), at.to_string()));
  }
  json_or_error(
    client
      .post(&reels)
      .query(&auth)
      .form(&finish)
      .send()
      .await
      .map_err(|e| e.to_string())?,
    "Facebook refused to publish the Reel.",
  )
  .await?;
  let deadline = std::time::Instant::now() + Duration::from_secs(PROCESSING_WAIT_SECS);
  loop {
    let body = json_or_error(
      client
        .get(format!("{base}/{video_id}"))
        .query(&auth)
        .query(&[("fields", "status")])
        .send()
        .await
        .map_err(|e| e.to_string())?,
      "Could not read Facebook's processing status.",
    )
    .await?;
    let status = body.get("status").cloned().unwrap_or(Value::Null);
    match facebook_reel_state(&status) {
      UploadState::Ready => {
        let scheduled = status
          .get("publishing_phase")
          .and_then(|p| p.get("publish_status"))
          .and_then(Value::as_str)
          == Some("scheduled");
        return Ok(MetaVideoProof {
          post_id: Some(video_id.clone()),
          url: Some(format!("https://www.facebook.com/reel/{video_id}")),
          publish_at_ms: schedule.map(|s| s * 1000),
          ..proof(
            "facebook",
            if scheduled { "scheduled" } else { "posted" },
            if scheduled { "Scheduled on Facebook." } else { "Posted on Facebook." },
          )
        });
      }
      UploadState::Failed(message) => return Err(message),
      UploadState::Waiting if std::time::Instant::now() > deadline => {
        return Err(format!("Facebook was still processing the Reel after 10 minutes (video {video_id}); check your Page before posting it again."))
      }
      UploadState::Waiting => tokio::time::sleep(Duration::from_secs(5)).await,
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use serde_json::json;

  const NOW: u64 = 1_800_000_000_000;
  const MIN: u64 = 60_000;

  #[test]
  fn facebook_schedule_posts_soon_times_now_and_refuses_far_ones() {
    assert_eq!(facebook_schedule(NOW, None), Ok(None));
    assert_eq!(
      facebook_schedule(NOW, Some(NOW - 5 * MIN)),
      Ok(None),
      "a past time posts now"
    );
    assert_eq!(
      facebook_schedule(NOW, Some(NOW + 9 * MIN)),
      Ok(None),
      "Meta needs more than 10 minutes"
    );
    assert_eq!(
      facebook_schedule(NOW, Some(NOW + 120 * MIN)),
      Ok(Some((NOW + 120 * MIN) / 1000))
    );
    assert_eq!(
      facebook_schedule(NOW, Some(NOW + 28 * 24 * 60 * MIN)),
      Ok(Some((NOW + 28 * 24 * 60 * MIN) / 1000))
    );
    let far = facebook_schedule(NOW, Some(NOW + 30 * 24 * 60 * MIN)).unwrap_err();
    assert!(far.contains("29 days"), "{far}");
  }

  #[test]
  fn instagram_container_states() {
    assert_eq!(instagram_container_state("FINISHED"), UploadState::Ready);
    assert_eq!(instagram_container_state("PUBLISHED"), UploadState::Ready);
    assert_eq!(
      instagram_container_state("IN_PROGRESS"),
      UploadState::Waiting
    );
    assert!(matches!(
      instagram_container_state("ERROR"),
      UploadState::Failed(_)
    ));
    assert!(matches!(
      instagram_container_state("EXPIRED"),
      UploadState::Failed(_)
    ));
  }

  #[test]
  fn facebook_reel_states() {
    let processing =
      json!({ "video_status": "processing", "processing_phase": { "status": "in_progress" } });
    assert_eq!(facebook_reel_state(&processing), UploadState::Waiting);
    let published = json!({ "video_status": "ready", "publishing_phase": { "status": "completed", "publish_status": "published" } });
    assert_eq!(facebook_reel_state(&published), UploadState::Ready);
    let scheduled = json!({ "video_status": "ready", "publishing_phase": { "status": "completed", "publish_status": "scheduled" } });
    assert_eq!(facebook_reel_state(&scheduled), UploadState::Ready);
    let failed = json!({ "video_status": "error", "processing_phase": { "status": "error", "errors": [{ "message": "Video too short" }] } });
    assert_eq!(
      facebook_reel_state(&failed),
      UploadState::Failed("Video too short".into())
    );
    let upload_failed = json!({ "video_status": "upload_failed" });
    assert!(matches!(
      facebook_reel_state(&upload_failed),
      UploadState::Failed(_)
    ));
  }

  #[test]
  fn rupload_headers_send_the_whole_file() {
    let headers = rupload_headers("tok", 1234);
    assert!(headers.contains(&("Authorization".into(), "OAuth tok".into())));
    assert!(headers.contains(&("offset".into(), "0".into())));
    assert!(headers.contains(&("file_size".into(), "1234".into())));
  }

  #[test]
  fn instagram_reel_form_is_a_reel_with_its_caption() {
    let form = instagram_reel_form("Hello #tag");
    assert!(form.contains(&("media_type".into(), "REELS".into())));
    assert!(form.contains(&("caption".into(), "Hello #tag".into())));
  }

  #[test]
  fn check_video_file_says_what_is_wrong() {
    let dir = std::env::temp_dir().join(format!("alphonso-meta-video-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let missing = check_video_file(&dir.join("none.mp4")).unwrap_err();
    assert!(missing.contains("not found"), "{missing}");
    let text = dir.join("notes.txt");
    std::fs::write(&text, b"x").unwrap();
    assert!(check_video_file(&text).unwrap_err().contains("MP4 or MOV"));
    let video = dir.join("clip.mp4");
    std::fs::write(&video, b"12345").unwrap();
    assert_eq!(check_video_file(&video), Ok(5));
    let empty = dir.join("empty.mov");
    std::fs::write(&empty, b"").unwrap();
    assert!(check_video_file(&empty).unwrap_err().contains("empty"));
    let _ = std::fs::remove_dir_all(&dir);
  }
}
