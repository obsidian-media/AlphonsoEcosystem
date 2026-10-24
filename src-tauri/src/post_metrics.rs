//! A post's numbers from the platform (content factory phase 4a).
//!
//! YouTube: Analytics `reports` for the video (views, watch time, …); Analytics
//! lags about two days, so the Data API's instant counts are used while it has
//! no row yet. Instagram: media insights, on either route. Facebook: a Reel's
//! video insights, or a photo post's reach and its reactions, comments and
//! shares. The app's value keys stay fixed whatever the platforms call them.

use crate::meta_media::instagram_base;
use crate::meta_publish::{meta_graph_api_version, resolve_meta_credentials, MetaCredentials};
use crate::meta_video::auth_query;
use crate::youtube::{youtube_access_token, YouTubeOAuth};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
use std::time::Duration;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MetricsRequest {
  platform: String,
  piece: String,
  platform_id: String,
  #[serde(default)]
  instagram_route: Option<String>,
  /// When the post went out (YYYY-MM-DD), for YouTube's report.
  since_date: String,
  /// Today (YYYY-MM-DD), the end of YouTube's report.
  until_date: String,
  #[serde(default)]
  youtube_oauth: Option<YouTubeOAuth>,
  #[serde(default)]
  credentials: Option<MetaCredentials>,
}

#[derive(Serialize, Default, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MetricsResult {
  ok: bool,
  values: BTreeMap<String, f64>,
  unavailable: Vec<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  problem: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  reason: Option<String>,
}

#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub(crate) enum Problem {
  Permission,
  Removed,
  Temporary,
  Other,
}

impl Problem {
  fn as_str(self) -> &'static str {
    match self {
      Problem::Permission => "permission",
      Problem::Removed => "removed",
      Problem::Temporary => "temporary",
      Problem::Other => "other",
    }
  }
}

pub(crate) const YOUTUBE_KEYS: [&str; 7] = [
  "views",
  "watchMinutes",
  "averageViewSeconds",
  "likes",
  "comments",
  "shares",
  "subscribersGained",
];
pub(crate) const INSTAGRAM_KEYS: [&str; 6] =
  ["views", "reach", "likes", "comments", "saves", "shares"];
pub(crate) const FACEBOOK_KEYS: [&str; 5] = ["views", "reach", "reactions", "comments", "shares"];

