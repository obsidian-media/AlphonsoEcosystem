//! Google Web Risk lookup (agent phase 4, owner 2026-10-25: "optional, with your key").
//! Only the link addresses are sent. Google's Safe Browsing API is for non-commercial use
//! only and points commercial users to Web Risk (checked 2026-10-26), so this uses Web Risk's
//! Lookup API: one address per request, `{}` when it isn't listed. Answers are kept for
//! 30 minutes. An error never carries the key.

use crate::utils::secret_or_env;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

const LOOKUP_URL: &str = "https://webrisk.googleapis.com/v1/uris:search";
const THREAT_TYPES: [&str; 3] = ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE"];
const MAX_ADDRESSES: usize = 25;
const CACHE_FOR: Duration = Duration::from_secs(30 * 60);

/// Each address checked, when, and what it was listed as.
type LookupCache = HashMap<String, (Instant, Vec<String>)>;
static CACHE: Mutex<Option<LookupCache>> = Mutex::new(None);

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WebRiskMatch {
  url: String,
  threats: Vec<String>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WebRiskResult {
  ok: bool,
  setup_required: bool,
  matches: Vec<WebRiskMatch>,
  reason: Option<String>,
}

#[derive(Deserialize)]
struct LookupBody {
  threat: Option<LookupThreat>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LookupThreat {
  threat_types: Option<Vec<String>>,
}

/// The lookup address for one link, with the threat types and the key as query parameters.
pub(crate) fn lookup_url(address: &str, key: &str) -> Result<reqwest::Url, String> {
  let mut params: Vec<(&str, &str)> = THREAT_TYPES.iter().map(|t| ("threatTypes", *t)).collect();
  params.push(("uri", address));
  params.push(("key", key));
  reqwest::Url::parse_with_params(LOOKUP_URL, &params).map_err(|e| e.to_string())
}

/// The threat types in a lookup answer; empty when the address isn't listed.
pub(crate) fn threats_of(body: &str) -> Result<Vec<String>, String> {
  let parsed: LookupBody =
    serde_json::from_str(body).map_err(|_| "Web Risk's answer couldn't be read.".to_string())?;
  Ok(
    parsed
      .threat
      .and_then(|t| t.threat_types)
      .unwrap_or_default(),
  )
}

/// An error message with the key taken out (the key is a query parameter).
pub(crate) fn without_key(message: &str, key: &str) -> String {
  if key.is_empty() {
    return message.to_string();
  }
  message.replace(key, "[hidden]")
}

fn cached(address: &str) -> Option<Vec<String>> {
  let guard = CACHE.lock().ok()?;
  let (at, threats) = guard.as_ref()?.get(address)?;
  (at.elapsed() < CACHE_FOR).then(|| threats.clone())
}

fn remember(address: &str, threats: &[String]) {
  if let Ok(mut guard) = CACHE.lock() {
    guard
      .get_or_insert_with(HashMap::new)
      .insert(address.to_string(), (Instant::now(), threats.to_vec()));
  }
}

#[tauri::command]
pub(crate) async fn web_risk_check(
  urls: Vec<String>,
  api_key: Option<String>,
) -> Result<WebRiskResult, String> {
  let key = secret_or_env(api_key, "WEB_RISK_API_KEY");
  if key.is_empty() {
    return Ok(WebRiskResult {
      ok: false,
      setup_required: true,
      matches: vec![],
      reason: Some(
        "Add a Google Web Risk key in Settings → Connectors → Search & Research.".to_string(),
      ),
    });
  }
  let client = reqwest::Client::builder()
    .timeout(Duration::from_secs(8))
    .redirect(reqwest::redirect::Policy::none())
    .build()
    .map_err(|e| e.to_string())?;
  let mut matches = Vec::new();
  for address in urls.into_iter().take(MAX_ADDRESSES) {
    let threats = if let Some(hit) = cached(&address) {
      hit
    } else {
      let url = lookup_url(&address, &key)?;
      let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| without_key(&e.without_url().to_string(), &key))?;
      let status = response.status();
      let body = response
        .text()
        .await
        .map_err(|e| without_key(&e.without_url().to_string(), &key))?;
      if !status.is_success() {
        return Ok(WebRiskResult {
          ok: false,
          setup_required: status.as_u16() == 400 || status.as_u16() == 403,
          matches,
          reason: Some(format!(
            "Web Risk refused the check (HTTP {}).",
            status.as_u16()
          )),
        });
      }
      let found = threats_of(&body)?;
      remember(&address, &found);
      found
    };
    if !threats.is_empty() {
      matches.push(WebRiskMatch {
        url: address,
        threats,
      });
    }
  }
  Ok(WebRiskResult {
    ok: true,
    setup_required: false,
    matches,
    reason: None,
  })
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn the_lookup_asks_for_each_threat_type_and_encodes_the_address() {
    let url = lookup_url("http://paypa1-secure-login.com/verify?a=1&b=2", "KEY123").unwrap();
    let query = url.query().unwrap();
    assert!(query.contains("threatTypes=MALWARE"));
    assert!(query.contains("threatTypes=SOCIAL_ENGINEERING"));
    assert!(query.contains("threatTypes=UNWANTED_SOFTWARE"));
    assert!(query.contains("uri=http%3A%2F%2Fpaypa1-secure-login.com%2Fverify%3Fa%3D1%26b%3D2"));
    assert!(url
      .as_str()
      .starts_with("https://webrisk.googleapis.com/v1/uris:search?"));
  }

  #[test]
  fn an_empty_answer_means_not_listed() {
    assert_eq!(threats_of("{}").unwrap(), Vec::<String>::new());
  }

  #[test]
  fn a_listed_address_gives_its_threats() {
    let body =
      r#"{"threat":{"threatTypes":["SOCIAL_ENGINEERING"],"expireTime":"2026-10-26T10:00:00Z"}}"#;
    assert_eq!(
      threats_of(body).unwrap(),
      vec!["SOCIAL_ENGINEERING".to_string()]
    );
  }

  #[test]
  fn the_key_never_appears_in_an_error() {
    let message =
      "error sending request for url (https://webrisk.googleapis.com/v1/uris:search?key=SECRET42)";
    assert!(!without_key(message, "SECRET42").contains("SECRET42"));
  }

  #[tokio::test]
  async fn without_a_key_it_says_what_to_set_up() {
    std::env::remove_var("WEB_RISK_API_KEY");
    let result = web_risk_check(vec!["https://example.org".to_string()], None)
      .await
      .unwrap();
    assert!(result.setup_required);
    assert!(result.matches.is_empty());
  }
}
