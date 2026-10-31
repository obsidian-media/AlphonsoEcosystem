//! Outside tools through MCP (2026-10-30, owner): Alphonso calls out to online MCP servers the
//! user added. Every request goes from here, never from the window: https only, private and
//! local addresses refused (every redirect too), answers capped at 2 MB, calls cut off after
//! 60 s, and the server's keys read from the keychain by server id, never put in an error.
//!
//! Protocol: 2026-07-28 first (no handshake; version, client info and capabilities in each
//! request's `_meta`, mirrored into `MCP-Protocol-Version`, `Mcp-Method`, `Mcp-Name` and
//! `Mcp-Param-*` headers). A server that answers 400/404/405 without a modern JSON-RPC error,
//! or that names 2025-11-25 as its version, gets the 2025-11-25 handshake (`initialize`,
//! `notifications/initialized`, `Mcp-Session-Id`). The deprecated HTTP+SSE transport of
//! 2024-11-05 is not supported.

use base64::Engine as _;
use serde::Serialize;
use serde_json::{json, Value};
use std::time::Duration;

pub(crate) const V2026: &str = "2026-07-28";
pub(crate) const V2025: &str = "2025-11-25";
pub(crate) const MAX_ANSWER_BYTES: usize = 2 * 1024 * 1024;
pub(crate) const CALL_TIMEOUT: Duration = Duration::from_secs(60);
pub(crate) const MAX_TOOLS: usize = 200;
pub(crate) const MAX_TEXT_CHARS: usize = 200_000;
const MAX_PAGES: usize = 10;
const MAX_REDIRECTS: usize = 5;
const REGISTRY_URL: &str = "https://registry.modelcontextprotocol.io/v0/servers";
const REGISTRY_MAX: usize = 30;

pub(crate) const NOT_HTTPS: &str = "Outside tools need an https address.";
pub(crate) const PRIVATE_ADDRESS: &str =
  "That address is on this computer or a private network; Alphonso only connects to online servers.";
pub(crate) const REDIRECT_PRIVATE: &str =
  "The server sent Alphonso to a private address; nothing was read.";
pub(crate) const REDIRECT_ELSEWHERE: &str =
  "The server sent the request somewhere else; check the address.";
pub(crate) const TOO_LARGE: &str = "The server's answer was too large (over 2 MB).";
pub(crate) const NOT_ANSWERING: &str = "The server didn't answer within 60 seconds.";
pub(crate) const ASKED_QUESTION: &str =
  "The server asked a question in the middle of the call, which Alphonso can't answer yet.";