/// Ids the platforms give: letters, digits, `_` and `-` only.
fn valid_id(id: &str) -> bool {
  !id.is_empty()
    && id.len() <= 128
    && id
      .chars()
      .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

fn valid_date(date: &str) -> bool {
  date.len() == 10
    && date.chars().enumerate().all(|(i, c)| {
      if i == 4 || i == 7 {
        c == '-'
      } else {
        c.is_ascii_digit()
      }
    })
}

/// YouTube Analytics' report for one video, from the day it went out to today.
pub(crate) fn youtube_report_url(video_id: &str, start: &str, end: &str) -> String {
  format!(
    "https://youtubeanalytics.googleapis.com/v2/reports?ids=channel%3D%3DMINE&startDate={start}&endDate={end}\
     &metrics=views,estimatedMinutesWatched,averageViewDuration,likes,comments,shares,subscribersGained\
     &filters=video%3D%3D{video_id}"
  )
}

/// The report's single row in the app's keys; empty when YouTube has no row yet.
pub(crate) fn parse_youtube_report(body: &Value) -> BTreeMap<String, f64> {
  let names: Vec<String> = body["columnHeaders"]
    .as_array()
    .map(|h| {
      h.iter()
        .filter_map(|c| c["name"].as_str().map(str::to_string))
        .collect()
    })
    .unwrap_or_default();
  let mut out = BTreeMap::new();
  let Some(row) = body["rows"]
    .as_array()
    .and_then(|rows| rows.first())
    .and_then(Value::as_array)
  else {
    return out;
  };
  for (name, value) in names.iter().zip(row) {
    let key = match name.as_str() {
      "views" => "views",
      "estimatedMinutesWatched" => "watchMinutes",
      "averageViewDuration" => "averageViewSeconds",
      "likes" => "likes",
      "comments" => "comments",
      "shares" => "shares",
      "subscribersGained" => "subscribersGained",
      _ => continue,
    };
    if let Some(n) = value.as_f64() {
      out.insert(key.to_string(), n);
    }
  }
  out
}

/// The Data API's instant counts (views, likes, comments).
pub(crate) fn parse_youtube_statistics(body: &Value) -> BTreeMap<String, f64> {
  let stats = &body["items"][0]["statistics"];
  let mut out = BTreeMap::new();
  for (from, to) in [
    ("viewCount", "views"),
    ("likeCount", "likes"),
    ("commentCount", "comments"),
  ] {
    if let Some(n) = stats[from].as_str().and_then(|s| s.parse::<f64>().ok()) {
      out.insert(to.to_string(), n);
    }
  }
  out
}

pub(crate) fn insights_url(base: &str, media_id: &str, metrics: &[&str]) -> String {
  format!("{base}/{media_id}/insights?metric={}", metrics.join(","))
}

/// Graph insights (`data[].name`, `values[0].value`) in the app's keys, plus the keys it lacked.
pub(crate) fn parse_insights(
  body: &Value,
  wanted: &[&str],
) -> (BTreeMap<String, f64>, Vec<String>) {
  let mut out = BTreeMap::new();
  for item in body["data"].as_array().into_iter().flatten() {
    let name = item["name"].as_str().unwrap_or("");
    let value = &item["values"][0]["value"];
    let key = match name {
      "views" | "blue_reels_play_count" => "views",
      "reach" | "post_impressions_unique" => "reach",
      "likes" => "likes",
      "comments" => "comments",
      "saved" => "saves",
      "shares" => "shares",
      "post_video_likes_by_reaction_type" => {
        let total: f64 = value
          .as_object()
          .map(|o| o.values().filter_map(Value::as_f64).sum())
          .unwrap_or(0.0);
        out.insert("reactions".to_string(), total);
        continue;
      }
      "post_video_social_actions" => {
        for (from, to) in [("COMMENT", "comments"), ("SHARE", "shares")] {
          if let Some(n) = value[from].as_f64() {
            out.insert(to.to_string(), n);
          }
        }
        continue;
      }
      _ => continue,
    };
    if let Some(n) = value.as_f64() {
      out.insert(key.to_string(), n);
    }
  }
  let missing = wanted
    .iter()
    .filter(|k| !out.contains_key(**k))
    .map(|k| k.to_string())
    .collect();
  (out, missing)
}

/// What a refused read means: permission, removed, temporary or other.
pub(crate) fn classify_read_error(status: u16, body: &Value) -> Problem {
  let code = body["error"]["code"].as_i64().unwrap_or(0);
  let message = body["error"]["message"]
    .as_str()
    .unwrap_or("")
    .to_lowercase();
  let reason = body["error"]["errors"][0]["reason"]
    .as_str()
    .unwrap_or("")
    .to_lowercase();
  if code == 10
    || code == 200
    || reason.contains("insufficientpermissions")
    || message.contains("insufficient")
    || message.contains("permission")
  {
    return Problem::Permission;
  }
  if status == 404 || (code == 100 && message.contains("does not exist")) {
    return Problem::Removed;
  }
  if status == 429 || status >= 500 || code == 4 || code == 17 || code == 32 || code == 613 {
    return Problem::Temporary;
  }
  if status == 401 || status == 403 {
    return Problem::Permission;
  }
  Problem::Other
}

fn refused(problem: Problem, reason: impl Into<String>) -> MetricsResult {
  MetricsResult {
    ok: false,
    problem: Some(problem.as_str().to_string()),
    reason: Some(reason.into()),
    ..Default::default()
  }
}

fn client() -> Result<reqwest::Client, String> {
  reqwest::Client::builder()
    .timeout(Duration::from_secs(30))
    .user_agent("Alphonso-Post-Metrics/0.1")
    .build()
    .map_err(|e| e.to_string())
}

async fn get_json(request: reqwest::RequestBuilder) -> Result<Value, (u16, Value)> {
  match request.send().await {
    Ok(response) => {
      let status = response.status().as_u16();
      let body: Value = response.json().await.unwrap_or(Value::Null);
      if (200..300).contains(&status) && body.get("error").is_none() {
        Ok(body)
      } else {
        Err((status, body))
      }
    }
    Err(_) => Err((503, Value::Null)),
  }
}

fn fill(values: BTreeMap<String, f64>, keys: &[&str], problem: Option<Problem>) -> MetricsResult {
  let unavailable = keys
    .iter()
    .filter(|k| !values.contains_key(**k))
    .map(|k| k.to_string())
    .collect();
  MetricsResult {
    ok: true,
    values,
    unavailable,
    problem: problem.map(|p| p.as_str().to_string()),
    reason: None,
  }
}

async fn read_youtube(request: &MetricsRequest) -> MetricsResult {
  let token = match youtube_access_token(request.youtube_oauth.clone().unwrap_or_default()).await {
    Ok(t) => t,
    Err(error) => return refused(Problem::Permission, error),
  };
  let Ok(http) = client() else {
    return refused(Problem::Other, "Could not start the request.");
  };
  let id = &request.platform_id;
  let stats = get_json(
    http
      .get(format!(
        "https://www.googleapis.com/youtube/v3/videos?part=statistics&id={id}"
      ))
      .bearer_auth(&token),
  )
  .await;
  let stats = match stats {
    Ok(body) if body["items"].as_array().is_some_and(|i| i.is_empty()) => {
      return refused(Problem::Removed, "removed from YouTube")
    }
    Ok(body) => parse_youtube_statistics(&body),
    Err((status, body)) => {
      return refused(
        classify_read_error(status, &body),
        "YouTube refused to give the numbers.",
      )
    }
  };
  match get_json(
    http
      .get(youtube_report_url(
        id,
        &request.since_date,
        &request.until_date,
      ))
      .bearer_auth(&token),
  )
  .await
  {
    Ok(body) => {
      let mut values = stats;
      values.extend(parse_youtube_report(&body));
      fill(values, &YOUTUBE_KEYS, None)
    }
    Err((status, body)) => fill(
      stats,
      &YOUTUBE_KEYS,
      Some(classify_read_error(status, &body)),
    ),
  }
}

async fn read_meta(request: &MetricsRequest) -> MetricsResult {
  let keys = resolve_meta_credentials(request.credentials.clone());
  let Ok(http) = client() else {
    return refused(Problem::Other, "Could not start the request.");
  };
  let version = meta_graph_api_version();
  let id = &request.platform_id;
  if request.platform == "instagram" {
    let route = request
      .instagram_route
      .clone()
      .unwrap_or_else(|| "page".to_string());
    let (token, secret) = if route == "instagram_login" {
      (keys.ig_login_token.clone(), String::new())
    } else {
      (keys.access_token.clone(), keys.app_secret.clone())
    };
    if token.trim().is_empty() {
      return refused(Problem::Permission, "Instagram isn't signed in.");
    }
    let wanted: Vec<&str> = if request.piece == "carousel" {
      vec!["reach", "likes", "comments", "saved", "shares"]
    } else {
      vec!["views", "reach", "likes", "comments", "saved", "shares"]
    };
    let url = insights_url(&instagram_base(&route, &version), id, &wanted);
    return match get_json(http.get(url).query(&auth_query(&token, &secret))).await {
      Ok(body) => {
        let (values, _) = parse_insights(&body, &INSTAGRAM_KEYS);
        fill(values, &INSTAGRAM_KEYS, None)
      }
      Err((status, body)) => refused(
        classify_read_error(status, &body),
        "Instagram refused to give the numbers.",
      ),
    };
  }
  // Facebook: a Reel's video insights, or a photo post's reach and its counts.
  let base = format!("https://graph.facebook.com/{version}");
  let auth = auth_query(&keys.page_token, &keys.app_secret);
  if keys.page_token.trim().is_empty() {
    return refused(Problem::Permission, "Facebook isn't signed in.");
  }
  if request.piece == "carousel" {
    let insights = get_json(
      http
        .get(insights_url(&base, id, &["post_impressions_unique"]))
        .query(&auth),
    )
    .await;
    let counts = get_json(
      http
        .get(format!("{base}/{id}?fields=shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)"))
        .query(&auth),
    )
    .await;
    let mut values = BTreeMap::new();
    match counts {
      Ok(body) => {
        for (field, key) in [("reactions", "reactions"), ("comments", "comments")] {
          if let Some(n) = body[field]["summary"]["total_count"].as_f64() {
            values.insert(key.to_string(), n);
          }
        }
        values.insert(
          "shares".to_string(),
          body["shares"]["count"].as_f64().unwrap_or(0.0),
        );
      }
      Err((status, body)) => {
        return refused(
          classify_read_error(status, &body),
          "Facebook refused to give the numbers.",
        )
      }
    }
    if let Ok(body) = insights {
      values.extend(parse_insights(&body, &FACEBOOK_KEYS).0);
    }
    return fill(values, &FACEBOOK_KEYS, None);
  }
  let metrics = [
    "blue_reels_play_count",
    "post_impressions_unique",
    "post_video_likes_by_reaction_type",
    "post_video_social_actions",
  ];
  let url = format!(
    "{base}/{id}/video_insights?metric={}&period=lifetime",
    metrics.join(",")
  );
  match get_json(http.get(url).query(&auth)).await {
    Ok(body) => fill(
      parse_insights(&body, &FACEBOOK_KEYS).0,
      &FACEBOOK_KEYS,
      None,
    ),
    Err((status, body)) => refused(
      classify_read_error(status, &body),
      "Facebook refused to give the numbers.",
    ),
  }
}

/// Reads one post's numbers now.
#[tauri::command]
pub(crate) async fn content_read_metrics(request: MetricsRequest) -> Result<MetricsResult, String> {
  if !valid_id(&request.platform_id) {
    return Ok(refused(
      Problem::Other,
      "That is not a post id from the platform.",
    ));
  }
  if !valid_date(&request.since_date) || !valid_date(&request.until_date) {
    return Ok(refused(Problem::Other, "The post's date is not a date."));
  }
  Ok(match request.platform.as_str() {
    "youtube" => read_youtube(&request).await,
    "instagram" | "facebook" => read_meta(&request).await,
    _ => refused(
      Problem::Other,
      "Numbers are read from YouTube, Instagram and Facebook only.",
    ),
  })
}

#[cfg(test)]
mod tests {
  use super::*;
  use serde_json::json;

  #[test]
  fn a_youtube_report_is_read_into_the_apps_keys() {
    let body = json!({
      "columnHeaders": [{"name":"views"},{"name":"estimatedMinutesWatched"},{"name":"averageViewDuration"},{"name":"likes"},{"name":"comments"},{"name":"shares"},{"name":"subscribersGained"}],
      "rows": [[1200, 340.5, 48, 90, 12, 7, 3]]
    });
    let v = parse_youtube_report(&body);
    assert_eq!(v["views"], 1200.0);
    assert_eq!(v["watchMinutes"], 340.5);
    assert_eq!(v["averageViewSeconds"], 48.0);
    assert_eq!(v["subscribersGained"], 3.0);
    assert!(parse_youtube_report(&json!({"columnHeaders": [], "rows": []})).is_empty());
  }

  #[test]
  fn youtube_statistics_give_the_instant_counts() {
    let v = parse_youtube_statistics(
      &json!({"items":[{"statistics":{"viewCount":"50","likeCount":"4","commentCount":"1"}}]}),
    );
    assert_eq!((v["views"], v["likes"], v["comments"]), (50.0, 4.0, 1.0));
  }

  #[test]
  fn the_youtube_report_is_for_that_video_on_my_channel() {
    let url = youtube_report_url("abc_123", "2026-10-01", "2026-10-08");
    assert!(url.contains("ids=channel%3D%3DMINE"));
    assert!(url.contains("filters=video%3D%3Dabc_123"));
    assert!(url.contains("startDate=2026-10-01&endDate=2026-10-08"));
  }

  #[test]
  fn instagram_insights_missing_a_metric_say_so() {
    let body = json!({"data":[{"name":"views","values":[{"value":900}]},{"name":"reach","values":[{"value":700}]},{"name":"saved","values":[{"value":5}]}]});
    let (v, missing) = parse_insights(&body, &INSTAGRAM_KEYS);
    assert_eq!((v["views"], v["reach"], v["saves"]), (900.0, 700.0, 5.0));
    assert_eq!(missing, vec!["likes", "comments", "shares"]);
  }

  #[test]
  fn facebook_reel_insights_are_summed_into_the_apps_keys() {
    let body = json!({"data":[
      {"name":"blue_reels_play_count","values":[{"value":3000}]},
      {"name":"post_impressions_unique","values":[{"value":2100}]},
      {"name":"post_video_likes_by_reaction_type","values":[{"value":{"REACTION_LIKE":40,"REACTION_LOVE":5}}]},
      {"name":"post_video_social_actions","values":[{"value":{"COMMENT":6,"SHARE":9}}]}
    ]});
    let (v, missing) = parse_insights(&body, &FACEBOOK_KEYS);
    assert_eq!(
      (
        v["views"],
        v["reach"],
        v["reactions"],
        v["comments"],
        v["shares"]
      ),
      (3000.0, 2100.0, 45.0, 6.0, 9.0)
    );
    assert!(missing.is_empty());
  }

  #[test]
  fn read_errors_are_classified() {
    assert_eq!(
      classify_read_error(
        403,
        &json!({"error":{"code":403,"errors":[{"reason":"insufficientPermissions"}]}})
      ),
      Problem::Permission
    );
    assert_eq!(
      classify_read_error(
        400,
        &json!({"error":{"code":10,"message":"Application does not have permission"}})
      ),
      Problem::Permission
    );
    assert_eq!(
      classify_read_error(400, &json!({"error":{"code":200}})),
      Problem::Permission
    );
    assert_eq!(classify_read_error(404, &Value::Null), Problem::Removed);
    assert_eq!(
      classify_read_error(
        400,
        &json!({"error":{"code":100,"message":"Object with ID '1' does not exist"}})
      ),
      Problem::Removed
    );
    assert_eq!(classify_read_error(429, &Value::Null), Problem::Temporary);
    assert_eq!(
      classify_read_error(400, &json!({"error":{"code":4}})),
      Problem::Temporary
    );
    assert_eq!(
      classify_read_error(400, &json!({"error":{"code":1}})),
      Problem::Other
    );
  }

  #[tokio::test]
  async fn a_bad_id_or_date_is_refused_before_sending() {
    let request = |id: &str, date: &str| MetricsRequest {
      platform: "instagram".into(),
      piece: "reel".into(),
      platform_id: id.into(),
      instagram_route: None,
      since_date: date.into(),
      until_date: "2026-10-08".into(),
      youtube_oauth: None,
      credentials: None,
    };
    for id in ["a/b", "x?y=1", "", "../me"] {
      let r = content_read_metrics(request(id, "2026-10-01"))
        .await
        .unwrap();
      assert_eq!(r.problem.as_deref(), Some("other"));
    }
    let r = content_read_metrics(request("123", "next week"))
      .await
      .unwrap();
    assert_eq!(r.problem.as_deref(), Some("other"));
  }
}
