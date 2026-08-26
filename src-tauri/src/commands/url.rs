use crate::now_ms;
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UrlOpenProof {
  url: String,
  opened: bool,
  opened_at_ms: u64,
  trust: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UrlFetchProof {
  url: String,
  status: u16,
  content: String,
  title: String,
  fetched_at_ms: u64,
  trust: String,
  error: Option<String>,
}

#[tauri::command]
pub(crate) fn open_url(app: tauri::AppHandle, url: String) -> Result<UrlOpenProof, String> {
  if !url.starts_with("http://") && !url.starts_with("https://") {
    return Err("URL must start with http:// or https://".to_string());
  }
  use tauri_plugin_opener::OpenerExt;
  app
    .opener()
    .open_url(&url, None::<&str>)
    .map_err(|e| e.to_string())?;
  Ok(UrlOpenProof {
    url,
    opened: true,
    opened_at_ms: now_ms(),
    trust: "verified".to_string(),
  })
}

#[tauri::command]
pub(crate) async fn fetch_url_content(
  state: tauri::State<'_, reqwest::Client>,
  url: String,
) -> Result<UrlFetchProof, String> {
  if !url.starts_with("http://") && !url.starts_with("https://") {
    return Err("URL must start with http:// or https://".to_string());
  }
  // SSRF protection: block requests to private/loopback IP ranges, resolving DNS first
  // so a public-looking hostname that resolves to a private address can't bypass this.
  if let Ok(parsed) = reqwest::Url::parse(&url) {
    let host = parsed.host_str().unwrap_or("");
    if crate::search::is_private_host(host).await {
      return Err("Requests to private or loopback addresses are not allowed.".to_string());
    }
  }
  let response = state
    .get(&url)
    .header(reqwest::header::USER_AGENT, "Alphonso/1.0")
    .send()
    .await
    .map_err(|e| e.to_string())?;
  let status = response.status().as_u16();
  let html = response.text().await.map_err(|e| e.to_string())?;

  let title = html
    .lines()
    .find(|line| line.to_lowercase().contains("<title>"))
    .and_then(|line| {
      let start = line.to_lowercase().find("<title>")? + 7;
      let end = line.to_lowercase().find("</title>")?;
      Some(line[start..end].trim().to_string())
    })
    .unwrap_or_default();

  let mut content = String::new();
  let mut in_tag = false;
  for ch in html.chars() {
    if ch == '<' {
      in_tag = true;
      continue;
    }
    if ch == '>' {
      in_tag = false;
      continue;
    }
    if !in_tag {
      content.push(ch);
    }
  }
  let content = content
    .lines()
    .map(|l| l.trim())
    .filter(|l| !l.is_empty())
    .take(200)
    .collect::<Vec<_>>()
    .join("\n")
    .chars()
    .take(10000)
    .collect();

  Ok(UrlFetchProof {
    url,
    status,
    content,
    title,
    fetched_at_ms: now_ms(),
    trust: "verified".to_string(),
    error: None,
  })
}
