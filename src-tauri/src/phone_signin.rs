//! Signing the computer in to the user's account for phone access (phone app phase 1).
//! Opens the browser at the Alphonso sign-in page (Firebase Hosting, `gateway/signin-page`)
//! with a local port and a one-time code; the page signs in with Google, Apple or an email
//! link and comes back to `http://127.0.0.1:<port>/callback` with the Firebase refresh token.
//! The refresh token is kept only in the OS keychain; the window gets ID tokens (an hour each)
//! through `phone_id_token`, never the refresh token.
use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

pub(crate) const REFRESH_KEY: &str = "alphonso_phone_account_refresh";
const WAIT: Duration = Duration::from_secs(300);
const TOKEN_URL: &str = "https://securetoken.googleapis.com/v1/token";

struct Cached {
  id_token: String,
  email: Option<String>,
  until: Instant,
}
static CACHE: Mutex<Option<Cached>> = Mutex::new(None);

/// The sign-in page's address with what this sign-in needs; only an https page is used.
pub(crate) fn sign_in_url(
  page: &str,
  port: u16,
  state: &str,
  method: &str,
  email: &str,
) -> Result<String, String> {
  let mut url = reqwest::Url::parse(page.trim())
    .map_err(|_| "The sign-in page's address isn't valid.".to_string())?;
  if url.scheme() != "https" {
    return Err("The sign-in page must use https.".to_string());
  }
  if !["", "google", "apple", "email"].contains(&method) {
    return Err("Unknown way of signing in.".to_string());
  }
  url.set_query(None);
  url.set_fragment(None);
  {
    let mut q = url.query_pairs_mut();
    q.append_pair("port", &port.to_string())
      .append_pair("state", state);
    if !method.is_empty() {
      q.append_pair("method", method);
    }
    if !email.trim().is_empty() {
      q.append_pair("email", email.trim());
    }
  }
  Ok(url.to_string())
}

/// The refresh token from `/callback?state=…&token=…`, only when the code matches.
pub(crate) fn parse_handoff(target: &str, expected_state: &str) -> Result<String, String> {
  let url = reqwest::Url::parse(&format!("http://127.0.0.1{target}"))
    .map_err(|_| "The sign-in came back unreadable.".to_string())?;
  if url.path() != "/callback" {
    return Err("The sign-in came back unreadable.".to_string());
  }
  let get = |k: &str| {
    url
      .query_pairs()
      .find(|(key, _)| key == k)
      .map(|(_, v)| v.into_owned())
  };
  let state = get("state").unwrap_or_default();
  use subtle::ConstantTimeEq;
  if state.is_empty() || !bool::from(state.as_bytes().ct_eq(expected_state.as_bytes())) {
    return Err("The sign-in didn't match the one Alphonso started. Try again.".to_string());
  }
  match get("token") {
    Some(t) if !t.is_empty() && t.len() < 4096 => Ok(t),
    _ => Err("The sign-in came back without an account.".to_string()),
  }
}

/// The email inside an ID token (read only; the token came straight from Google over https).
pub(crate) fn email_from_id_token(id_token: &str) -> Option<String> {
  let payload = id_token.split('.').nth(1)?;
  let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
    .decode(payload.trim_end_matches('='))
    .ok()?;
  let v: Value = serde_json::from_slice(&bytes).ok()?;
  v.get("email").and_then(Value::as_str).map(str::to_string)
}

