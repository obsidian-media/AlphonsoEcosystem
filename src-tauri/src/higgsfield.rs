//! Higgsfield (content factory phase 4b): pictures and clips from a model id the user
//! pasted, with Higgsfield's own cost estimate first. One path for every use: upload the
//! input picture through Higgsfield's own upload (the presigned PUT never gets the API
//! keys), estimate, submit, poll, download the result into the project at once (Higgsfield
//! keeps it 7 days), then delete the request's data on Higgsfield. Keys never reach an error.

use crate::media_tools::checked_file;
use crate::utils::secret_or_env;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::Path;
use std::time::Duration;

const BASE: &str = "https://api.higgsfield.ai";
const WAIT_SECONDS: u64 = 900;
const MAX_BYTES: u64 = 500 * 1024 * 1024;

#[derive(Deserialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HiggsfieldKeys {
  #[serde(default)]
  key_id: Option<String>,
  #[serde(default)]
  key_secret: Option<String>,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HiggsfieldJob {
  model: String,
  prompt: String,
  /// A picture in the workspace to start from (uploaded to Higgsfield first).
  #[serde(default)]
  image_path: Option<String>,
  #[serde(default)]
  seconds: Option<f64>,
  #[serde(default)]
  aspect: Option<String>,
  /// The user's "Extra settings (JSON)" for this model id.
  #[serde(default)]
  extra: Option<Value>,
}

pub(crate) const EXTRA_REFUSED: &str =
  "Extra settings must be a JSON object and can't replace the prompt or picture.";

/// A model id from the Console: letters, digits, `.`, `_`, `-` and `/`, no `..`.
pub(crate) fn valid_model(model: &str) -> bool {
  let m = model.trim();
  !m.is_empty()
    && m.len() <= 120
    && !m.starts_with('/')
    && !m.contains("..")
    && m
      .chars()
      .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-' | '/'))
}

/// The common fields, with the user's extra settings merged over them.
pub(crate) fn request_body(job: &HiggsfieldJob, image_url: Option<&str>) -> Result<Value, String> {
  let mut body = serde_json::json!({ "prompt": job.prompt.chars().take(2000).collect::<String>() });
  if let Some(url) = image_url {
    body["image_url"] = Value::String(url.to_string());
  }
  if let Some(seconds) = job.seconds.filter(|s| s.is_finite() && *s > 0.0) {
    body["duration"] = serde_json::json!(seconds.round() as i64);
  }
  if let Some(aspect) = job
    .aspect
    .as_deref()
    .filter(|a| ["16:9", "9:16", "1:1", "4:5"].contains(a))
  {
    body["aspect_ratio"] = Value::String(aspect.to_string());
  }
  match &job.extra {
    None | Some(Value::Null) => {}
    Some(Value::Object(extra)) => {
      if extra.contains_key("prompt") || extra.contains_key("image_url") {
        return Err(EXTRA_REFUSED.to_string());
      }
      for (k, v) in extra {
        body[k] = v.clone();
      }
    }
    Some(_) => return Err(EXTRA_REFUSED.to_string()),
  }
  Ok(body)
}

/// Higgsfield's estimate in US dollars, from whichever amount field it answers with.
pub(crate) fn parse_estimate(body: &Value) -> Option<f64> {
  for key in [
    "usd",
    "cost_usd",
    "estimated_cost",
    "estimate",
    "cost",
    "price",
    "amount",
  ] {
    let v = &body[key];
    if let Some(n) = v.as_f64().or_else(|| {
      v.as_str()
        .and_then(|s| s.trim().trim_start_matches('$').parse::<f64>().ok())
    }) {
      if n.is_finite() && n >= 0.0 {
        return Some(n);
      }
    }
    if let Some(n) = v["usd"].as_f64().or_else(|| v["amount"].as_f64()) {
      return Some(n);
    }
  }
  None
}

/// What a status answer means.
#[derive(Debug, PartialEq)]
pub(crate) enum Outcome {
  Running,
  Done(String),
  Failed(String),
}

pub(crate) fn outcome_of(body: &Value) -> Outcome {
  match body["status"].as_str().unwrap_or("") {
    "completed" => {
      let url = body["video"]["url"]
        .as_str()
        .or_else(|| body["images"][0]["url"].as_str())
        .or_else(|| body["audio"]["url"].as_str())
        .or_else(|| body["audios"][0]["url"].as_str());
      match url {
        Some(u) if u.starts_with("https://") => Outcome::Done(u.to_string()),
        _ => Outcome::Failed("Higgsfield finished but sent no file.".to_string()),
      }
    }
    "failed" => Outcome::Failed("Higgsfield could not make it (not charged).".to_string()),
    "nsfw" => {
      Outcome::Failed("Higgsfield refused it as not safe for work (not charged).".to_string())
    }
    "canceled" => Outcome::Failed("The Higgsfield request was cancelled.".to_string()),
    _ => Outcome::Running,
  }
}

