//! Signing in to outside MCP servers (2026-10-30): MCP's standard sign-in. The server's 401
//! names its protected-resource metadata, which names the authorization server, whose metadata
//! gives the endpoints. PKCE always, `state` checked, and the `iss` in the answer checked
//! against the authorization server before the code is redeemed (RFC 9207). Alphonso
//! identifies itself with its Client ID Metadata Document when the server supports it, else
//! registers itself (`application_type: native`), else uses a client id the user pasted. A
//! client id is kept per server with the issuer that gave it and never used with another.
//! Tokens stay in the keychain (`mcp:<id>:token`, `mcp:<id>:client`).

use crate::mcp_client::{account, checked_url, valid_server_id, BAD_SERVER_ID};
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Duration;

/// Alphonso's client metadata document (Task 9: hosted on the owner's site). Used only while it
/// answers with a document whose `client_id` is this address.
pub(crate) const CLIENT_METADATA_URL: &str =
  "https://obsidianmedia.online/alphonso/oauth-client.json";
pub(crate) const CALLBACK_PORT: u16 = 8088;
const PASTE_WAIT: Duration = Duration::from_secs(600);
const METADATA_CHECK_EVERY: Duration = Duration::from_secs(24 * 3600);

pub(crate) const NEEDS_CLIENT_ID: &str =
  "This server needs a client ID. Paste the one the service gave you.";
pub(crate) const ISSUER_MISMATCH: &str =
  "The sign-in answer came from a different server; nothing was saved.";
pub(crate) const NO_SIGN_IN_INFO: &str =
  "This server asks for a sign-in but doesn't say how. Use a key instead, if it offers one.";

pub(crate) fn redirect_uri() -> String {
  format!("http://127.0.0.1:{CALLBACK_PORT}/callback")
}

/// The protected-resource metadata addresses to try: the one the 401 named, else the well-known
/// ones for the server's path and its root.
pub(crate) fn resource_metadata_urls(
  www_authenticate: Option<&str>,
  server: &reqwest::Url,
) -> Vec<String> {
  let mut out = Vec::new();
  if let Some(h) = www_authenticate {
    if let Some(start) = h.find("resource_metadata=") {
      let rest = &h[start + "resource_metadata=".len()..];
      let value: String = if let Some(stripped) = rest.strip_prefix('"') {
        stripped.chars().take_while(|c| *c != '"').collect()
      } else {
        rest
          .chars()
          .take_while(|c| *c != ',' && !c.is_whitespace())
          .collect()
      };
      if !value.is_empty() {
        out.push(value);
      }
    }
  }
  let origin = server.origin().ascii_serialization();
  let path = server.path().trim_end_matches('/');
  if !path.is_empty() {
    out.push(format!(
      "{origin}/.well-known/oauth-protected-resource{path}"
    ));
  }
  out.push(format!("{origin}/.well-known/oauth-protected-resource"));
  out
}

/// The authorization server and scopes from protected-resource metadata.
pub(crate) fn parse_protected_resource(v: &Value) -> Option<(String, Vec<String>)> {
  let server = v
    .get("authorization_servers")?
    .as_array()?
    .first()?
    .as_str()?
    .to_string();
  let scopes = v
    .get("scopes_supported")
    .and_then(Value::as_array)
    .map(|a| {
      a.iter()
        .filter_map(Value::as_str)
        .map(str::to_string)
        .collect()
    })
    .unwrap_or_default();
  Some((server, scopes))
}

