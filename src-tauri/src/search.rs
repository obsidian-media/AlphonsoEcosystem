use crate::{now_ms, unix_now_iso};
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ResearchSourceInput {
  pub(crate) url: String,
  pub(crate) source_type: Option<String>,
  pub(crate) official: Option<bool>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ResearchSourceProof {
  pub(crate) url: String,
  pub(crate) source_type: String,
  pub(crate) official: bool,
  pub(crate) fetched_at_ms: u64,
  pub(crate) http_status: Option<u16>,
  pub(crate) ok: bool,
  pub(crate) title: Option<String>,
  pub(crate) snippet: Option<String>,
  pub(crate) date_checked: String,
  pub(crate) confidence: String,
  pub(crate) risk_level: String,
  pub(crate) verification_state: String,
  pub(crate) error: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ResearchSearchInput {
  pub(crate) query: String,
  pub(crate) source_type: Option<String>,
  pub(crate) limit: Option<u8>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ResearchSearchResult {
  pub(crate) url: String,
  pub(crate) title: String,
  pub(crate) snippet: Option<String>,
  pub(crate) source_type: String,
  pub(crate) provider: String,
  pub(crate) date_checked: String,
  pub(crate) confidence: String,
  pub(crate) risk_level: String,
  pub(crate) verification_state: String,
}

fn clean_ws(input: &str) -> String {
  input.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn is_private_ip(host: &str) -> bool {
  let host = host.trim().to_ascii_lowercase();
  if host.is_empty() {
    return false;
  }
  if host == "localhost" || host == "127.0.0.1" || host == "::1" || host == "0.0.0.0" {
    return true;
  }
  if let Ok(ip) = host.parse::<std::net::IpAddr>() {
    match ip {
      std::net::IpAddr::V4(v4) => {
        let octets = v4.octets();
        if octets[0] == 10 {
          return true;
        }
        if octets[0] == 172 && octets[1] >= 16 && octets[1] <= 31 {
          return true;
        }
        if octets[0] == 192 && octets[1] == 168 {
          return true;
        }
        if octets[0] == 169 && octets[1] == 254 {
          return true;
        }
        if octets[0] == 100 && (octets[1] & 0xc0) == 0x40 {
          return true;
        }
        if octets[0] == 198 && (octets[1] & 0xfe) == 0x12 {
          return true;
        }
      }
      std::net::IpAddr::V6(v6) => {
        if v6.is_loopback() || v6.is_multicast() {
          return true;
        }
        let segments = v6.segments();
        if segments[0] == 0xfc00 || segments[0] == 0xfd00 {
          return true;
        }
        if segments[0] == 0xfe80 {
          return true;
        }
      }
    }
  }
  false
}

fn extract_title(html: &str) -> Option<String> {
  let lower = html.to_ascii_lowercase();
  let start = lower.find("<title")?;
  let start_close = lower[start..].find('>')? + start + 1;
  let end = lower[start_close..].find("</title>")? + start_close;
  let title = clean_ws(&html[start_close..end]);
  if title.is_empty() {
    None
  } else {
    Some(title.chars().take(180).collect())
  }
}

pub(crate) fn strip_html_tags(input: &str) -> String {
  let mut output = String::new();
  let mut in_tag = false;
  for ch in input.chars() {
    match ch {
      '<' => {
        in_tag = true;
        output.push(' ');
      }
      '>' => {
        in_tag = false;
        output.push(' ');
      }
      _ if !in_tag => output.push(ch),
      _ => {}
    }
  }
  clean_ws(&output)
}

pub(crate) fn decode_html_entities(input: &str) -> String {
  input
    .replace("&amp;", "&")
    .replace("&lt;", "<")
    .replace("&gt;", ">")
    .replace("&quot;", "\"")
    .replace("&#39;", "'")
    .replace("&#x2F;", "/")
    .replace("&nbsp;", " ")
}

fn extract_attr(tag_html: &str, attr_name: &str) -> Option<String> {
  let needle = format!("{attr_name}=");
  let start = tag_html.find(&needle)? + needle.len();
  let rest = &tag_html[start..];
  let quote = rest.chars().next()?;
  if quote != '"' && quote != '\'' {
    return None;
  }
  let value_start = start + quote.len_utf8();
  let value_rest = &tag_html[value_start..];
  let value_end = value_rest.find(quote)?;
  Some(tag_html[value_start..value_start + value_end].to_string())
}

fn decode_ddg_result_url(raw_href: &str) -> Option<String> {
  let clean = decode_html_entities(raw_href.trim());
  if let Ok(parsed) = reqwest::Url::parse(&clean) {
    if parsed.scheme() == "http" || parsed.scheme() == "https" {
      if let Some(uddg) = parsed
        .query_pairs()
        .find(|(key, _)| key == "uddg")
        .map(|(_, value)| value.to_string())
      {
        if let Ok(decoded) = reqwest::Url::parse(&uddg) {
          if decoded.scheme() == "http" || decoded.scheme() == "https" {
            return Some(decoded.to_string());
          }
        }
      }
      return Some(parsed.to_string());
    }
  }

  let prefixed = if clean.starts_with("//") {
    format!("https:{clean}")
  } else if clean.starts_with('/') {
    format!("https://duckduckgo.com{clean}")
  } else {
    clean
  };

  if let Ok(parsed) = reqwest::Url::parse(&prefixed) {
    if let Some(uddg) = parsed
      .query_pairs()
      .find(|(key, _)| key == "uddg")
      .map(|(_, value)| value.to_string())
    {
      if let Ok(decoded) = reqwest::Url::parse(&uddg) {
        if decoded.scheme() == "http" || decoded.scheme() == "https" {
          return Some(decoded.to_string());
        }
      }
    }
    if parsed.scheme() == "http" || parsed.scheme() == "https" {
      return Some(parsed.to_string());
    }
  }
  None
}

pub(crate) fn parse_ddg_results(
  html: &str,
  source_type: &str,
  limit: usize,
) -> Vec<ResearchSearchResult> {
  let mut results: Vec<ResearchSearchResult> = vec![];
  let mut cursor = 0usize;
  let max_results = limit.clamp(1, 12);
  let lower = html.to_ascii_lowercase();

  while cursor < lower.len() && results.len() < max_results {
    let Some(anchor_rel) = lower[cursor..].find("result__a") else {
      break;
    };
    let anchor_hint = cursor + anchor_rel;
    let Some(tag_start_rel) = lower[..anchor_hint].rfind("<a") else {
      cursor = anchor_hint + "result__a".len();
      continue;
    };
    let Some(tag_end_rel) = lower[anchor_hint..].find("</a>") else {
      break;
    };
    let tag_end = anchor_hint + tag_end_rel + "</a>".len();
    let anchor_html = &html[tag_start_rel..tag_end];

    let href_raw = match extract_attr(anchor_html, "href") {
      Some(href) => href,
      None => {
        cursor = tag_end;
        continue;
      }
    };
    let Some(url) = decode_ddg_result_url(&href_raw) else {
      cursor = tag_end;
      continue;
    };

    if results.iter().any(|item| item.url == url) {
      cursor = tag_end;
      continue;
    }

    let title_raw = strip_html_tags(anchor_html);
    let title = decode_html_entities(&title_raw);

    let search_window_end = (tag_end + 3000).min(html.len());
    let window_lower = &lower[tag_end..search_window_end];
    let snippet = window_lower
      .find("result__snippet")
      .and_then(|snippet_rel| {
        let snippet_hint = tag_end + snippet_rel;
        let snippet_start = lower[..snippet_hint].rfind('<')?;
        let snippet_tail = &lower[snippet_hint..search_window_end];
        let close_rel = snippet_tail
          .find("</a>")
          .or_else(|| snippet_tail.find("</div>"))?;
        let snippet_end = snippet_hint + close_rel + 4;
        let snippet_html = &html[snippet_start..snippet_end];
        let plain = decode_html_entities(&strip_html_tags(snippet_html));
        if plain.is_empty() {
          None
        } else {
          Some(plain.chars().take(320).collect::<String>())
        }
      });

    results.push(ResearchSearchResult {
      url,
      title: if title.is_empty() {
        "Untitled result".to_string()
      } else {
        title.chars().take(180).collect()
      },
      snippet,
      source_type: source_type.to_string(),
      provider: "duckduckgo_html".to_string(),
      date_checked: unix_now_iso(),
      confidence: "inferred".to_string(),
      risk_level: "medium".to_string(),
      verification_state: "inferred".to_string(),
    });
    cursor = tag_end;
  }

  results
}

#[tauri::command]
pub(crate) async fn fetch_research_sources(
  sources: Vec<ResearchSourceInput>,
) -> Vec<ResearchSourceProof> {
  let client = match reqwest::Client::builder()
    .timeout(std::time::Duration::from_secs(12))
    .redirect(reqwest::redirect::Policy::limited(5))
    .user_agent("Alphonso-Hector/0.1 local-first research verifier")
    .build()
  {
    Ok(client) => client,
    Err(error) => {
      return vec![ResearchSourceProof {
        url: String::new(),
        source_type: "unknown".to_string(),
        official: false,
        fetched_at_ms: now_ms(),
        http_status: None,
        ok: false,
        title: None,
        snippet: None,
        date_checked: unix_now_iso(),
        confidence: "failed".to_string(),
        risk_level: "medium".to_string(),
        verification_state: "failed".to_string(),
        error: Some(error.to_string()),
      }];
    }
  };

  let mut proofs = Vec::new();
  for source in sources.into_iter().take(10) {
    let fetched_at_ms = now_ms();
    let source_type = source
      .source_type
      .unwrap_or_else(|| "public_web".to_string());
    let official = source.official.unwrap_or(false);
    let risk_level = if official { "low" } else { "medium" }.to_string();
    let parsed = reqwest::Url::parse(source.url.trim());
    if parsed
      .as_ref()
      .map(|url| url.scheme() != "http" && url.scheme() != "https")
      .unwrap_or(true)
    {
      proofs.push(ResearchSourceProof {
        url: source.url,
        source_type,
        official,
        fetched_at_ms,
        http_status: None,
        ok: false,
        title: None,
        snippet: None,
        date_checked: unix_now_iso(),
        confidence: "failed".to_string(),
        risk_level,
        verification_state: "failed".to_string(),
        error: Some("Only http and https URLs are supported.".to_string()),
      });
      continue;
    }

    // Safety: the `continue` block above already handles every Err and non-http/https case.
    // If we reach this line, parsed is guaranteed Ok with a valid http(s) URL.
    let url = match parsed {
      Ok(u) => u,
      Err(_) => continue, // defensive fallback; should be unreachable due to guard above
    };
    if let Some(host) = url.host_str() {
      if is_private_ip(host) {
        proofs.push(ResearchSourceProof {
          url: url.to_string(),
          source_type,
          official,
          fetched_at_ms,
          http_status: None,
          ok: false,
          title: None,
          snippet: None,
          date_checked: unix_now_iso(),
          confidence: "failed".to_string(),
          risk_level: "high".to_string(),
          verification_state: "blocked".to_string(),
          error: Some("SSRF blocked: private/internal IP address.".to_string()),
        });
        continue;
      }
    }
    match client.get(url.clone()).send().await {
      Ok(response) => {
        let status = response.status();
        match response.bytes().await {
          Ok(bytes) => {
            let max_len = bytes.len().min(200_000);
            let body = String::from_utf8_lossy(&bytes[..max_len]).to_string();
            let title = extract_title(&body);
            let text = strip_html_tags(&body);
            let snippet = if text.is_empty() {
              None
            } else {
              Some(text.chars().take(420).collect::<String>())
            };
            proofs.push(ResearchSourceProof {
              url: url.to_string(),
              source_type,
              official,
              fetched_at_ms,
              http_status: Some(status.as_u16()),
              ok: status.is_success(),
              title,
              snippet,
              date_checked: unix_now_iso(),
              confidence: if status.is_success() {
                "verified".to_string()
              } else {
                "failed".to_string()
              },
              risk_level,
              verification_state: if status.is_success() {
                "verified".to_string()
              } else {
                "failed".to_string()
              },
              error: if status.is_success() {
                None
              } else {
                Some(format!("HTTP status {}", status.as_u16()))
              },
            });
          }
          Err(error) => proofs.push(ResearchSourceProof {
            url: url.to_string(),
            source_type,
            official,
            fetched_at_ms,
            http_status: Some(status.as_u16()),
            ok: false,
            title: None,
            snippet: None,
            date_checked: unix_now_iso(),
            confidence: "failed".to_string(),
            risk_level,
            verification_state: "failed".to_string(),
            error: Some(error.to_string()),
          }),
        }
      }
      Err(error) => proofs.push(ResearchSourceProof {
        url: url.to_string(),
        source_type,
        official,
        fetched_at_ms,
        http_status: None,
        ok: false,
        title: None,
        snippet: None,
        date_checked: unix_now_iso(),
        confidence: "failed".to_string(),
        risk_level,
        verification_state: "failed".to_string(),
        error: Some(error.to_string()),
      }),
    }
  }

  proofs
}

#[tauri::command]
pub(crate) async fn search_research_sources(
  request: ResearchSearchInput,
) -> Result<Vec<ResearchSearchResult>, String> {
  let query = request.query.trim().to_string();
  if query.is_empty() {
    return Ok(vec![]);
  }
  let source_type = request
    .source_type
    .unwrap_or_else(|| "official_docs".to_string());
  let limit = request.limit.unwrap_or(6).clamp(1, 12) as usize;

  let client = reqwest::Client::builder()
    .timeout(std::time::Duration::from_secs(14))
    .redirect(reqwest::redirect::Policy::limited(5))
    .user_agent("Alphonso-Hector/0.1 local-first research discovery")
    .build()
    .map_err(|error| error.to_string())?;

  let response = client
    .get("https://html.duckduckgo.com/html/")
    .query(&[("q", query.as_str()), ("kl", "us-en"), ("kp", "-1")])
    .header("Accept", "text/html,application/xhtml+xml")
    .header("Referer", "https://html.duckduckgo.com/")
    .send()
    .await
    .map_err(|error| format!("DuckDuckGo HTML request failed: {error}"))?;

  let status = response.status();
  if !status.is_success() {
    return Err(format!(
      "DuckDuckGo HTML request returned HTTP {}",
      status.as_u16()
    ));
  }

  let html = response.text().await.map_err(|error| error.to_string())?;
  Ok(parse_ddg_results(&html, &source_type, limit))
}

#[tauri::command]
pub(crate) async fn search_brave_sources(
  query: String,
  limit: Option<u8>,
  source_type: Option<String>,
) -> Result<Vec<ResearchSearchResult>, String> {
  let query = query.trim().to_string();
  if query.is_empty() {
    return Ok(vec![]);
  }
  let api_key = std::env::var("BRAVE_SEARCH_API_KEY")
    .map_err(|_| "BRAVE_SEARCH_API_KEY not set".to_string())?;
  let api_key = api_key.trim().to_string();
  if api_key.is_empty() {
    return Err("BRAVE_SEARCH_API_KEY is empty".to_string());
  }
  let count = limit.unwrap_or(8).clamp(1, 20);
  let src_type = source_type.unwrap_or_else(|| "official_docs".to_string());

  let client = reqwest::Client::builder()
    .timeout(std::time::Duration::from_secs(14))
    .user_agent("Alphonso-Hector/0.1 local-first research discovery")
    .build()
    .map_err(|e| e.to_string())?;

  let response = client
    .get("https://api.search.brave.com/res/v1/web/search")
    .query(&[
      ("q", query.as_str()),
      ("count", &count.to_string()),
      ("country", "us"),
      ("search_lang", "en"),
      ("safesearch", "moderate"),
    ])
    .header("Accept", "application/json")
    .header("Accept-Encoding", "gzip")
    .header("X-Subscription-Token", api_key.as_str())
    .send()
    .await
    .map_err(|e| format!("Brave Search request failed: {e}"))?;

  let status = response.status();
  if !status.is_success() {
    return Err(format!("Brave Search returned HTTP {}", status.as_u16()));
  }

  let body: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
  let raw_results = body
    .get("web")
    .and_then(|w| w.get("results"))
    .and_then(|r| r.as_array())
    .cloned()
    .unwrap_or_default();

  let results = raw_results
    .iter()
    .filter_map(|item| {
      let url = item
        .get("url")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
      if url.is_empty() {
        return None;
      }
      let title = item
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("Untitled")
        .chars()
        .take(180)
        .collect::<String>();
      let snippet = item
        .get("description")
        .and_then(|v| v.as_str())
        .map(|s| s.chars().take(320).collect::<String>());
      Some(ResearchSearchResult {
        url,
        title,
        snippet,
        source_type: src_type.clone(),
        provider: "brave_search".to_string(),
        date_checked: unix_now_iso(),
        confidence: "inferred".to_string(),
        risk_level: "medium".to_string(),
        verification_state: "inferred".to_string(),
      })
    })
    .take(count as usize)
    .collect();

  Ok(results)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn private_ip_blocks_localhost() {
    assert!(is_private_ip("localhost"));
    assert!(is_private_ip("127.0.0.1"));
    assert!(is_private_ip("::1"));
  }

  #[test]
  fn private_ip_blocks_rfc1918() {
    assert!(is_private_ip("10.0.0.1"));
    assert!(is_private_ip("10.255.255.255"));
    assert!(is_private_ip("172.16.0.1"));
    assert!(is_private_ip("172.31.255.255"));
    assert!(is_private_ip("192.168.1.1"));
    assert!(is_private_ip("192.168.0.1"));
  }

  #[test]
  fn private_ip_blocks_link_local() {
    assert!(is_private_ip("169.254.1.1"));
    assert!(is_private_ip("0.0.0.0"));
  }

  #[test]
  fn private_ip_allows_public() {
    assert!(!is_private_ip("8.8.8.8"));
    assert!(!is_private_ip("1.1.1.1"));
    assert!(!is_private_ip("203.0.113.1"));
    assert!(!is_private_ip("example.com"));
  }

  #[test]
  fn private_ip_empty_not_private() {
    assert!(!is_private_ip(""));
    assert!(!is_private_ip("  "));
  }

  #[test]
  fn private_ip_case_insensitive() {
    assert!(is_private_ip("Localhost"));
    assert!(is_private_ip("LOCALHOST"));
  }

  #[test]
  fn strip_html_removes_tags() {
    assert_eq!(strip_html_tags("<p>Hello <b>world</b></p>"), "Hello world");
  }

  #[test]
  fn decode_html_entities_basic() {
    assert_eq!(decode_html_entities("& < >"), "& < >");
  }
}
