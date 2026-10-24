//! Signing in to YouTube, Facebook (Meta) and Instagram from the app (content factory
//! phase 3c): no terminal. The user's own Google project / Meta app is used (its id and
//! secret come from Settings). Alphonso opens the browser, listens on `127.0.0.1` at a
//! fixed local address (YouTube 8085, Meta 8086, Instagram 8087, `/callback`) for at most
//! 5 minutes, checks a random `state`, uses PKCE where the service supports it, and
//! exchanges the code for tokens here. When a service can't send the browser back to this
//! computer, the user pastes the address the browser ended on (`oauth_finish_pasted`).
//! Tokens are returned to the app, which saves them in the OS keychain; nothing from a
//! token or secret goes into an error message.

use base64::Engine as _;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

/// How long Alphonso waits for the browser to come back.
pub(crate) const SIGN_IN_WAIT: Duration = Duration::from_secs(300);
const GOOGLE_SCOPES: &str = "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly";
const META_SCOPES: &str = "pages_show_list,pages_read_engagement,pages_manage_posts,pages_manage_metadata,instagram_basic,instagram_content_publish,business_management,public_profile,instagram_manage_insights,read_insights,pages_manage_engagement";
const INSTAGRAM_SCOPES: &str =
  "instagram_business_basic,instagram_business_content_publish,instagram_business_manage_insights";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Service {
  YouTube,
  Meta,
  Instagram,
}

pub(crate) fn service(name: &str) -> Result<Service, String> {
  match name.trim().to_ascii_lowercase().as_str() {
    "youtube" => Ok(Service::YouTube),
    "meta" => Ok(Service::Meta),
    "instagram" => Ok(Service::Instagram),
    _ => Err("Sign in to youtube, meta or instagram.".to_string()),
  }
}

pub(crate) fn port(service: Service) -> u16 {
  match service {
    Service::YouTube => 8085,
    Service::Meta => 8086,
    Service::Instagram => 8087,
  }
}

pub(crate) fn redirect_uri(service: Service) -> String {
  format!("http://localhost:{}/callback", port(service))
}

/// The PKCE challenge for a verifier (S256, RFC 7636).
pub(crate) fn pkce_challenge(verifier: &str) -> String {
  use sha2::{Digest, Sha256};
  base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

/// A fresh PKCE verifier and its challenge.
pub(crate) fn pkce_pair() -> (String, String) {
  let bytes: Vec<u8> = (0..48).map(|_| rand::random::<u8>()).collect();
  let verifier = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes);
  let challenge = pkce_challenge(&verifier);
  (verifier, challenge)
}

/// The address the browser opens to sign in.
pub(crate) fn auth_url(service: Service, client_id: &str, state: &str, challenge: &str) -> String {
  let redirect = redirect_uri(service);
  let (base, params): (String, Vec<(&str, &str)>) = match service {
    Service::YouTube => (
      "https://accounts.google.com/o/oauth2/v2/auth".to_string(),
      vec![
        ("client_id", client_id),
        ("redirect_uri", &redirect),
        ("response_type", "code"),
        ("scope", GOOGLE_SCOPES),
        ("access_type", "offline"),
        ("prompt", "consent"),
        ("state", state),
        ("code_challenge", challenge),
        ("code_challenge_method", "S256"),
      ],
    ),
    Service::Meta => (
      format!(
        "https://www.facebook.com/{}/dialog/oauth",
        crate::meta_publish::meta_graph_api_version()
      ),
      vec![
        ("client_id", client_id),
        ("redirect_uri", &redirect),
        ("response_type", "code"),
        ("scope", META_SCOPES),
        ("state", state),
        ("code_challenge", challenge),
        ("code_challenge_method", "S256"),
      ],
    ),
    // Business Login for Instagram documents no PKCE: the state guards it.
    Service::Instagram => (
      "https://www.instagram.com/oauth/authorize".to_string(),
      vec![
        ("client_id", client_id),
        ("redirect_uri", &redirect),
        ("response_type", "code"),
        ("scope", INSTAGRAM_SCOPES),
        ("state", state),
      ],
    ),
  };
  reqwest::Url::parse_with_params(&base, &params)
    .map(|u| u.to_string())
    .unwrap_or(base)
}