/// RFC 8414 and OpenID metadata addresses for an issuer.
pub(crate) fn auth_server_metadata_urls(issuer: &str) -> Vec<String> {
  let Ok(url) = reqwest::Url::parse(issuer) else {
    return Vec::new();
  };
  let origin = url.origin().ascii_serialization();
  let path = url.path().trim_end_matches('/');
  vec![
    format!("{origin}/.well-known/oauth-authorization-server{path}"),
    format!("{origin}/.well-known/openid-configuration{path}"),
    format!(
      "{}/.well-known/openid-configuration",
      issuer.trim_end_matches('/')
    ),
  ]
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct AuthServer {
  pub issuer: String,
  pub authorization_endpoint: String,
  pub token_endpoint: String,
  pub registration_endpoint: Option<String>,
  pub metadata_document_supported: bool,
  pub iss_required: bool,
}

/// Authorization-server metadata, refused unless its `issuer` is the one asked for.
pub(crate) fn parse_auth_server(v: &Value, expected_issuer: &str) -> Option<AuthServer> {
  let s = |k: &str| v.get(k).and_then(Value::as_str).map(str::to_string);
  let issuer = s("issuer")?;
  if issuer.trim_end_matches('/') != expected_issuer.trim_end_matches('/') {
    return None;
  }
  let methods = v
    .get("code_challenge_methods_supported")
    .and_then(Value::as_array);
  if methods.is_some_and(|m| !m.iter().any(|x| x.as_str() == Some("S256"))) {
    return None;
  }
  Some(AuthServer {
    issuer,
    authorization_endpoint: s("authorization_endpoint")?,
    token_endpoint: s("token_endpoint")?,
    registration_endpoint: s("registration_endpoint"),
    metadata_document_supported: v
      .get("client_id_metadata_document_supported")
      .and_then(Value::as_bool)
      .unwrap_or(false),
    iss_required: v
      .get("authorization_response_iss_parameter_supported")
      .and_then(Value::as_bool)
      .unwrap_or(false),
  })
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) enum ClientPlan {
  Use {
    client_id: String,
    kind: &'static str,
  },
  Register(String),
}

/// A client id saved for this server, from the issuer that gave it.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct SavedClient {
  pub issuer: String,
  pub client_id: String,
}

/// How Alphonso identifies itself to this authorization server.
pub(crate) fn choose_client(
  server: &AuthServer,
  saved: Option<&SavedClient>,
  pasted: Option<&str>,
  metadata_document_ok: bool,
) -> Result<ClientPlan, String> {
  if let Some(p) = pasted.map(str::trim).filter(|p| !p.is_empty()) {
    return Ok(ClientPlan::Use {
      client_id: p.to_string(),
      kind: "pasted",
    });
  }
  if let Some(c) =
    saved.filter(|c| c.issuer.trim_end_matches('/') == server.issuer.trim_end_matches('/'))
  {
    return Ok(ClientPlan::Use {
      client_id: c.client_id.clone(),
      kind: "saved",
    });
  }
  if server.metadata_document_supported && metadata_document_ok {
    return Ok(ClientPlan::Use {
      client_id: CLIENT_METADATA_URL.to_string(),
      kind: "metadata",
    });
  }
  if let Some(endpoint) = &server.registration_endpoint {
    return Ok(ClientPlan::Register(endpoint.clone()));
  }
  Err(NEEDS_CLIENT_ID.to_string())
}

pub(crate) fn registration_body() -> Value {
  json!({
    "client_name": "Alphonso",
    "redirect_uris": [redirect_uri()],
    "grant_types": ["authorization_code", "refresh_token"],
    "response_types": ["code"],
    "token_endpoint_auth_method": "none",
    "application_type": "native"
  })
}

/// True when a fetched document is Alphonso's client metadata at this address.
pub(crate) fn metadata_document_ok(v: &Value, url: &str) -> bool {
  v.get("client_id").and_then(Value::as_str) == Some(url)
    && v
      .get("redirect_uris")
      .and_then(Value::as_array)
      .is_some_and(|r| {
        r.iter()
          .any(|u| u.as_str() == Some(redirect_uri().as_str()))
      })
}

pub(crate) fn authorize_url(
  server: &AuthServer,
  client_id: &str,
  state: &str,
  challenge: &str,
  resource: &str,
  scopes: &[String],
) -> String {
  let mut params = vec![
    ("response_type", "code".to_string()),
    ("client_id", client_id.to_string()),
    ("redirect_uri", redirect_uri()),
    ("state", state.to_string()),
    ("code_challenge", challenge.to_string()),
    ("code_challenge_method", "S256".to_string()),
    ("resource", resource.to_string()),
  ];
  if !scopes.is_empty() {
    params.push(("scope", scopes.join(" ")));
  }
  reqwest::Url::parse_with_params(&server.authorization_endpoint, &params)
    .map(|u| u.to_string())
    .unwrap_or_default()
}

