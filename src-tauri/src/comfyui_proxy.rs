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

/// Paths the image generator needs. Anything else is refused.
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
    "POST" => path == "/prompt",
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

#[cfg(test)]
mod tests {
  use super::{allowed_path, loopback_base};

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
    ] {
      assert!(allowed_path(method, path), "{method} {path}");
    }
    for (method, path) in [
      ("POST", "/system_stats"),
      ("GET", "/prompt"),
      ("POST", "/interrupt"),
      ("POST", "/free"),
      ("GET", "/userdata/x"),
      ("GET", "/view/../../etc/passwd"),
      ("GET", "history/abc"),
      ("DELETE", "/history/abc"),
    ] {
      assert!(!allowed_path(method, path), "{method} {path}");
    }
  }
}
