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
pub(crate) async fn fetch_url_content(url: String) -> Result<UrlFetchProof, String> {
  if !url.starts_with("http://") && !url.starts_with("https://") {
    return Err("URL must start with http:// or https://".to_string());
  }
  // SSRF protection: the first address is checked here (resolving DNS first), and every
  // redirect hop by `fetch_page_text` (agent phase 4: it used to follow redirects unchecked).
  let parsed = reqwest::Url::parse(&url).map_err(|_| "Not a valid address.".to_string())?;
  if crate::search::is_private_host(parsed.host_str().unwrap_or("")).await {
    return Err("Requests to private or loopback addresses are not allowed.".to_string());
  }
  let client = crate::search::research_client(None)?;
  let (status, html) = crate::search::fetch_page_text(&client, parsed).await?;
  let (title, content) = crate::search::page_title_and_text(&html);

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
