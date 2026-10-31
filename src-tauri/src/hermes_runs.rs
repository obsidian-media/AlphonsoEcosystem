//! Hermes gateway (2026-10-30): a Hermes step runs as a Hermes run, so Alphonso
//! sees its progress, can stop it and answers its approval requests. Hermes
//! 0.19.0's API (read from its source): `POST /v1/runs` → `{ run_id }`,
//! `GET /v1/runs/{id}/events` (server-sent events, `data:` lines, a keep-alive
//! comment every 30 s), `POST /v1/runs/{id}/approval` `{ choice }` (409 once
//! Hermes stopped waiting), `POST /v1/runs/{id}/stop`.
//!
//! The window passes the profile's address and its Authorization header; a
//! profile Alphonso set up passes a key reference that `resolve_profile_auth()`
//! swaps for the key, only at that profile's own address. Events go to the
//! window as `hermes://run_event` `{ runId, event, data }`; a stream that ends
//! without a final event, or stays silent, ends as `run.lost`.

use crate::hermes_profiles::resolve_profile_auth;
use serde::Serialize;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

pub(crate) const RUN_EVENT: &str = "hermes://run_event";
/// Hermes sends a keep-alive every 30 s; four missed ones mean it stopped answering.
const SILENCE_LIMIT: Duration = Duration::from_secs(120);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const FINAL_EVENTS: &[&str] = &["run.completed", "run.failed", "run.cancelled"];

/// Alphonso only ever answers one use at a time, or no.
pub(crate) fn valid_choice(choice: &str) -> bool {
  matches!(choice, "once" | "deny")
}