/// The code from the address the browser came back to (or that the user pasted).
pub(crate) fn parse_callback(target: &str, expected_state: &str) -> Result<String, String> {
  let trimmed = target.trim();
  let full = if trimmed.starts_with('/') {
    format!("http://localhost{trimmed}")
  } else {
    trimmed.to_string()
  };
  let url = reqwest::Url::parse(&full)
    .map_err(|_| "That is not the address the browser ended on.".to_string())?;
  let query: HashMap<String, String> = url.query_pairs().into_owned().collect();
  if query.contains_key("error") {
    return Err("The sign-in was cancelled or refused.".to_string());
  }
  if query.get("state").map(String::as_str) != Some(expected_state) {
    return Err(
      "This sign-in answer does not belong to the sign-in Alphonso started. Try again.".to_string(),
    );
  }
  let code = query
    .get("code")
    .map(|c| c.trim_end_matches("#_").trim().to_string())
    .unwrap_or_default();
  if code.is_empty() {
    return Err("The sign-in was cancelled: no code came back.".to_string());
  }
  Ok(code)
}

/// The token request's form for a code.
pub(crate) fn token_form(
  service: Service,
  code: &str,
  client_id: &str,
  client_secret: &str,
  verifier: &str,
) -> Vec<(String, String)> {
  let redirect = redirect_uri(service);
  let mut form = vec![
    ("client_id".to_string(), client_id.to_string()),
    ("client_secret".to_string(), client_secret.to_string()),
    ("redirect_uri".to_string(), redirect),
    ("code".to_string(), code.to_string()),
  ];
  match service {
    Service::YouTube => {
      form.push(("grant_type".to_string(), "authorization_code".to_string()));
      form.push(("code_verifier".to_string(), verifier.to_string()));
    }
    Service::Meta => form.push(("code_verifier".to_string(), verifier.to_string())),
    Service::Instagram => form.push(("grant_type".to_string(), "authorization_code".to_string())),
  }
  form
}

pub(crate) fn token_url(service: Service) -> String {
  match service {
    Service::YouTube => "https://oauth2.googleapis.com/token".to_string(),
    Service::Meta => format!(
      "https://graph.facebook.com/{}/oauth/access_token",
      crate::meta_publish::meta_graph_api_version()
    ),
    Service::Instagram => "https://api.instagram.com/oauth/access_token".to_string(),
  }
}

/// A started sign-in, kept so a pasted address can finish it.
struct Pending {
  service: Service,
  state: String,
  verifier: String,
  started: std::time::Instant,
}

static PENDING: Mutex<Option<Pending>> = Mutex::new(None);

/// The code and verifier from a pasted address. The started sign-in is used up only
/// when the address is right, so a wrong paste can be tried again (phase 3d).
fn take_pending_if(
  slot: &mut Option<Pending>,
  service: Service,
  pasted: &str,
) -> Result<(String, String), String> {
  let usable = slot
    .as_ref()
    .filter(|p| p.service == service && p.started.elapsed() < Duration::from_secs(600))
    .ok_or_else(|| "Start the sign-in again first, then paste the address.".to_string())?;
  let code = parse_callback(pasted, &usable.state)?;
  let pending = slot.take().expect("checked above");
  Ok((code, pending.verifier))
}

/// The answer the browser sees once Alphonso has the code.
fn page(ok: bool) -> String {
  let text = if ok {
    "Signed in. You can close this tab and go back to Alphonso."
  } else {
    "The sign-in did not finish. Go back to Alphonso to see why."
  };
  let body = format!(
    "<html><body style=\"font-family:sans-serif;padding:2rem\"><h2>{text}</h2></body></html>"
  );
  format!(
    "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
    body.len()
  )
}

/// Waits for `GET /callback?…` on the listener; other requests (a favicon) get a 404.
pub(crate) async fn wait_for_callback(
  listener: tokio::net::TcpListener,
  expected_state: &str,
  wait: Duration,
) -> Result<String, String> {
  let deadline = tokio::time::Instant::now() + wait;
  loop {
    let accepted = tokio::time::timeout_at(deadline, listener.accept()).await;
    let Ok(Ok((mut socket, _))) = accepted else {
      return Err("No answer from the browser within 5 minutes. Try again, or paste the address the browser ended on.".to_string());
    };
    let mut buf = vec![0u8; 8192];
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
    let result = parse_callback(&target, expected_state);
    let _ = socket.write_all(page(result.is_ok()).as_bytes()).await;
    let _ = socket.shutdown().await;
    return result;
  }
}

