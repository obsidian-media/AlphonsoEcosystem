use hmac::{Hmac, KeyInit, Mac};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::Sha256;
use std::time::Duration;

use crate::now_ms;
use crate::utils::secret_or_env;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MetaPublishProof {
  connector_id: String,
  ok: bool,
  platform: String,
  published: bool,
  post_ids: Vec<String>,
  url: Option<String>,
  setup_required: bool,
  published_at_ms: u64,
  trust: String,
  message: String,
  error: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MetaPublishRequest {
  approved: bool,
  platform: String,
  caption: Option<String>,
  message: Option<String>,
  title: Option<String>,
  link: Option<String>,
  image_url: Option<String>,
  video_url: Option<String>,
  local_file_path: Option<String>,
  media_type: Option<String>,
  request_id: Option<String>,
  /// Keys saved in Settings → Connectors → Meta; each falls back to the environment.
  #[serde(default)]
  credentials: Option<MetaCredentials>,
}

#[derive(Deserialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MetaCredentials {
  access_token: Option<String>,
  page_access_token: Option<String>,
  page_id: Option<String>,
  instagram_business_account_id: Option<String>,
  app_secret: Option<String>,
}

/// The Meta keys to use: what the app passed (saved in Settings), else the environment.
pub(crate) struct ResolvedMeta {
  pub access_token: String,
  /// Facebook Page posts use the Page token when there is one.
  pub page_token: String,
  pub page_id: String,
  pub ig_user_id: String,
  pub app_secret: String,
}

pub(crate) fn resolve_meta_credentials(passed: Option<MetaCredentials>) -> ResolvedMeta {
  let c = passed.unwrap_or_default();
  let access_token = secret_or_env(c.access_token, "META_ACCESS_TOKEN");
  let page_token = secret_or_env(c.page_access_token, "META_PAGE_ACCESS_TOKEN");
  ResolvedMeta {
    page_token: if page_token.is_empty() {
      access_token.clone()
    } else {
      page_token
    },
    access_token,
    page_id: secret_or_env(c.page_id, "META_PAGE_ID"),
    ig_user_id: secret_or_env(
      c.instagram_business_account_id,
      "INSTAGRAM_BUSINESS_ACCOUNT_ID",
    ),
    app_secret: secret_or_env(c.app_secret, "META_APP_SECRET"),
  }
}

pub(crate) fn meta_graph_api_version() -> String {
  std::env::var("META_GRAPH_API_VERSION")
    .map(|value| {
      let clean = value.trim();
      if clean.is_empty() {
        "v20.0".to_string()
      } else {
        clean.trim_start_matches('/').to_string()
      }
    })
    .unwrap_or_else(|_| "v20.0".to_string())
}

/// `appsecret_proof` for a token with this app secret (none without a secret).
pub(crate) fn meta_appsecret_proof_with(app_secret: &str, access_token: &str) -> Option<String> {
  let secret = app_secret.trim();
  if secret.is_empty() {
    return None;
  }
  let mut mac = Hmac::<Sha256>::new_from_slice(secret.as_bytes()).ok()?;
  mac.update(access_token.as_bytes());
  let bytes = mac.finalize().into_bytes();
  let mut out = String::with_capacity(bytes.len() * 2);
  for byte in bytes {
    use std::fmt::Write as _;
    let _ = write!(&mut out, "{:02x}", byte);
  }
  Some(out)
}

pub(crate) fn graph_error_message(body: &Value, fallback: &str) -> String {
  body
    .get("error")
    .and_then(|value| value.get("message"))
    .and_then(|value| value.as_str())
    .unwrap_or(fallback)
    .to_string()
}

