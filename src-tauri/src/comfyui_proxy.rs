//! Backend route for the app's own ComfyUI calls.
//!
//! ComfyUI answers any request that carries a foreign `Origin` header with
//! 403 (its default cross-origin protection). The app window always sends
//! one (`http://tauri.localhost` on Windows, the dev server origin in a
//! browser), so calling ComfyUI with `fetch` from the window never worked
//! against a current ComfyUI. A request made from here has no `Origin`.
//!
//! Deliberately narrow: loopback endpoints only, GET/POST only, and only the
//! handful of ComfyUI paths the image generator uses. It is not a general
//! local HTTP proxy.

use base64::Engine;
use serde::Serialize;
use std::time::Duration;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ComfyUiResponse {
  status: u16,
  /// Response body as text (empty for image responses).
  body: String,
  /// Response body as base64, set only for `/view` (image bytes).
  body_base64: Option<String>,
}

/// Paths the image generator needs, plus `POST /free` (the resource manager
/// asks ComfyUI to drop its loaded models). Anything else is refused.
fn allowed_path(method: &str, path: &str) -> bool {
  if path.contains("..") || path.contains('\\') || !path.starts_with('/') {
    return false;
  }
  match method {
    "GET" => {
      path == "/system_stats"
        || path.starts_with("/object_info/")
        || path.starts_with("/history/")
        || path.starts_with("/view?")
    }
    "POST" => path == "/prompt" || path == "/free",
    _ => false,
  }
}

/// `scheme://host:port` for a loopback http endpoint, or `None`.
fn loopback_base(endpoint: &str) -> Option<String> {
  let url = reqwest::Url::parse(endpoint.trim()).ok()?;
  if url.scheme() != "http" {
    return None;
  }
  let host = url.host_str()?;
  let loopback = host.eq_ignore_ascii_case("localhost")
    || host
      .trim_matches(|c| c == '[' || c == ']')
      .parse::<std::net::IpAddr>()
      .map(|ip| ip.is_loopback())
      .unwrap_or(false);
  if !loopback {
    return None;
  }
  let port = url.port_or_known_default()?;
  Some(format!("http://{host}:{port}"))
}

#[tauri::command]
pub(crate) async fn comfyui_request(
  endpoint: String,
  method: String,
  path: String,
  body: Option<String>,
  http_client: tauri::State<'_, reqwest::Client>,
) -> Result<ComfyUiResponse, String> {
  let method = method.trim().to_ascii_uppercase();
  let base = loopback_base(&endpoint)
    .ok_or_else(|| "ComfyUI endpoint must be an http address on this machine.".to_string())?;
  if !allowed_path(&method, &path) {
    return Err(format!("ComfyUI request not allowed: {method} {path}"));
  }

  let url = format!("{base}{path}");
  let request = if method == "POST" {
    http_client
      .post(&url)
      .header("Content-Type", "application/json")
      .body(body.unwrap_or_default())
  } else {
    http_client.get(&url)
  };
  let response = request
    .timeout(Duration::from_secs(30))
    .send()
    .await
    .map_err(|error| format!("ComfyUI is not reachable at {base}: {error}"))?;

  let status = response.status().as_u16();
  if path.starts_with("/view?") {
    let bytes = response.bytes().await.map_err(|error| error.to_string())?;
    return Ok(ComfyUiResponse {
      status,
      body: String::new(),
      body_base64: Some(base64::engine::general_purpose::STANDARD.encode(bytes)),
    });
  }
  Ok(ComfyUiResponse {
    status,
    body: response.text().await.map_err(|error| error.to_string())?,
    body_base64: None,
  })
}

// ── AI clips (content factory phase 2b) ────────────────────────────────────

/// A scene picture as a `multipart/form-data` body for ComfyUI's `/upload/image`.
pub(crate) fn multipart_image_body(boundary: &str, filename: &str, bytes: &[u8]) -> Vec<u8> {
  multipart_upload_body(boundary, filename, upload_mime(filename), bytes)
}

/// The type ComfyUI's upload is told: a picture, or a motion clip (phase 4c).
pub(crate) fn upload_mime(filename: &str) -> &'static str {
  if filename.to_ascii_lowercase().ends_with(".mp4") {
    "video/mp4"
  } else {
    "image/png"
  }
}

pub(crate) fn multipart_upload_body(
  boundary: &str,
  filename: &str,
  mime: &str,
  bytes: &[u8],
) -> Vec<u8> {
  let mut body = Vec::with_capacity(bytes.len() + 512);
  let head = format!(
    "--{boundary}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"{filename}\"\r\nContent-Type: {mime}\r\n\r\n"
  );
  body.extend_from_slice(head.as_bytes());
  body.extend_from_slice(bytes);
  body.extend_from_slice(
    format!("\r\n--{boundary}\r\nContent-Disposition: form-data; name=\"overwrite\"\r\n\r\ntrue\r\n--{boundary}--\r\n").as_bytes(),
  );
  body
}