/// The code from the address the browser came back to, with RFC 9207's issuer check.
pub(crate) fn parse_callback_with_issuer(
  target: &str,
  state: &str,
  issuer: &str,
  iss_required: bool,
) -> Result<String, String> {
  let code = crate::oauth_signin::parse_callback(target, state)?;
  let full = if target.trim().starts_with('/') {
    format!("http://localhost{}", target.trim())
  } else {
    target.trim().to_string()
  };
  let query: HashMap<String, String> = reqwest::Url::parse(&full)
    .map(|u| u.query_pairs().into_owned().collect())
    .unwrap_or_default();
  match query.get("iss") {
    Some(iss) if iss.trim_end_matches('/') != issuer.trim_end_matches('/') => {
      Err(ISSUER_MISMATCH.to_string())
    }
    None if iss_required => Err(ISSUER_MISMATCH.to_string()),
    _ => Ok(code),
  }
}

// ---- Network (every address checked like a server address) ----

async fn get_json(url: &str, allow_local: bool) -> Result<Value, String> {
  let url = checked_url(url, allow_local).await?;
  let client = crate::mcp_client::http_client()?;
  let response = client
    .get(url)
    .header("Accept", "application/json")
    .send()
    .await
    .map_err(|_| "The sign-in server couldn't be reached.".to_string())?;
  if !response.status().is_success() {
    return Err(format!(
      "The sign-in server answered {}.",
      response.status().as_u16()
    ));
  }
  let (bytes, truncated) = crate::search::read_capped(response, 256 * 1024).await?;
  if truncated {
    return Err("The sign-in server's answer was too large.".to_string());
  }
  serde_json::from_slice(&bytes)
    .map_err(|_| "The sign-in server's answer could not be read.".to_string())
}

async fn first_json<F: Fn(&Value) -> bool>(
  urls: &[String],
  allow_local: bool,
  ok: F,
) -> Option<Value> {
  for u in urls {
    if let Ok(v) = get_json(u, allow_local).await {
      if ok(&v) {
        return Some(v);
      }
    }
  }
  None
}

/// A form POST to a token endpoint: `(status, body)`. No redirects followed.
async fn post_form(
  url: &str,
  form: &[(&str, String)],
  allow_local: bool,
) -> Result<(u16, Value), String> {
  let url = checked_url(url, allow_local).await?;
  let client = crate::mcp_client::http_client()?;
  let response = client
    .post(url)
    .header("Accept", "application/json")
    .form(form)
    .send()
    .await
    .map_err(|_| "The sign-in server couldn't be reached.".to_string())?;
  let status = response.status().as_u16();
  let (bytes, _) = crate::search::read_capped(response, 256 * 1024).await?;
  Ok((
    status,
    serde_json::from_slice(&bytes).unwrap_or(Value::Null),
  ))
}

static METADATA_CHECK: Mutex<Option<(std::time::Instant, bool)>> = Mutex::new(None);

/// Whether Alphonso's client metadata document answers correctly (checked once a day).
async fn metadata_document_reachable() -> bool {
  if let Ok(slot) = METADATA_CHECK.lock() {
    if let Some((at, ok)) = *slot {
      if at.elapsed() < METADATA_CHECK_EVERY {
        return ok;
      }
    }
  }
  let ok = get_json(CLIENT_METADATA_URL, false)
    .await
    .map(|v| metadata_document_ok(&v, CLIENT_METADATA_URL))
    .unwrap_or(false);
  if let Ok(mut slot) = METADATA_CHECK.lock() {
    *slot = Some((std::time::Instant::now(), ok));
  }
  ok
}

fn now_ms() -> i64 {
  std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .map(|d| d.as_millis() as i64)
    .unwrap_or(0)
}