#[tauri::command]
pub(crate) async fn meta_publish_content(
  rate_limiter: tauri::State<'_, crate::RateLimiter>,
  request: MetaPublishRequest,
) -> Result<MetaPublishProof, String> {
  rate_limiter.check_and_record("meta_publish_content")?;
  let published_at_ms = now_ms();
  let platform = request.platform.trim().to_ascii_lowercase();
  let _request_id = request
    .request_id
    .as_deref()
    .unwrap_or("")
    .trim()
    .to_string();
  if platform.is_empty() || !matches!(platform.as_str(), "instagram" | "facebook") {
    return Ok(MetaPublishProof {
      connector_id: "meta".to_string(),
      ok: false,
      platform,
      published: false,
      post_ids: Vec::new(),
      url: None,
      setup_required: false,
      published_at_ms,
      trust: "failed".to_string(),
      message: "Unsupported Meta platform. Use 'instagram' or 'facebook'.".to_string(),
      error: Some("invalid platform".to_string()),
    });
  }

  if !request.approved {
    return Ok(MetaPublishProof {
      connector_id: "meta".to_string(),
      ok: false,
      platform,
      published: false,
      post_ids: Vec::new(),
      url: None,
      setup_required: false,
      published_at_ms,
      trust: "failed".to_string(),
      message: "Publish denied pending approval.".to_string(),
      error: Some("approval required".to_string()),
    });
  }

  let keys = resolve_meta_credentials(request.credentials.clone());
  let access_token = keys.access_token.clone();
  if access_token.trim().is_empty() {
    return Ok(MetaPublishProof {
      connector_id: "meta".to_string(),
      ok: false,
      platform,
      published: false,
      post_ids: Vec::new(),
      url: None,
      setup_required: true,
      published_at_ms,
      trust: "unverified".to_string(),
      message: "META_ACCESS_TOKEN is missing.".to_string(),
      error: Some("META_ACCESS_TOKEN is not configured.".to_string()),
    });
  }

  let proof = meta_appsecret_proof_with(&keys.app_secret, access_token.trim());
  let client = reqwest::Client::builder()
    .timeout(Duration::from_secs(90))
    .user_agent("Alphonso-Meta-Publish/0.1")
    .build()
    .map_err(|error| error.to_string())?;
  let caption = request
    .caption
    .as_deref()
    .unwrap_or(
      request
        .message
        .as_deref()
        .unwrap_or(request.title.as_deref().unwrap_or("")),
    )
    .trim()
    .to_string();
  let title = request.title.as_deref().unwrap_or("").trim().to_string();
  let link = request.link.as_deref().unwrap_or("").trim().to_string();

  let mut auth_query: Vec<(String, String)> =
    vec![("access_token".to_string(), access_token.trim().to_string())];
  if let Some(proof_value) = proof.clone() {
    auth_query.push(("appsecret_proof".to_string(), proof_value));
  }

  if platform == "instagram" {
    let ig_user_id = keys.ig_user_id.clone();
    if ig_user_id.trim().is_empty() {
      return Ok(MetaPublishProof {
        connector_id: "meta".to_string(),
        ok: false,
        platform,
        published: false,
        post_ids: Vec::new(),
        url: None,
        setup_required: true,
        published_at_ms,
        trust: "unverified".to_string(),
        message: "INSTAGRAM_BUSINESS_ACCOUNT_ID is missing.".to_string(),
        error: Some("INSTAGRAM_BUSINESS_ACCOUNT_ID is not configured.".to_string()),
      });
    }

    let image_url = request
      .image_url
      .as_deref()
      .unwrap_or("")
      .trim()
      .to_string();
    let video_url = request
      .video_url
      .as_deref()
      .unwrap_or("")
      .trim()
      .to_string();
    let media_type = request
      .media_type
      .as_deref()
      .unwrap_or("")
      .trim()
      .to_ascii_uppercase();
    if image_url.is_empty() && video_url.is_empty() {
      return Ok(MetaPublishProof {
        connector_id: "meta".to_string(),
        ok: false,
        platform,
        published: false,
        post_ids: Vec::new(),
        url: None,
        setup_required: true,
        published_at_ms,
        trust: "setup_required".to_string(),
        message: "Instagram publishing requires a public image_url or video_url.".to_string(),
        error: Some("public media url required".to_string()),
      });
    }

    let media_endpoint = format!(
      "https://graph.facebook.com/{}/{}/media",
      meta_graph_api_version(),
      ig_user_id.trim()
    );
    let mut media_form = vec![("caption".to_string(), caption.clone())];
    if !media_type.is_empty() {
      media_form.push(("media_type".to_string(), media_type.clone()));
    } else if !video_url.is_empty() {
      media_form.push(("media_type".to_string(), "REELS".to_string()));
    }
    if !video_url.is_empty() {
      media_form.push(("video_url".to_string(), video_url.clone()));
    } else {
      media_form.push(("image_url".to_string(), image_url.clone()));
    }
    let create_response = client
      .post(&media_endpoint)
      .query(&auth_query)
      .form(&media_form)
      .send()
      .await
      .map_err(|error| error.to_string())?;
    let create_status = create_response.status();
    let create_body: Value = create_response
      .json()
      .await
      .map_err(|error| error.to_string())?;
    if !create_status.is_success() {
      return Ok(MetaPublishProof {
        connector_id: "meta".to_string(),
        ok: false,
        platform,
        published: false,
        post_ids: Vec::new(),
        url: None,
        setup_required: false,
        published_at_ms,
        trust: "failed".to_string(),
        message: "Instagram media container creation failed.".to_string(),
        error: Some(graph_error_message(
          &create_body,
          "Instagram media container creation failed.",
        )),
      });
    }
    let creation_id = create_body
      .get("id")
      .and_then(|value| value.as_str())
      .unwrap_or("")
      .trim()
      .to_string();
    if creation_id.is_empty() {
      return Ok(MetaPublishProof {
        connector_id: "meta".to_string(),
        ok: false,
        platform,
        published: false,
        post_ids: Vec::new(),
        url: None,
        setup_required: false,
        published_at_ms,
        trust: "failed".to_string(),
        message: "Instagram media container id was not returned.".to_string(),
        error: Some("missing creation id".to_string()),
      });
    }

    let publish_endpoint = format!(
      "https://graph.facebook.com/{}/{}/media_publish",
      meta_graph_api_version(),
      ig_user_id.trim()
    );
    let publish_form = vec![("creation_id".to_string(), creation_id.clone())];
    let publish_response = client
      .post(&publish_endpoint)
      .query(&auth_query)
      .form(&publish_form)
      .send()
      .await
      .map_err(|error| error.to_string())?;
    let publish_status = publish_response.status();
    let publish_body: Value = publish_response
      .json()
      .await
      .map_err(|error| error.to_string())?;
    if !publish_status.is_success() {
      return Ok(MetaPublishProof {
        connector_id: "meta".to_string(),
        ok: false,
        platform,
        published: false,
        post_ids: vec![creation_id],
        url: None,
        setup_required: false,
        published_at_ms,
        trust: "failed".to_string(),
        message: "Instagram media publish failed.".to_string(),
        error: Some(graph_error_message(
          &publish_body,
          "Instagram media publish failed.",
        )),
      });
    }

    let published_id = publish_body
      .get("id")
      .and_then(|value| value.as_str())
      .unwrap_or("")
      .trim()
      .to_string();
    return Ok(MetaPublishProof {
      connector_id: "meta".to_string(),
      ok: true,
      platform,
      published: true,
      post_ids: if published_id.is_empty() {
        vec![creation_id]
      } else {
        vec![published_id]
      },
      url: None,
      setup_required: false,
      published_at_ms,
      trust: "verified".to_string(),
      message: "Instagram content published.".to_string(),
      error: None,
    });
  }

  let page_id = keys.page_id.clone();
  // Facebook Page posts are made with the Page's own token when there is one.
  let mut auth_query: Vec<(String, String)> = vec![(
    "access_token".to_string(),
    keys.page_token.trim().to_string(),
  )];
  if let Some(proof_value) = meta_appsecret_proof_with(&keys.app_secret, keys.page_token.trim()) {
    auth_query.push(("appsecret_proof".to_string(), proof_value));
  }
  if page_id.trim().is_empty() {
    return Ok(MetaPublishProof {
      connector_id: "meta".to_string(),
      ok: false,
      platform,
      published: false,
      post_ids: Vec::new(),
      url: None,
      setup_required: true,
      published_at_ms,
      trust: "unverified".to_string(),
      message: "META_PAGE_ID is missing.".to_string(),
      error: Some("META_PAGE_ID is not configured.".to_string()),
    });
  }

  let local_file_path = request
    .local_file_path
    .as_deref()
    .unwrap_or("")
    .trim()
    .to_string();
  let image_url = request
    .image_url
    .as_deref()
    .unwrap_or("")
    .trim()
    .to_string();
  let video_url = request
    .video_url
    .as_deref()
    .unwrap_or("")
    .trim()
    .to_string();
  let page_endpoint_base = format!(
    "https://graph.facebook.com/{}/{}",
    meta_graph_api_version(),
    page_id.trim()
  );

  if !local_file_path.is_empty() {
    return Ok(MetaPublishProof {
      connector_id: "meta".to_string(),
      ok: false,
      platform,
      published: false,
      post_ids: Vec::new(),
      url: None,
      setup_required: true,
      published_at_ms,
      trust: "setup_required".to_string(),
      message: "Local Meta file uploads are not wired in this build. Use a public image_url or video_url for Instagram, or a remote media URL for Facebook.".to_string(),
      error: Some("local file uploads require a separate storage step".to_string()),
    });
  }

  if !video_url.is_empty() {
    let response = client
      .post(format!("{}/videos", page_endpoint_base))
      .query(&auth_query)
      .form(&[
        ("file_url", video_url.clone()),
        (
          "description",
          if caption.is_empty() {
            title.clone()
          } else {
            caption.clone()
          },
        ),
      ])
      .send()
      .await
      .map_err(|error| error.to_string())?;
    let status = response.status();
    let body: Value = response.json().await.map_err(|error| error.to_string())?;
    if !status.is_success() {
      return Ok(MetaPublishProof {
        connector_id: "meta".to_string(),
        ok: false,
        platform,
        published: false,
        post_ids: Vec::new(),
        url: None,
        setup_required: false,
        published_at_ms,
        trust: "failed".to_string(),
        message: "Facebook video publish failed.".to_string(),
        error: Some(graph_error_message(&body, "Facebook video publish failed.")),
      });
    }
    let post_id = body
      .get("post_id")
      .or_else(|| body.get("id"))
      .and_then(|value| value.as_str())
      .unwrap_or("")
      .trim()
      .to_string();
    return Ok(MetaPublishProof {
      connector_id: "meta".to_string(),
      ok: true,
      platform,
      published: true,
      post_ids: vec![post_id.clone()]
        .into_iter()
        .filter(|value| !value.is_empty())
        .collect(),
      url: if post_id.is_empty() {
        None
      } else {
        Some(format!("https://www.facebook.com/{}", post_id))
      },
      setup_required: false,
      published_at_ms,
      trust: "verified".to_string(),
      message: "Facebook video published.".to_string(),
      error: None,
    });
  }

  if !image_url.is_empty() {
    let response = client
      .post(format!("{}/photos", page_endpoint_base))
      .query(&auth_query)
      .form(&[
        ("url", image_url.clone()),
        (
          "caption",
          if caption.is_empty() {
            title.clone()
          } else {
            caption.clone()
          },
        ),
      ])
      .send()
      .await
      .map_err(|error| error.to_string())?;
    let status = response.status();
    let body: Value = response.json().await.map_err(|error| error.to_string())?;
    if !status.is_success() {
      return Ok(MetaPublishProof {
        connector_id: "meta".to_string(),
        ok: false,
        platform,
        published: false,
        post_ids: Vec::new(),
        url: None,
        setup_required: false,
        published_at_ms,
        trust: "failed".to_string(),
        message: "Facebook photo publish failed.".to_string(),
        error: Some(graph_error_message(&body, "Facebook photo publish failed.")),
      });
    }
    let post_id = body
      .get("post_id")
      .or_else(|| body.get("id"))
      .and_then(|value| value.as_str())
      .unwrap_or("")
      .trim()
      .to_string();
    return Ok(MetaPublishProof {
      connector_id: "meta".to_string(),
      ok: true,
      platform,
      published: true,
      post_ids: vec![post_id.clone()]
        .into_iter()
        .filter(|value| !value.is_empty())
        .collect(),
      url: if post_id.is_empty() {
        None
      } else {
        Some(format!("https://www.facebook.com/{}", post_id))
      },
      setup_required: false,
      published_at_ms,
      trust: "verified".to_string(),
      message: "Facebook photo published.".to_string(),
      error: None,
    });
  }

  let message = if !caption.is_empty() {
    caption.clone()
  } else if !link.is_empty() {
    link.clone()
  } else {
    title.clone()
  };
  if message.is_empty() {
    return Ok(MetaPublishProof {
      connector_id: "meta".to_string(),
      ok: false,
      platform,
      published: false,
      post_ids: Vec::new(),
      url: None,
      setup_required: true,
      published_at_ms,
      trust: "setup_required".to_string(),
      message: "Facebook publish requires text or media input.".to_string(),
      error: Some("content missing".to_string()),
    });
  }

  let mut feed_form = vec![("message".to_string(), message)];
  if !link.is_empty() {
    feed_form.push(("link".to_string(), link));
  }
  let response = client
    .post(format!("{}/feed", page_endpoint_base))
    .query(&auth_query)
    .form(&feed_form)
    .send()
    .await
    .map_err(|error| error.to_string())?;
  let status = response.status();
  let body: Value = response.json().await.map_err(|error| error.to_string())?;
  if !status.is_success() {
    return Ok(MetaPublishProof {
      connector_id: "meta".to_string(),
      ok: false,
      platform,
      published: false,
      post_ids: Vec::new(),
      url: None,
      setup_required: false,
      published_at_ms,
      trust: "failed".to_string(),
      message: "Facebook feed publish failed.".to_string(),
      error: Some(graph_error_message(&body, "Facebook feed publish failed.")),
    });
  }
  let post_id = body
    .get("post_id")
    .or_else(|| body.get("id"))
    .and_then(|value| value.as_str())
    .unwrap_or("")
    .trim()
    .to_string();
  Ok(MetaPublishProof {
    connector_id: "meta".to_string(),
    ok: true,
    platform,
    published: true,
    post_ids: vec![post_id.clone()]
      .into_iter()
      .filter(|value| !value.is_empty())
      .collect(),
    url: if post_id.is_empty() {
      None
    } else {
      Some(format!("https://www.facebook.com/{}", post_id))
    },
    setup_required: false,
    published_at_ms,
    trust: "verified".to_string(),
    message: "Facebook post published.".to_string(),
    error: None,
  })
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::ffi::OsString;
  use std::sync::{Mutex, MutexGuard};

  // Environment variables are process-global, while Rust unit tests execute in
  // parallel. Keep the Meta configuration tests serial and always put a
  // pre-existing value back, so one test cannot affect another test or the
  // developer's shell configuration.
  static META_ENV_TEST_LOCK: Mutex<()> = Mutex::new(());

  struct EnvVarRestore {
    key: &'static str,
    original: Option<OsString>,
  }

  impl Drop for EnvVarRestore {
    fn drop(&mut self) {
      match &self.original {
        Some(value) => std::env::set_var(self.key, value),
        None => std::env::remove_var(self.key),
      }
    }
  }

  fn set_meta_env(
    key: &'static str,
    value: Option<&str>,
  ) -> (MutexGuard<'static, ()>, EnvVarRestore) {
    let lock = META_ENV_TEST_LOCK
      .lock()
      .unwrap_or_else(|poisoned| poisoned.into_inner());
    let restore = EnvVarRestore {
      key,
      original: std::env::var_os(key),
    };
    match value {
      Some(value) => std::env::set_var(key, value),
      None => std::env::remove_var(key),
    }
    (lock, restore)
  }

  #[test]
  fn meta_graph_api_version_defaults_when_unset() {
    let (_lock, _restore) = set_meta_env("META_GRAPH_API_VERSION", None);
    assert_eq!(meta_graph_api_version(), "v20.0");
  }

  #[test]
  fn meta_graph_api_version_strips_leading_slash() {
    let (_lock, _restore) = set_meta_env("META_GRAPH_API_VERSION", Some("/v19.0"));
    assert_eq!(meta_graph_api_version(), "v19.0");
  }

  #[test]
  fn meta_graph_api_version_treats_empty_as_default() {
    let (_lock, _restore) = set_meta_env("META_GRAPH_API_VERSION", Some("   "));
    assert_eq!(meta_graph_api_version(), "v20.0");
  }

  #[test]
  fn meta_appsecret_proof_returns_none_without_secret() {
    assert!(meta_appsecret_proof_with("", "any_token").is_none());
  }

  #[test]
  fn meta_appsecret_proof_returns_hex_hmac_when_secret_set() {
    let proof = meta_appsecret_proof_with("secret123", "access_token");
    assert!(proof.is_some());
    let value = proof.unwrap();
    assert_eq!(value.len(), 64, "HMAC-SHA256 hex must be 64 chars");
    assert!(value.chars().all(|c| c.is_ascii_hexdigit()));
  }

  #[test]
  fn graph_error_message_extracts_nested_error_message() {
    let body = serde_json::json!({
      "error": { "message": "Invalid OAuth access token.", "type": "OAuthException" }
    });
    assert_eq!(
      graph_error_message(&body, "fallback"),
      "Invalid OAuth access token."
    );
  }

  #[test]
  fn graph_error_message_falls_back_when_no_error() {
    let body = serde_json::json!({ "id": "123" });
    assert_eq!(graph_error_message(&body, "fallback msg"), "fallback msg");
  }

  #[test]
  fn saved_meta_keys_win_over_the_environment_and_fall_back_to_it() {
    let (_lock, _restore) = set_meta_env("META_ACCESS_TOKEN", Some("env-token"));
    let keys = resolve_meta_credentials(Some(MetaCredentials {
      access_token: Some(" saved-token ".into()),
      page_id: Some("123".into()),
      ..Default::default()
    }));
    assert_eq!(keys.access_token, "saved-token");
    assert_eq!(keys.page_id, "123");
    // No Page token anywhere: Page posts use the access token.
    assert_eq!(keys.page_token, "saved-token");
    let from_env = resolve_meta_credentials(None);
    assert_eq!(from_env.access_token, "env-token");
  }

  #[test]
  fn the_page_token_is_used_for_page_posts_when_there_is_one() {
    let keys = resolve_meta_credentials(Some(MetaCredentials {
      access_token: Some("user".into()),
      page_access_token: Some("page".into()),
      ..Default::default()
    }));
    assert_eq!(keys.page_token, "page");
  }

  #[test]
  fn appsecret_proof_uses_the_given_secret() {
    assert!(meta_appsecret_proof_with("", "t").is_none());
    assert_eq!(meta_appsecret_proof_with("s", "t").unwrap().len(), 64);
  }
}