/// A name ComfyUI may use for a file: no folders, no `..`, nothing odd.
pub(crate) fn safe_comfy_name(name: &str) -> bool {
  !name.is_empty()
    && name.len() <= 200
    && !name.contains("..")
    && name
      .chars()
      .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | ' '))
}

/// `/view?…` for one of ComfyUI's output files.
pub(crate) fn view_path(filename: &str, subfolder: &str, kind: &str) -> Result<String, String> {
  if !safe_comfy_name(filename)
    || !(subfolder.is_empty() || subfolder.split('/').all(safe_comfy_name))
    || !matches!(kind, "output" | "temp")
  {
    return Err("That is not a ComfyUI output file.".to_string());
  }
  let url = reqwest::Url::parse_with_params(
    "http://x/view",
    &[
      ("filename", filename),
      ("subfolder", subfolder),
      ("type", kind),
    ],
  )
  .map_err(|e| e.to_string())?;
  Ok(format!("/view?{}", url.query().unwrap_or_default()))
}

const MAX_CLIP_BYTES: u64 = 500 * 1024 * 1024;

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadImageRequest {
  endpoint: String,
  workspace_root: String,
  rel_path: String,
}

/// Sends a scene picture to ComfyUI's input folder; returns the name to use in a workflow.
#[tauri::command]
pub(crate) async fn comfyui_upload_image(
  request: UploadImageRequest,
  http_client: tauri::State<'_, reqwest::Client>,
) -> Result<serde_json::Value, String> {
  let base = loopback_base(&request.endpoint)
    .ok_or_else(|| "ComfyUI endpoint must be an http address on this machine.".to_string())?;
  let file = crate::media_tools::checked_file(
    &request.workspace_root,
    &request.rel_path,
    // A motion clip too (phase 4c), for ComfyUI's LoadVideo.
    &["png", "jpg", "jpeg", "webp", "mp4"],
  )?;
  let bytes = std::fs::read(&file).map_err(|_| "The scene picture is missing.".to_string())?;
  let name = format!(
    "alphonso-{}",
    file
      .file_name()
      .map(|n| n.to_string_lossy().to_string())
      .unwrap_or_default()
  );
  if !safe_comfy_name(&name) {
    return Err("The picture's file name cannot be sent to ComfyUI.".to_string());
  }
  let boundary = format!(
    "alphonso{}",
    std::time::SystemTime::now()
      .duration_since(std::time::UNIX_EPOCH)
      .map(|d| d.as_nanos())
      .unwrap_or(0)
  );
  let response = http_client
    .post(format!("{base}/upload/image"))
    .header(
      "Content-Type",
      format!("multipart/form-data; boundary={boundary}"),
    )
    .body(multipart_image_body(&boundary, &name, &bytes))
    .timeout(Duration::from_secs(60))
    .send()
    .await
    .map_err(|error| format!("ComfyUI is not reachable at {base}: {error}"))?;
  if !response.status().is_success() {
    return Err(format!(
      "ComfyUI refused the picture (HTTP {}).",
      response.status().as_u16()
    ));
  }
  let json: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
  let stored = json["name"].as_str().unwrap_or(&name).to_string();
  let subfolder = json["subfolder"].as_str().unwrap_or("").to_string();
  Ok(
    serde_json::json!({ "name": if subfolder.is_empty() { stored } else { format!("{subfolder}/{stored}") } }),
  )
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveOutputRequest {
  endpoint: String,
  filename: String,
  subfolder: String,
  kind: String,
  workspace_root: String,
  rel_path: String,
}

/// Saves one of ComfyUI's output videos into the project folder (500 MB at most;
/// written as .part, then renamed; never over an existing file).
#[tauri::command]
pub(crate) async fn comfyui_save_output(
  request: SaveOutputRequest,
  http_client: tauri::State<'_, reqwest::Client>,
) -> Result<serde_json::Value, String> {
  use tokio::io::AsyncWriteExt;
  let base = loopback_base(&request.endpoint)
    .ok_or_else(|| "ComfyUI endpoint must be an http address on this machine.".to_string())?;
  let path = view_path(&request.filename, &request.subfolder, &request.kind)?;
  let dest =
    crate::media_tools::checked_file(&request.workspace_root, &request.rel_path, &["mp4", "webm"])?;
  if dest.exists() {
    return Err("That clip already exists; nothing was overwritten.".to_string());
  }
  if let Some(parent) = dest.parent() {
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
  }
  let mut response = http_client
    .get(format!("{base}{path}"))
    .timeout(Duration::from_secs(600))
    .send()
    .await
    .map_err(|error| format!("ComfyUI is not reachable at {base}: {error}"))?;
  if !response.status().is_success() {
    return Err(format!(
      "ComfyUI did not return the clip (HTTP {}).",
      response.status().as_u16()
    ));
  }
  let part = dest.with_extension("part");
  let mut file = tokio::fs::File::create(&part)
    .await
    .map_err(|e| e.to_string())?;
  let mut bytes: u64 = 0;
  while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
    bytes += chunk.len() as u64;
    if bytes > MAX_CLIP_BYTES {
      drop(file);
      let _ = tokio::fs::remove_file(&part).await;
      return Err("The clip is larger than 500 MB.".to_string());
    }
    file.write_all(&chunk).await.map_err(|e| e.to_string())?;
  }
  file.flush().await.map_err(|e| e.to_string())?;
  drop(file);
  tokio::fs::rename(&part, &dest)
    .await
    .map_err(|e| e.to_string())?;
  Ok(serde_json::json!({ "path": dest.to_string_lossy(), "bytes": bytes }))
}