/// A plain reason from a refusal; never the keys.
pub(crate) fn api_error(status: u16, body: &Value) -> String {
  let detail = body["detail"]
    .as_str()
    .or_else(|| body["message"].as_str())
    .or_else(|| body["error"]["message"].as_str())
    .or_else(|| body["error"].as_str())
    .unwrap_or("");
  match status {
    401 | 403 => {
      "Higgsfield refused the keys: check them in Settings → Connectors → Higgsfield.".to_string()
    }
    402 => "The Higgsfield account has too little balance for this.".to_string(),
    404 => "Higgsfield doesn't know that model id; check it in Settings → Connectors → Higgsfield."
      .to_string(),
    429 => "Higgsfield says too many requests for now; try again shortly.".to_string(),
    _ if !detail.is_empty() => format!(
      "Higgsfield: {}",
      detail.chars().take(240).collect::<String>()
    ),
    _ => format!("Higgsfield answered {status}."),
  }
}

/// The headers the presigned upload asks for; the API keys are never among them.
pub(crate) fn upload_headers(answer: &Value) -> Vec<(String, String)> {
  answer["upload_headers"]
    .as_object()
    .into_iter()
    .flatten()
    .filter(|(k, _)| !k.eq_ignore_ascii_case("authorization"))
    .filter_map(|(k, v)| Some((k.clone(), v.as_str()?.to_string())))
    .collect()
}

fn auth(keys: &HiggsfieldKeys) -> Result<String, String> {
  let id = secret_or_env(keys.key_id.clone(), "HIGGSFIELD_KEY_ID");
  let secret = secret_or_env(keys.key_secret.clone(), "HIGGSFIELD_KEY_SECRET");
  if id.trim().is_empty() || secret.trim().is_empty() {
    return Err(
      "Add your Higgsfield key id and secret in Settings → Connectors → Higgsfield.".to_string(),
    );
  }
  Ok(format!("Key {}:{}", id.trim(), secret.trim()))
}

fn client() -> Result<reqwest::Client, String> {
  reqwest::Client::builder()
    .timeout(Duration::from_secs(120))
    .user_agent("Alphonso-Higgsfield/0.1")
    .build()
    .map_err(|e| e.to_string())
}

async fn send_json(request: reqwest::RequestBuilder) -> Result<Value, String> {
  let response = request
    .send()
    .await
    .map_err(|_| "Higgsfield could not be reached.".to_string())?;
  let status = response.status().as_u16();
  let body: Value = response.json().await.unwrap_or(Value::Null);
  if (200..300).contains(&status) {
    Ok(body)
  } else {
    Err(api_error(status, &body))
  }
}

fn content_type(path: &str) -> Option<&'static str> {
  let ext = Path::new(path).extension()?.to_str()?.to_ascii_lowercase();
  Some(match ext.as_str() {
    "png" => "image/png",
    "jpg" | "jpeg" => "image/jpeg",
    "webp" => "image/webp",
    "mp4" => "video/mp4",
    "wav" => "audio/wav",
    _ => return None,
  })
}

/// Uploads a workspace file through Higgsfield's own presigned upload; returns its public URL.
async fn upload(
  http: &reqwest::Client,
  authz: &str,
  workspace_root: &str,
  rel: &str,
) -> Result<String, String> {
  let file = checked_file(
    workspace_root,
    rel,
    &["png", "jpg", "jpeg", "webp", "mp4", "wav"],
  )?;
  let kind =
    content_type(rel).ok_or_else(|| "That file type can't go to Higgsfield.".to_string())?;
  let answer = send_json(
    http
      .post(format!("{BASE}/files/generate-upload-url"))
      .header("Authorization", authz)
      .json(&serde_json::json!({ "content_type": kind })),
  )
  .await?;
  let upload_url = answer["upload_url"]
    .as_str()
    .ok_or("Higgsfield gave no upload address.")?
    .to_string();
  let public_url = answer["public_url"]
    .as_str()
    .ok_or("Higgsfield gave no public address.")?
    .to_string();
  let bytes = std::fs::read(&file).map_err(|_| "The picture could not be read.".to_string())?;
  let mut put = http.put(upload_url).body(bytes);
  for (k, v) in upload_headers(&answer) {
    put = put.header(k, v);
  }
  let status = put
    .send()
    .await
    .map_err(|_| "The upload to Higgsfield failed.".to_string())?
    .status();
  if !status.is_success() {
    return Err(format!(
      "The upload to Higgsfield failed ({}).",
      status.as_u16()
    ));
  }
  Ok(public_url)
}

async fn body_for(
  http: &reqwest::Client,
  authz: &str,
  workspace_root: &str,
  job: &HiggsfieldJob,
) -> Result<Value, String> {
  if !valid_model(&job.model) {
    return Err("That is not a Higgsfield model id.".to_string());
  }
  let image_url = match &job.image_path {
    Some(rel) => Some(upload(http, authz, workspace_root, rel).await?),
    None => None,
  };
  request_body(job, image_url.as_deref())
}