/// What is kept for a server after a sign-in (one keychain entry).
pub(crate) fn token_record(
  answer: &Value,
  previous: Option<&Value>,
  issuer: &str,
  token_endpoint: &str,
  client_id: &str,
  resource: &str,
) -> Option<Value> {
  let access = answer.get("access_token")?.as_str()?.to_string();
  let refresh = answer
    .get("refresh_token")
    .and_then(Value::as_str)
    .map(str::to_string)
    .or_else(|| {
      previous
        .and_then(|p| p.get("refresh"))
        .and_then(Value::as_str)
        .map(str::to_string)
    });
  let expires_at = answer
    .get("expires_in")
    .and_then(Value::as_i64)
    .map(|s| now_ms() + s * 1000);
  Some(json!({
    "access": access, "refresh": refresh, "expiresAt": expires_at,
    "issuer": issuer, "tokenEndpoint": token_endpoint, "clientId": client_id, "resource": resource
  }))
}

fn keychain_get(key: &str) -> Option<String> {
  crate::os_keychain_store::secure_credential_get(key.to_string())
    .ok()
    .flatten()
}

fn keychain_set(key: &str, value: &str) -> Result<(), String> {
  crate::os_keychain_store::secure_credential_set(key.to_string(), value.to_string())
}

/// Asks the token endpoint for a new token. `Ok(None)` when it refused (sign in again).
pub(crate) async fn refresh_record(
  record: &Value,
  allow_local: bool,
) -> Result<Option<Value>, String> {
  let s = |k: &str| {
    record
      .get(k)
      .and_then(Value::as_str)
      .unwrap_or("")
      .to_string()
  };
  let refresh = s("refresh");
  if refresh.is_empty() {
    return Ok(None);
  }
  let form = [
    ("grant_type", "refresh_token".to_string()),
    ("refresh_token", refresh),
    ("client_id", s("clientId")),
    ("resource", s("resource")),
  ];
  let (status, body) = post_form(&s("tokenEndpoint"), &form, allow_local).await?;
  if !(200..300).contains(&status) {
    return Ok(None);
  }
  Ok(token_record(
    &body,
    Some(record),
    &s("issuer"),
    &s("tokenEndpoint"),
    &s("clientId"),
    &s("resource"),
  ))
}

/// Refreshes a server's saved sign-in. `Ok(true)` when a new token was saved.
pub(crate) async fn refresh_saved_token(server_id: &str) -> Result<bool, String> {
  if !valid_server_id(server_id) {
    return Err(BAD_SERVER_ID.to_string());
  }
  let Some(record) =
    keychain_get(&account(server_id, "token")).and_then(|r| serde_json::from_str::<Value>(&r).ok())
  else {
    return Ok(false);
  };
  match refresh_record(&record, crate::mcp_client::allow_local()).await? {
    Some(new) => {
      keychain_set(&account(server_id, "token"), &new.to_string())?;
      Ok(true)
    }
    None => Ok(false),
  }
}

