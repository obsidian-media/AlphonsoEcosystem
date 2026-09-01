use crate::now_ms;
use serde::Serialize;
use tauri_plugin_updater::UpdaterExt;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppUpdateCheckProof {
  configured: bool,
  available: bool,
  current_version: String,
  latest_version: Option<String>,
  notes: Option<String>,
  pub_date: Option<String>,
  download_url: Option<String>,
  checked_at_ms: u64,
  trust: String,
  error: Option<String>,
}

#[tauri::command]
pub(crate) async fn check_app_update(
  app: tauri::AppHandle,
  endpoint: Option<String>,
  pubkey: Option<String>,
  target: Option<String>,
) -> AppUpdateCheckProof {
  let checked_at_ms = now_ms();
  let endpoint = endpoint.unwrap_or_default().trim().to_string();
  let pubkey = pubkey.unwrap_or_default().trim().to_string();

  if endpoint.is_empty() || pubkey.is_empty() {
    return AppUpdateCheckProof {
      configured: false,
      available: false,
      current_version: app.package_info().version.to_string(),
      latest_version: None,
      notes: None,
      pub_date: None,
      download_url: None,
      checked_at_ms,
      trust: "unverified".to_string(),
      error: Some("Updater is not configured. Provide both endpoint and public key.".to_string()),
    };
  }

  let builder = app.updater_builder();
  let endpoint_url = match reqwest::Url::parse(&endpoint) {
    Ok(url) => url,
    Err(error) => {
      return AppUpdateCheckProof {
        configured: true,
        available: false,
        current_version: app.package_info().version.to_string(),
        latest_version: None,
        notes: None,
        pub_date: None,
        download_url: None,
        checked_at_ms,
        trust: "failed".to_string(),
        error: Some(format!("Invalid updater endpoint URL: {error}")),
      };
    }
  };

  let builder = match builder.endpoints(vec![endpoint_url]) {
    Ok(next) => next,
    Err(error) => {
      return AppUpdateCheckProof {
        configured: true,
        available: false,
        current_version: app.package_info().version.to_string(),
        latest_version: None,
        notes: None,
        pub_date: None,
        download_url: None,
        checked_at_ms,
        trust: "failed".to_string(),
        error: Some(error.to_string()),
      };
    }
  };

  let mut builder = builder.pubkey(pubkey);

  if let Some(custom_target) = target {
    let clean = custom_target.trim();
    if !clean.is_empty() {
      builder = builder.target(clean.to_string());
    }
  }

  let updater = match builder.build() {
    Ok(updater) => updater,
    Err(error) => {
      return AppUpdateCheckProof {
        configured: true,
        available: false,
        current_version: app.package_info().version.to_string(),
        latest_version: None,
        notes: None,
        pub_date: None,
        download_url: None,
        checked_at_ms,
        trust: "failed".to_string(),
        error: Some(error.to_string()),
      };
    }
  };

  match updater.check().await {
    Ok(Some(update)) => AppUpdateCheckProof {
      configured: true,
      available: true,
      current_version: update.current_version,
      latest_version: Some(update.version),
      notes: update.body,
      pub_date: update.date.map(|date| date.to_string()),
      download_url: Some(update.download_url.to_string()),
      checked_at_ms,
      trust: "verified".to_string(),
      error: None,
    },
    Ok(None) => AppUpdateCheckProof {
      configured: true,
      available: false,
      current_version: app.package_info().version.to_string(),
      latest_version: None,
      notes: None,
      pub_date: None,
      download_url: None,
      checked_at_ms,
      trust: "verified".to_string(),
      error: None,
    },
    Err(error) => AppUpdateCheckProof {
      configured: true,
      available: false,
      current_version: app.package_info().version.to_string(),
      latest_version: None,
      notes: None,
      pub_date: None,
      download_url: None,
      checked_at_ms,
      trust: "failed".to_string(),
      error: Some(error.to_string()),
    },
  }
}
