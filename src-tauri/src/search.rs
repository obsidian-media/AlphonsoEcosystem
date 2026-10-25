use crate::utils::secret_or_env;
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
  /// The page is a PDF: its text is not decoded here (agent phase 1); the app keeps the search snippet.
  #[serde(default)]
  pub(crate) pdf: bool,
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

/// Checks a resolved IP address against private/loopback/link-local ranges.
/// This is the ground-truth check — always test the address a connection would
/// actually be made to, not just a hostname string, to avoid DNS-rebinding bypasses.
pub(crate) fn is_private_ip_addr(ip: std::net::IpAddr) -> bool {
  match ip {
    std::net::IpAddr::V4(v4) => {
      if v4.is_loopback() || v4.is_unspecified() {
        return true;
      }
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
      false
    }
    std::net::IpAddr::V6(v6) => {
      if v6.is_loopback() || v6.is_multicast() || v6.is_unspecified() {
        return true;
      }
      let segments = v6.segments();
      if segments[0] == 0xfc00 || segments[0] == 0xfd00 {
        return true;
      }
      if segments[0] == 0xfe80 {
        return true;
      }
      false
    }
  }
}

/// String-only check: catches IP-literal hosts and the `localhost` name without a DNS
/// lookup. Does NOT protect against DNS-rebinding (a public-looking hostname that
/// resolves to a private IP) — use `is_private_host` (async, resolves DNS) for that.
pub(crate) fn is_private_ip(host: &str) -> bool {
  let host = host.trim().to_ascii_lowercase();
  if host.is_empty() {
    return false;
  }
  if host == "localhost" || host == "127.0.0.1" || host == "::1" || host == "0.0.0.0" {
    return true;
  }
  if let Ok(ip) = host.parse::<std::net::IpAddr>() {
    if is_private_ip_addr(ip) {
      return true;
    }
  }
  false
}

/// SSRF-safe host check: resolves DNS and checks every returned address, so a public-looking
/// hostname (e.g. `attacker.example.com`) that resolves to a private/link-local address
/// (e.g. the cloud metadata IP 169.254.169.254) is caught. Falls back to the literal-string
/// check if resolution fails (offline, bad DNS) — a failed lookup means the follow-up request
/// will fail on its own, so it's safe to not block here.
pub(crate) async fn is_private_host(host: &str) -> bool {
  if is_private_ip(host) {
    return true;
  }
  match tokio::net::lookup_host((host, 0)).await {
    Ok(addrs) => addrs.map(|addr| addr.ip()).any(is_private_ip_addr),
    Err(_) => false,
  }
}