pub(crate) const UNREADABLE: &str = "The server's answer could not be read.";
pub(crate) const BAD_SERVER_ID: &str =
  "That server isn't saved correctly; remove it and add it again.";

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct McpTool {
  pub name: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub title: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub description: Option<String>,
  pub input_schema: Value,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub read_only_hint: Option<bool>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub destructive_hint: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct McpToolsResult {
  pub ok: bool,
  pub tools: Vec<McpTool>,
  pub truncated: bool,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub ttl_ms: Option<u64>,
  pub version: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub reason: Option<String>,
  pub needs_sign_in: bool,
  /// Tools left out because their `x-mcp-header` marks break the spec's rules.
  pub rejected: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct McpCallResult {
  pub ok: bool,
  pub text: String,
  pub is_error: bool,
  pub version: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub reason: Option<String>,
  pub needs_sign_in: bool,
}

/// What a request carries to prove who is asking. Loaded from the keychain by the commands.
#[derive(Debug, Clone, Default)]
pub(crate) struct Creds {
  pub bearer: Option<String>,
  pub headers: Vec<(String, String)>,
}

impl Creds {
  fn secrets(&self) -> Vec<String> {
    let mut out: Vec<String> = self.headers.iter().map(|(_, v)| v.clone()).collect();
    if let Some(b) = &self.bearer {
      out.push(b.clone());
    }
    out.into_iter().filter(|s| s.len() >= 4).collect()
  }
}

#[derive(Debug, PartialEq)]
pub(crate) enum McpError {
  /// 401: sign in (again). Carries the `WWW-Authenticate` header for the sign-in.
  SignIn(Option<String>),
  Failed(String),
}

impl McpError {
  fn text(&self) -> String {
    match self {
      McpError::SignIn(_) => "Sign in to this server again in Settings → Connectors.".to_string(),
      McpError::Failed(t) => t.clone(),
    }
  }
}

/// Hides every secret in `text` and cuts it to 300 characters.
pub(crate) fn scrub(text: &str, secrets: &[String]) -> String {
  let mut out = text.to_string();
  for s in secrets {
    if !s.is_empty() {
      out = out.replace(s.as_str(), "[hidden]");
    }
  }
  out.chars().take(300).collect()
}

fn is_loopback(host: &str) -> bool {
  let h = host
    .trim_matches(|c| c == '[' || c == ']')
    .to_ascii_lowercase();
  h == "localhost" || h == "127.0.0.1" || h == "::1"
}

/// The end-to-end suite's stand-in server is on this computer: a debug build under a test
/// profile may reach loopback (only), and only when the spec asks for it.
pub(crate) fn allow_local() -> bool {
  cfg!(debug_assertions)
    && crate::utils::e2e_profile().is_some()
    && std::env::var("ALPHONSO_E2E_MCP_LOCAL").ok().as_deref() == Some("1")
}

/// A server address Alphonso may connect to: https on a public host. With `allow_local`,
/// plain http to loopback too (never another private address).
pub(crate) async fn checked_url(raw: &str, allow_local: bool) -> Result<reqwest::Url, String> {
  let url = reqwest::Url::parse(raw.trim()).map_err(|_| NOT_HTTPS.to_string())?;
  let host = url.host_str().unwrap_or("").to_string();
  if host.is_empty() {
    return Err(NOT_HTTPS.to_string());
  }
  let local_ok = allow_local && is_loopback(&host);
  if url.scheme() != "https" && !(local_ok && url.scheme() == "http") {
    return Err(NOT_HTTPS.to_string());
  }
  if !local_ok && crate::search::is_private_host(&host).await {
    return Err(PRIVATE_ADDRESS.to_string());
  }
  Ok(url)
}

pub(crate) fn http_client() -> Result<reqwest::Client, String> {
  reqwest::Client::builder()
    .redirect(reqwest::redirect::Policy::none())
    .timeout(CALL_TIMEOUT)
    .user_agent(concat!("Alphonso/", env!("CARGO_PKG_VERSION")))
    .build()
    .map_err(|e| e.to_string())
}

#[derive(Debug)]
pub(crate) struct HttpAnswer {
  pub status: u16,
  pub content_type: String,
  pub body: Vec<u8>,
  pub session_id: Option<String>,
  pub www_authenticate: Option<String>,
}

/// One POST, following only 307/308 redirects (which keep the method and body), each target
/// checked like the first address.
pub(crate) async fn post_json(
  client: &reqwest::Client,
  url: &reqwest::Url,
  headers: &[(String, String)],
  body: &Value,
  allow_local: bool,
) -> Result<HttpAnswer, String> {
  let mut current = url.clone();
  for _ in 0..=MAX_REDIRECTS {
    let mut req = client.post(current.clone()).json(body);
    for (k, v) in headers {
      req = req.header(k.as_str(), v.as_str());
    }
    let response = req.send().await.map_err(|e| {
      if e.is_timeout() {
        NOT_ANSWERING.to_string()
      } else {
        "The server couldn't be reached.".to_string()
      }
    })?;
    let status = response.status();
    if status.is_redirection() {
      let location = response
        .headers()
        .get(reqwest::header::LOCATION)
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| REDIRECT_ELSEWHERE.to_string())?;
      let next = current
        .join(location)
        .map_err(|_| REDIRECT_ELSEWHERE.to_string())?;
      let host = next.host_str().unwrap_or("").to_string();
      let local_ok = allow_local && is_loopback(&host);
      if !local_ok && crate::search::is_private_host(&host).await {
        return Err(REDIRECT_PRIVATE.to_string());
      }
      if next.scheme() != "https" && !local_ok {
        return Err(REDIRECT_ELSEWHERE.to_string());
      }
      if status.as_u16() != 307 && status.as_u16() != 308 {
        return Err(REDIRECT_ELSEWHERE.to_string());
      }
      current = next;
      continue;
    }
    let header = |name: &str| {
      response
        .headers()
        .get(name)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
    };
    let content_type = header("content-type").unwrap_or_default();
    let session_id = header("mcp-session-id");
    let www_authenticate = header("www-authenticate");
    let (bytes, truncated) = crate::search::read_capped(response, MAX_ANSWER_BYTES).await?;
    if truncated {
      return Err(TOO_LARGE.to_string());
    }
    return Ok(HttpAnswer {
      status: status.as_u16(),
      content_type,
      body: bytes,
      session_id,
      www_authenticate,
    });
  }
  Err(REDIRECT_ELSEWHERE.to_string())
}

/// The JSON-RPC message answering `id`: a JSON body, or the matching message in an SSE stream
/// (notifications before it are skipped).
pub(crate) fn find_answer(content_type: &str, body: &[u8], id: u64) -> Option<Value> {
  let text = String::from_utf8_lossy(body);
  let matches = |v: &Value| v.get("id").and_then(Value::as_u64) == Some(id);
  if content_type
    .to_ascii_lowercase()
    .contains("text/event-stream")
  {
    let mut data = String::new();
    let mut found = None;
    let flush = |data: &mut String, found: &mut Option<Value>| {
      if !data.is_empty() {
        if let Ok(v) = serde_json::from_str::<Value>(data) {
          if found.is_none() && matches(&v) {
            *found = Some(v);
          }
        }
        data.clear();
      }
    };
    for line in text.lines() {
      let line = line.trim_end_matches('\r');
      if line.is_empty() {
        flush(&mut data, &mut found);
      } else if let Some(rest) = line.strip_prefix("data:") {
        if !data.is_empty() {
          data.push('\n');
        }
        data.push_str(rest.strip_prefix(' ').unwrap_or(rest));
      }
    }
    flush(&mut data, &mut found);
    return found;
  }
  let v: Value = serde_json::from_str(text.trim()).ok()?;
  if let Some(items) = v.as_array() {
    return items.iter().find(|m| matches(m)).cloned();
  }
  Some(v)
}

/// A JSON-RPC error that only a 2026-07-28 server sends: the client should not fall back.
fn modern_error(answer: &HttpAnswer) -> Option<Value> {
  let v: Value = serde_json::from_slice(&answer.body).ok()?;
  let error = v.get("error")?.clone();
  let code = error.get("code").and_then(Value::as_i64)?;
  let modern = matches!(code, -32022..=-32020) || (answer.status == 404 && code == -32601);
  modern.then_some(error)
}

fn rpc_error_text(error: &Value) -> String {
  error
    .get("message")
    .and_then(Value::as_str)
    .unwrap_or("unknown error")
    .to_string()
}

/// A header value as the spec's Value Encoding says: as is when plain visible ASCII, else
/// `=?base64?…?=`.
pub(crate) fn encode_header_value(value: &str) -> String {
  let plain = !value.is_empty()
    && value.chars().all(|c| c == '\t' || (' '..='~').contains(&c))
    && value.trim() == value
    && !(value.starts_with("=?base64?") && value.ends_with("?="));
  if plain {
    value.to_string()
  } else {
    format!(
      "=?base64?{}?=",
      base64::engine::general_purpose::STANDARD.encode(value.as_bytes())
    )
  }
}

fn is_token(name: &str) -> bool {
  !name.is_empty()
    && name
      .chars()
      .all(|c| c.is_ascii_alphanumeric() || "!#$%&'*+-.^_`|~".contains(c))
}

fn count_header_marks(v: &Value) -> usize {
  match v {
    Value::Object(map) => {
      usize::from(map.contains_key("x-mcp-header"))
        + map.values().map(count_header_marks).sum::<usize>()
    }
    Value::Array(items) => items.iter().map(count_header_marks).sum(),
    _ => 0,
  }
}

/// The `x-mcp-header` marks of a tool's input schema as (property path, header name). An
/// invalid mark (not a token, a duplicate, a non-primitive or `number` type, or reachable other
/// than through `properties`) makes the tool invalid.
pub(crate) fn header_params(schema: &Value) -> Result<Vec<(Vec<String>, String)>, String> {
  fn walk(
    schema: &Value,
    path: &mut Vec<String>,
    out: &mut Vec<(Vec<String>, String)>,
  ) -> Result<(), String> {
    let Some(props) = schema.get("properties").and_then(Value::as_object) else {
      return Ok(());
    };
    for (key, prop) in props {
      path.push(key.clone());
      if let Some(mark) = prop.get("x-mcp-header") {
        let name = mark.as_str().unwrap_or("");
        if !is_token(name) {
          return Err(format!(
            "its header mark on {key} isn't a valid header name"
          ));
        }
        let kind = prop.get("type").and_then(Value::as_str).unwrap_or("");
        if !matches!(kind, "string" | "integer" | "boolean") {
          return Err(format!(
            "its header mark on {key} isn't on a text, whole number or yes/no field"
          ));
        }
        out.push((path.clone(), name.to_string()));
      }
      walk(prop, path, out)?;
      path.pop();
    }
    Ok(())
  }
  let mut out = Vec::new();
  walk(schema, &mut Vec::new(), &mut out)?;
  if out.len() != count_header_marks(schema) {
    return Err("a header mark is somewhere the spec doesn't allow".to_string());
  }
  let mut seen = std::collections::HashSet::new();
  for (_, name) in &out {
    if !seen.insert(name.to_ascii_lowercase()) {
      return Err(format!("the header mark {name} is used twice"));
    }
  }
  Ok(out)
}

/// `Mcp-Param-*` headers for a call's arguments.
pub(crate) fn param_headers(schema: &Value, args: &Value) -> Vec<(String, String)> {
  let Ok(marks) = header_params(schema) else {
    return Vec::new();
  };
  let mut out = Vec::new();
  for (path, name) in marks {
    let mut v = args;
    let mut found = true;
    for key in &path {
      match v.get(key) {
        Some(next) => v = next,
        None => {
          found = false;
          break;
        }
      }
    }
    if !found {
      continue;
    }
    let text = match v {
      Value::String(s) => s.clone(),
      Value::Bool(b) => b.to_string(),
      Value::Number(n) if n.is_i64() || n.is_u64() => n.to_string(),
      _ => continue,
    };
    out.push((format!("Mcp-Param-{name}"), encode_header_value(&text)));
  }
  out
}

/// One connection to one server for one command.
pub(crate) struct McpConn {
  pub client: reqwest::Client,
  pub url: reqwest::Url,
  pub allow_local: bool,
  pub creds: Creds,
  /// The version to try first (the one that worked last time).
  pub preferred: String,
  pub version: String,
  session: Option<String>,
  legacy_ready: bool,
  next_id: u64,
}

impl McpConn {
  pub(crate) fn new(
    url: reqwest::Url,
    creds: Creds,
    preferred: Option<&str>,
    allow_local: bool,
  ) -> Result<Self, String> {
    let preferred = if preferred == Some(V2025) {
      V2025
    } else {
      V2026
    }
    .to_string();
    Ok(McpConn {
      client: http_client()?,
      url,
      allow_local,
      creds,
      version: preferred.clone(),
      preferred,
      session: None,
      legacy_ready: false,
      next_id: 1,
    })
  }

  fn secrets(&self) -> Vec<String> {
    self.creds.secrets()
  }

  fn headers(
    &self,
    version: &str,
    method: &str,
    name: Option<&str>,
    extra: &[(String, String)],
  ) -> Vec<(String, String)> {
    let mut h: Vec<(String, String)> = vec![
      (
        "Accept".into(),
        "application/json, text/event-stream".into(),
      ),
      ("MCP-Protocol-Version".into(), version.into()),
    ];
    if version == V2026 {
      h.push(("Mcp-Method".into(), method.into()));
      if let Some(n) = name {
        h.push(("Mcp-Name".into(), encode_header_value(n)));
      }
    }
    if let Some(s) = &self.session {
      h.push(("Mcp-Session-Id".into(), s.clone()));
    }
    if let Some(b) = &self.creds.bearer {
      h.push(("Authorization".into(), format!("Bearer {b}")));
    }
    h.extend(self.creds.headers.iter().cloned());
    h.extend(extra.iter().cloned());
    h
  }

  fn body(&mut self, version: &str, method: &str, params: Value) -> (u64, Value) {
    let id = self.next_id;
    self.next_id += 1;
    let mut params = if params.is_object() {
      params
    } else {
      json!({})
    };
    if version == V2026 {
      params["_meta"] = json!({
        "io.modelcontextprotocol/protocolVersion": V2026,
        "io.modelcontextprotocol/clientInfo": { "name": "Alphonso", "version": env!("CARGO_PKG_VERSION") },
        "io.modelcontextprotocol/clientCapabilities": {}
      });
    }
    (
      id,
      json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params }),
    )
  }

  async fn send(
    &mut self,
    version: &str,
    method: &str,
    name: Option<&str>,
    params: Value,
    extra: &[(String, String)],
  ) -> Result<(HttpAnswer, u64), McpError> {
    let (id, body) = self.body(version, method, params);
    let headers = self.headers(version, method, name, extra);
    let answer = post_json(&self.client, &self.url, &headers, &body, self.allow_local)
      .await
      .map_err(McpError::Failed)?;
    if answer.status == 401 {
      return Err(McpError::SignIn(answer.www_authenticate.clone()));
    }
    Ok((answer, id))
  }

  fn result_of(&self, answer: &HttpAnswer, id: u64) -> Result<Value, McpError> {
    let secrets = self.secrets();
    let message = find_answer(&answer.content_type, &answer.body, id);
    if !(200..300).contains(&answer.status) {
      let detail = message
        .as_ref()
        .and_then(|m| m.get("error"))
        .map(rpc_error_text)
        .unwrap_or_else(|| {
          String::from_utf8_lossy(&answer.body)
            .chars()
            .take(200)
            .collect()
        });
      return Err(McpError::Failed(scrub(
        &format!(
          "The server refused the request ({}): {detail}",
          answer.status
        ),
        &secrets,
      )));
    }
    let message = message.ok_or_else(|| McpError::Failed(UNREADABLE.to_string()))?;
    if let Some(error) = message.get("error") {
      return Err(McpError::Failed(scrub(
        &format!("The server said: {}", rpc_error_text(error)),
        &secrets,
      )));
    }
    message
      .get("result")
      .cloned()
      .ok_or_else(|| McpError::Failed(UNREADABLE.to_string()))
  }

  async fn legacy_handshake(&mut self) -> Result<(), McpError> {
    self.version = V2025.to_string();
    let params = json!({
      "protocolVersion": V2025,
      "capabilities": {},
      "clientInfo": { "name": "Alphonso", "version": env!("CARGO_PKG_VERSION") }
    });
    let (answer, id) = self.send(V2025, "initialize", None, params, &[]).await?;
    self.session = answer.session_id.clone();
    self.result_of(&answer, id)?;
    let note = json!({ "jsonrpc": "2.0", "method": "notifications/initialized", "params": {} });
    let headers = self.headers(V2025, "notifications/initialized", None, &[]);
    let _ = post_json(&self.client, &self.url, &headers, &note, self.allow_local).await;
    self.legacy_ready = true;
    Ok(())
  }

  /// One request, on the version that works: 2026-07-28 first unless 2025-11-25 worked before.
  pub(crate) async fn request(
    &mut self,
    method: &str,
    name: Option<&str>,
    params: Value,
    extra: &[(String, String)],
  ) -> Result<Value, McpError> {
    if self.preferred == V2025 || self.legacy_ready {
      if !self.legacy_ready {
        self.legacy_handshake().await?;
      }
      let (answer, id) = self.send(V2025, method, name, params, extra).await?;
      return self.result_of(&answer, id);
    }
    let (answer, id) = self
      .send(V2026, method, name, params.clone(), extra)
      .await?;
    if matches!(answer.status, 400 | 404 | 405) {
      let modern = modern_error(&answer);
      let names_2025 = modern.as_ref().is_some_and(|e| {
        e.get("code").and_then(Value::as_i64) == Some(-32022) && e.to_string().contains(V2025)
      });
      if modern.is_none() || names_2025 {
        self.legacy_handshake().await?;
        let (answer, id) = self.send(V2025, method, name, params, extra).await?;
        return self.result_of(&answer, id);
      }
    }
    self.version = V2026.to_string();
    self.result_of(&answer, id)
  }
}