fn valid_api_key(key: &str) -> bool {
  !key.is_empty()
    && key.len() < 100
    && key
      .chars()
      .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// The local answer: removes the address (which carried the token) from the browser's history.
fn done_page(ok: bool) -> String {
  let text = if ok {
    "Signed in. You can close this tab and go back to Alphonso."
  } else {
    "The sign-in did not finish. Go back to Alphonso to see why."
  };
  let body = format!(
    "<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"referrer\" content=\"no-referrer\"><script>history.replaceState(null,'','/done')</script></head><body style=\"font-family:sans-serif;padding:2rem\"><h2>{text}</h2></body></html>"
  );
  format!(
    "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nCache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
    body.len()
  )
}

async fn wait_for_handoff(
  listener: tokio::net::TcpListener,
  state: &str,
) -> Result<String, String> {
  let deadline = tokio::time::Instant::now() + WAIT;
  loop {
    let Ok(Ok((mut socket, _))) = tokio::time::timeout_at(deadline, listener.accept()).await else {
      return Err("No answer from the browser within 5 minutes. Try again.".to_string());
    };
    let mut buf = vec![0u8; 16384];
    let n = tokio::time::timeout(Duration::from_secs(10), socket.read(&mut buf))
      .await
      .ok()
      .and_then(Result::ok)
      .unwrap_or(0);
    let request = String::from_utf8_lossy(&buf[..n]);
    let target = request
      .lines()
      .next()
      .and_then(|l| l.split_whitespace().nth(1))
      .unwrap_or("")
      .to_string();
    if !target.starts_with("/callback") {
      let _ = socket
        .write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
        .await;
      continue;
    }
    let result = parse_handoff(&target, state);
    let _ = socket.write_all(done_page(result.is_ok()).as_bytes()).await;
    let _ = socket.shutdown().await;
    return result;
  }
}

/// Swaps a refresh token for an ID token at Firebase; returns (id token, new refresh token, seconds).
async fn refresh(api_key: &str, refresh_token: &str) -> Result<(String, String, u64), String> {
  let client = reqwest::Client::builder()
    .timeout(Duration::from_secs(30))
    .redirect(reqwest::redirect::Policy::none())
    .build()
    .map_err(|_| "Could not reach the sign-in service.".to_string())?;
  let res = client
    .post(TOKEN_URL)
    .query(&[("key", api_key)])
    .form(&[
      ("grant_type", "refresh_token"),
      ("refresh_token", refresh_token),
    ])
    .send()
    .await
    .map_err(|_| "Could not reach the sign-in service.".to_string())?;
  let ok = res.status().is_success();
  let body: Value = res.json().await.unwrap_or(Value::Null);
  if !ok {
    let code = body
      .pointer("/error/message")
      .and_then(Value::as_str)
      .unwrap_or("");
    return Err(
      if code.contains("TOKEN_EXPIRED")
        || code.contains("USER_DISABLED")
        || code.contains("USER_NOT_FOUND")
        || code.contains("INVALID_REFRESH_TOKEN")
      {
        "Your sign-in has ended. Sign in again.".to_string()
      } else {
        "The sign-in service refused it.".to_string()
      },
    );
  }
  let id = body
    .get("id_token")
    .and_then(Value::as_str)
    .unwrap_or("")
    .to_string();
  let next = body
    .get("refresh_token")
    .and_then(Value::as_str)
    .unwrap_or(refresh_token)
    .to_string();
  let secs = body
    .get("expires_in")
    .and_then(Value::as_str)
    .and_then(|s| s.parse().ok())
    .unwrap_or(3600);
  if id.is_empty() {
    return Err("The sign-in service gave no account.".to_string());
  }
  Ok((id, next, secs))
}

fn keep(id_token: &str, email: Option<String>, secs: u64) {
  if let Ok(mut c) = CACHE.lock() {
    *c = Some(Cached {
      id_token: id_token.to_string(),
      email,
      // Renewed five minutes before Firebase would refuse it.
      until: Instant::now() + Duration::from_secs(secs.saturating_sub(300)),
    });
  }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PhoneSignInRequest {
  page_url: String,
  api_key: String,
  #[serde(default)]
  method: String,
  #[serde(default)]
  email: String,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PhoneSignInResult {
  ok: bool,
  #[serde(skip_serializing_if = "Option::is_none")]
  email: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  reason: Option<String>,
}

fn failed(reason: impl Into<String>) -> PhoneSignInResult {
  PhoneSignInResult {
    ok: false,
    email: None,
    reason: Some(reason.into()),
  }
}

/// Opens the sign-in page and waits (5 minutes at most) for it to come back to this computer.
#[tauri::command]
pub(crate) async fn phone_sign_in(
  app: tauri::AppHandle,
  request: PhoneSignInRequest,
) -> PhoneSignInResult {
  if !valid_api_key(request.api_key.trim()) {
    return failed("This build has no sign-in set up.");
  }
  let Ok(listener) = tokio::net::TcpListener::bind(("127.0.0.1", 0)).await else {
    return failed("Could not start the sign-in on this computer.");
  };
  let Ok(port) = listener.local_addr().map(|a| a.port()) else {
    return failed("Could not start the sign-in on this computer.");
  };
  let bytes: Vec<u8> = (0..32).map(|_| rand::random::<u8>()).collect();
  let state = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes);
  let url = match sign_in_url(
    &request.page_url,
    port,
    &state,
    request.method.trim(),
    &request.email,
  ) {
    Ok(u) => u,
    Err(e) => return failed(e),
  };
  use tauri_plugin_opener::OpenerExt;
  if app.opener().open_url(url, None::<&str>).is_err() {
    return failed("The browser could not be opened.");
  }
  let token = match wait_for_handoff(listener, &state).await {
    Ok(t) => t,
    Err(e) => return failed(e),
  };
  let (id, next, secs) = match refresh(request.api_key.trim(), &token).await {
    Ok(v) => v,
    Err(e) => return failed(e),
  };
  if crate::os_keychain_store::secure_credential_set(REFRESH_KEY.to_string(), next).is_err() {
    return failed("This computer's keychain refused to keep the sign-in.");
  }
  let email = email_from_id_token(&id);
  keep(&id, email.clone(), secs);
  PhoneSignInResult {
    ok: true,
    email,
    reason: None,
  }
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PhoneIdToken {
  #[serde(skip_serializing_if = "Option::is_none")]
  id_token: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  email: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  reason: Option<String>,
}

/// A current ID token for the relay, renewed from the keychain's sign-in when needed; none
/// when signed out.
#[tauri::command]
pub(crate) async fn phone_id_token(api_key: String) -> PhoneIdToken {
  if let Ok(c) = CACHE.lock() {
    if let Some(c) = c.as_ref().filter(|c| Instant::now() < c.until) {
      return PhoneIdToken {
        id_token: Some(c.id_token.clone()),
        email: c.email.clone(),
        reason: None,
      };
    }
  }
  let Some(stored) = crate::os_keychain_store::secure_credential_get(REFRESH_KEY.to_string())
    .ok()
    .flatten()
  else {
    return PhoneIdToken::default();
  };
  if !valid_api_key(api_key.trim()) {
    return PhoneIdToken {
      reason: Some("This build has no sign-in set up.".to_string()),
      ..Default::default()
    };
  }
  match refresh(api_key.trim(), &stored).await {
    Ok((id, next, secs)) => {
      if next != stored {
        let _ = crate::os_keychain_store::secure_credential_set(REFRESH_KEY.to_string(), next);
      }
      let email = email_from_id_token(&id);
      keep(&id, email.clone(), secs);
      PhoneIdToken {
        id_token: Some(id),
        email,
        reason: None,
      }
    }
    Err(reason) => PhoneIdToken {
      reason: Some(reason),
      ..Default::default()
    },
  }
}

/// Forgets the sign-in on this computer.
#[tauri::command]
pub(crate) fn phone_sign_out() -> Result<(), String> {
  if let Ok(mut c) = CACHE.lock() {
    *c = None;
  }
  crate::os_keychain_store::secure_credential_delete(REFRESH_KEY.to_string())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn sign_in_url_carries_the_port_code_and_method_and_needs_https() {
    let u = sign_in_url(
      "https://example.web.app/?x=1#y",
      53123,
      "s".repeat(32).as_str(),
      "google",
      " a@b.c ",
    )
    .unwrap();
    let parsed = reqwest::Url::parse(&u).unwrap();
    let q: std::collections::HashMap<_, _> = parsed.query_pairs().into_owned().collect();
    assert_eq!(q.get("port").map(String::as_str), Some("53123"));
    assert_eq!(q.get("method").map(String::as_str), Some("google"));
    assert_eq!(q.get("email").map(String::as_str), Some("a@b.c"));
    assert!(q.get("x").is_none());
    assert!(parsed.fragment().is_none());
    assert!(sign_in_url("http://example.web.app/", 1, "s", "", "").is_err());
    assert!(sign_in_url("https://example.web.app/", 1, "s", "facebook", "").is_err());
  }

  #[test]
  fn the_handoff_is_taken_only_with_the_matching_code() {
    let s = "a".repeat(32);
    assert_eq!(
      parse_handoff(&format!("/callback?state={s}&token=tok%2Fen"), &s).unwrap(),
      "tok/en"
    );
    assert!(parse_handoff(&format!("/callback?state={}&token=t", "b".repeat(32)), &s).is_err());
    assert!(parse_handoff("/callback?token=t", &s).is_err());
    assert!(parse_handoff(&format!("/callback?state={s}"), &s).is_err());
    assert!(parse_handoff(&format!("/other?state={s}&token=t"), &s).is_err());
  }

  #[test]
  fn the_email_is_read_from_the_id_token() {
    let payload =
      base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(br#"{"email":"a@b.c","sub":"1"}"#);
    assert_eq!(
      email_from_id_token(&format!("h.{payload}.s")).as_deref(),
      Some("a@b.c")
    );
    assert_eq!(email_from_id_token("nonsense"), None);
  }

  #[test]
  fn the_local_page_removes_the_token_from_the_history() {
    let page = done_page(true);
    assert!(page.contains("history.replaceState(null,'','/done')"));
    assert!(page.contains("no-store"));
  }
}