#[cfg(test)]
mod tests {
  use super::{
    allowed_path, loopback_base, multipart_image_body, safe_comfy_name, upload_mime, view_path,
  };

  #[test]
  fn accepts_only_loopback_http_endpoints() {
    assert_eq!(
      loopback_base("http://127.0.0.1:8188"),
      Some("http://127.0.0.1:8188".to_string())
    );
    assert_eq!(
      loopback_base(" http://localhost:8188/ "),
      Some("http://localhost:8188".to_string())
    );
    for bad in [
      "https://127.0.0.1:8188",
      "http://192.168.1.10:8188",
      "http://169.254.169.254",
      "http://example.com:8188",
      "http://localhost.evil.com:8188",
      "file:///c:/windows",
      "not a url",
    ] {
      assert_eq!(loopback_base(bad), None, "{bad}");
    }
  }

  #[test]
  fn allows_only_the_image_generator_paths() {
    for (method, path) in [
      ("GET", "/system_stats"),
      ("GET", "/object_info/CheckpointLoaderSimple"),
      ("GET", "/history/abc-123"),
      ("GET", "/view?filename=a.png&type=output"),
      ("POST", "/prompt"),
      ("POST", "/free"),
    ] {
      assert!(allowed_path(method, path), "{method} {path}");
    }
    for (method, path) in [
      ("POST", "/system_stats"),
      ("GET", "/prompt"),
      ("POST", "/interrupt"),
      ("GET", "/free"),
      ("GET", "/userdata/x"),
      ("GET", "/view/../../etc/passwd"),
      ("GET", "history/abc"),
      ("DELETE", "/history/abc"),
    ] {
      assert!(!allowed_path(method, path), "{method} {path}");
    }
  }

  #[test]
  fn builds_an_image_upload_body() {
    let body = String::from_utf8(multipart_image_body("B", "alphonso-v1-s1.png", b"PNG")).unwrap();
    assert!(body.starts_with("--B\r\nContent-Disposition: form-data; name=\"image\"; filename=\"alphonso-v1-s1.png\"\r\nContent-Type: image/png\r\n\r\nPNG\r\n--B\r\n"));
    assert!(body.contains("name=\"overwrite\"\r\n\r\ntrue\r\n"));
    assert!(body.ends_with("--B--\r\n"));
  }

  #[test]
  fn only_plain_output_files_can_be_fetched() {
    assert_eq!(
      view_path("clip_00001_.mp4", "", "output").unwrap(),
      "/view?filename=clip_00001_.mp4&subfolder=&type=output"
    );
    assert!(view_path("clip.mp4", "video/a b", "output")
      .unwrap()
      .contains("subfolder=video%2Fa+b"));
    assert!(view_path("../secret.txt", "", "output").is_err());
    assert!(view_path("clip.mp4", "..", "output").is_err());
    assert!(view_path("clip.mp4", "", "input").is_err());
    assert!(view_path("a\\b.mp4", "", "output").is_err());
    assert!(safe_comfy_name("alphonso-v1-s1.png"));
    assert!(!safe_comfy_name(""));
  }
  #[test]
  fn a_motion_clip_is_uploaded_as_a_video() {
    assert_eq!(upload_mime("alphonso-s1-v1.mp4"), "video/mp4");
    assert_eq!(upload_mime("alphonso-v1-s1.png"), "image/png");
    let body = String::from_utf8(multipart_image_body("B", "alphonso-s1-v1.mp4", b"MP4")).unwrap();
    assert!(body.contains("Content-Type: video/mp4"));
  }
}