/// `tools/list` results (every page) as tools: at most `MAX_TOOLS`, invalid header marks left
/// out by name.
pub(crate) fn parse_tools(pages: &[Value]) -> (Vec<McpTool>, bool, Option<u64>, Vec<String>) {
  let mut tools = Vec::new();
  let mut rejected = Vec::new();
  let mut truncated = false;
  let mut ttl = None;
  for page in pages {
    if ttl.is_none() {
      ttl = page.get("ttlMs").and_then(Value::as_u64);
    }
    for t in page
      .get("tools")
      .and_then(Value::as_array)
      .into_iter()
      .flatten()
    {
      let Some(name) = t
        .get("name")
        .and_then(Value::as_str)
        .filter(|n| !n.is_empty())
      else {
        continue;
      };
      let schema = t
        .get("inputSchema")
        .cloned()
        .unwrap_or_else(|| json!({ "type": "object" }));
      if header_params(&schema).is_err() {
        rejected.push(name.to_string());
        continue;
      }
      if tools.len() >= MAX_TOOLS {
        truncated = true;
        continue;
      }
      let ann = t.get("annotations");
      let s = |v: Option<&Value>| v.and_then(Value::as_str).map(|x| x.to_string());
      tools.push(McpTool {
        name: name.to_string(),
        title: s(t.get("title")).or_else(|| s(ann.and_then(|a| a.get("title")))),
        description: s(t.get("description")).map(|d| d.chars().take(2000).collect()),
        input_schema: schema,
        read_only_hint: ann
          .and_then(|a| a.get("readOnlyHint"))
          .and_then(Value::as_bool),
        destructive_hint: ann
          .and_then(|a| a.get("destructiveHint"))
          .and_then(Value::as_bool),
      });
    }
  }
  (tools, truncated, ttl, rejected)
}