/// Manually follows redirects (the client itself uses `Policy::none()`), re-validating the
/// target host of *every* hop against `is_private_host` before continuing. reqwest's built-in
/// redirect policy has no async hook, so a request could otherwise be redirected straight past
/// the initial SSRF check (e.g. a source URL that 302s to `169.254.169.254`) with no re-check on
/// each hop.
pub(crate) async fn fetch_with_ssrf_guard(
  client: &reqwest::Client,
  start_url: reqwest::Url,
) -> Result<reqwest::Response, String> {
  const MAX_REDIRECTS: usize = 5;
  let mut current = start_url;
  let mut redirects_followed = 0usize;
  loop {
    let response = client
      .get(current.clone())
      .send()
      .await
      .map_err(|error| error.to_string())?;
    if !response.status().is_redirection() {
      return Ok(response);
    }
    if redirects_followed >= MAX_REDIRECTS {
      return Err("Too many redirects.".to_string());
    }
    let location = response
      .headers()
      .get(reqwest::header::LOCATION)
      .and_then(|value| value.to_str().ok())
      .map(|value| value.to_string())
      .ok_or_else(|| "Redirect response missing a Location header.".to_string())?;
    let next = current
      .join(&location)
      .map_err(|error| format!("Invalid redirect location: {error}"))?;
    if next.scheme() != "http" && next.scheme() != "https" {
      return Err("SSRF blocked: redirect target uses a non-http(s) scheme.".to_string());
    }
    if let Some(host) = next.host_str() {
      if is_private_host(host).await {
        return Err("SSRF blocked: redirect target is a private/internal IP address.".to_string());
      }
    }
    current = next;
    redirects_followed += 1;
  }
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
  fn remove_html_block(input: &str, tag: &str) -> String {
    let lower = input.to_ascii_lowercase();
    let open = format!("<{tag}");
    let close = format!("</{tag}>");
    let mut output = String::with_capacity(input.len());
    let mut cursor = 0;
    while let Some(relative_start) = lower[cursor..].find(&open) {
      let start = cursor + relative_start;
      output.push_str(&input[cursor..start]);
      let Some(relative_end) = lower[start..].find(&close) else {
        cursor = input.len();
        break;
      };
      cursor = start + relative_end + close.len();
    }
    output.push_str(&input[cursor..]);
    output
  }

  let without_script = remove_html_block(input, "script");
  let input = remove_html_block(&without_script, "style");
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

fn build_snippet(text: &str) -> Option<String> {
  if text.is_empty() {
    None
  } else {
    Some(text.to_string())
  }
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

/// A desktop browser's user agent (agent phase 1). Until 2026-10-25 Hector introduced himself
/// as "Alphonso-Hector/0.1", and about half the sites he visited refused him as a bot.
const BROWSER_USER_AGENT: &str =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
/// Statuses worth one more try: refused, too many requests, briefly unavailable.
const RETRY_STATUSES: [u16; 3] = [403, 429, 503];
const RETRY_DELAY_MS: u64 = 1500;

/// The languages to ask pages in: the app passes the user's own; a neutral default otherwise.
fn accept_language(passed: Option<&str>) -> String {
  passed
    .map(str::trim)
    .filter(|value| {
      !value.is_empty()
        && value.len() <= 200
        && value
          .chars()
          .all(|c| c.is_ascii_alphanumeric() || ",;=.- ".contains(c))
    })
    .map(str::to_string)
    .unwrap_or_else(|| "en;q=0.9,*;q=0.5".to_string())
}

/// A client that asks for pages the way a desktop browser does.
pub(crate) fn research_client(language: Option<&str>) -> Result<reqwest::Client, String> {
  let mut headers = reqwest::header::HeaderMap::new();
  headers.insert(
    reqwest::header::ACCEPT,
    reqwest::header::HeaderValue::from_static(
      "text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf;q=0.8,*/*;q=0.7",
    ),
  );
  if let Ok(value) = reqwest::header::HeaderValue::from_str(&accept_language(language)) {
    headers.insert(reqwest::header::ACCEPT_LANGUAGE, value);
  }
  reqwest::Client::builder()
    .timeout(std::time::Duration::from_secs(12))
    // Redirects are followed manually via `fetch_with_ssrf_guard` so each hop's host can be
    // re-validated -- reqwest's built-in `Policy` has no async hook to call `is_private_host`.
    .redirect(reqwest::redirect::Policy::none())
    .user_agent(BROWSER_USER_AGENT)
    .default_headers(headers)
    .build()
    .map_err(|error| error.to_string())
}

/// Fetches a page, trying once more after a short wait when the site refuses or is busy.
pub(crate) async fn fetch_page_with_retry(
  client: &reqwest::Client,
  url: reqwest::Url,
  retry_delay_ms: u64,
) -> Result<reqwest::Response, String> {
  let first = fetch_with_ssrf_guard(client, url.clone()).await?;
  if !RETRY_STATUSES.contains(&first.status().as_u16()) {
    return Ok(first);
  }
  tokio::time::sleep(std::time::Duration::from_millis(retry_delay_ms)).await;
  fetch_with_ssrf_guard(client, url).await
}

/// Whether a response body is a PDF, by its content type or its first bytes.
pub(crate) fn is_pdf(content_type: Option<&str>, bytes: &[u8]) -> bool {
  content_type
    .map(|value| value.to_ascii_lowercase().contains("application/pdf"))
    .unwrap_or(false)
    || bytes.starts_with(b"%PDF")
}

#[tauri::command]
pub(crate) async fn fetch_research_sources(
  sources: Vec<ResearchSourceInput>,
  accept_language: Option<String>,
) -> Vec<ResearchSourceProof> {
  let client = match research_client(accept_language.as_deref()) {
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
        error: Some(error),
        pdf: false,
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
        pdf: false,
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
      if is_private_host(host).await {
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
          pdf: false,
        });
        continue;
      }
    }
    match fetch_page_with_retry(&client, url.clone(), RETRY_DELAY_MS).await {
      Ok(response) => {
        let status = response.status();
        let content_type = response
          .headers()
          .get(reqwest::header::CONTENT_TYPE)
          .and_then(|value| value.to_str().ok())
          .map(str::to_string);
        match response.bytes().await {
          Ok(bytes) => {
            let pdf = is_pdf(content_type.as_deref(), &bytes);
            let max_len = bytes.len().min(200_000);
            let body = if pdf {
              String::new()
            } else {
              String::from_utf8_lossy(&bytes[..max_len]).to_string()
            };
            let title = if pdf { None } else { extract_title(&body) };
            let text = strip_html_tags(&body);
            let snippet = build_snippet(&text);
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
              pdf,
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
            pdf: false,
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
        error: Some(error),
        pdf: false,
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
  api_key: Option<String>,
) -> Result<Vec<ResearchSearchResult>, String> {
  let query = query.trim().to_string();
  if query.is_empty() {
    return Ok(vec![]);
  }
  let api_key = secret_or_env(api_key, "BRAVE_SEARCH_API_KEY");
  if api_key.is_empty() {
    return Err("Brave Search API key is not set: add it in Settings → Connectors".to_string());
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

/// The most a news feed may be (2 MB); a larger reply is cut off.
const RSS_MAX_BYTES: usize = 2 * 1024 * 1024;

/// Fetches a news feed's raw text for Hector (QA 2026-10-22). The app window
/// cannot: the feed sites aren't in the content-security policy and refuse its
/// origin, so Hector's RSS fallback and the morning briefing never got a feed
/// in the desktop app. Public https addresses only; every redirect hop is
/// checked by `fetch_with_ssrf_guard`.
#[tauri::command]
pub(crate) async fn fetch_rss_feed(url: String) -> Result<serde_json::Value, String> {
  let parsed =
    reqwest::Url::parse(url.trim()).map_err(|_| "Not a valid feed address.".to_string())?;
  if parsed.scheme() != "https" {
    return Err("Only https feeds are fetched.".to_string());
  }
  if is_private_host(parsed.host_str().unwrap_or("")).await {
    return Err("Requests to private or loopback addresses are not allowed.".to_string());
  }
  let client = reqwest::Client::builder()
    .timeout(std::time::Duration::from_secs(10))
    .redirect(reqwest::redirect::Policy::none())
    .user_agent("Alphonso-Hector/0.1 feed reader")
    .build()
    .map_err(|error| error.to_string())?;
  let response = fetch_with_ssrf_guard(&client, parsed).await?;
  let status = response.status().as_u16();
  let bytes = response.bytes().await.map_err(|error| error.to_string())?;
  let truncated = bytes.len() > RSS_MAX_BYTES;
  let text = String::from_utf8_lossy(&bytes[..bytes.len().min(RSS_MAX_BYTES)]).into_owned();
  Ok(serde_json::json!({
    "ok": (200..300).contains(&status),
    "status": status,
    "text": text,
    "truncated": truncated,
  }))
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
  fn strip_html_removes_style_and_script_blocks() {
    assert_eq!(
      strip_html_tags("<style>html { color: red }</style><p>Hello</p><script>alert(1)</script>"),
      "Hello"
    );
  }

  #[test]
  fn strip_html_preserves_text_after_script_containing_style_marker() {
    assert_eq!(
      strip_html_tags("<script>const marker = '<style>'; </script><p>Visible</p>"),
      "Visible"
    );
  }

  #[test]
  fn build_snippet_keeps_long_text_in_full() {
    let long_text = "a".repeat(5000);
    let snippet = build_snippet(&long_text).unwrap();
    assert_eq!(
      snippet.len(),
      5000,
      "snippet should no longer be capped at 420 chars"
    );
  }

  #[test]
  fn build_snippet_returns_none_for_empty_text() {
    assert!(build_snippet("").is_none());
  }

  #[test]
  fn decode_html_entities_basic() {
    assert_eq!(decode_html_entities("& < >"), "& < >");
  }

  /// Minimal single-shot HTTP/1.1 server for redirect tests: binds an ephemeral loopback
  /// port, accepts exactly one connection, ignores the request, and writes back a raw
  /// `302 Found` pointing at `location`. Returns the port so the test can build the request URL.
  async fn spawn_redirect_server(location: &str) -> u16 {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let response = format!(
      "HTTP/1.1 302 Found\r\nLocation: {location}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
    );
    tokio::spawn(async move {
      let (mut socket, _) = listener.accept().await.unwrap();
      let mut buf = [0u8; 1024];
      let _ = socket.read(&mut buf).await;
      let _ = socket.write_all(response.as_bytes()).await;
      let _ = socket.shutdown().await;
    });
    port
  }

  #[tokio::test]
  async fn fetch_with_ssrf_guard_blocks_redirect_to_private_address() {
    let port = spawn_redirect_server("http://169.254.169.254/latest/meta-data/").await;
    let client = reqwest::Client::builder()
      .redirect(reqwest::redirect::Policy::none())
      .build()
      .unwrap();
    let start_url = reqwest::Url::parse(&format!("http://127.0.0.1:{port}/")).unwrap();
    let result = fetch_with_ssrf_guard(&client, start_url).await;
    let error = result.expect_err("redirect to a private/link-local address must be blocked");
    assert!(
      error.contains("SSRF blocked"),
      "expected an SSRF-blocked error, got: {error}"
    );
  }

  #[tokio::test]
  async fn fetch_with_ssrf_guard_blocks_redirect_to_non_http_scheme() {
    let port = spawn_redirect_server("file:///etc/passwd").await;
    let client = reqwest::Client::builder()
      .redirect(reqwest::redirect::Policy::none())
      .build()
      .unwrap();
    let start_url = reqwest::Url::parse(&format!("http://127.0.0.1:{port}/")).unwrap();
    let result = fetch_with_ssrf_guard(&client, start_url).await;
    let error = result.expect_err("redirect to a non-http(s) scheme must be blocked");
    assert!(
      error.contains("non-http(s) scheme"),
      "expected a scheme-blocked error, got: {error}"
    );
  }

  #[tokio::test]
  async fn fetch_with_ssrf_guard_blocks_redirect_after_missing_location_header() {
    // A 3xx with no Location header at all must fail closed (an error), not silently return
    // the redirect response itself as if it were a normal 200.
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    tokio::spawn(async move {
      use tokio::io::{AsyncReadExt, AsyncWriteExt};
      let (mut socket, _) = listener.accept().await.unwrap();
      let mut buf = [0u8; 1024];
      let _ = socket.read(&mut buf).await;
      let _ = socket
        .write_all(b"HTTP/1.1 302 Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
        .await;
      let _ = socket.shutdown().await;
    });
    let client = reqwest::Client::builder()
      .redirect(reqwest::redirect::Policy::none())
      .build()
      .unwrap();
    let start_url = reqwest::Url::parse(&format!("http://127.0.0.1:{port}/")).unwrap();
    let result = fetch_with_ssrf_guard(&client, start_url).await;
    let error = result.expect_err("a redirect with no Location header must fail, not pass through");
    assert!(
      error.contains("Location header"),
      "expected a missing-Location error, got: {error}"
    );
  }

  /// A loopback server that answers each connection from `replies` in turn and sends back
  /// what it received on the channel, so a test can read the request headers.
  async fn spawn_scripted_server(
    replies: Vec<String>,
  ) -> (u16, tokio::sync::mpsc::UnboundedReceiver<String>) {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let (tx, rx) = tokio::sync::mpsc::unbounded_channel();
    tokio::spawn(async move {
      for reply in replies {
        let (mut socket, _) = listener.accept().await.unwrap();
        let mut buf = vec![0u8; 4096];
        let n = socket.read(&mut buf).await.unwrap_or(0);
        let _ = tx.send(String::from_utf8_lossy(&buf[..n]).to_string());
        let _ = socket.write_all(reply.as_bytes()).await;
        let _ = socket.shutdown().await;
      }
    });
    (port, rx)
  }

  fn reply(status: &str, content_type: &str, body: &str) -> String {
    format!("HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len())
  }

  #[tokio::test]
  async fn browser_headers_are_sent() {
    let (port, mut seen) =
      spawn_scripted_server(vec![reply("200 OK", "text/html", "<p>hi</p>")]).await;
    let client = research_client(Some("de-DE,de;q=0.9")).unwrap();
    let url = reqwest::Url::parse(&format!("http://127.0.0.1:{port}/page")).unwrap();
    fetch_page_with_retry(&client, url, 1).await.unwrap();
    let request = seen.recv().await.unwrap().to_ascii_lowercase();
    assert!(request.contains("user-agent: mozilla/5.0"), "{request}");
    assert!(!request.contains("alphonso-hector"), "{request}");
    assert!(
      request.contains("accept-language: de-de,de;q=0.9"),
      "{request}"
    );
  }

  #[test]
  fn a_bad_language_falls_back() {
    assert_eq!(
      accept_language(Some("x\r\nInjected: 1")),
      "en;q=0.9,*;q=0.5"
    );
    assert_eq!(accept_language(None), "en;q=0.9,*;q=0.5");
    assert_eq!(accept_language(Some("fr-FR,fr;q=0.9")), "fr-FR,fr;q=0.9");
  }

  #[tokio::test]
  async fn retries_once_on_403() {
    let (port, _seen) = spawn_scripted_server(vec![
      reply("403 Forbidden", "text/html", "blocked"),
      reply("200 OK", "text/html", "<p>the page</p>"),
    ])
    .await;
    let client = research_client(None).unwrap();
    let url = reqwest::Url::parse(&format!("http://127.0.0.1:{port}/page")).unwrap();
    let response = fetch_page_with_retry(&client, url, 1).await.unwrap();
    assert_eq!(response.status().as_u16(), 200);
  }

  #[tokio::test]
  async fn does_not_retry_a_404() {
    let (port, _seen) =
      spawn_scripted_server(vec![reply("404 Not Found", "text/html", "gone")]).await;
    let client = research_client(None).unwrap();
    let url = reqwest::Url::parse(&format!("http://127.0.0.1:{port}/page")).unwrap();
    let response = fetch_page_with_retry(&client, url, 1).await.unwrap();
    assert_eq!(response.status().as_u16(), 404);
  }

  #[test]
  fn pdf_is_recognised() {
    assert!(is_pdf(Some("application/pdf"), b"anything"));
    assert!(is_pdf(None, b"%PDF-1.7 ..."));
    assert!(!is_pdf(Some("text/html; charset=utf-8"), b"<html>"));
  }
}