pub(crate) fn valid_run_id(run_id: &str) -> bool {
  !run_id.is_empty()
    && run_id.len() <= 100
    && run_id
      .chars()
      .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

pub(crate) fn valid_base(base: &str) -> bool {
  let lower = base.to_ascii_lowercase();
  (lower.starts_with("http://") || lower.starts_with("https://"))
    && !base.contains(char::is_whitespace)
}

pub(crate) fn runs_url(base: &str, run_id: Option<&str>, tail: Option<&str>) -> String {
  let mut url = format!("{}/v1/runs", base.trim_end_matches('/'));
  if let Some(id) = run_id {
    url.push('/');
    url.push_str(id);
  }
  if let Some(t) = tail {
    url.push('/');
    url.push_str(t);
  }
  url
}

/// Splits complete server-sent events off `buffer`: each `data:` block parsed as
/// JSON, comments (keep-alives) skipped. Returns the events and what is left.
pub(crate) fn parse_sse(buffer: &str) -> (Vec<serde_json::Value>, String) {
  let text = buffer.replace("\r\n", "\n");
  let mut events = Vec::new();
  let mut rest = text.as_str();
  while let Some(end) = rest.find("\n\n") {
    let block = &rest[..end];
    rest = &rest[end + 2..];
    let data: Vec<&str> = block
      .lines()
      .filter_map(|l| l.strip_prefix("data:"))
      .map(|l| l.strip_prefix(' ').unwrap_or(l))
      .collect();
    if data.is_empty() {
      continue;
    }
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(&data.join("\n")) {
      events.push(value);
    }
  }
  (events, rest.to_string())
}

fn authorization(header: &str, url: &str) -> Result<String, String> {
  Ok(resolve_profile_auth(header, url)?.unwrap_or_else(|| header.to_string()))
}

fn client() -> Result<reqwest::Client, String> {
  reqwest::Client::builder()
    .connect_timeout(Duration::from_secs(10))
    .build()
    .map_err(|e| e.to_string())
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct RunEvent {
  run_id: String,
  event: String,
  data: serde_json::Value,
}

fn emit(app: &AppHandle, run_id: &str, data: serde_json::Value) {
  let event = data
    .get("event")
    .and_then(|e| e.as_str())
    .unwrap_or("")
    .to_string();
  let _ = app.emit(
    RUN_EVENT,
    RunEvent {
      run_id: run_id.to_string(),
      event,
      data,
    },
  );
}

async fn follow_events(app: AppHandle, events_url: String, auth: String, run_id: String) {
  let lost = |app: &AppHandle| emit(app, &run_id, serde_json::json!({ "event": "run.lost" }));
  let Ok(client) = client() else {
    return lost(&app);
  };
  let response = match client
    .get(&events_url)
    .header("Authorization", &auth)
    .header("Accept", "text/event-stream")
    .send()
    .await
  {
    Ok(r) if r.status().is_success() => r,
    _ => return lost(&app),
  };
  let mut response = response;
  let mut buffer = String::new();
  loop {
    match tokio::time::timeout(SILENCE_LIMIT, response.chunk()).await {
      Ok(Ok(Some(bytes))) => {
        buffer.push_str(&String::from_utf8_lossy(&bytes));
        let (events, rest) = parse_sse(&buffer);
        buffer = rest;
        for event in events {
          let last = event
            .get("event")
            .and_then(|e| e.as_str())
            .is_some_and(|e| FINAL_EVENTS.contains(&e));
          emit(&app, &run_id, event);
          if last {
            return;
          }
        }
      }
      _ => return lost(&app),
    }
  }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunStarted {
  pub run_id: Option<String>,
  pub not_supported: bool,
}

/// Starts a run and follows its events in the background.
#[tauri::command]
pub async fn hermes_run_start(
  app: AppHandle,
  base_url: String,
  authorization_header: String,
  input: String,
  instructions: Option<String>,
  session_id: Option<String>,
) -> Result<RunStarted, String> {
  if !valid_base(&base_url) {
    return Err("That is not a Hermes address.".to_string());
  }
  let url = runs_url(&base_url, None, None);
  let auth = authorization(&authorization_header, &url)?;
  let mut body = serde_json::json!({ "input": input });
  if let Some(i) = instructions.filter(|i| !i.trim().is_empty()) {
    body["instructions"] = i.into();
  }
  if let Some(s) = session_id.filter(|s| !s.trim().is_empty()) {
    body["session_id"] = s.into();
  }
  let response = client()?
    .post(&url)
    .timeout(REQUEST_TIMEOUT)
    .header("Authorization", &auth)
    .json(&body)
    .send()
    .await
    .map_err(|e| format!("Hermes didn't answer: {e}"))?;
  let status = response.status();
  if status == reqwest::StatusCode::NOT_FOUND || status == reqwest::StatusCode::METHOD_NOT_ALLOWED {
    return Ok(RunStarted {
      run_id: None,
      not_supported: true,
    });
  }
  if !status.is_success() {
    return Err(format!(
      "Hermes refused the run (HTTP {}).",
      status.as_u16()
    ));
  }
  let value: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
  let run_id = value
    .get("run_id")
    .and_then(|r| r.as_str())
    .filter(|r| valid_run_id(r))
    .ok_or_else(|| "Hermes started no run.".to_string())?
    .to_string();
  let events_url = runs_url(&base_url, Some(&run_id), Some("events"));
  tauri::async_runtime::spawn(follow_events(app, events_url, auth, run_id.clone()));
  Ok(RunStarted {
    run_id: Some(run_id),
    not_supported: false,
  })
}

#[tauri::command]
pub async fn hermes_run_stop(
  base_url: String,
  authorization_header: String,
  run_id: String,
) -> Result<(), String> {
  if !valid_base(&base_url) || !valid_run_id(&run_id) {
    return Err("That is not a Hermes run.".to_string());
  }
  let url = runs_url(&base_url, Some(&run_id), Some("stop"));
  let auth = authorization(&authorization_header, &url)?;
  client()?
    .post(&url)
    .timeout(REQUEST_TIMEOUT)
    .header("Authorization", &auth)
    .json(&serde_json::json!({}))
    .send()
    .await
    .map_err(|e| format!("Hermes didn't answer: {e}"))?;
  Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnswerResult {
  pub ok: bool,
  /// Hermes no longer waits for this answer (its own time ran out).
  pub too_late: bool,
}

/// Answers Hermes's approval request: `once` or `deny`, nothing else.
#[tauri::command]
pub async fn hermes_run_answer(
  base_url: String,
  authorization_header: String,
  run_id: String,
  choice: String,
) -> Result<AnswerResult, String> {
  if !valid_choice(&choice) {
    return Err("Alphonso answers Hermes with once or deny only.".to_string());
  }
  if !valid_base(&base_url) || !valid_run_id(&run_id) {
    return Err("That is not a Hermes run.".to_string());
  }
  let url = runs_url(&base_url, Some(&run_id), Some("approval"));
  let auth = authorization(&authorization_header, &url)?;
  let response = client()?
    .post(&url)
    .timeout(REQUEST_TIMEOUT)
    .header("Authorization", &auth)
    .json(&serde_json::json!({ "choice": choice }))
    .send()
    .await
    .map_err(|e| format!("Hermes didn't answer: {e}"))?;
  let status = response.status();
  Ok(AnswerResult {
    ok: status.is_success(),
    too_late: status == reqwest::StatusCode::CONFLICT || status == reqwest::StatusCode::NOT_FOUND,
  })
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn parses_sse_events() {
    let (events, rest) = parse_sse(
      "event: x\ndata: {\"event\":\"tool.started\",\"tool\":\"web_search\"}\n\n: keepalive\n\n",
    );
    assert_eq!(events.len(), 1);
    assert_eq!(events[0]["event"], "tool.started");
    assert_eq!(events[0]["tool"], "web_search");
    assert_eq!(rest, "");
  }

  #[test]
  fn keeps_a_half_event_for_the_next_chunk() {
    let (events, rest) = parse_sse("data: {\"event\":\"run.started\"}\r\n\r\ndata: {\"ev");
    assert_eq!(events.len(), 1);
    assert_eq!(rest, "data: {\"ev");
    let (events, _) = parse_sse(&format!(
      "{rest}ent\":\"run.completed\",\"output\":\"Hi\"}}\n\n"
    ));
    assert_eq!(events[0]["output"], "Hi");
  }

  #[test]
  fn answer_choice_checked() {
    assert!(valid_choice("once"));
    assert!(valid_choice("deny"));
    for refused in ["session", "always", "ONCE", ""] {
      assert!(!valid_choice(refused), "{refused}");
    }
  }

  #[test]
  fn run_ids_and_addresses_checked() {
    assert!(valid_run_id("run_0a1b2c"));
    for bad in ["", "../stop", "run 1", "run/1", &"a".repeat(101)] {
      assert!(!valid_run_id(bad), "{bad}");
    }
    assert!(valid_base("http://127.0.0.1:8700"));
    assert!(valid_base("https://box.example"));
    assert!(!valid_base("file:///etc"));
    assert!(!valid_base("http://a b"));
    assert_eq!(
      runs_url("http://127.0.0.1:8700/", Some("run_1"), Some("events")),
      "http://127.0.0.1:8700/v1/runs/run_1/events"
    );
    assert_eq!(runs_url("http://h", None, None), "http://h/v1/runs");
  }
}