/// A `tools/call` result as text: structured content as JSON, else the content items.
pub(crate) fn parse_call_result(result: &Value) -> Result<(String, bool), String> {
  match result.get("resultType").and_then(Value::as_str) {
    None | Some("complete") => {}
    Some("input_required") => return Err(ASKED_QUESTION.to_string()),
    Some(_) => return Err(UNREADABLE.to_string()),
  }
  let is_error = result
    .get("isError")
    .and_then(Value::as_bool)
    .unwrap_or(false);
  let text = if let Some(structured) = result.get("structuredContent").filter(|v| !v.is_null()) {
    serde_json::to_string_pretty(structured).unwrap_or_default()
  } else {
    let mut parts = Vec::new();
    for item in result
      .get("content")
      .and_then(Value::as_array)
      .into_iter()
      .flatten()
    {
      let kind = item.get("type").and_then(Value::as_str).unwrap_or("");
      let part = match kind {
        "text" => item
          .get("text")
          .and_then(Value::as_str)
          .unwrap_or("")
          .to_string(),
        "image" => "[a picture]".to_string(),
        "audio" => "[a sound]".to_string(),
        "resource_link" => format!(
          "[link: {}]",
          item.get("uri").and_then(Value::as_str).unwrap_or("")
        ),
        "resource" => item
          .get("resource")
          .and_then(|r| r.get("text"))
          .and_then(Value::as_str)
          .map(|t| t.to_string())
          .unwrap_or_else(|| "[a file]".to_string()),
        _ => continue,
      };
      parts.push(part);
    }
    parts.join("\n")
  };
  Ok((text.chars().take(MAX_TEXT_CHARS).collect(), is_error))
}

pub(crate) async fn list_tools(conn: &mut McpConn) -> Result<McpToolsResult, McpError> {
  let mut pages = Vec::new();
  let mut cursor: Option<String> = None;
  for _ in 0..MAX_PAGES {
    let params = match &cursor {
      Some(c) => json!({ "cursor": c }),
      None => json!({}),
    };
    let page = conn.request("tools/list", None, params, &[]).await?;
    cursor = page
      .get("nextCursor")
      .and_then(Value::as_str)
      .map(|s| s.to_string());
    let count: usize = pages
      .iter()
      .map(|p: &Value| p.get("tools").and_then(Value::as_array).map_or(0, Vec::len))
      .sum::<usize>()
      + page
        .get("tools")
        .and_then(Value::as_array)
        .map_or(0, Vec::len);
    pages.push(page);
    if cursor.is_none() || count > MAX_TOOLS {
      break;
    }
  }
  let (tools, mut truncated, ttl_ms, rejected) = parse_tools(&pages);
  truncated |= cursor.is_some();
  Ok(McpToolsResult {
    ok: true,
    tools,
    truncated,
    ttl_ms,
    version: conn.version.clone(),
    reason: None,
    needs_sign_in: false,
    rejected,
  })
}

pub(crate) async fn call_tool(
  conn: &mut McpConn,
  tool: &str,
  arguments: Value,
  schema: Option<&Value>,
) -> Result<McpCallResult, McpError> {
  let extra = schema
    .map(|s| param_headers(s, &arguments))
    .unwrap_or_default();
  let result = conn
    .request(
      "tools/call",
      Some(tool),
      json!({ "name": tool, "arguments": arguments }),
      &extra,
    )
    .await?;
  let (text, is_error) = parse_call_result(&result).map_err(McpError::Failed)?;
  let secrets = conn.secrets();
  let text = if secrets.is_empty() {
    text
  } else {
    secrets
      .iter()
      .fold(text, |t, s| t.replace(s.as_str(), "[hidden]"))
  };
  Ok(McpCallResult {
    ok: !is_error,
    text,
    is_error,
    version: conn.version.clone(),
    reason: None,
    needs_sign_in: false,
  })
}

// ---- Keychain: secrets by server id, never through the window. ----