#[derive(Serialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MetaPage {
  id: String,
  name: String,
  access_token: String,
  instagram_business_account_id: Option<String>,
}

#[derive(Serialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SignInResult {
  ok: bool,
  /// Connector keys to save, by name.
  tokens: HashMap<String, String>,
  /// Meta: the user's Pages, for the app to pick one.
  pages: Vec<MetaPage>,
  expires_in_secs: Option<u64>,
  reason: Option<String>,
}

fn failed(reason: impl Into<String>) -> SignInResult {
  SignInResult {
    ok: false,
    reason: Some(reason.into()),
    ..Default::default()
  }
}

/// A provider's error as plain words (its own description, never the request).
fn provider_error(body: &Value, fallback: &str) -> String {
  body
    .get("error_description")
    .or_else(|| body.get("error").and_then(|e| e.get("message")))
    .or_else(|| body.get("error_message"))
    .and_then(Value::as_str)
    .map(|s| s.chars().take(200).collect())
    .unwrap_or_else(|| fallback.to_string())
}

fn http() -> Result<reqwest::Client, String> {
  reqwest::Client::builder()
    .timeout(Duration::from_secs(60))
    .redirect(reqwest::redirect::Policy::none())
    .build()
    .map_err(|_| "Could not start the sign-in.".to_string())
}

async fn post_form(url: &str, form: &[(String, String)]) -> Result<Value, String> {
  let res = http()?
    .post(url)
    .form(form)
    .send()
    .await
    .map_err(|_| "Could not reach the sign-in service.".to_string())?;
  let ok = res.status().is_success();
  let body: Value = res.json().await.unwrap_or(Value::Null);
  if ok {
    Ok(body)
  } else {
    Err(provider_error(
      &body,
      "The sign-in service refused the code.",
    ))
  }
}

async fn get_json(url: &str, query: &[(&str, &str)]) -> Result<Value, String> {
  let res = http()?
    .get(url)
    .query(query)
    .send()
    .await
    .map_err(|_| "Could not reach the sign-in service.".to_string())?;
  let ok = res.status().is_success();
  let body: Value = res.json().await.unwrap_or(Value::Null);
  if ok {
    Ok(body)
  } else {
    Err(provider_error(
      &body,
      "The sign-in service refused the request.",
    ))
  }
}

fn text(v: &Value, key: &str) -> String {
  match v.get(key) {
    Some(Value::String(s)) => s.clone(),
    Some(Value::Number(n)) => n.to_string(),
    _ => String::new(),
  }
}

/// The Instagram Login refresh query (a long-lived token for another 60 days).
pub(crate) fn instagram_refresh_query(token: &str) -> Vec<(&'static str, String)> {
  vec![
    ("grant_type", "ig_refresh_token".to_string()),
    ("access_token", token.to_string()),
  ]
}