fn random_key() -> String {
  (0..16)
    .map(|_| format!("{:02x}", rand::random::<u8>()))
    .collect()
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RunResult {
  ok: bool,
  status: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  path: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  request_id: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  reason: Option<String>,
}

fn failed(reason: impl Into<String>) -> RunResult {
  RunResult {
    ok: false,
    status: "failed".into(),
    reason: Some(reason.into()),
    ..Default::default()
  }
}

/// The result address and every redirect are checked as research fetches are (phase 4c):
/// never this computer or a private network.
async fn guarded_download(url: &str) -> Result<reqwest::Response, String> {
  const PRIVATE: &str =
    "Higgsfield's result address is on a private network; nothing was downloaded.";
  let parsed = reqwest::Url::parse(url)
    .map_err(|_| "Higgsfield sent an address that can't be used.".to_string())?;
  if let Some(host) = parsed.host_str() {
    if crate::search::is_private_host(host).await {
      return Err(PRIVATE.to_string());
    }
  }
  let http = reqwest::Client::builder()
    .timeout(Duration::from_secs(600))
    .redirect(reqwest::redirect::Policy::none())
    .user_agent("Alphonso-Higgsfield/0.1")
    .build()
    .map_err(|_| "Could not start the download.".to_string())?;
  crate::search::fetch_with_ssrf_guard(&http, parsed)
    .await
    .map_err(|e| {
      if e.contains("SSRF") {
        PRIVATE.to_string()
      } else {
        "The result could not be downloaded from Higgsfield.".to_string()
      }
    })
}

/// Downloads the result to `out_rel` (never over an existing file), then deletes it on Higgsfield.
async fn fetch_result(
  base: &str,
  http: &reqwest::Client,
  authz: &str,
  workspace_root: &str,
  out_rel: &str,
  url: &str,
  request_id: &str,
) -> RunResult {
  fetch_result_with(
    true,
    base,
    http,
    authz,
    workspace_root,
    out_rel,
    url,
    request_id,
  )
  .await
}

/// `guard`: the result address must not be on this computer or a private network (tests turn it off).
#[allow(clippy::too_many_arguments)]
async fn fetch_result_with(
  guard: bool,
  base: &str,
  http: &reqwest::Client,
  authz: &str,
  workspace_root: &str,
  out_rel: &str,
  url: &str,
  request_id: &str,
) -> RunResult {
  let out = match checked_file(
    workspace_root,
    out_rel,
    &["png", "jpg", "jpeg", "webp", "mp4"],
  ) {
    Ok(p) => p,
    Err(r) => return failed(r),
  };
  if out.exists() {
    return failed("That file already exists; nothing was overwritten.");
  }
  if let Some(dir) = out.parent() {
    let _ = std::fs::create_dir_all(dir);
  }
  let response = if guard {
    match guarded_download(url).await {
      Ok(r) => r,
      Err(reason) => return failed(reason),
    }
  } else {
    match http.get(url).timeout(Duration::from_secs(600)).send().await {
      Ok(r) => r,
      Err(_) => return failed("The result could not be downloaded from Higgsfield."),
    }
  };
  if response.content_length().unwrap_or(0) > MAX_BYTES {
    return failed("The result is too large.");
  }
  let bytes = match response.bytes().await {
    Ok(b) => b,
    Err(_) => return failed("The result could not be downloaded from Higgsfield."),
  };
  let part = out.with_extension("part");
  if std::fs::write(&part, &bytes).is_err() || std::fs::rename(&part, &out).is_err() {
    let _ = std::fs::remove_file(&part);
    return failed("The result could not be saved.");
  }
  // Kept here now, so Higgsfield's copy goes.
  let _ = http
    .delete(format!("{base}/requests/{request_id}"))
    .header("Authorization", authz)
    .send()
    .await;
  RunResult {
    ok: true,
    status: "done".into(),
    path: Some(out_rel.to_string()),
    request_id: Some(request_id.to_string()),
    reason: None,
  }
}

async fn wait_for(
  http: &reqwest::Client,
  authz: &str,
  status_url: &str,
  seconds: u64,
) -> Result<Outcome, String> {
  let started = std::time::Instant::now();
  loop {
    let body = send_json(http.get(status_url).header("Authorization", authz)).await?;
    match outcome_of(&body) {
      Outcome::Running if started.elapsed().as_secs() < seconds => {
        tokio::time::sleep(Duration::from_secs(5)).await
      }
      other => return Ok(other),
    }
  }
}

/// Higgsfield's cost for this job, before anything is made.
#[tauri::command]
pub(crate) async fn higgsfield_estimate(job: HiggsfieldJob, keys: Option<HiggsfieldKeys>) -> Value {
  let fail = |r: String| serde_json::json!({ "ok": false, "reason": r });
  let authz = match auth(&keys.unwrap_or_default()) {
    Ok(a) => a,
    Err(r) => return fail(r),
  };
  let Ok(http) = client() else {
    return fail("Could not start the request.".into());
  };
  if !valid_model(&job.model) {
    return fail("That is not a Higgsfield model id.".into());
  }
  // Nothing is uploaded for an estimate: the picture's content doesn't change the price.
  let body = match request_body(&job, None) {
    Ok(b) => b,
    Err(r) => return fail(r),
  };
  match send_json(
    http
      .post(format!("{BASE}/estimate/{}", job.model.trim()))
      .header("Authorization", &authz)
      .json(&body),
  )
  .await
  {
    Ok(answer) => match parse_estimate(&answer) {
      Some(usd) => serde_json::json!({ "ok": true, "usd": usd }),
      None => fail("Higgsfield gave no estimate for this model.".into()),
    },
    Err(r) => fail(r),
  }
}

/// Makes one picture or clip: submit, wait up to 15 minutes, download, delete on Higgsfield.
#[tauri::command]
pub(crate) async fn higgsfield_run(
  job: HiggsfieldJob,
  workspace_root: String,
  out_path: String,
  keys: Option<HiggsfieldKeys>,
) -> RunResult {
  let authz = match auth(&keys.unwrap_or_default()) {
    Ok(a) => a,
    Err(r) => return failed(r),
  };
  if checked_file(
    &workspace_root,
    &out_path,
    &["png", "jpg", "jpeg", "webp", "mp4"],
  )
  .map(|p| p.exists())
  .unwrap_or(true)
  {
    return failed(
      "That file already exists, or its folder isn't in the workspace; nothing was sent.",
    );
  }
  let Ok(http) = client() else {
    return failed("Could not start the request.");
  };
  let body = match body_for(&http, &authz, &workspace_root, &job).await {
    Ok(b) => b,
    Err(r) => return failed(r),
  };
  let submitted = match send_json(
    http
      .post(format!("{BASE}/{}", job.model.trim()))
      .header("Authorization", &authz)
      .header("Idempotency-Key", random_key())
      .json(&body),
  )
  .await
  {
    Ok(a) => a,
    Err(r) => return failed(r),
  };
  let Some(request_id) = submitted["request_id"].as_str().map(str::to_string) else {
    return failed("Higgsfield gave no request id.");
  };
  let status_url = submitted["status_url"]
    .as_str()
    .map(str::to_string)
    .unwrap_or_else(|| format!("{BASE}/requests/{request_id}/status"));
  match wait_for(&http, &authz, &status_url, WAIT_SECONDS).await {
    Ok(Outcome::Done(url)) => {
      fetch_result(
        BASE,
        &http,
        &authz,
        &workspace_root,
        &out_path,
        &url,
        &request_id,
      )
      .await
    }
    Ok(Outcome::Failed(reason)) => RunResult {
      request_id: Some(request_id),
      ..failed(reason)
    },
    Ok(Outcome::Running) => RunResult {
      ok: true,
      status: "pending".into(),
      request_id: Some(request_id),
      ..Default::default()
    },
    Err(reason) => RunResult {
      ok: true,
      status: "pending".into(),
      request_id: Some(request_id),
      reason: Some(reason),
      ..Default::default()
    },
  }
}

/// Fetches a request that was still running (`pending`), without submitting anything again.
#[tauri::command]
pub(crate) async fn higgsfield_check(
  request_id: String,
  workspace_root: String,
  out_path: String,
  keys: Option<HiggsfieldKeys>,
) -> RunResult {
  let authz = match auth(&keys.unwrap_or_default()) {
    Ok(a) => a,
    Err(r) => return failed(r),
  };
  if !request_id
    .chars()
    .all(|c| c.is_ascii_alphanumeric() || c == '-')
    || request_id.is_empty()
  {
    return failed("That is not a Higgsfield request id.");
  }
  let Ok(http) = client() else {
    return failed("Could not start the request.");
  };
  check_at(BASE, &http, &authz, request_id, &workspace_root, &out_path).await
}

/// One look at a request that was still running; fetched when it has finished.
async fn check_at(
  base: &str,
  http: &reqwest::Client,
  authz: &str,
  request_id: String,
  workspace_root: &str,
  out_path: &str,
) -> RunResult {
  match wait_for(
    http,
    authz,
    &format!("{base}/requests/{request_id}/status"),
    0,
  )
  .await
  {
    Ok(Outcome::Done(url)) => {
      fetch_result(
        base,
        http,
        authz,
        workspace_root,
        out_path,
        &url,
        &request_id,
      )
      .await
    }
    Ok(Outcome::Failed(reason)) => RunResult {
      request_id: Some(request_id),
      ..failed(reason)
    },
    Ok(Outcome::Running) | Err(_) => RunResult {
      ok: true,
      status: "pending".into(),
      request_id: Some(request_id),
      ..Default::default()
    },
  }
}

/// Settings' Test: the estimate for a model id with its common and extra fields.
#[tauri::command]
pub(crate) async fn higgsfield_test(
  model: String,
  extra: Option<Value>,
  keys: Option<HiggsfieldKeys>,
) -> Value {
  let job = HiggsfieldJob {
    model,
    prompt: "A test of this model".into(),
    image_path: None,
    seconds: None,
    aspect: None,
    extra,
  };
  higgsfield_estimate(job, keys).await
}

// ---- Characters (content factory phase 4c) ----
// Higgsfield's character training endpoint is not in its public docs; the model id is pasted
// in Settings like the others, and the fields below were chosen from third-party descriptions
// (a name and the pictures' addresses in; an id and a training status out). Confirm live.

pub(crate) const TRAINING_EXTRA_REFUSED: &str =
  "Extra settings must be a JSON object and can't replace the name or pictures.";

/// The training request: the character's name and its pictures' addresses, with the user's extras.
pub(crate) fn training_body(
  name: &str,
  image_urls: &[String],
  extra: Option<&Value>,
) -> Result<Value, String> {
  let mut body = serde_json::json!({ "name": name.chars().take(80).collect::<String>(), "image_urls": image_urls });
  match extra {
    None | Some(Value::Null) => {}
    Some(Value::Object(map)) => {
      if map.contains_key("name") || map.contains_key("image_urls") || map.contains_key("prompt") {
        return Err(TRAINING_EXTRA_REFUSED.to_string());
      }
      for (k, v) in map {
        body[k] = v.clone();
      }
    }
    Some(_) => return Err(TRAINING_EXTRA_REFUSED.to_string()),
  }
  Ok(body)
}

/// What a training answer says: ready with the character's id, failed, or still training.
#[derive(Debug, PartialEq)]
pub(crate) enum Training {
  Ready(String),
  Failed(String),
  InProgress,
}

pub(crate) fn training_of(body: &Value) -> Training {
  let id = [
    "soul_id",
    "character_id",
    "reference_id",
    "custom_reference_id",
  ]
  .iter()
  .find_map(|k| body[*k].as_str().map(str::to_string))
  .or_else(|| body["result"]["id"].as_str().map(str::to_string));
  match body["status"].as_str().unwrap_or("") {
    "completed" | "ready" => match id {
      Some(id) if !id.is_empty() => Training::Ready(id),
      _ => Training::Failed("Higgsfield finished training but sent no character id.".to_string()),
    },
    "failed" => {
      Training::Failed("Higgsfield could not train this character (not charged).".to_string())
    }
    "nsfw" => Training::Failed(
      "Higgsfield refused these pictures as not safe for work (not charged).".to_string(),
    ),
    "canceled" => Training::Failed("The training was cancelled.".to_string()),
    _ => Training::InProgress,
  }
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TrainRequest {
  model: String,
  name: String,
  image_paths: Vec<String>,
  #[serde(default)]
  extra: Option<Value>,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TrainResult {
  ok: bool,
  status: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  character_id: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  request_id: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  reason: Option<String>,
}

fn train_failed(reason: impl Into<String>) -> TrainResult {
  TrainResult {
    ok: false,
    status: "failed".into(),
    reason: Some(reason.into()),
    ..Default::default()
  }
}

fn train_outcome(answer: &Value, request_id: Option<String>) -> TrainResult {
  match training_of(answer) {
    Training::Ready(id) => TrainResult {
      ok: true,
      status: "ready".into(),
      character_id: Some(id),
      request_id,
      reason: None,
    },
    Training::Failed(r) => TrainResult {
      request_id,
      ..train_failed(r)
    },
    Training::InProgress => TrainResult {
      ok: true,
      status: "training".into(),
      request_id,
      ..Default::default()
    },
  }
}

/// Higgsfield's cost for training, before anything is sent (the pictures aren't uploaded).
#[tauri::command]
pub(crate) async fn higgsfield_estimate_training(
  request: TrainRequest,
  keys: Option<HiggsfieldKeys>,
) -> Value {
  let fail = |r: String| serde_json::json!({ "ok": false, "reason": r });
  let authz = match auth(&keys.unwrap_or_default()) {
    Ok(a) => a,
    Err(r) => return fail(r),
  };
  if !valid_model(&request.model) {
    return fail("That is not a Higgsfield model id.".into());
  }
  let body = match training_body(&request.name, &[], request.extra.as_ref()) {
    Ok(b) => b,
    Err(r) => return fail(r),
  };
  let Ok(http) = client() else {
    return fail("Could not start the request.".into());
  };
  match send_json(
    http
      .post(format!("{BASE}/estimate/{}", request.model.trim()))
      .header("Authorization", &authz)
      .json(&body),
  )
  .await
  {
    Ok(answer) => match parse_estimate(&answer) {
      Some(usd) => serde_json::json!({ "ok": true, "usd": usd }),
      None => fail("Higgsfield gave no estimate for training.".into()),
    },
    Err(r) => fail(r),
  }
}

/// Uploads the character's pictures through Higgsfield's own upload and starts the training.
#[tauri::command]
pub(crate) async fn higgsfield_train_character(
  request: TrainRequest,
  workspace_root: String,
  keys: Option<HiggsfieldKeys>,
) -> TrainResult {
  let authz = match auth(&keys.unwrap_or_default()) {
    Ok(a) => a,
    Err(r) => return train_failed(r),
  };
  if !valid_model(&request.model) {
    return train_failed("That is not a Higgsfield model id.");
  }
  if request.image_paths.is_empty() {
    return train_failed("The character has no pictures.");
  }
  // Checked before anything is uploaded.
  if let Err(r) = training_body(&request.name, &[], request.extra.as_ref()) {
    return train_failed(r);
  }
  let Ok(http) = client() else {
    return train_failed("Could not start the request.");
  };
  let mut urls = Vec::new();
  for rel in &request.image_paths {
    match upload(&http, &authz, &workspace_root, rel).await {
      Ok(url) => urls.push(url),
      Err(r) => return train_failed(r),
    }
  }
  let body = match training_body(&request.name, &urls, request.extra.as_ref()) {
    Ok(b) => b,
    Err(r) => return train_failed(r),
  };
  match send_json(
    http
      .post(format!("{BASE}/{}", request.model.trim()))
      .header("Authorization", &authz)
      .header("Idempotency-Key", random_key())
      .json(&body),
  )
  .await
  {
    Ok(answer) => {
      let request_id = answer["request_id"].as_str().map(str::to_string);
      train_outcome(&answer, request_id)
    }
    Err(r) => train_failed(r),
  }
}

/// One look at a training still running; never starts it again.
#[tauri::command]
pub(crate) async fn higgsfield_character_status(
  request_id: String,
  keys: Option<HiggsfieldKeys>,
) -> TrainResult {
  let authz = match auth(&keys.unwrap_or_default()) {
    Ok(a) => a,
    Err(r) => return train_failed(r),
  };
  if request_id.is_empty()
    || !request_id
      .chars()
      .all(|c| c.is_ascii_alphanumeric() || c == '-')
  {
    return train_failed("That is not a Higgsfield request id.");
  }
  let Ok(http) = client() else {
    return train_failed("Could not start the request.");
  };
  match send_json(
    http
      .get(format!("{BASE}/requests/{request_id}/status"))
      .header("Authorization", &authz),
  )
  .await
  {
    Ok(answer) => train_outcome(&answer, Some(request_id)),
    Err(_) => TrainResult {
      ok: true,
      status: "training".into(),
      request_id: Some(request_id),
      ..Default::default()
    },
  }
}

/// Asks Higgsfield to delete a request's data (the character's training) when a character is deleted.
#[tauri::command]
pub(crate) async fn higgsfield_delete_request(
  request_id: String,
  keys: Option<HiggsfieldKeys>,
) -> Value {
  let Ok(authz) = auth(&keys.unwrap_or_default()) else {
    return serde_json::json!({ "ok": false });
  };
  if request_id.is_empty()
    || !request_id
      .chars()
      .all(|c| c.is_ascii_alphanumeric() || c == '-')
  {
    return serde_json::json!({ "ok": false });
  }
  let Ok(http) = client() else {
    return serde_json::json!({ "ok": false });
  };
  let ok = http
    .delete(format!("{BASE}/requests/{request_id}"))
    .header("Authorization", &authz)
    .send()
    .await
    .map(|r| r.status().is_success())
    .unwrap_or(false);
  serde_json::json!({ "ok": ok })
}

#[cfg(test)]
mod tests {
  use super::*;
  use serde_json::json;

  fn job(extra: Option<Value>) -> HiggsfieldJob {
    HiggsfieldJob {
      model: "higgsfield-ai/soul/v2/standard".into(),
      prompt: "A pour".into(),
      image_path: None,
      seconds: Some(5.2),
      aspect: Some("9:16".into()),
      extra,
    }
  }

  #[test]
  fn the_request_merges_the_extra_settings() {
    let body = request_body(
      &job(Some(json!({ "quality": "high", "duration": 10 }))),
      Some("https://cdn.example/x.png"),
    )
    .unwrap();
    assert_eq!(
      body,
      json!({ "prompt": "A pour", "image_url": "https://cdn.example/x.png", "duration": 10, "aspect_ratio": "9:16", "quality": "high" })
    );
  }

  #[test]
  fn extra_settings_that_are_not_an_object_or_set_the_prompt_are_refused() {
    for extra in [
      json!([1, 2]),
      json!("text"),
      json!({ "prompt": "other" }),
      json!({ "image_url": "https://x" }),
    ] {
      assert_eq!(
        request_body(&job(Some(extra)), None).unwrap_err(),
        EXTRA_REFUSED
      );
    }
    assert!(request_body(&job(Some(Value::Null)), None).is_ok());
  }

  #[test]
  fn model_ids_are_checked() {
    assert!(valid_model("kling-video/v2.1/pro/image-to-video"));
    assert!(!valid_model("../files"));
    assert!(!valid_model("/requests/x"));
    assert!(!valid_model("a?b=c"));
    assert!(!valid_model(""));
  }

  #[test]
  fn the_upload_sends_only_the_returned_headers_never_the_keys() {
    let answer = json!({ "upload_headers": { "Content-Type": "image/png", "x-amz-tagging": "t=1", "Authorization": "Key leaked:secret" } });
    let mut headers = upload_headers(&answer);
    headers.sort();
    assert_eq!(
      headers,
      vec![
        ("Content-Type".to_string(), "image/png".to_string()),
        ("x-amz-tagging".to_string(), "t=1".to_string())
      ]
    );
  }

  #[test]
  fn a_status_says_done_failed_or_running() {
    assert_eq!(
      outcome_of(&json!({ "status": "completed", "images": [{ "url": "https://cdn/x.png" }] })),
      Outcome::Done("https://cdn/x.png".into())
    );
    assert_eq!(
      outcome_of(&json!({ "status": "completed", "video": { "url": "https://cdn/x.mp4" } })),
      Outcome::Done("https://cdn/x.mp4".into())
    );
    assert!(matches!(
      outcome_of(&json!({ "status": "completed", "video": { "url": "http://insecure" } })),
      Outcome::Failed(_)
    ));
    assert!(
      matches!(outcome_of(&json!({ "status": "nsfw" })), Outcome::Failed(r) if r.contains("not charged"))
    );
    assert_eq!(
      outcome_of(&json!({ "status": "in_progress" })),
      Outcome::Running
    );
    assert_eq!(outcome_of(&json!({ "status": "queued" })), Outcome::Running);
  }

  #[test]
  fn the_estimate_is_read_from_its_amount() {
    assert_eq!(parse_estimate(&json!({ "usd": 0.84 })), Some(0.84));
    assert_eq!(parse_estimate(&json!({ "cost": "$1.20" })), Some(1.2));
    assert_eq!(
      parse_estimate(&json!({ "estimate": { "usd": 0.3 } })),
      Some(0.3)
    );
    assert_eq!(parse_estimate(&json!({ "nothing": 1 })), None);
  }

  #[test]
  fn errors_never_carry_the_keys() {
    let secret = "very-secret-value";
    let body = json!({ "detail": format!("bad key Key id:{secret}") });
    assert!(!api_error(401, &body).contains(secret));
    assert!(!api_error(403, &body).contains(secret));
    assert_eq!(
      api_error(404, &json!({})),
      "Higgsfield doesn't know that model id; check it in Settings → Connectors → Higgsfield."
    );
  }

  /// A local server answering each request in turn with the given responses; records the request lines.
  async fn serve(responses: Vec<Vec<u8>>) -> (u16, std::sync::Arc<std::sync::Mutex<Vec<String>>>) {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let seen = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
    let log = seen.clone();
    tokio::spawn(async move {
      for response in responses {
        let (mut socket, _) = listener.accept().await.unwrap();
        let mut buf = vec![0u8; 8192];
        let n = socket.read(&mut buf).await.unwrap_or(0);
        let head = String::from_utf8_lossy(&buf[..n])
          .lines()
          .next()
          .unwrap_or("")
          .to_string();
        log.lock().unwrap().push(head);
        let _ = socket.write_all(&response).await;
        let _ = socket.shutdown().await;
      }
    });
    (port, seen)
  }

  fn http_ok(body: &[u8], kind: &str) -> Vec<u8> {
    let mut r = format!(
      "HTTP/1.1 200 OK\r\nContent-Type: {kind}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
      body.len()
    )
    .into_bytes();
    r.extend_from_slice(body);
    r
  }

  fn workspace(name: &str) -> String {
    let dir = std::env::temp_dir().join(format!("alphonso-hf-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    dir.to_string_lossy().to_string()
  }

  #[tokio::test]
  async fn a_result_is_downloaded_and_never_written_over() {
    let root = workspace("download");
    let (port, seen) = serve(vec![
      http_ok(b"PNGDATA", "image/png"),
      http_ok(b"{}", "application/json"),
    ])
    .await;
    let base = format!("http://127.0.0.1:{port}");
    let http = client().unwrap();
    let done = fetch_result_with(
      false,
      &base,
      &http,
      "Key a:b",
      &root,
      "b/p/scenes/v1-s1.png",
      &format!("{base}/out.png"),
      "req-1",
    )
    .await;
    assert!(done.ok && done.status == "done", "{:?}", done.reason);
    assert_eq!(
      std::fs::read(std::path::Path::new(&root).join("b/p/scenes/v1-s1.png")).unwrap(),
      b"PNGDATA"
    );
    // Higgsfield's copy is deleted once it is kept here.
    assert_eq!(
      seen.lock().unwrap().clone(),
      vec![
        "GET /out.png HTTP/1.1".to_string(),
        "DELETE /requests/req-1 HTTP/1.1".to_string()
      ]
    );
    // A second result for the same file is refused, and the first stays.
    let again = fetch_result_with(
      false,
      &base,
      &http,
      "Key a:b",
      &root,
      "b/p/scenes/v1-s1.png",
      &format!("{base}/out.png"),
      "req-2",
    )
    .await;
    assert!(!again.ok && again.reason.unwrap().contains("already exists"));
    assert_eq!(
      std::fs::read(std::path::Path::new(&root).join("b/p/scenes/v1-s1.png")).unwrap(),
      b"PNGDATA"
    );
  }

  #[tokio::test]
  async fn a_pending_request_is_fetched_later_by_its_id() {
    let root = workspace("pending");
    let (port, seen) = serve(vec![
      http_ok(
        br#"{"status":"in_progress","request_id":"req-9"}"#,
        "application/json",
      ),
      http_ok(
        br#"{"status":"nsfw","request_id":"req-9"}"#,
        "application/json",
      ),
    ])
    .await;
    let base = format!("http://127.0.0.1:{port}");
    let http = client().unwrap();
    let still = check_at(
      &base,
      &http,
      "Key a:b",
      "req-9".into(),
      &root,
      "b/p/clips/v1-s1.mp4",
    )
    .await;
    assert_eq!(
      (still.ok, still.status.as_str(), still.request_id.as_deref()),
      (true, "pending", Some("req-9"))
    );
    let later = check_at(
      &base,
      &http,
      "Key a:b",
      "req-9".into(),
      &root,
      "b/p/clips/v1-s1.mp4",
    )
    .await;
    assert!(!later.ok && later.reason.unwrap().contains("not charged"));
    // Only the status was asked for: nothing was submitted again.
    assert_eq!(
      seen.lock().unwrap().clone(),
      vec!["GET /requests/req-9/status HTTP/1.1".to_string(); 2]
    );
  }

  #[tokio::test]
  async fn a_result_on_a_private_address_is_refused() {
    let root = workspace("private");
    let (port, seen) = serve(vec![http_ok(b"PNGDATA", "image/png")]).await;
    let base = format!("http://127.0.0.1:{port}");
    let http = client().unwrap();
    let out = fetch_result(
      &base,
      &http,
      "Key a:b",
      &root,
      "b/p/scenes/v1-s1.png",
      &format!("{base}/out.png"),
      "req-1",
    )
    .await;
    assert!(!out.ok, "a private address must be refused");
    assert!(out.reason.unwrap().contains("private"));
    assert!(!std::path::Path::new(&root)
      .join("b/p/scenes/v1-s1.png")
      .exists());
    assert!(
      seen.lock().unwrap().is_empty(),
      "nothing is fetched from a private address"
    );
  }

  #[test]
  fn the_training_request_has_the_name_and_pictures_and_merges_extras() {
    let body = training_body(
      "Ana",
      &["https://cdn/a.png".to_string()],
      Some(&json!({ "quality": "high" })),
    )
    .unwrap();
    assert_eq!(
      body,
      json!({ "name": "Ana", "image_urls": ["https://cdn/a.png"], "quality": "high" })
    );
    for extra in [
      json!({ "name": "x" }),
      json!({ "image_urls": [] }),
      json!({ "prompt": "x" }),
      json!([1]),
    ] {
      assert_eq!(
        training_body("Ana", &[], Some(&extra)).unwrap_err(),
        TRAINING_EXTRA_REFUSED
      );
    }
  }

  #[test]
  fn a_training_answer_reads_as_ready_failed_or_training() {
    assert_eq!(
      training_of(&json!({ "status": "completed", "soul_id": "s-1" })),
      Training::Ready("s-1".into())
    );
    assert_eq!(
      training_of(&json!({ "status": "ready", "id": "x", "character_id": "c-2" })),
      Training::Ready("c-2".into())
    );
    assert!(matches!(
      training_of(&json!({ "status": "completed" })),
      Training::Failed(_)
    ));
    assert!(
      matches!(training_of(&json!({ "status": "failed" })), Training::Failed(r) if r.contains("not charged"))
    );
    assert_eq!(
      training_of(&json!({ "status": "in_progress" })),
      Training::InProgress
    );
    assert_eq!(
      training_of(&json!({ "status": "queued", "request_id": "r" })),
      Training::InProgress
    );
  }
}