pub(crate) fn valid_server_id(id: &str) -> bool {
  !id.is_empty()
    && id.len() <= 64
    && id
      .chars()
      .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

fn header_name_allowed(name: &str) -> bool {
  let lower = name.to_ascii_lowercase();
  is_token(name)
    && !lower.starts_with("mcp-")
    && !matches!(
      lower.as_str(),
      "host" | "content-type" | "content-length" | "accept" | "connection" | "transfer-encoding"
    )
}

pub(crate) fn account(server_id: &str, part: &str) -> String {
  format!("mcp:{server_id}:{part}")
}

fn keychain_get(key: &str) -> Option<String> {
  crate::os_keychain_store::secure_credential_get(key.to_string())
    .ok()
    .flatten()
}

fn keychain_set(key: &str, value: &str) -> Result<(), String> {
  crate::os_keychain_store::secure_credential_set(key.to_string(), value.to_string())
}

fn header_names(server_id: &str) -> Vec<String> {
  keychain_get(&account(server_id, "headers"))
    .and_then(|s| serde_json::from_str::<Vec<String>>(&s).ok())
    .unwrap_or_default()
}

/// The saved sign-in token, when there is one (written by `mcp_auth.rs`).
pub(crate) fn saved_access_token(server_id: &str) -> Option<String> {
  let raw = keychain_get(&account(server_id, "token"))?;
  let v: Value = serde_json::from_str(&raw).ok()?;
  v.get("access")
    .and_then(Value::as_str)
    .map(|s| s.to_string())
}

pub(crate) fn load_creds(server_id: &str) -> Creds {
  let headers = header_names(server_id)
    .into_iter()
    .filter_map(|n| keychain_get(&account(server_id, &format!("header:{n}"))).map(|v| (n, v)))
    .collect();
  Creds {
    bearer: saved_access_token(server_id),
    headers,
  }
}

/// The origin an address is reached at: "https://host" or "https://host:port".
pub(crate) fn origin_of(url: &reqwest::Url) -> String {
  url.origin().ascii_serialization()
}

/// Only secrets saved for this exact origin go with a request (final review, 2026-10-30): the
/// window passes the address, so a key or sign-in saved for one server must never reach another.
/// Saved keys carry the origin they were saved for; a sign-in token carries its `resource`.
pub(crate) fn creds_for_address(
  saved_origin: Option<&str>,
  token_resource: Option<&str>,
  url: &reqwest::Url,
  creds: Creds,
) -> Creds {
  let here = origin_of(url);
  let token_ok = token_resource
    .and_then(|r| reqwest::Url::parse(r).ok())
    .is_some_and(|r| origin_of(&r) == here);
  let headers_ok = saved_origin == Some(here.as_str());
  Creds {
    bearer: if token_ok { creds.bearer } else { None },
    headers: if headers_ok {
      creds.headers
    } else {
      Vec::new()
    },
  }
}

fn saved_token_resource(server_id: &str) -> Option<String> {
  let raw = keychain_get(&account(server_id, "token"))?;
  let v: Value = serde_json::from_str(&raw).ok()?;
  v.get("resource")
    .and_then(Value::as_str)
    .map(|s| s.to_string())
}

/// The saved secrets that may go to `url`.
pub(crate) fn bound_creds(server_id: &str, url: &reqwest::Url) -> Creds {
  creds_for_address(
    keychain_get(&account(server_id, "origin")).as_deref(),
    saved_token_resource(server_id).as_deref(),
    url,
    load_creds(server_id),
  )
}

async fn connect(server_id: &str, url: &str, version: Option<&str>) -> Result<McpConn, String> {
  if !valid_server_id(server_id) {
    return Err(BAD_SERVER_ID.to_string());
  }
  let allow = allow_local();
  let url = checked_url(url, allow).await?;
  crate::mcp_auth::refresh_if_expired(server_id).await;
  let creds = bound_creds(server_id, &url);
  McpConn::new(url, creds, version, allow)
}

#[tauri::command]
pub(crate) async fn mcp_list_tools(
  server_id: String,
  url: String,
  version: Option<String>,
) -> McpToolsResult {
  let mut conn = match connect(&server_id, &url, version.as_deref()).await {
    Ok(c) => c,
    Err(reason) => {
      return McpToolsResult {
        reason: Some(reason),
        ..Default::default()
      }
    }
  };
  let mut outcome = list_tools(&mut conn).await;
  if matches!(outcome, Err(McpError::SignIn(_)))
    && crate::mcp_auth::refresh_saved_token(&server_id)
      .await
      .unwrap_or(false)
  {
    conn.creds = bound_creds(&server_id, &conn.url);
    outcome = list_tools(&mut conn).await;
  }
  match outcome {
    Ok(r) => r,
    Err(e) => McpToolsResult {
      reason: Some(e.text()),
      needs_sign_in: matches!(e, McpError::SignIn(_)),
      version: conn.version.clone(),
      ..Default::default()
    },
  }
}

#[tauri::command]
pub(crate) async fn mcp_call_tool(
  server_id: String,
  url: String,
  version: Option<String>,
  tool: String,
  arguments: Value,
  input_schema: Option<Value>,
) -> McpCallResult {
  let mut conn = match connect(&server_id, &url, version.as_deref()).await {
    Ok(c) => c,
    Err(reason) => {
      return McpCallResult {
        reason: Some(reason),
        ..Default::default()
      }
    }
  };
  let arguments = if arguments.is_object() {
    arguments
  } else {
    json!({})
  };
  let mut outcome = call_tool(&mut conn, &tool, arguments.clone(), input_schema.as_ref()).await;
  if matches!(outcome, Err(McpError::SignIn(_)))
    && crate::mcp_auth::refresh_saved_token(&server_id)
      .await
      .unwrap_or(false)
  {
    conn.creds = bound_creds(&server_id, &conn.url);
    outcome = call_tool(&mut conn, &tool, arguments, input_schema.as_ref()).await;
  }
  match outcome {
    Ok(r) => r,
    Err(e) => McpCallResult {
      reason: Some(e.text()),
      needs_sign_in: matches!(e, McpError::SignIn(_)),
      version: conn.version.clone(),
      ..Default::default()
    },
  }
}

pub(crate) const KEY_FOR_OTHER_ADDRESS: &str =
  "This server's key was saved for another address. Remove the server and add it again.";

/// A key or header the server needs, kept in the keychain (never returned to the window), and
/// bound to the server's address: it is only ever sent there.
#[tauri::command]
pub(crate) async fn mcp_save_header(
  server_id: String,
  url: String,
  name: String,
  value: String,
) -> Result<(), String> {
  if !valid_server_id(&server_id) {
    return Err(BAD_SERVER_ID.to_string());
  }
  let origin = origin_of(&checked_url(&url, allow_local()).await?);
  match keychain_get(&account(&server_id, "origin")) {
    Some(saved) if saved != origin => return Err(KEY_FOR_OTHER_ADDRESS.to_string()),
    Some(_) => {}
    None => keychain_set(&account(&server_id, "origin"), &origin)?,
  }
  let name = name.trim().to_string();
  if !header_name_allowed(&name) {
    return Err("That header name can't be used.".to_string());
  }
  if value.contains('\r') || value.contains('\n') {
    return Err("That value can't be used as a header.".to_string());
  }
  keychain_set(
    &account(&server_id, &format!("header:{name}")),
    value.trim(),
  )?;
  let mut names = header_names(&server_id);
  if !names.iter().any(|n| n.eq_ignore_ascii_case(&name)) {
    names.push(name);
  }
  keychain_set(
    &account(&server_id, "headers"),
    &serde_json::to_string(&names).unwrap_or_default(),
  )
}

/// Forgets every secret saved for a server (its headers and its sign-in).
#[tauri::command]
pub(crate) fn mcp_forget_server(server_id: String) -> Result<(), String> {
  if !valid_server_id(&server_id) {
    return Err(BAD_SERVER_ID.to_string());
  }
  let del = |k: String| {
    let _ = crate::os_keychain_store::secure_credential_delete(k);
  };
  for n in header_names(&server_id) {
    del(account(&server_id, &format!("header:{n}")));
  }
  for part in ["headers", "token", "client", "origin"] {
    del(account(&server_id, part));
  }
  Ok(())
}

/// Which saved secrets a server has, by name only.
#[tauri::command]
pub(crate) fn mcp_saved_parts(server_id: String) -> Value {
  if !valid_server_id(&server_id) {
    return json!({ "headers": [], "signedIn": false });
  }
  json!({ "headers": header_names(&server_id), "signedIn": saved_access_token(&server_id).is_some() })
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RegistryHeader {
  pub name: String,
  pub description: String,
  pub is_secret: bool,
  pub is_required: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RegistryRemote {
  #[serde(rename = "type")]
  pub kind: String,
  pub url: String,
  pub headers: Vec<RegistryHeader>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RegistryServer {
  pub name: String,
  pub title: String,
  pub description: String,
  pub website_url: String,
  pub remotes: Vec<RegistryRemote>,
}

/// The Registry's answer, kept to the latest version of servers with an online
/// (`streamable-http`) remote. `sse` remotes use the deprecated transport and are left out.
pub(crate) fn parse_registry(v: &Value) -> Vec<RegistryServer> {
  let s = |x: Option<&Value>| x.and_then(Value::as_str).unwrap_or("").to_string();
  let mut out: Vec<RegistryServer> = Vec::new();
  for item in v
    .get("servers")
    .and_then(Value::as_array)
    .into_iter()
    .flatten()
  {
    let latest = item
      .get("_meta")
      .and_then(|m| m.get("io.modelcontextprotocol.registry/official"))
      .and_then(|o| o.get("isLatest"))
      .and_then(Value::as_bool)
      .unwrap_or(true);
    if !latest {
      continue;
    }
    let Some(server) = item.get("server") else {
      continue;
    };
    let remotes: Vec<RegistryRemote> = server
      .get("remotes")
      .and_then(Value::as_array)
      .into_iter()
      .flatten()
      .filter(|r| r.get("type").and_then(Value::as_str) == Some("streamable-http"))
      .filter(|r| s(r.get("url")).starts_with("https://"))
      .map(|r| RegistryRemote {
        kind: "streamable-http".to_string(),
        url: s(r.get("url")),
        headers: r
          .get("headers")
          .and_then(Value::as_array)
          .into_iter()
          .flatten()
          .map(|h| RegistryHeader {
            name: s(h.get("name")),
            description: s(h.get("description")),
            is_secret: h.get("isSecret").and_then(Value::as_bool).unwrap_or(false),
            is_required: h
              .get("isRequired")
              .and_then(Value::as_bool)
              .unwrap_or(false),
          })
          .filter(|h| header_name_allowed(&h.name))
          .collect(),
      })
      .collect();
    if remotes.is_empty() {
      continue;
    }
    let name = s(server.get("name"));
    if out.iter().any(|o| o.name == name) {
      continue;
    }
    out.push(RegistryServer {
      title: Some(s(server.get("title")))
        .filter(|t| !t.is_empty())
        .unwrap_or_else(|| name.clone()),
      name,
      description: s(server.get("description")).chars().take(500).collect(),
      website_url: s(server.get("websiteUrl")),
      remotes,
    });
    if out.len() >= REGISTRY_MAX {
      break;
    }
  }
  out
}

#[tauri::command]
pub(crate) async fn mcp_registry_search(text: String) -> Result<Vec<RegistryServer>, String> {
  let mut url = reqwest::Url::parse(REGISTRY_URL).map_err(|e| e.to_string())?;
  url
    .query_pairs_mut()
    .append_pair(
      "search",
      text.trim().chars().take(100).collect::<String>().as_str(),
    )
    .append_pair("limit", "100");
  let client = http_client()?;
  let response = crate::search::fetch_with_ssrf_guard(&client, url)
    .await
    .map_err(|_| "The MCP Registry couldn't be reached.".to_string())?;
  if !response.status().is_success() {
    return Err(format!(
      "The MCP Registry answered {}.",
      response.status().as_u16()
    ));
  }
  let (bytes, _) = crate::search::read_capped(response, MAX_ANSWER_BYTES).await?;
  let v: Value = serde_json::from_slice(&bytes)
    .map_err(|_| "The MCP Registry's answer could not be read.".to_string())?;
  Ok(parse_registry(&v))
}

#[cfg(test)]
pub(crate) mod tests {
  use super::*;

  /// A loopback server answering each connection from `replies` in turn; sends back each
  /// request it received.
  pub(crate) async fn scripted(
    replies: Vec<String>,
  ) -> (u16, tokio::sync::mpsc::UnboundedReceiver<String>) {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let (tx, rx) = tokio::sync::mpsc::unbounded_channel();
    tokio::spawn(async move {
      for reply in replies {
        let (mut socket, _) = listener.accept().await.unwrap();
        let mut buf = vec![0u8; 65536];
        let mut got = Vec::new();
        loop {
          let n = socket.read(&mut buf).await.unwrap_or(0);
          got.extend_from_slice(&buf[..n]);
          let text = String::from_utf8_lossy(&got).to_string();
          if n == 0 {
            break;
          }
          if let Some(head_end) = text.find("\r\n\r\n") {
            let len = text[..head_end]
              .lines()
              .find_map(|l| {
                l.to_ascii_lowercase()
                  .strip_prefix("content-length:")
                  .map(|v| v.trim().parse::<usize>().unwrap_or(0))
              })
              .unwrap_or(0);
            if got.len() >= head_end + 4 + len {
              break;
            }
          }
        }
        let _ = tx.send(String::from_utf8_lossy(&got).to_string());
        let _ = socket.write_all(reply.as_bytes()).await;
        let _ = socket.shutdown().await;
      }
    });
    (port, rx)
  }

  pub(crate) fn reply(status: &str, content_type: &str, extra: &str, body: &str) -> String {
    format!(
      "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\n{extra}Content-Length: {}\r\nConnection: close\r\n\r\n{body}",
      body.len()
    )
  }

  fn conn(port: u16, creds: Creds) -> McpConn {
    let url = reqwest::Url::parse(&format!("http://127.0.0.1:{port}/mcp")).unwrap();
    McpConn::new(url, creds, None, true).unwrap()
  }

  fn tools_result(id: u64, n: usize) -> String {
    let tools: Vec<Value> = (0..n)
      .map(|i| json!({ "name": format!("tool_{i}"), "inputSchema": { "type": "object" } }))
      .collect();
    json!({ "jsonrpc": "2.0", "id": id, "result": { "tools": tools } }).to_string()
  }

  #[tokio::test]
  async fn refuses_http_and_private_addresses() {
    assert_eq!(
      checked_url("http://example.com/mcp", false)
        .await
        .unwrap_err(),
      NOT_HTTPS
    );
    assert_eq!(
      checked_url("https://127.0.0.1/mcp", false)
        .await
        .unwrap_err(),
      PRIVATE_ADDRESS
    );
    assert_eq!(
      checked_url("https://10.0.0.5/mcp", false)
        .await
        .unwrap_err(),
      PRIVATE_ADDRESS
    );
    // The test allowance reaches loopback only, never another private address.
    assert!(checked_url("http://127.0.0.1:9/mcp", true).await.is_ok());
    assert_eq!(
      checked_url("http://10.0.0.5/mcp", true).await.unwrap_err(),
      NOT_HTTPS
    );
    assert_eq!(
      checked_url("https://169.254.169.254/", true)
        .await
        .unwrap_err(),
      PRIVATE_ADDRESS
    );
  }

  #[tokio::test]
  async fn refuses_redirect_to_private_address() {
    let (port, _seen) = scripted(vec![reply(
      "307 Temporary Redirect",
      "text/plain",
      "Location: http://169.254.169.254/latest\r\n",
      "",
    )])
    .await;
    let mut c = conn(port, Creds::default());
    assert_eq!(
      list_tools(&mut c).await.unwrap_err(),
      McpError::Failed(REDIRECT_PRIVATE.to_string())
    );
  }

  #[tokio::test]
  async fn speaks_2026_first() {
    let (port, mut seen) = scripted(vec![reply(
      "200 OK",
      "application/json",
      "",
      &tools_result(1, 2),
    )])
    .await;
    let mut c = conn(port, Creds::default());
    let r = list_tools(&mut c).await.unwrap();
    assert_eq!(r.tools.len(), 2);
    assert_eq!(r.version, V2026);
    let req = seen.recv().await.unwrap();
    let lower = req.to_ascii_lowercase();
    assert!(lower.contains("mcp-protocol-version: 2026-07-28"), "{req}");
    assert!(lower.contains("mcp-method: tools/list"), "{req}");
    assert!(
      req.contains("io.modelcontextprotocol/protocolVersion"),
      "{req}"
    );
    assert!(
      req.contains("io.modelcontextprotocol/clientCapabilities"),
      "{req}"
    );
    assert!(!req.contains("\"initialize\""), "{req}");
  }

  #[tokio::test]
  async fn falls_back_to_2025_handshake() {
    let init = json!({ "jsonrpc": "2.0", "id": 2, "result": { "protocolVersion": V2025, "capabilities": {} } }).to_string();
    let (port, mut seen) = scripted(vec![
      reply(
        "400 Bad Request",
        "text/plain",
        "",
        "Bad Request: no valid session",
      ),
      reply(
        "200 OK",
        "application/json",
        "Mcp-Session-Id: sess-42\r\n",
        &init,
      ),
      reply("202 Accepted", "text/plain", "", ""),
      reply("200 OK", "application/json", "", &tools_result(3, 1)),
    ])
    .await;
    let mut c = conn(port, Creds::default());
    let r = list_tools(&mut c).await.unwrap();
    assert_eq!(r.version, V2025);
    assert_eq!(r.tools.len(), 1);
    let _first = seen.recv().await.unwrap();
    assert!(seen.recv().await.unwrap().contains("\"initialize\""));
    assert!(seen
      .recv()
      .await
      .unwrap()
      .contains("notifications/initialized"));
    let last = seen.recv().await.unwrap();
    assert!(
      last
        .to_ascii_lowercase()
        .contains("mcp-session-id: sess-42"),
      "{last}"
    );
    assert!(last.contains("tools/list"));
  }

  #[tokio::test]
  async fn a_modern_error_does_not_fall_back() {
    let err = json!({ "jsonrpc": "2.0", "id": 1, "error": { "code": -32020, "message": "Header mismatch" } }).to_string();
    let (port, _seen) =
      scripted(vec![reply("400 Bad Request", "application/json", "", &err)]).await;
    let mut c = conn(port, Creds::default());
    let e = list_tools(&mut c).await.unwrap_err();
    assert!(matches!(e, McpError::Failed(t) if t.contains("Header mismatch")));
  }

  #[tokio::test]
  async fn picks_the_answer_matching_the_request_id() {
    let note =
      json!({ "jsonrpc": "2.0", "method": "notifications/progress", "params": { "progress": 1 } });
    let body = format!(
      "event: message\ndata: {note}\n\n: keep-alive\n\ndata: {}\n\n",
      tools_result(1, 3)
    );
    let (port, _seen) = scripted(vec![reply("200 OK", "text/event-stream", "", &body)]).await;
    let mut c = conn(port, Creds::default());
    assert_eq!(list_tools(&mut c).await.unwrap().tools.len(), 3);
  }

  #[tokio::test]
  async fn caps_answers_at_2mb() {
    let big = format!(
      "{{\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{{\"x\":\"{}\"}}}}",
      "a".repeat(3 * 1024 * 1024)
    );
    let (port, _seen) = scripted(vec![reply("200 OK", "application/json", "", &big)]).await;
    let mut c = conn(port, Creds::default());
    assert_eq!(
      list_tools(&mut c).await.unwrap_err(),
      McpError::Failed(TOO_LARGE.to_string())
    );
  }

  #[tokio::test]
  async fn secret_never_in_errors() {
    let secret = "sk-supersecret-123456";
    let (port, mut seen) = scripted(vec![reply(
      "500 Internal Server Error",
      "text/plain",
      "",
      &format!("bad token {secret} rejected"),
    )])
    .await;
    let mut c = conn(
      port,
      Creds {
        bearer: Some(secret.into()),
        headers: vec![("X-Api-Key".into(), "key-abcdef".into())],
      },
    );
    let e = list_tools(&mut c).await.unwrap_err();
    let McpError::Failed(text) = e else {
      panic!("expected a failure")
    };
    assert!(!text.contains(secret), "{text}");
    assert!(text.contains("[hidden]"), "{text}");
    let req = seen.recv().await.unwrap();
    assert!(req.contains(&format!("Bearer {secret}")));
    assert!(req.to_ascii_lowercase().contains("x-api-key: key-abcdef"));
  }

  #[tokio::test]
  async fn a_401_asks_to_sign_in_with_the_challenge() {
    let (port, _seen) = scripted(vec![reply("401 Unauthorized", "text/plain", "WWW-Authenticate: Bearer resource_metadata=\"https://x.example/.well-known/oauth-protected-resource\"\r\n", "")]).await;
    let mut c = conn(port, Creds::default());
    match list_tools(&mut c).await.unwrap_err() {
      McpError::SignIn(Some(h)) => assert!(h.contains("resource_metadata")),
      other => panic!("{other:?}"),
    }
  }

  #[tokio::test]
  async fn keeps_at_most_200_tools() {
    let (port, _seen) = scripted(vec![reply(
      "200 OK",
      "application/json",
      "",
      &tools_result(1, 250),
    )])
    .await;
    let mut c = conn(port, Creds::default());
    let r = list_tools(&mut c).await.unwrap();
    assert_eq!(r.tools.len(), 200);
    assert!(r.truncated);
  }

  #[tokio::test]
  async fn a_call_sends_the_name_and_param_headers() {
    let res = json!({ "jsonrpc": "2.0", "id": 1, "result": { "content": [{ "type": "text", "text": "Price set." }] } }).to_string();
    let (port, mut seen) = scripted(vec![reply("200 OK", "application/json", "", &res)]).await;
    let mut c = conn(port, Creds::default());
    let schema = json!({ "type": "object", "properties": { "region": { "type": "string", "x-mcp-header": "Region" }, "q": { "type": "string" } } });
    let r = call_tool(
      &mut c,
      "update_price",
      json!({ "region": "Mūnich", "q": "x" }),
      Some(&schema),
    )
    .await
    .unwrap();
    assert_eq!(r.text, "Price set.");
    assert!(r.ok);
    let req = seen.recv().await.unwrap().to_ascii_lowercase();
    assert!(req.contains("mcp-name: update_price"), "{req}");
    assert!(req.contains("mcp-param-region: =?base64?"), "{req}");
  }

  #[test]
  fn reads_call_results() {
    assert_eq!(
      parse_call_result(&json!({ "structuredContent": { "count": 3 } }))
        .unwrap()
        .0,
      "{\n  \"count\": 3\n}"
    );
    let (text, is_error) = parse_call_result(&json!({ "isError": true, "content": [{ "type": "text", "text": "No such product" }, { "type": "image", "data": "x" }] })).unwrap();
    assert_eq!(text, "No such product\n[a picture]");
    assert!(is_error);
    assert_eq!(
      parse_call_result(&json!({ "resultType": "input_required", "inputRequests": {} }))
        .unwrap_err(),
      ASKED_QUESTION
    );
    assert_eq!(
      parse_call_result(&json!({ "resultType": "weird" })).unwrap_err(),
      UNREADABLE
    );
  }

  #[test]
  fn invalid_header_marks_leave_the_tool_out() {
    let page = json!({ "tools": [
      { "name": "good", "inputSchema": { "type": "object", "properties": { "a": { "type": "string", "x-mcp-header": "A" } } } },
      { "name": "in_items", "inputSchema": { "type": "object", "properties": { "list": { "type": "array", "items": { "type": "string", "x-mcp-header": "B" } } } } },
      { "name": "number", "inputSchema": { "type": "object", "properties": { "n": { "type": "number", "x-mcp-header": "N" } } } },
      { "name": "twice", "inputSchema": { "type": "object", "properties": { "a": { "type": "string", "x-mcp-header": "X" }, "b": { "type": "string", "x-mcp-header": "x" } } } }
    ]});
    let (tools, _, _, rejected) = parse_tools(&[page]);
    assert_eq!(
      tools.iter().map(|t| t.name.as_str()).collect::<Vec<_>>(),
      vec!["good"]
    );
    assert_eq!(rejected, vec!["in_items", "number", "twice"]);
  }

  #[test]
  fn reads_hints_and_ttl() {
    let page = json!({ "ttlMs": 60000, "tools": [{ "name": "list_products", "annotations": { "readOnlyHint": true, "title": "List products" } }] });
    let (tools, truncated, ttl, _) = parse_tools(&[page]);
    assert_eq!(ttl, Some(60000));
    assert!(!truncated);
    assert_eq!(tools[0].read_only_hint, Some(true));
    assert_eq!(tools[0].title.as_deref(), Some("List products"));
  }

  #[test]
  fn header_values_are_encoded_when_needed() {
    assert_eq!(encode_header_value("us-west1"), "us-west1");
    assert_eq!(encode_header_value(" padded "), "=?base64?IHBhZGRlZCA=?=");
    assert_eq!(
      encode_header_value("line1\nline2"),
      "=?base64?bGluZTEKbGluZTI=?="
    );
    assert_eq!(
      encode_header_value("=?base64?literal?="),
      "=?base64?PT9iYXNlNjQ/bGl0ZXJhbD89?="
    );
  }

  #[test]
  fn registry_keeps_latest_online_servers_only() {
    let v = json!({ "servers": [
      { "server": { "name": "com.a/shop", "title": "Shop", "description": "d", "remotes": [{ "type": "streamable-http", "url": "https://a.example/mcp", "headers": [{ "name": "X-Api-Key", "isSecret": true, "isRequired": true }] }] },
        "_meta": { "io.modelcontextprotocol.registry/official": { "isLatest": true } } },
      { "server": { "name": "com.a/shop", "remotes": [{ "type": "streamable-http", "url": "https://old.example/mcp" }] },
        "_meta": { "io.modelcontextprotocol.registry/official": { "isLatest": false } } },
      { "server": { "name": "com.b/local", "packages": [{ "registryType": "npm" }] },
        "_meta": { "io.modelcontextprotocol.registry/official": { "isLatest": true } } },
      { "server": { "name": "com.c/old", "remotes": [{ "type": "sse", "url": "https://c.example/sse" }] } }
    ]});
    let out = parse_registry(&v);
    assert_eq!(out.len(), 1);
    assert_eq!(out[0].title, "Shop");
    assert_eq!(out[0].remotes[0].url, "https://a.example/mcp");
    assert!(out[0].remotes[0].headers[0].is_secret);
  }

  #[test]
  fn server_ids_and_header_names_are_checked() {
    assert!(valid_server_id("shopify-2"));
    assert!(!valid_server_id("Shop"));
    assert!(!valid_server_id("a:b"));
    assert!(header_name_allowed("X-Api-Key"));
    assert!(header_name_allowed("Authorization"));
    assert!(!header_name_allowed("Mcp-Session-Id"));
    assert!(!header_name_allowed("Host"));
    assert!(!header_name_allowed("Bad Name"));
  }

  // Final review (2026-10-30): a saved key or sign-in goes only to the address it was saved for,
  // whatever address the window passes.
  #[test]
  fn saved_secrets_go_only_to_their_own_address() {
    let creds = || Creds {
      bearer: Some("tok".into()),
      headers: vec![("X-Api-Key".into(), "k".into())],
    };
    let shop = reqwest::Url::parse("https://shop.example/api/mcp").unwrap();
    let evil = reqwest::Url::parse("https://evil.example/api/mcp").unwrap();
    let other_port = reqwest::Url::parse("https://shop.example:8443/api/mcp").unwrap();
    let kept = creds_for_address(
      Some("https://shop.example"),
      Some("https://shop.example/api/mcp"),
      &shop,
      creds(),
    );
    assert_eq!(kept.bearer.as_deref(), Some("tok"));
    assert_eq!(kept.headers.len(), 1);
    let none = creds_for_address(
      Some("https://shop.example"),
      Some("https://shop.example/api/mcp"),
      &evil,
      creds(),
    );
    assert!(none.bearer.is_none() && none.headers.is_empty());
    let port = creds_for_address(
      Some("https://shop.example"),
      Some("https://shop.example/api/mcp"),
      &other_port,
      creds(),
    );
    assert!(port.bearer.is_none() && port.headers.is_empty());
    // Nothing recorded: nothing is sent.
    let unknown = creds_for_address(None, None, &shop, creds());
    assert!(unknown.bearer.is_none() && unknown.headers.is_empty());
    assert_eq!(origin_of(&shop), "https://shop.example");
  }
}