async fn exchange(
  service: Service,
  code: &str,
  client_id: &str,
  client_secret: &str,
  verifier: &str,
) -> SignInResult {
  let first = match post_form(
    &token_url(service),
    &token_form(service, code, client_id, client_secret, verifier),
  )
  .await
  {
    Ok(v) => v,
    Err(reason) => return failed(reason),
  };
  match service {
    Service::YouTube => {
      let refresh = text(&first, "refresh_token");
      if refresh.is_empty() {
        return failed("Google did not give a lasting sign-in. Remove Alphonso's access at myaccount.google.com/permissions, then sign in again.");
      }
      SignInResult {
        ok: true,
        tokens: HashMap::from([("YOUTUBE_REFRESH_TOKEN".to_string(), refresh)]),
        ..Default::default()
      }
    }
    Service::Meta => {
      let short = text(&first, "access_token");
      if short.is_empty() {
        return failed("Meta did not give a sign-in.");
      }
      let version = crate::meta_publish::meta_graph_api_version();
      let long = get_json(
        &format!("https://graph.facebook.com/{version}/oauth/access_token"),
        &[
          ("grant_type", "fb_exchange_token"),
          ("client_id", client_id),
          ("client_secret", client_secret),
          ("fb_exchange_token", short.as_str()),
        ],
      )
      .await
      .map(|v| text(&v, "access_token"))
      .ok()
      .filter(|t| !t.is_empty())
      .unwrap_or(short);
      let pages = get_json(
        &format!("https://graph.facebook.com/{version}/me/accounts"),
        &[
          ("fields", "id,name,access_token,instagram_business_account"),
          ("access_token", long.as_str()),
        ],
      )
      .await
      .ok()
      .and_then(|v| v.get("data").and_then(Value::as_array).cloned())
      .unwrap_or_default()
      .iter()
      .map(|p| MetaPage {
        id: text(p, "id"),
        name: text(p, "name"),
        access_token: text(p, "access_token"),
        instagram_business_account_id: p
          .get("instagram_business_account")
          .map(|ig| text(ig, "id"))
          .filter(|id| !id.is_empty()),
      })
      .filter(|p| !p.id.is_empty())
      .collect();
      SignInResult {
        ok: true,
        tokens: HashMap::from([("META_ACCESS_TOKEN".to_string(), long)]),
        pages,
        ..Default::default()
      }
    }
    Service::Instagram => {
      let short = text(&first, "access_token");
      let user = text(&first, "user_id");
      if short.is_empty() || user.is_empty() {
        return failed("Instagram did not give a sign-in.");
      }
      let long = get_json(
        "https://graph.instagram.com/access_token",
        &[
          ("grant_type", "ig_exchange_token"),
          ("client_secret", client_secret),
          ("access_token", short.as_str()),
        ],
      )
      .await;
      let (token, expires) = match long {
        Ok(v) if !text(&v, "access_token").is_empty() => (
          text(&v, "access_token"),
          v.get("expires_in").and_then(Value::as_u64),
        ),
        _ => return failed("Instagram did not give a lasting sign-in (60 days). Try again."),
      };
      SignInResult {
        ok: true,
        tokens: HashMap::from([
          ("INSTAGRAM_LOGIN_TOKEN".to_string(), token),
          ("INSTAGRAM_LOGIN_USER_ID".to_string(), user),
        ]),
        expires_in_secs: expires,
        ..Default::default()
      }
    }
  }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SignInRequest {
  service: String,
  client_id: String,
  client_secret: String,
}

/// Opens the browser to sign in and waits (5 minutes at most) for it to come back.
#[tauri::command]
pub(crate) async fn oauth_sign_in(app: tauri::AppHandle, request: SignInRequest) -> SignInResult {
  let service = match service(&request.service) {
    Ok(s) => s,
    Err(e) => return failed(e),
  };
  if request.client_id.trim().is_empty() || request.client_secret.trim().is_empty() {
    return failed("Fill in the app's ID and secret first.");
  }
  let listener = match tokio::net::TcpListener::bind(("127.0.0.1", port(service))).await {
    Ok(l) => l,
    Err(_) => {
      return failed(format!(
        "Port {} on this computer is busy; close what uses it and try again.",
        port(service)
      ))
    }
  };
  let state = uuid::Uuid::new_v4().simple().to_string();
  let (verifier, challenge) = pkce_pair();
  if let Ok(mut pending) = PENDING.lock() {
    *pending = Some(Pending {
      service,
      state: state.clone(),
      verifier: verifier.clone(),
      started: std::time::Instant::now(),
    });
  }
  use tauri_plugin_opener::OpenerExt;
  if app
    .opener()
    .open_url(
      auth_url(service, request.client_id.trim(), &state, &challenge),
      None::<&str>,
    )
    .is_err()
  {
    return failed("The browser could not be opened.");
  }
  let code = match wait_for_callback(listener, &state, SIGN_IN_WAIT).await {
    Ok(code) => code,
    Err(reason) => return failed(reason),
  };
  if let Ok(mut pending) = PENDING.lock() {
    *pending = None;
  }
  exchange(
    service,
    &code,
    request.client_id.trim(),
    request.client_secret.trim(),
    &verifier,
  )
  .await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PastedRequest {
  service: String,
  pasted_url: String,
  client_id: String,
  client_secret: String,
}

/// Finishes the last sign-in from the address the browser ended on (10 minutes at most).
#[tauri::command]
pub(crate) async fn oauth_finish_pasted(request: PastedRequest) -> SignInResult {
  let service = match service(&request.service) {
    Ok(s) => s,
    Err(e) => return failed(e),
  };
  let taken = match PENDING.lock() {
    Ok(mut slot) => take_pending_if(&mut slot, service, &request.pasted_url),
    Err(_) => Err("Start the sign-in again first, then paste the address.".to_string()),
  };
  let (code, verifier) = match taken {
    Ok(found) => found,
    Err(reason) => return failed(reason),
  };
  exchange(
    service,
    &code,
    request.client_id.trim(),
    request.client_secret.trim(),
    &verifier,
  )
  .await
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RefreshResult {
  ok: bool,
  token: Option<String>,
  expires_in_secs: Option<u64>,
  reason: Option<String>,
}

/// Renews an Instagram Login token for another 60 days.
#[tauri::command]
pub(crate) async fn instagram_refresh_token(token: String) -> RefreshResult {
  if token.trim().is_empty() {
    return RefreshResult {
      reason: Some("Sign in with Instagram first.".to_string()),
      ..Default::default()
    };
  }
  let query = instagram_refresh_query(token.trim());
  let pairs: Vec<(&str, &str)> = query.iter().map(|(k, v)| (*k, v.as_str())).collect();
  match get_json("https://graph.instagram.com/refresh_access_token", &pairs).await {
    Ok(v) if !text(&v, "access_token").is_empty() => RefreshResult {
      ok: true,
      token: Some(text(&v, "access_token")),
      expires_in_secs: v.get("expires_in").and_then(Value::as_u64),
      reason: None,
    },
    Ok(_) => RefreshResult {
      reason: Some("Instagram did not renew the sign-in.".to_string()),
      ..Default::default()
    },
    Err(reason) => RefreshResult {
      reason: Some(reason),
      ..Default::default()
    },
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn the_sign_ins_ask_to_read_numbers() {
    assert!(GOOGLE_SCOPES.contains("https://www.googleapis.com/auth/yt-analytics.readonly"));
    assert!(META_SCOPES
      .split(',')
      .any(|s| s == "instagram_manage_insights"));
    assert!(META_SCOPES.split(',').any(|s| s == "read_insights"));
    assert!(META_SCOPES
      .split(',')
      .any(|s| s == "pages_manage_engagement"));
    assert!(INSTAGRAM_SCOPES
      .split(',')
      .any(|s| s == "instagram_business_manage_insights"));
  }

  fn query(url: &str) -> HashMap<String, String> {
    reqwest::Url::parse(url)
      .unwrap()
      .query_pairs()
      .into_owned()
      .collect()
  }

  #[test]
  fn pkce_challenge_is_s256_of_verifier() {
    // RFC 7636, appendix B.
    assert_eq!(
      pkce_challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
    );
    let (v, c) = pkce_pair();
    assert!(v.len() >= 43);
    assert_eq!(pkce_challenge(&v), c);
  }

  #[test]
  fn auth_url_has_state_and_pkce() {
    let yt = query(&auth_url(Service::YouTube, "cid", "st", "ch"));
    assert_eq!(yt["state"], "st");
    assert_eq!(yt["code_challenge"], "ch");
    assert_eq!(yt["code_challenge_method"], "S256");
    assert_eq!(yt["redirect_uri"], "http://localhost:8085/callback");
    assert_eq!(yt["access_type"], "offline");
    let meta = query(&auth_url(Service::Meta, "app", "st", "ch"));
    assert_eq!(meta["code_challenge_method"], "S256");
    assert_eq!(meta["redirect_uri"], "http://localhost:8086/callback");
    assert!(meta["scope"].contains("instagram_content_publish"));
    let ig_url = auth_url(Service::Instagram, "igapp", "st", "ch");
    assert!(ig_url.starts_with("https://www.instagram.com/oauth/authorize?"));
    let ig = query(&ig_url);
    assert_eq!(ig["state"], "st");
    assert_eq!(ig["redirect_uri"], "http://localhost:8087/callback");
    assert!(ig["scope"].contains("instagram_business_content_publish"));
  }

  #[test]
  fn callback_with_wrong_state_is_refused() {
    assert!(parse_callback("/callback?code=abc&state=other", "mine")
      .unwrap_err()
      .contains("does not belong"));
    assert!(parse_callback("/callback?code=abc", "mine").is_err());
    assert_eq!(
      parse_callback("/callback?code=abc&state=mine", "mine").unwrap(),
      "abc"
    );
  }

  #[test]
  fn callback_without_code_says_cancelled() {
    assert!(
      parse_callback("/callback?error=access_denied&state=mine", "mine")
        .unwrap_err()
        .contains("cancelled")
    );
    assert!(parse_callback("/callback?state=mine", "mine")
      .unwrap_err()
      .contains("cancelled"));
  }

  #[test]
  fn pasted_address_with_trailing_hash_is_read() {
    // Instagram adds "#_" after the query: the fragment is not part of the query.
    assert_eq!(
      parse_callback("http://localhost:8087/callback?state=s1&code=AQB12#_", "s1").unwrap(),
      "AQB12"
    );
    assert!(parse_callback("not an address", "s1").is_err());
  }

  #[test]
  fn token_exchange_requests() {
    let get =
      |f: &[(String, String)], k: &str| f.iter().find(|(a, _)| a == k).map(|(_, v)| v.clone());
    let yt = token_form(Service::YouTube, "c", "id", "sec", "ver");
    assert_eq!(
      get(&yt, "grant_type").as_deref(),
      Some("authorization_code")
    );
    assert_eq!(get(&yt, "code_verifier").as_deref(), Some("ver"));
    assert_eq!(
      get(&yt, "redirect_uri").as_deref(),
      Some("http://localhost:8085/callback")
    );
    let ig = token_form(Service::Instagram, "c", "id", "sec", "ver");
    assert_eq!(get(&ig, "code_verifier"), None);
    assert_eq!(
      token_url(Service::Instagram),
      "https://api.instagram.com/oauth/access_token"
    );
    assert_eq!(
      instagram_refresh_query("tok")[0],
      ("grant_type", "ig_refresh_token".to_string())
    );
  }

  #[test]
  fn errors_use_the_provider_description_only() {
    let body = serde_json::json!({ "error": "invalid_grant", "error_description": "Bad Request" });
    assert_eq!(provider_error(&body, "x"), "Bad Request");
    assert_eq!(provider_error(&Value::Null, "fallback"), "fallback");
  }

  #[test]
  fn a_wrong_pasted_address_keeps_the_sign_in_for_another_try() {
    let mut slot = Some(Pending {
      service: Service::Instagram,
      state: "s1".to_string(),
      verifier: "v1".to_string(),
      started: std::time::Instant::now(),
    });
    assert!(take_pending_if(&mut slot, Service::Instagram, "nonsense").is_err());
    assert!(slot.is_some());
    assert!(take_pending_if(
      &mut slot,
      Service::YouTube,
      "http://localhost:8087/callback?state=s1&code=c"
    )
    .is_err());
    assert!(slot.is_some());
    assert_eq!(
      take_pending_if(
        &mut slot,
        Service::Instagram,
        "http://localhost:8087/callback?state=s1&code=c"
      )
      .unwrap(),
      ("c".to_string(), "v1".to_string())
    );
    assert!(slot.is_none());
  }

  #[tokio::test]
  async fn listener_frees_the_port_after_timeout() {
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0))
      .await
      .unwrap();
    let addr = listener.local_addr().unwrap();
    let result = wait_for_callback(listener, "s", Duration::from_millis(300)).await;
    assert!(result.unwrap_err().contains("5 minutes"));
    assert!(tokio::net::TcpListener::bind(addr).await.is_ok());
  }

  #[tokio::test]
  async fn the_browser_answer_is_read_and_a_favicon_ignored() {
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0))
      .await
      .unwrap();
    let addr = listener.local_addr().unwrap();
    let waiter =
      tokio::spawn(async move { wait_for_callback(listener, "s9", Duration::from_secs(5)).await });
    let mut first = tokio::net::TcpStream::connect(addr).await.unwrap();
    first
      .write_all(b"GET /favicon.ico HTTP/1.1\r\n\r\n")
      .await
      .unwrap();
    let mut sink = Vec::new();
    let _ = first.read_to_end(&mut sink).await;
    let mut second = tokio::net::TcpStream::connect(addr).await.unwrap();
    second
      .write_all(b"GET /callback?code=k1&state=s9 HTTP/1.1\r\n\r\n")
      .await
      .unwrap();
    let mut page_back = Vec::new();
    let _ = second.read_to_end(&mut page_back).await;
    assert!(String::from_utf8_lossy(&page_back).contains("Signed in"));
    assert_eq!(waiter.await.unwrap().unwrap(), "k1");
  }
}