/// A saved sign-in that has run out (or runs out within a minute) is refreshed before a call.
pub(crate) async fn refresh_if_expired(server_id: &str) {
  let Some(record) =
    keychain_get(&account(server_id, "token")).and_then(|r| serde_json::from_str::<Value>(&r).ok())
  else {
    return;
  };
  if record
    .get("expiresAt")
    .and_then(Value::as_i64)
    .is_some_and(|at| at - 60_000 < now_ms())
  {
    let _ = refresh_saved_token(server_id).await;
  }
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct McpSignInResult {
  pub ok: bool,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub reason: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub client_kind: Option<String>,
  /// True when the server answered without a sign-in.
  pub not_needed: bool,
}

fn failed(reason: impl Into<String>) -> McpSignInResult {
  McpSignInResult {
    reason: Some(reason.into()),
    ..Default::default()
  }
}

struct Pending {
  server_id: String,
  state: String,
  verifier: String,
  server: AuthServer,
  client_id: String,
  resource: String,
  started: std::time::Instant,
}

static PENDING: Mutex<Option<Pending>> = Mutex::new(None);

struct Prepared {
  server: AuthServer,
  scopes: Vec<String>,
  client_id: String,
  kind: &'static str,
}

/// Discovery and the client: everything before the browser opens.
async fn prepare(
  server_id: &str,
  url: &reqwest::Url,
  challenge: Option<String>,
  pasted: Option<&str>,
) -> Result<Prepared, String> {
  let allow = crate::mcp_client::allow_local();
  let candidates = resource_metadata_urls(challenge.as_deref(), url);
  let resource = first_json(&candidates, allow, |v| {
    parse_protected_resource(v).is_some()
  })
  .await
  .ok_or_else(|| NO_SIGN_IN_INFO.to_string())?;
  let (issuer, scopes) =
    parse_protected_resource(&resource).ok_or_else(|| NO_SIGN_IN_INFO.to_string())?;
  let meta = first_json(&auth_server_metadata_urls(&issuer), allow, |v| {
    parse_auth_server(v, &issuer).is_some()
  })
  .await
  .ok_or_else(|| NO_SIGN_IN_INFO.to_string())?;
  let server = parse_auth_server(&meta, &issuer).ok_or_else(|| NO_SIGN_IN_INFO.to_string())?;
  let saved = keychain_get(&account(server_id, "client"))
    .and_then(|s| serde_json::from_str::<Value>(&s).ok())
    .and_then(|v| {
      Some(SavedClient {
        issuer: v.get("issuer")?.as_str()?.to_string(),
        client_id: v.get("clientId")?.as_str()?.to_string(),
      })
    });
  let metadata_ok = server.metadata_document_supported && metadata_document_reachable().await;
  let (client_id, kind) = match choose_client(&server, saved.as_ref(), pasted, metadata_ok)? {
    ClientPlan::Use { client_id, kind } => (client_id, kind),
    ClientPlan::Register(endpoint) => {
      let endpoint = checked_url(&endpoint, allow).await?;
      let client = crate::mcp_client::http_client()?;
      let response = client
        .post(endpoint)
        .json(&registration_body())
        .send()
        .await
        .map_err(|_| "The sign-in server couldn't be reached.".to_string())?;
      let ok = response.status().is_success();
      let (bytes, _) = crate::search::read_capped(response, 256 * 1024).await?;
      let v: Value = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
      let id = v
        .get("client_id")
        .and_then(Value::as_str)
        .filter(|_| ok)
        .ok_or_else(|| NEEDS_CLIENT_ID.to_string())?;
      (id.to_string(), "registered")
    }
  };
  keychain_set(
    &account(server_id, "client"),
    &json!({ "issuer": server.issuer, "clientId": client_id, "kind": kind }).to_string(),
  )?;
  Ok(Prepared {
    server,
    scopes,
    client_id,
    kind,
  })
}

async fn exchange(p: Pending, code: String) -> McpSignInResult {
  let form = [
    ("grant_type", "authorization_code".to_string()),
    ("code", code),
    ("redirect_uri", redirect_uri()),
    ("client_id", p.client_id.clone()),
    ("code_verifier", p.verifier.clone()),
    ("resource", p.resource.clone()),
  ];
  let (status, body) = match post_form(
    &p.server.token_endpoint,
    &form,
    crate::mcp_client::allow_local(),
  )
  .await
  {
    Ok(r) => r,
    Err(e) => return failed(e),
  };
  if !(200..300).contains(&status) {
    let why = body
      .get("error_description")
      .or_else(|| body.get("error"))
      .and_then(Value::as_str)
      .unwrap_or("refused");
    return failed(format!(
      "The sign-in server refused the sign-in: {}",
      why.chars().take(200).collect::<String>()
    ));
  }
  let Some(record) = token_record(
    &body,
    None,
    &p.server.issuer,
    &p.server.token_endpoint,
    &p.client_id,
    &p.resource,
  ) else {
    return failed("The sign-in server sent no token.");
  };
  match keychain_set(&account(&p.server_id, "token"), &record.to_string()) {
    Ok(()) => McpSignInResult {
      ok: true,
      ..Default::default()
    },
    Err(e) => failed(e),
  }
}

/// Opens the browser to sign in to an MCP server and waits (5 minutes at most).
#[tauri::command]
pub(crate) async fn mcp_sign_in(
  app: tauri::AppHandle,
  server_id: String,
  url: String,
  pasted_client_id: Option<String>,
) -> McpSignInResult {
  if !valid_server_id(&server_id) {
    return failed(BAD_SERVER_ID);
  }
  let allow = crate::mcp_client::allow_local();
  let server_url = match checked_url(&url, allow).await {
    Ok(u) => u,
    Err(e) => return failed(e),
  };
  // A first request without a sign-in: the 401 says where to sign in.
  let mut probe =
    match crate::mcp_client::McpConn::new(server_url.clone(), Default::default(), None, allow) {
      Ok(c) => c,
      Err(e) => return failed(e),
    };
  let challenge = match crate::mcp_client::list_tools(&mut probe).await {
    Ok(_) => {
      return McpSignInResult {
        ok: true,
        not_needed: true,
        ..Default::default()
      }
    }
    Err(crate::mcp_client::McpError::SignIn(h)) => h,
    Err(crate::mcp_client::McpError::Failed(reason)) => return failed(reason),
  };
  let prepared = match prepare(
    &server_id,
    &server_url,
    challenge,
    pasted_client_id.as_deref(),
  )
  .await
  {
    Ok(p) => p,
    Err(e) => return failed(e),
  };
  let listener = match tokio::net::TcpListener::bind(("127.0.0.1", CALLBACK_PORT)).await {
    Ok(l) => l,
    Err(_) => {
      return failed(format!(
        "Port {CALLBACK_PORT} on this computer is busy; close what uses it and try again."
      ))
    }
  };
  let state = uuid::Uuid::new_v4().simple().to_string();
  let (verifier, code_challenge) = crate::oauth_signin::pkce_pair();
  let resource = server_url.to_string();
  let link = authorize_url(
    &prepared.server,
    &prepared.client_id,
    &state,
    &code_challenge,
    &resource,
    &prepared.scopes,
  );
  let pending = Pending {
    server_id: server_id.clone(),
    state: state.clone(),
    verifier,
    server: prepared.server.clone(),
    client_id: prepared.client_id.clone(),
    resource,
    started: std::time::Instant::now(),
  };
  let (issuer, iss_required) = (pending.server.issuer.clone(), pending.server.iss_required);
  if let Ok(mut slot) = PENDING.lock() {
    *slot = Some(pending);
  }
  use tauri_plugin_opener::OpenerExt;
  if app.opener().open_url(link, None::<&str>).is_err() {
    return failed("The browser could not be opened.");
  }
  let code = match crate::oauth_signin::wait_for_callback_with(
    listener,
    crate::oauth_signin::SIGN_IN_WAIT,
    |target| parse_callback_with_issuer(target, &state, &issuer, iss_required),
  )
  .await
  {
    Ok(code) => code,
    Err(reason) => return failed(reason),
  };
  let Some(pending) = PENDING.lock().ok().and_then(|mut s| s.take()) else {
    return failed("Start the sign-in again.");
  };
  let mut result = exchange(pending, code).await;
  result.client_kind = Some(prepared.kind.to_string());
  result
}

/// Finishes the last MCP sign-in from the address the browser ended on (10 minutes at most).
#[tauri::command]
pub(crate) async fn mcp_finish_pasted(address: String) -> McpSignInResult {
  let taken = PENDING.lock().ok().and_then(|mut slot| {
    let usable = slot.as_ref().filter(|p| p.started.elapsed() < PASTE_WAIT)?;
    let code = parse_callback_with_issuer(
      &address,
      &usable.state,
      &usable.server.issuer,
      usable.server.iss_required,
    );
    match code {
      Ok(c) => slot.take().map(|p| Ok((p, c))),
      Err(e) => Some(Err(e)),
    }
  });
  match taken {
    Some(Ok((pending, code))) => exchange(pending, code).await,
    Some(Err(e)) => failed(e),
    None => failed("Start the sign-in again first, then paste the address."),
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::mcp_client::tests::{reply, scripted};

  fn server(meta_doc: bool, registration: bool, iss: bool) -> AuthServer {
    AuthServer {
      issuer: "https://auth.example".into(),
      authorization_endpoint: "https://auth.example/authorize".into(),
      token_endpoint: "https://auth.example/token".into(),
      registration_endpoint: registration.then(|| "https://auth.example/register".to_string()),
      metadata_document_supported: meta_doc,
      iss_required: iss,
    }
  }

  #[test]
  fn discovers_auth_server_from_www_authenticate() {
    let url = reqwest::Url::parse("https://shop.example/api/mcp").unwrap();
    let urls = resource_metadata_urls(
      Some(
        r#"Bearer error="invalid_token", resource_metadata="https://shop.example/.well-known/oauth-protected-resource/api/mcp""#,
      ),
      &url,
    );
    assert_eq!(
      urls[0],
      "https://shop.example/.well-known/oauth-protected-resource/api/mcp"
    );
  }

  #[test]
  fn discovers_auth_server_from_well_known() {
    let url = reqwest::Url::parse("https://shop.example/api/mcp").unwrap();
    assert_eq!(
      resource_metadata_urls(None, &url),
      vec![
        "https://shop.example/.well-known/oauth-protected-resource/api/mcp".to_string(),
        "https://shop.example/.well-known/oauth-protected-resource".to_string()
      ]
    );
    let (issuer, scopes) = parse_protected_resource(&json!({ "authorization_servers": ["https://auth.example"], "scopes_supported": ["read", "write"] })).unwrap();
    assert_eq!(issuer, "https://auth.example");
    assert_eq!(scopes, vec!["read", "write"]);
    assert_eq!(
      auth_server_metadata_urls("https://auth.example/tenant1")[0],
      "https://auth.example/.well-known/oauth-authorization-server/tenant1"
    );
  }

  #[test]
  fn auth_metadata_must_name_the_issuer_asked_for() {
    let meta = json!({ "issuer": "https://evil.example", "authorization_endpoint": "a", "token_endpoint": "t" });
    assert!(parse_auth_server(&meta, "https://auth.example").is_none());
    let meta = json!({ "issuer": "https://auth.example/", "authorization_endpoint": "https://auth.example/a", "token_endpoint": "https://auth.example/t", "code_challenge_methods_supported": ["S256"], "authorization_response_iss_parameter_supported": true });
    let s = parse_auth_server(&meta, "https://auth.example").unwrap();
    assert!(s.iss_required);
    let plain_only = json!({ "issuer": "https://auth.example", "authorization_endpoint": "a", "token_endpoint": "t", "code_challenge_methods_supported": ["plain"] });
    assert!(parse_auth_server(&plain_only, "https://auth.example").is_none());
  }

  #[test]
  fn prefers_client_metadata_when_supported() {
    assert_eq!(
      choose_client(&server(true, true, false), None, None, true).unwrap(),
      ClientPlan::Use {
        client_id: CLIENT_METADATA_URL.into(),
        kind: "metadata"
      }
    );
    // Not reachable yet (the owner's page isn't up): register instead.
    assert_eq!(
      choose_client(&server(true, true, false), None, None, false).unwrap(),
      ClientPlan::Register("https://auth.example/register".into())
    );
    assert_eq!(
      choose_client(&server(false, false, false), None, None, true).unwrap_err(),
      NEEDS_CLIENT_ID
    );
    assert_eq!(
      choose_client(&server(false, false, false), None, Some(" abc "), true).unwrap(),
      ClientPlan::Use {
        client_id: "abc".into(),
        kind: "pasted"
      }
    );
    let body = registration_body();
    assert_eq!(body["application_type"], "native");
    assert_eq!(body["redirect_uris"][0], "http://127.0.0.1:8088/callback");
    assert_eq!(body["token_endpoint_auth_method"], "none");
  }

  #[test]
  fn client_bound_to_issuer() {
    let other = SavedClient {
      issuer: "https://other.example".into(),
      client_id: "old".into(),
    };
    assert_eq!(
      choose_client(&server(false, true, false), Some(&other), None, false).unwrap(),
      ClientPlan::Register("https://auth.example/register".into())
    );
    let same = SavedClient {
      issuer: "https://auth.example/".into(),
      client_id: "mine".into(),
    };
    assert_eq!(
      choose_client(&server(false, true, false), Some(&same), None, false).unwrap(),
      ClientPlan::Use {
        client_id: "mine".into(),
        kind: "saved"
      }
    );
  }

  #[test]
  fn rejects_wrong_issuer() {
    let target = "/callback?code=abc&state=s1&iss=https%3A%2F%2Fevil.example";
    assert_eq!(
      parse_callback_with_issuer(target, "s1", "https://auth.example", false).unwrap_err(),
      ISSUER_MISMATCH
    );
    let good = "/callback?code=abc&state=s1&iss=https%3A%2F%2Fauth.example";
    assert_eq!(
      parse_callback_with_issuer(good, "s1", "https://auth.example", true).unwrap(),
      "abc"
    );
  }

  #[test]
  fn missing_issuer_when_required() {
    let target = "/callback?code=abc&state=s1";
    assert_eq!(
      parse_callback_with_issuer(target, "s1", "https://auth.example", true).unwrap_err(),
      ISSUER_MISMATCH
    );
    assert_eq!(
      parse_callback_with_issuer(target, "s1", "https://auth.example", false).unwrap(),
      "abc"
    );
  }

  #[test]
  fn metadata_document_is_used_only_when_reachable() {
    let doc = json!({ "client_id": CLIENT_METADATA_URL, "redirect_uris": ["http://127.0.0.1:8088/callback"] });
    assert!(metadata_document_ok(&doc, CLIENT_METADATA_URL));
    let wrong = json!({ "client_id": "https://elsewhere.example/c.json", "redirect_uris": ["http://127.0.0.1:8088/callback"] });
    assert!(!metadata_document_ok(&wrong, CLIENT_METADATA_URL));
    let no_redirect = json!({ "client_id": CLIENT_METADATA_URL, "redirect_uris": [] });
    assert!(!metadata_document_ok(&no_redirect, CLIENT_METADATA_URL));
  }

  #[test]
  fn the_sign_in_link_carries_pkce_and_the_resource() {
    let link = authorize_url(
      &server(false, false, false),
      "cid",
      "st",
      "chal",
      "https://shop.example/mcp",
      &["read".into()],
    );
    assert!(link.starts_with("https://auth.example/authorize?"));
    for part in [
      "code_challenge_method=S256",
      "code_challenge=chal",
      "state=st",
      "client_id=cid",
      "resource=https%3A%2F%2Fshop.example%2Fmcp",
      "scope=read",
    ] {
      assert!(link.contains(part), "{link}");
    }
  }

  #[test]
  fn a_token_answer_keeps_the_old_refresh_token() {
    let prev = json!({ "refresh": "r-old" });
    let rec = token_record(
      &json!({ "access_token": "a-new", "expires_in": 3600 }),
      Some(&prev),
      "i",
      "t",
      "c",
      "r",
    )
    .unwrap();
    assert_eq!(rec["access"], "a-new");
    assert_eq!(rec["refresh"], "r-old");
    assert!(rec["expiresAt"].as_i64().unwrap() > now_ms());
    assert!(token_record(&json!({ "error": "x" }), None, "i", "t", "c", "r").is_none());
  }

  #[tokio::test]
  async fn refused_refresh_asks_to_sign_in_again() {
    let (port, _seen) = scripted(vec![reply(
      "400 Bad Request",
      "application/json",
      "",
      r#"{"error":"invalid_grant"}"#,
    )])
    .await;
    let record = json!({ "refresh": "r1", "tokenEndpoint": format!("http://127.0.0.1:{port}/token"), "clientId": "c", "resource": "https://s.example/mcp", "issuer": "i" });
    assert_eq!(refresh_record(&record, true).await.unwrap(), None);
  }

  #[tokio::test]
  async fn a_good_refresh_saves_a_new_token() {
    let (port, mut seen) = scripted(vec![reply(
      "200 OK",
      "application/json",
      "",
      r#"{"access_token":"a2","refresh_token":"r2","expires_in":60}"#,
    )])
    .await;
    let record = json!({ "refresh": "r1", "tokenEndpoint": format!("http://127.0.0.1:{port}/token"), "clientId": "c", "resource": "https://s.example/mcp", "issuer": "i" });
    let new = refresh_record(&record, true).await.unwrap().unwrap();
    assert_eq!(new["access"], "a2");
    let req = seen.recv().await.unwrap();
    assert!(
      req.contains("grant_type=refresh_token") && req.contains("refresh_token=r1"),
      "{req}"
    );
  }
}
