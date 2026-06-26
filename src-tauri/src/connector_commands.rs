use crate::{
  dedup_strings, now_ms, ConnectorInboundMessage, ConnectorPollProof, ConnectorSendProof,
};
use serde::Serialize;
use serde_json::Value;
use std::time::Duration;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WebhookPostProof {
  pub(crate) ok: bool,
  pub(crate) platform: String,
  pub(crate) connection_name: Option<String>,
  pub(crate) webhook_host: Option<String>,
  pub(crate) http_status: Option<u16>,
  pub(crate) response_preview: Option<String>,
  pub(crate) sent_at_ms: u64,
  pub(crate) trust: String,
  pub(crate) error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MediaGenerationProof {
  pub(crate) connector_id: String,
  pub(crate) ok: bool,
  pub(crate) provider: String,
  pub(crate) job_id: Option<String>,
  pub(crate) output_paths: Vec<String>,
  pub(crate) preview_base64: Option<String>,
  pub(crate) queued_at_ms: u64,
  pub(crate) trust: String,
  pub(crate) message: String,
  pub(crate) error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LocalRuntimeHealthProof {
  pub(crate) connector_id: String,
  pub(crate) provider: String,
  pub(crate) ok: bool,
  pub(crate) endpoint: String,
  pub(crate) probe_path: String,
  pub(crate) http_status: Option<u16>,
  pub(crate) checked_at_ms: u64,
  pub(crate) trust: String,
  pub(crate) message: String,
  pub(crate) error: Option<String>,
}

fn is_allowed_webhook_url(webhook_url: &str) -> bool {
  let normalized = webhook_url.trim().to_ascii_lowercase();
  normalized.starts_with("https://")
    || normalized.starts_with("http://localhost")
    || normalized.starts_with("http://127.0.0.1")
    || normalized.starts_with("http://[::1]")
}

fn webhook_host_from_url(webhook_url: &str) -> Option<String> {
  let trimmed = webhook_url.trim();
  let after_scheme = trimmed.split_once("://")?.1;
  let host = after_scheme.split('/').next()?.trim();
  if host.is_empty() {
    None
  } else {
    Some(host.to_string())
  }
}

fn inject_prompt_into_comfy_workflow(workflow: &mut Value, prompt: &str) -> usize {
  let mut replaced = 0_usize;
  let Some(map) = workflow.as_object_mut() else {
    return replaced;
  };

  for node in map.values_mut() {
    let Some(node_obj) = node.as_object_mut() else {
      continue;
    };
    let class_type = node_obj
      .get("class_type")
      .and_then(|value| value.as_str())
      .unwrap_or("")
      .to_string();
    let Some(inputs) = node_obj
      .get_mut("inputs")
      .and_then(|value| value.as_object_mut())
    else {
      continue;
    };

    if class_type.to_ascii_lowercase().contains("cliptextencode") {
      if let Some(text_value) = inputs.get_mut("text") {
        if text_value.is_string() {
          *text_value = Value::String(prompt.to_string());
          replaced += 1;
        }
      }
    }
  }

  replaced
}

async fn probe_local_runtime_health(
  connector_id: &str,
  provider: &str,
  endpoint: &str,
  probe_path: &str,
) -> Result<LocalRuntimeHealthProof, String> {
  let checked_at_ms = now_ms();
  let client = reqwest::Client::builder()
    .timeout(Duration::from_secs(10))
    .user_agent("Alphonso-LocalRuntimeHealth/0.1")
    .build()
    .map_err(|error| error.to_string())?;
  let response = client
    .get(format!("{endpoint}{probe_path}"))
    .send()
    .await
    .map_err(|error| error.to_string())?;
  let http_status = Some(response.status().as_u16());
  if !response.status().is_success() {
    return Ok(LocalRuntimeHealthProof {
      connector_id: connector_id.to_string(),
      provider: provider.to_string(),
      ok: false,
      endpoint: endpoint.to_string(),
      probe_path: probe_path.to_string(),
      http_status,
      checked_at_ms,
      trust: "failed".to_string(),
      message: format!("{provider} runtime responded but not successfully."),
      error: Some(format!("HTTP {}", response.status().as_u16())),
    });
  }

  Ok(LocalRuntimeHealthProof {
    connector_id: connector_id.to_string(),
    provider: provider.to_string(),
    ok: true,
    endpoint: endpoint.to_string(),
    probe_path: probe_path.to_string(),
    http_status,
    checked_at_ms,
    trust: "verified".to_string(),
    message: format!("{provider} runtime is reachable."),
    error: None,
  })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GithubActionProof {
  pub(crate) ok: bool,
  pub(crate) action: String,
  pub(crate) http_status: Option<u16>,
  pub(crate) data: Option<Value>,
  pub(crate) sent_at_ms: u64,
  pub(crate) trust: String,
  pub(crate) error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SlackSendProof {
  pub(crate) ok: bool,
  pub(crate) channel: String,
  pub(crate) ts: Option<String>,
  pub(crate) sent_at_ms: u64,
  pub(crate) trust: String,
  pub(crate) error: Option<String>,
}

#[tauri::command]
pub(crate) async fn connector_github_action(
  action: String,
  payload: Value,
) -> Result<GithubActionProof, String> {
  let sent_at_ms = now_ms();
  let token = std::env::var("GITHUB_TOKEN").unwrap_or_default();
  if token.trim().is_empty() {
    return Ok(GithubActionProof {
      ok: false,
      action,
      http_status: None,
      data: None,
      sent_at_ms,
      trust: "unverified".to_string(),
      error: Some("GITHUB_TOKEN is not configured.".to_string()),
    });
  }

  let clean_action = action.trim().to_string();
  if clean_action.is_empty() {
    return Ok(GithubActionProof {
      ok: false,
      action: clean_action,
      http_status: None,
      data: None,
      sent_at_ms,
      trust: "failed".to_string(),
      error: Some("action is required.".to_string()),
    });
  }

  let owner = payload
    .get("owner")
    .and_then(|value| value.as_str())
    .unwrap_or("");
  let repo = payload
    .get("repo")
    .and_then(|value| value.as_str())
    .unwrap_or("");

  let client = reqwest::Client::builder()
    .timeout(Duration::from_secs(30))
    .user_agent("Alphonso-GitHub-Connector/0.1")
    .build()
    .map_err(|error| error.to_string())?;

  let (method, url, body) = match clean_action.as_str() {
    "create_issue" => {
      if owner.is_empty() || repo.is_empty() {
        return Ok(GithubActionProof {
          ok: false,
          action: clean_action,
          http_status: None,
          data: None,
          sent_at_ms,
          trust: "failed".to_string(),
          error: Some("payload must include owner and repo.".to_string()),
        });
      }
      let issue_payload = serde_json::json!({
        "title": payload.get("title"),
        "body": payload.get("body"),
        "labels": payload.get("labels"),
      });
      (
        "POST",
        format!("https://api.github.com/repos/{owner}/{repo}/issues"),
        issue_payload,
      )
    }
    "dispatch_workflow" => {
      if owner.is_empty() || repo.is_empty() {
        return Ok(GithubActionProof {
          ok: false,
          action: clean_action,
          http_status: None,
          data: None,
          sent_at_ms,
          trust: "failed".to_string(),
          error: Some("payload must include owner and repo.".to_string()),
        });
      }
      let workflow_id = payload
        .get("workflow_id")
        .and_then(|value| value.as_str())
        .unwrap_or("");
      if workflow_id.is_empty() {
        return Ok(GithubActionProof {
          ok: false,
          action: clean_action,
          http_status: None,
          data: None,
          sent_at_ms,
          trust: "failed".to_string(),
          error: Some("payload must include workflow_id.".to_string()),
        });
      }
      let ref_name = payload
        .get("ref")
        .and_then(|value| value.as_str())
        .unwrap_or("main");
      let dispatch_payload = serde_json::json!({
        "ref": ref_name,
        "inputs": payload.get("inputs"),
      });
      (
        "POST",
        format!(
          "https://api.github.com/repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches"
        ),
        dispatch_payload,
      )
    }
    "create_pr" => {
      if owner.is_empty() || repo.is_empty() {
        return Ok(GithubActionProof {
          ok: false,
          action: clean_action,
          http_status: None,
          data: None,
          sent_at_ms,
          trust: "failed".to_string(),
          error: Some("payload must include owner and repo.".to_string()),
        });
      }
      let pr_payload = serde_json::json!({
        "title": payload.get("title"),
        "head": payload.get("head"),
        "base": payload.get("base").and_then(|value| value.as_str()).unwrap_or("main"),
        "body": payload.get("body"),
      });
      (
        "POST",
        format!("https://api.github.com/repos/{owner}/{repo}/pulls"),
        pr_payload,
      )
    }
    "get_repo" => {
      if owner.is_empty() || repo.is_empty() {
        return Ok(GithubActionProof {
          ok: false,
          action: clean_action,
          http_status: None,
          data: None,
          sent_at_ms,
          trust: "failed".to_string(),
          error: Some("payload must include owner and repo.".to_string()),
        });
      }
      (
        "GET",
        format!("https://api.github.com/repos/{owner}/{repo}"),
        Value::Null,
      )
    }
    "list_issues" => {
      if owner.is_empty() || repo.is_empty() {
        return Ok(GithubActionProof {
          ok: false,
          action: clean_action,
          http_status: None,
          data: None,
          sent_at_ms,
          trust: "failed".to_string(),
          error: Some("payload must include owner and repo.".to_string()),
        });
      }
      let state = payload
        .get("state")
        .and_then(|value| value.as_str())
        .unwrap_or("open");
      (
        "GET",
        format!("https://api.github.com/repos/{owner}/{repo}/issues?state={state}&per_page=20"),
        Value::Null,
      )
    }
    _ => {
      return Ok(GithubActionProof {
        ok: false,
        action: clean_action.clone(),
        http_status: None,
        data: None,
        sent_at_ms,
        trust: "failed".to_string(),
        error: Some(format!("Unsupported GitHub action: {clean_action}. Supported: create_issue, dispatch_workflow, create_pr, get_repo, list_issues")),
      });
    }
  };

  let request = match method {
    "POST" => client.post(&url).bearer_auth(token.trim()).json(&body),
    _ => client.get(&url).bearer_auth(token.trim()),
  };

  let response = request
    .header(reqwest::header::ACCEPT, "application/vnd.github.v3+json")
    .header(reqwest::header::USER_AGENT, "Alphonso-GitHub-Connector/0.1")
    .send()
    .await
    .map_err(|error| error.to_string())?;
  let http_status = response.status().as_u16();
  let response_body: Value = response.json().await.map_err(|error| error.to_string())?;

  if http_status >= 400 {
    let error_message = response_body
      .get("message")
      .and_then(|value| value.as_str())
      .unwrap_or("GitHub API request failed.")
      .to_string();
    return Ok(GithubActionProof {
      ok: false,
      action: clean_action,
      http_status: Some(http_status),
      data: Some(response_body),
      sent_at_ms,
      trust: "failed".to_string(),
      error: Some(error_message),
    });
  }

  Ok(GithubActionProof {
    ok: true,
    action: clean_action,
    http_status: Some(http_status),
    data: Some(response_body),
    sent_at_ms,
    trust: "verified".to_string(),
    error: None,
  })
}

#[tauri::command]
pub(crate) async fn connector_slack_send(
  channel: String,
  text: String,
  thread_ts: Option<String>,
) -> Result<SlackSendProof, String> {
  let sent_at_ms = now_ms();
  let token = std::env::var("SLACK_BOT_TOKEN").unwrap_or_default();
  if token.trim().is_empty() {
    return Ok(SlackSendProof {
      ok: false,
      channel,
      ts: None,
      sent_at_ms,
      trust: "unverified".to_string(),
      error: Some("SLACK_BOT_TOKEN is not configured.".to_string()),
    });
  }

  let clean_channel = channel.trim().to_string();
  let clean_text = text.trim().to_string();
  if clean_channel.is_empty() || clean_text.is_empty() {
    return Ok(SlackSendProof {
      ok: false,
      channel: clean_channel,
      ts: None,
      sent_at_ms,
      trust: "failed".to_string(),
      error: Some("channel and text are required.".to_string()),
    });
  }

  let client = reqwest::Client::builder()
    .timeout(Duration::from_secs(20))
    .user_agent("Alphonso-Slack-Connector/0.1")
    .build()
    .map_err(|error| error.to_string())?;

  let mut payload = serde_json::json!({
    "channel": clean_channel,
    "text": clean_text,
  });
  if let Some(ts) = thread_ts {
    let clean_ts = ts.trim().to_string();
    if !clean_ts.is_empty() {
      payload["thread_ts"] = Value::String(clean_ts);
    }
  }

  let response = client
    .post("https://slack.com/api/chat.postMessage")
    .bearer_auth(token.trim())
    .json(&payload)
    .send()
    .await
    .map_err(|error| error.to_string())?;
  let http_status = response.status().as_u16();
  let body: Value = response.json().await.map_err(|error| error.to_string())?;

  let slack_ok = body
    .get("ok")
    .and_then(|value| value.as_bool())
    .unwrap_or(false);
  let ts = body
    .get("ts")
    .and_then(|value| value.as_str())
    .map(|value| value.to_string());

  if http_status >= 400 || !slack_ok {
    let error_message = body
      .get("error")
      .and_then(|value| value.as_str())
      .unwrap_or("Slack chat.postMessage API call failed.");
    return Ok(SlackSendProof {
      ok: false,
      channel: clean_channel,
      ts: None,
      sent_at_ms,
      trust: "failed".to_string(),
      error: Some(format!("HTTP {http_status}: {error_message}")),
    });
  }

  Ok(SlackSendProof {
    ok: true,
    channel: clean_channel,
    ts,
    sent_at_ms,
    trust: "verified".to_string(),
    error: None,
  })
}

#[tauri::command]
pub(crate) async fn connector_send_whatsapp(
  rate_limiter: tauri::State<'_, crate::RateLimiter>,
  to: String,
  text: String,
) -> Result<ConnectorSendProof, String> {
  rate_limiter.check_and_record("connector_send_whatsapp")?;
  let sent_at_ms = now_ms();
  let provider = std::env::var("WHATSAPP_PROVIDER")
    .map(|value| value.trim().to_ascii_lowercase())
    .unwrap_or_else(|_| "cloud_api".to_string());
  let clean_to = to.trim().to_string();
  let clean_text = text.trim().to_string();
  if clean_to.is_empty() || clean_text.is_empty() {
    return Ok(ConnectorSendProof {
      connector_id: "whatsapp".to_string(),
      ok: false,
      target: clean_to,
      external_id: None,
      sent_at_ms,
      trust: "failed".to_string(),
      error: Some("target and text are required.".to_string()),
    });
  }

  let client = reqwest::Client::builder()
    .timeout(Duration::from_secs(20))
    .user_agent("Alphonso-WhatsApp-Bridge/0.1")
    .build()
    .map_err(|error| error.to_string())?;

  if provider == "twilio" {
    let account_sid = std::env::var("WHATSAPP_TWILIO_ACCOUNT_SID").unwrap_or_default();
    let auth_token = std::env::var("WHATSAPP_TWILIO_AUTH_TOKEN").unwrap_or_default();
    let from_number = std::env::var("WHATSAPP_TWILIO_FROM").unwrap_or_default();
    if account_sid.trim().is_empty()
      || auth_token.trim().is_empty()
      || from_number.trim().is_empty()
    {
      return Ok(ConnectorSendProof {
        connector_id: "whatsapp".to_string(),
        ok: false,
        target: clean_to,
        external_id: None,
        sent_at_ms,
        trust: "unverified".to_string(),
        error: Some("Twilio provider is selected, but WHATSAPP_TWILIO_ACCOUNT_SID, WHATSAPP_TWILIO_AUTH_TOKEN, or WHATSAPP_TWILIO_FROM is missing.".to_string()),
      });
    }

    let endpoint = format!(
      "https://api.twilio.com/2010-04-01/Accounts/{}/Messages.json",
      account_sid.trim()
    );
    let formatted_to = if clean_to.starts_with("whatsapp:") {
      clean_to.clone()
    } else {
      format!("whatsapp:{clean_to}")
    };
    let formatted_from = if from_number.trim().starts_with("whatsapp:") {
      from_number.trim().to_string()
    } else {
      format!("whatsapp:{}", from_number.trim())
    };
    let form = [
      ("To", formatted_to.clone()),
      ("From", formatted_from),
      ("Body", clean_text.clone()),
    ];

    let response = client
      .post(endpoint)
      .basic_auth(account_sid.trim(), Some(auth_token.trim()))
      .form(&form)
      .send()
      .await
      .map_err(|error| error.to_string())?;
    let status = response.status();
    let body: Value = response.json().await.map_err(|error| error.to_string())?;
    if !status.is_success() {
      let error_message = body
        .get("message")
        .and_then(|value| value.as_str())
        .unwrap_or("Twilio WhatsApp send failed.");
      return Ok(ConnectorSendProof {
        connector_id: "whatsapp".to_string(),
        ok: false,
        target: formatted_to,
        external_id: None,
        sent_at_ms,
        trust: "failed".to_string(),
        error: Some(error_message.to_string()),
      });
    }
    let external_id = body
      .get("sid")
      .and_then(|value| value.as_str())
      .map(|value| value.to_string());
    return Ok(ConnectorSendProof {
      connector_id: "whatsapp".to_string(),
      ok: true,
      target: formatted_to,
      external_id,
      sent_at_ms,
      trust: "verified".to_string(),
      error: None,
    });
  }

  let access_token = std::env::var("WHATSAPP_ACCESS_TOKEN").unwrap_or_default();
  let phone_number_id = std::env::var("WHATSAPP_PHONE_NUMBER_ID").unwrap_or_default();
  if access_token.trim().is_empty() || phone_number_id.trim().is_empty() {
    return Ok(ConnectorSendProof {
      connector_id: "whatsapp".to_string(),
      ok: false,
      target: clean_to,
      external_id: None,
      sent_at_ms,
      trust: "unverified".to_string(),
      error: Some("Cloud API provider is selected, but WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID is missing.".to_string()),
    });
  }

  let endpoint = format!(
    "https://graph.facebook.com/v20.0/{}/messages",
    phone_number_id.trim()
  );
  let payload = serde_json::json!({
    "messaging_product": "whatsapp",
    "to": clean_to,
    "type": "text",
    "text": { "body": clean_text, "preview_url": false }
  });

  let response = client
    .post(endpoint)
    .bearer_auth(access_token.trim())
    .json(&payload)
    .send()
    .await
    .map_err(|error| error.to_string())?;
  let status = response.status();
  let body: Value = response.json().await.map_err(|error| error.to_string())?;
  if !status.is_success() {
    let error_message = body
      .get("error")
      .and_then(|value| value.get("message"))
      .and_then(|value| value.as_str())
      .unwrap_or("WhatsApp Cloud API send failed.");
    return Ok(ConnectorSendProof {
      connector_id: "whatsapp".to_string(),
      ok: false,
      target: payload
        .get("to")
        .and_then(|value| value.as_str())
        .unwrap_or_default()
        .to_string(),
      external_id: None,
      sent_at_ms,
      trust: "failed".to_string(),
      error: Some(error_message.to_string()),
    });
  }
  let external_id = body
    .get("messages")
    .and_then(|value| value.as_array())
    .and_then(|rows| rows.first())
    .and_then(|first| first.get("id"))
    .and_then(|value| value.as_str())
    .map(|value| value.to_string());
  Ok(ConnectorSendProof {
    connector_id: "whatsapp".to_string(),
    ok: true,
    target: payload
      .get("to")
      .and_then(|value| value.as_str())
      .unwrap_or_default()
      .to_string(),
    external_id,
    sent_at_ms,
    trust: "verified".to_string(),
    error: None,
  })
}

#[tauri::command]
pub(crate) async fn connector_send_notion(
  title: String,
  content: String,
  parent_page_id: Option<String>,
) -> Result<ConnectorSendProof, String> {
  let sent_at_ms = now_ms();
  let token = std::env::var("NOTION_API_KEY").unwrap_or_default();
  if token.trim().is_empty() {
    return Ok(ConnectorSendProof {
      connector_id: "notion".to_string(),
      ok: false,
      target: "notion".to_string(),
      external_id: None,
      sent_at_ms,
      trust: "unverified".to_string(),
      error: Some("NOTION_API_KEY is not configured.".to_string()),
    });
  }

  let clean_title = title.trim().to_string();
  let clean_content = content.trim().to_string();
  if clean_title.is_empty() {
    return Ok(ConnectorSendProof {
      connector_id: "notion".to_string(),
      ok: false,
      target: "notion".to_string(),
      external_id: None,
      sent_at_ms,
      trust: "failed".to_string(),
      error: Some("title is required.".to_string()),
    });
  }

  let env_parent = std::env::var("NOTION_PARENT_PAGE_ID").unwrap_or_default();
  let target_parent = parent_page_id.unwrap_or_default().trim().to_string();
  let parent = if !target_parent.is_empty() {
    target_parent
  } else {
    env_parent.trim().to_string()
  };
  if parent.is_empty() {
    return Ok(ConnectorSendProof {
      connector_id: "notion".to_string(),
      ok: false,
      target: "notion".to_string(),
      external_id: None,
      sent_at_ms,
      trust: "unverified".to_string(),
      error: Some(
        "NOTION_PARENT_PAGE_ID is missing and no parent_page_id override was provided.".to_string(),
      ),
    });
  }

  let client = reqwest::Client::builder()
    .timeout(Duration::from_secs(20))
    .user_agent("Alphonso-Notion-Bridge/0.1")
    .build()
    .map_err(|error| error.to_string())?;

  let payload = serde_json::json!({
    "parent": { "page_id": parent },
    "properties": {
      "title": {
        "title": [
          {
            "type": "text",
            "text": { "content": clean_title }
          }
        ]
      }
    },
    "children": [
      {
        "object": "block",
        "type": "paragraph",
        "paragraph": {
          "rich_text": [
            {
              "type": "text",
              "text": { "content": if clean_content.is_empty() { "Created by Alphonso connector." } else { &clean_content } }
            }
          ]
        }
      }
    ]
  });

  let response = client
    .post("https://api.notion.com/v1/pages")
    .bearer_auth(token.trim())
    .header("Notion-Version", "2022-06-28")
    .json(&payload)
    .send()
    .await
    .map_err(|error| error.to_string())?;
  let status = response.status();
  let body: Value = response.json().await.map_err(|error| error.to_string())?;
  if !status.is_success() {
    let error_message = body
      .get("message")
      .and_then(|value| value.as_str())
      .or_else(|| body.get("error").and_then(|value| value.as_str()))
      .unwrap_or("Notion create page failed.");
    return Ok(ConnectorSendProof {
      connector_id: "notion".to_string(),
      ok: false,
      target: "notion".to_string(),
      external_id: None,
      sent_at_ms,
      trust: "failed".to_string(),
      error: Some(error_message.to_string()),
    });
  }

  let external_id = body
    .get("id")
    .and_then(|value| value.as_str())
    .map(|value| value.to_string());
  Ok(ConnectorSendProof {
    connector_id: "notion".to_string(),
    ok: true,
    target: "notion".to_string(),
    external_id,
    sent_at_ms,
    trust: "verified".to_string(),
    error: None,
  })
}

#[tauri::command]
pub(crate) async fn connector_send_clickup(
  title: String,
  content: String,
  list_id: Option<String>,
) -> Result<ConnectorSendProof, String> {
  let sent_at_ms = now_ms();
  let token = std::env::var("CLICKUP_API_KEY").unwrap_or_default();
  if token.trim().is_empty() {
    return Ok(ConnectorSendProof {
      connector_id: "clickup".to_string(),
      ok: false,
      target: "clickup".to_string(),
      external_id: None,
      sent_at_ms,
      trust: "unverified".to_string(),
      error: Some("CLICKUP_API_KEY is not configured.".to_string()),
    });
  }

  let clean_title = title.trim().to_string();
  let clean_content = content.trim().to_string();
  if clean_title.is_empty() {
    return Ok(ConnectorSendProof {
      connector_id: "clickup".to_string(),
      ok: false,
      target: "clickup".to_string(),
      external_id: None,
      sent_at_ms,
      trust: "failed".to_string(),
      error: Some("title is required.".to_string()),
    });
  }

  let env_list = std::env::var("CLICKUP_LIST_ID").unwrap_or_default();
  let target_list = list_id.unwrap_or_default().trim().to_string();
  let effective_list = if !target_list.is_empty() {
    target_list
  } else {
    env_list.trim().to_string()
  };
  if effective_list.is_empty() {
    return Ok(ConnectorSendProof {
      connector_id: "clickup".to_string(),
      ok: false,
      target: "clickup".to_string(),
      external_id: None,
      sent_at_ms,
      trust: "unverified".to_string(),
      error: Some("CLICKUP_LIST_ID is missing and no list_id override was provided.".to_string()),
    });
  }

  let client = reqwest::Client::builder()
    .timeout(Duration::from_secs(20))
    .user_agent("Alphonso-ClickUp-Bridge/0.1")
    .build()
    .map_err(|error| error.to_string())?;

  let endpoint = format!(
    "https://api.clickup.com/api/v2/list/{}/task",
    effective_list
  );
  let payload = serde_json::json!({
    "name": clean_title,
    "description": if clean_content.is_empty() { "Created by Alphonso connector." } else { clean_content.as_str() },
    "status": "to do"
  });

  let response = client
    .post(endpoint)
    .header("Authorization", token.trim())
    .header("Content-Type", "application/json")
    .json(&payload)
    .send()
    .await
    .map_err(|error| error.to_string())?;
  let status = response.status();
  let body: Value = response.json().await.map_err(|error| error.to_string())?;
  if !status.is_success() {
    let error_message = body
      .get("err")
      .and_then(|value| value.as_str())
      .or_else(|| body.get("error").and_then(|value| value.as_str()))
      .unwrap_or("ClickUp create task failed.");
    return Ok(ConnectorSendProof {
      connector_id: "clickup".to_string(),
      ok: false,
      target: effective_list,
      external_id: None,
      sent_at_ms,
      trust: "failed".to_string(),
      error: Some(error_message.to_string()),
    });
  }

  let external_id = body
    .get("id")
    .and_then(|value| value.as_str())
    .map(|value| value.to_string());
  Ok(ConnectorSendProof {
    connector_id: "clickup".to_string(),
    ok: true,
    target: effective_list,
    external_id,
    sent_at_ms,
    trust: "verified".to_string(),
    error: None,
  })
}

#[tauri::command]
pub(crate) async fn tool_connection_post_webhook(
  webhook_url: String,
  payload: Value,
  platform: Option<String>,
  connection_name: Option<String>,
) -> Result<WebhookPostProof, String> {
  let sent_at_ms = now_ms();
  let clean_url = webhook_url.trim().to_string();
  if clean_url.is_empty() {
    return Ok(WebhookPostProof {
      ok: false,
      platform: platform.unwrap_or_else(|| "custom".to_string()),
      connection_name,
      webhook_host: None,
      http_status: None,
      response_preview: None,
      sent_at_ms,
      trust: "failed".to_string(),
      error: Some("webhook_url is required.".to_string()),
    });
  }

  if !is_allowed_webhook_url(&clean_url) {
    return Ok(WebhookPostProof {
      ok: false,
      platform: platform.unwrap_or_else(|| "custom".to_string()),
      connection_name,
      webhook_host: webhook_host_from_url(&clean_url),
      http_status: None,
      response_preview: None,
      sent_at_ms,
      trust: "failed".to_string(),
      error: Some(
        "Webhook URLs must use https or localhost/http loopback for local testing.".to_string(),
      ),
    });
  }

  let client = reqwest::Client::builder()
    .timeout(Duration::from_secs(20))
    .user_agent("Alphonso-Webhook-Bridge/0.1")
    .build()
    .map_err(|error| error.to_string())?;

  let response = client
    .post(&clean_url)
    .json(&payload)
    .send()
    .await
    .map_err(|error| error.to_string())?;
  let status = response.status();
  let body = response.text().await.map_err(|error| error.to_string())?;
  let preview = {
    let trimmed = body.trim();
    if trimmed.is_empty() {
      None
    } else {
      Some(trimmed.chars().take(240).collect::<String>())
    }
  };

  if !status.is_success() {
    return Ok(WebhookPostProof {
      ok: false,
      platform: platform.unwrap_or_else(|| "custom".to_string()),
      connection_name,
      webhook_host: webhook_host_from_url(&clean_url),
      http_status: Some(status.as_u16()),
      response_preview: preview,
      sent_at_ms,
      trust: "failed".to_string(),
      error: Some(format!("Webhook POST returned HTTP {}", status.as_u16())),
    });
  }

  Ok(WebhookPostProof {
    ok: true,
    platform: platform.unwrap_or_else(|| "custom".to_string()),
    connection_name,
    webhook_host: webhook_host_from_url(&clean_url),
    http_status: Some(status.as_u16()),
    response_preview: preview,
    sent_at_ms,
    trust: "verified".to_string(),
    error: None,
  })
}

#[tauri::command]
pub(crate) async fn connector_poll_whatsapp(
  limit: Option<u16>,
) -> Result<ConnectorPollProof, String> {
  let checked_at_ms = now_ms();
  let provider = std::env::var("WHATSAPP_PROVIDER")
    .map(|value| value.trim().to_ascii_lowercase())
    .unwrap_or_else(|_| "cloud_api".to_string());
  if provider != "twilio" {
    return Ok(ConnectorPollProof {
      connector_id: "whatsapp".to_string(),
      ok: false,
      count: 0,
      cursor: None,
      messages: vec![],
      checked_at_ms,
      trust: "placeholder".to_string(),
      error: Some("Inbound polling is only supported for WHATSAPP_PROVIDER=twilio. Cloud API inbound requires webhook wiring.".to_string()),
    });
  }

  let account_sid = std::env::var("WHATSAPP_TWILIO_ACCOUNT_SID").unwrap_or_default();
  let auth_token = std::env::var("WHATSAPP_TWILIO_AUTH_TOKEN").unwrap_or_default();
  let from_number = std::env::var("WHATSAPP_TWILIO_FROM").unwrap_or_default();
  if account_sid.trim().is_empty() || auth_token.trim().is_empty() || from_number.trim().is_empty()
  {
    return Ok(ConnectorPollProof {
      connector_id: "whatsapp".to_string(),
      ok: false,
      count: 0,
      cursor: None,
      messages: vec![],
      checked_at_ms,
      trust: "unverified".to_string(),
      error: Some("Twilio inbound polling requires WHATSAPP_TWILIO_ACCOUNT_SID, WHATSAPP_TWILIO_AUTH_TOKEN, and WHATSAPP_TWILIO_FROM.".to_string()),
    });
  }

  let max = limit.unwrap_or(15).clamp(1, 50);
  let formatted_from = if from_number.trim().starts_with("whatsapp:") {
    from_number.trim().to_string()
  } else {
    format!("whatsapp:{}", from_number.trim())
  };

  let endpoint = format!(
    "https://api.twilio.com/2010-04-01/Accounts/{}/Messages.json",
    account_sid.trim()
  );
  let client = reqwest::Client::builder()
    .timeout(Duration::from_secs(20))
    .user_agent("Alphonso-WhatsApp-Bridge/0.1")
    .build()
    .map_err(|error| error.to_string())?;

  let response = client
    .get(endpoint)
    .basic_auth(account_sid.trim(), Some(auth_token.trim()))
    .query(&[
      ("PageSize", max.to_string()),
      ("To", formatted_from.clone()),
    ])
    .send()
    .await
    .map_err(|error| error.to_string())?;
  let status = response.status();
  let body: Value = response.json().await.map_err(|error| error.to_string())?;
  if !status.is_success() {
    let error_message = body
      .get("message")
      .and_then(|value| value.as_str())
      .unwrap_or("Twilio message poll failed.");
    return Ok(ConnectorPollProof {
      connector_id: "whatsapp".to_string(),
      ok: false,
      count: 0,
      cursor: None,
      messages: vec![],
      checked_at_ms,
      trust: "failed".to_string(),
      error: Some(error_message.to_string()),
    });
  }

  let mut messages: Vec<ConnectorInboundMessage> = vec![];
  if let Some(rows) = body.get("messages").and_then(|value| value.as_array()) {
    for row in rows {
      let direction = row
        .get("direction")
        .and_then(|value| value.as_str())
        .unwrap_or("");
      if direction != "inbound" {
        continue;
      }
      let from = row
        .get("from")
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .to_string();
      let to = row
        .get("to")
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .to_string();
      if to != formatted_from {
        continue;
      }
      let text = row
        .get("body")
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
      if text.is_empty() {
        continue;
      }
      let sid = row
        .get("sid")
        .and_then(|value| value.as_str())
        .unwrap_or("0");
      messages.push(ConnectorInboundMessage {
        update_id: 0,
        chat_id: from.clone(),
        from_id: Some(from),
        text,
        date_unix: None,
        received_at_ms: checked_at_ms,
      });
      if messages.len() >= usize::from(max) {
        break;
      }
      if sid.is_empty() {
        continue;
      }
    }
  }

  Ok(ConnectorPollProof {
    connector_id: "whatsapp".to_string(),
    ok: true,
    count: messages.len(),
    cursor: None,
    messages,
    checked_at_ms,
    trust: "verified".to_string(),
    error: None,
  })
}

#[tauri::command]
pub(crate) async fn connector_send_chatgpt(
  http_client: tauri::State<'_, reqwest::Client>,
  text: String,
) -> Result<ConnectorSendProof, String> {
  let sent_at_ms = now_ms();
  let key = std::env::var("OPENAI_API_KEY").unwrap_or_default();
  if key.trim().is_empty() {
    return Ok(ConnectorSendProof {
      connector_id: "chatgpt".to_string(),
      ok: false,
      target: "chatgpt".to_string(),
      external_id: None,
      sent_at_ms,
      trust: "unverified".to_string(),
      error: Some("OPENAI_API_KEY is not configured.".to_string()),
    });
  }

  let clean_text = text.trim().to_string();
  if clean_text.is_empty() {
    return Ok(ConnectorSendProof {
      connector_id: "chatgpt".to_string(),
      ok: false,
      target: "chatgpt".to_string(),
      external_id: None,
      sent_at_ms,
      trust: "failed".to_string(),
      error: Some("text is required.".to_string()),
    });
  }

  let model =
    std::env::var("OPENAI_CONNECTOR_MODEL").unwrap_or_else(|_| "gpt-4.1-mini".to_string());
  let client = http_client.inner();
  let payload = serde_json::json!({
    "model": model,
    "input": clean_text
  });
  let response = client
    .post("https://api.openai.com/v1/responses")
    .bearer_auth(key.trim())
    .header("Content-Type", "application/json")
    .json(&payload)
    .send()
    .await
    .map_err(|error| error.to_string())?;
  let status = response.status();
  let body: Value = response.json().await.map_err(|error| error.to_string())?;
  if !status.is_success() {
    let message = body
      .get("error")
      .and_then(|value| value.get("message"))
      .and_then(|value| value.as_str())
      .unwrap_or("OpenAI responses API call failed.");
    return Ok(ConnectorSendProof {
      connector_id: "chatgpt".to_string(),
      ok: false,
      target: model,
      external_id: None,
      sent_at_ms,
      trust: "failed".to_string(),
      error: Some(message.to_string()),
    });
  }
  let external_id = body
    .get("id")
    .and_then(|value| value.as_str())
    .map(|value| value.to_string());
  Ok(ConnectorSendProof {
    connector_id: "chatgpt".to_string(),
    ok: true,
    target: model,
    external_id,
    sent_at_ms,
    trust: "verified".to_string(),
    error: None,
  })
}

#[tauri::command]
pub(crate) async fn connector_send_claude(
  http_client: tauri::State<'_, reqwest::Client>,
  text: String,
) -> Result<ConnectorSendProof, String> {
  let sent_at_ms = now_ms();
  let key = std::env::var("ANTHROPIC_API_KEY").unwrap_or_default();
  if key.trim().is_empty() {
    return Ok(ConnectorSendProof {
      connector_id: "claude".to_string(),
      ok: false,
      target: "claude".to_string(),
      external_id: None,
      sent_at_ms,
      trust: "unverified".to_string(),
      error: Some("ANTHROPIC_API_KEY is not configured.".to_string()),
    });
  }

  let clean_text = text.trim().to_string();
  if clean_text.is_empty() {
    return Ok(ConnectorSendProof {
      connector_id: "claude".to_string(),
      ok: false,
      target: "claude".to_string(),
      external_id: None,
      sent_at_ms,
      trust: "failed".to_string(),
      error: Some("text is required.".to_string()),
    });
  }

  let model = std::env::var("CLAUDE_CONNECTOR_MODEL")
    .unwrap_or_else(|_| "claude-3-5-sonnet-latest".to_string());
  let client = http_client.inner();
  let payload = serde_json::json!({
    "model": model,
    "max_tokens": 512,
    "messages": [
      { "role": "user", "content": clean_text }
    ]
  });
  let response = client
    .post("https://api.anthropic.com/v1/messages")
    .header("x-api-key", key.trim())
    .header("anthropic-version", "2023-06-01")
    .header("content-type", "application/json")
    .json(&payload)
    .send()
    .await
    .map_err(|error| error.to_string())?;
  let status = response.status();
  let body: Value = response.json().await.map_err(|error| error.to_string())?;
  if !status.is_success() {
    let message = body
      .get("error")
      .and_then(|value| value.get("message"))
      .and_then(|value| value.as_str())
      .unwrap_or("Anthropic messages API call failed.");
    return Ok(ConnectorSendProof {
      connector_id: "claude".to_string(),
      ok: false,
      target: model,
      external_id: None,
      sent_at_ms,
      trust: "failed".to_string(),
      error: Some(message.to_string()),
    });
  }
  let external_id = body
    .get("id")
    .and_then(|value| value.as_str())
    .map(|value| value.to_string());
  Ok(ConnectorSendProof {
    connector_id: "claude".to_string(),
    ok: true,
    target: model,
    external_id,
    sent_at_ms,
    trust: "verified".to_string(),
    error: None,
  })
}

#[tauri::command]
pub(crate) async fn connector_send_qwen(
  http_client: tauri::State<'_, reqwest::Client>,
  text: String,
) -> Result<ConnectorSendProof, String> {
  let sent_at_ms = now_ms();
  let key = std::env::var("DASHSCOPE_API_KEY").unwrap_or_default();
  if key.trim().is_empty() {
    return Ok(ConnectorSendProof {
      connector_id: "qwen".to_string(),
      ok: false,
      target: "qwen".to_string(),
      external_id: None,
      sent_at_ms,
      trust: "unverified".to_string(),
      error: Some("DASHSCOPE_API_KEY is not configured.".to_string()),
    });
  }

  let clean_text = text.trim().to_string();
  if clean_text.is_empty() {
    return Ok(ConnectorSendProof {
      connector_id: "qwen".to_string(),
      ok: false,
      target: "qwen".to_string(),
      external_id: None,
      sent_at_ms,
      trust: "failed".to_string(),
      error: Some("text is required.".to_string()),
    });
  }

  let model = std::env::var("QWEN_CONNECTOR_MODEL").unwrap_or_else(|_| "qwen-plus".to_string());
  let base_url = std::env::var("QWEN_CONNECTOR_BASE_URL")
    .unwrap_or_else(|_| "https://dashscope-intl.aliyuncs.com/compatible-mode/v1".to_string())
    .trim_end_matches('/')
    .to_string();
  let endpoint = format!("{}/chat/completions", base_url);
  let client = http_client.inner();
  let payload = serde_json::json!({
    "model": model,
    "messages": [
      { "role": "user", "content": clean_text }
    ]
  });
  let response = client
    .post(endpoint)
    .bearer_auth(key.trim())
    .header("Content-Type", "application/json")
    .json(&payload)
    .send()
    .await
    .map_err(|error| error.to_string())?;
  let status = response.status();
  let body: Value = response.json().await.map_err(|error| error.to_string())?;
  if !status.is_success() {
    let message = body
      .get("error")
      .and_then(|value| value.get("message"))
      .and_then(|value| value.as_str())
      .or_else(|| body.get("message").and_then(|value| value.as_str()))
      .unwrap_or("Qwen chat completions API call failed.");
    return Ok(ConnectorSendProof {
      connector_id: "qwen".to_string(),
      ok: false,
      target: model,
      external_id: None,
      sent_at_ms,
      trust: "failed".to_string(),
      error: Some(message.to_string()),
    });
  }
  let external_id = body
    .get("id")
    .and_then(|value| value.as_str())
    .map(|value| value.to_string());
  Ok(ConnectorSendProof {
    connector_id: "qwen".to_string(),
    ok: true,
    target: model,
    external_id,
    sent_at_ms,
    trust: "verified".to_string(),
    error: None,
  })
}

#[tauri::command]
pub(crate) async fn connector_generate_sdwebui_image(
  prompt: String,
  negative_prompt: Option<String>,
  width: Option<u32>,
  height: Option<u32>,
  steps: Option<u16>,
  cfg_scale: Option<f32>,
) -> Result<MediaGenerationProof, String> {
  let queued_at_ms = now_ms();
  let clean_prompt = prompt.trim().to_string();
  if clean_prompt.is_empty() {
    return Ok(MediaGenerationProof {
      connector_id: "sd_webui".to_string(),
      ok: false,
      provider: "automatic1111".to_string(),
      job_id: None,
      output_paths: vec![],
      preview_base64: None,
      queued_at_ms,
      trust: "failed".to_string(),
      message: "Prompt is required.".to_string(),
      error: Some("Prompt is required.".to_string()),
    });
  }

  let endpoint = std::env::var("LOCAL_SDWEBUI_ENDPOINT")
    .unwrap_or_else(|_| "http://127.0.0.1:7860".to_string())
    .trim_end_matches('/')
    .to_string();
  let width = width.unwrap_or(768).clamp(256, 1536);
  let height = height.unwrap_or(768).clamp(256, 1536);
  let steps = steps.unwrap_or(24).clamp(6, 60);
  let cfg_scale = cfg_scale.unwrap_or(7.0).clamp(1.0, 20.0);
  let clean_negative = negative_prompt.unwrap_or_default().trim().to_string();
  let auth = std::env::var("LOCAL_SDWEBUI_BASIC_AUTH").unwrap_or_default();
  let mut auth_parts = auth.splitn(2, ':');
  let auth_user = auth_parts.next().unwrap_or("").trim().to_string();
  let auth_pass = auth_parts.next().unwrap_or("").trim().to_string();
  let use_basic_auth = !auth_user.is_empty() && !auth_pass.is_empty();

  let payload = serde_json::json!({
    "prompt": clean_prompt,
    "negative_prompt": clean_negative,
    "width": width,
    "height": height,
    "steps": steps,
    "cfg_scale": cfg_scale,
    "sampler_name": "DPM++ 2M Karras",
    "batch_size": 1,
    "n_iter": 1,
    "send_images": true,
    "save_images": false
  });

  let client = reqwest::Client::builder()
    .timeout(Duration::from_secs(180))
    .user_agent("Alphonso-Miya-SDWebUI/0.1")
    .build()
    .map_err(|error| error.to_string())?;
  let mut request = client
    .post(format!("{endpoint}/sdapi/v1/txt2img"))
    .json(&payload);
  if use_basic_auth {
    request = request.basic_auth(auth_user, Some(auth_pass));
  }

  let response = request.send().await.map_err(|error| error.to_string())?;
  let status = response.status();
  let body: Value = response.json().await.map_err(|error| error.to_string())?;
  if !status.is_success() {
    let error_message = body
      .get("error")
      .and_then(|value| value.as_str())
      .or_else(|| body.get("detail").and_then(|value| value.as_str()))
      .unwrap_or("Stable Diffusion txt2img request failed.");
    return Ok(MediaGenerationProof {
      connector_id: "sd_webui".to_string(),
      ok: false,
      provider: "automatic1111".to_string(),
      job_id: None,
      output_paths: vec![],
      preview_base64: None,
      queued_at_ms,
      trust: "failed".to_string(),
      message: "Image generation request failed.".to_string(),
      error: Some(error_message.to_string()),
    });
  }

  let images = body
    .get("images")
    .and_then(|value| value.as_array())
    .cloned()
    .unwrap_or_default();
  let preview_base64 = images
    .first()
    .and_then(|value| value.as_str())
    .map(|value| value.to_string());
  let image_count = images.len();
  if image_count == 0 {
    return Ok(MediaGenerationProof {
      connector_id: "sd_webui".to_string(),
      ok: false,
      provider: "automatic1111".to_string(),
      job_id: None,
      output_paths: vec![],
      preview_base64: None,
      queued_at_ms,
      trust: "failed".to_string(),
      message: "No image payload returned by local SD WebUI.".to_string(),
      error: Some("Local SD WebUI returned no images.".to_string()),
    });
  }

  Ok(MediaGenerationProof {
    connector_id: "sd_webui".to_string(),
    ok: true,
    provider: "automatic1111".to_string(),
    job_id: None,
    output_paths: vec![],
    preview_base64,
    queued_at_ms,
    trust: "verified".to_string(),
    message: format!("Generated {image_count} image(s) using local SD WebUI."),
    error: None,
  })
}

#[tauri::command]
pub(crate) async fn connector_check_local_runtime_health(
  connector_id: String,
) -> Result<LocalRuntimeHealthProof, String> {
  let clean_id = connector_id.trim();
  match clean_id {
    "sd_webui" => {
      let endpoint = std::env::var("LOCAL_SDWEBUI_ENDPOINT")
        .unwrap_or_else(|_| "http://127.0.0.1:7860".to_string())
        .trim_end_matches('/')
        .to_string();
      probe_local_runtime_health("sd_webui", "automatic1111", &endpoint, "/sdapi/v1/samplers").await
    }
    "comfyui_video" => {
      let endpoint = std::env::var("COMFYUI_ENDPOINT")
        .unwrap_or_else(|_| "http://127.0.0.1:8188".to_string())
        .trim_end_matches('/')
        .to_string();
      probe_local_runtime_health("comfyui_video", "comfyui", &endpoint, "/system_stats").await
    }
    _ => Err(format!("Unsupported local runtime connector: {clean_id}")),
  }
}

#[tauri::command]
pub(crate) async fn connector_queue_comfyui_video(
  prompt: String,
  workflow_json: String,
) -> Result<MediaGenerationProof, String> {
  let queued_at_ms = now_ms();
  let clean_prompt = prompt.trim().to_string();
  if clean_prompt.is_empty() {
    return Ok(MediaGenerationProof {
      connector_id: "comfyui_video".to_string(),
      ok: false,
      provider: "comfyui".to_string(),
      job_id: None,
      output_paths: vec![],
      preview_base64: None,
      queued_at_ms,
      trust: "failed".to_string(),
      message: "Prompt is required.".to_string(),
      error: Some("Prompt is required.".to_string()),
    });
  }

  let mut workflow: Value = match serde_json::from_str(&workflow_json) {
    Ok(value) => value,
    Err(error) => {
      return Ok(MediaGenerationProof {
        connector_id: "comfyui_video".to_string(),
        ok: false,
        provider: "comfyui".to_string(),
        job_id: None,
        output_paths: vec![],
        preview_base64: None,
        queued_at_ms,
        trust: "failed".to_string(),
        message: "Workflow JSON is invalid.".to_string(),
        error: Some(error.to_string()),
      });
    }
  };

  let replaced = inject_prompt_into_comfy_workflow(&mut workflow, &clean_prompt);
  if replaced == 0 {
    return Ok(MediaGenerationProof {
      connector_id: "comfyui_video".to_string(),
      ok: false,
      provider: "comfyui".to_string(),
      job_id: None,
      output_paths: vec![],
      preview_base64: None,
      queued_at_ms,
      trust: "unverified".to_string(),
      message: "Workflow has no CLIPTextEncode text inputs to inject prompt.".to_string(),
      error: Some("Provide a workflow with CLIPTextEncode text input nodes.".to_string()),
    });
  }

  let endpoint = std::env::var("COMFYUI_ENDPOINT")
    .unwrap_or_else(|_| "http://127.0.0.1:8188".to_string())
    .trim_end_matches('/')
    .to_string();
  let client = reqwest::Client::builder()
    .timeout(Duration::from_secs(120))
    .user_agent("Alphonso-Miya-ComfyUI/0.1")
    .build()
    .map_err(|error| error.to_string())?;
  let payload = serde_json::json!({
    "prompt": workflow
  });

  let response = client
    .post(format!("{endpoint}/prompt"))
    .json(&payload)
    .send()
    .await
    .map_err(|error| error.to_string())?;
  let status = response.status();
  let body: Value = response.json().await.map_err(|error| error.to_string())?;
  if !status.is_success() {
    let error_message = body
      .get("error")
      .and_then(|value| value.as_str())
      .or_else(|| body.get("detail").and_then(|value| value.as_str()))
      .unwrap_or("ComfyUI prompt queue request failed.");
    return Ok(MediaGenerationProof {
      connector_id: "comfyui_video".to_string(),
      ok: false,
      provider: "comfyui".to_string(),
      job_id: None,
      output_paths: vec![],
      preview_base64: None,
      queued_at_ms,
      trust: "failed".to_string(),
      message: "ComfyUI queue request failed.".to_string(),
      error: Some(error_message.to_string()),
    });
  }

  let job_id = body
    .get("prompt_id")
    .and_then(|value| value.as_str())
    .map(|value| value.to_string());

  Ok(MediaGenerationProof {
    connector_id: "comfyui_video".to_string(),
    ok: true,
    provider: "comfyui".to_string(),
    job_id: job_id.clone(),
    output_paths: vec![],
    preview_base64: None,
    queued_at_ms,
    trust: "verified".to_string(),
    message: if let Some(job_id) = job_id {
      format!("ComfyUI video workflow queued. prompt_id={job_id}")
    } else {
      "ComfyUI workflow queued, but prompt_id was not returned.".to_string()
    },
    error: None,
  })
}

#[tauri::command]
pub(crate) async fn connector_get_comfyui_history(
  prompt_id: String,
) -> Result<MediaGenerationProof, String> {
  let queued_at_ms = now_ms();
  let clean_id = prompt_id.trim().to_string();
  if clean_id.is_empty() {
    return Ok(MediaGenerationProof {
      connector_id: "comfyui_video".to_string(),
      ok: false,
      provider: "comfyui".to_string(),
      job_id: None,
      output_paths: vec![],
      preview_base64: None,
      queued_at_ms,
      trust: "failed".to_string(),
      message: "prompt_id is required.".to_string(),
      error: Some("prompt_id is required.".to_string()),
    });
  }

  let endpoint = std::env::var("COMFYUI_ENDPOINT")
    .unwrap_or_else(|_| "http://127.0.0.1:8188".to_string())
    .trim_end_matches('/')
    .to_string();
  let client = reqwest::Client::builder()
    .timeout(Duration::from_secs(30))
    .user_agent("Alphonso-Miya-ComfyUI/0.1")
    .build()
    .map_err(|error| error.to_string())?;
  let response = client
    .get(format!("{endpoint}/history/{clean_id}"))
    .send()
    .await
    .map_err(|error| error.to_string())?;
  let status = response.status();
  let body: Value = response.json().await.map_err(|error| error.to_string())?;

  if !status.is_success() {
    return Ok(MediaGenerationProof {
      connector_id: "comfyui_video".to_string(),
      ok: false,
      provider: "comfyui".to_string(),
      job_id: Some(clean_id),
      output_paths: vec![],
      preview_base64: None,
      queued_at_ms,
      trust: "failed".to_string(),
      message: "ComfyUI history request failed.".to_string(),
      error: Some(format!("HTTP {}", status.as_u16())),
    });
  }

  let history_entry = body.get(&clean_id).cloned().unwrap_or(Value::Null);
  if history_entry.is_null() {
    return Ok(MediaGenerationProof {
      connector_id: "comfyui_video".to_string(),
      ok: true,
      provider: "comfyui".to_string(),
      job_id: Some(clean_id),
      output_paths: vec![],
      preview_base64: None,
      queued_at_ms,
      trust: "pending".to_string(),
      message: "Workflow is still running or history not available yet.".to_string(),
      error: None,
    });
  }

  let mut output_paths: Vec<String> = vec![];
  if let Some(outputs) = history_entry
    .get("outputs")
    .and_then(|value| value.as_object())
  {
    for node_output in outputs.values() {
      if let Some(images) = node_output.get("images").and_then(|value| value.as_array()) {
        for image in images {
          let filename = image
            .get("filename")
            .and_then(|value| value.as_str())
            .unwrap_or("");
          let subfolder = image
            .get("subfolder")
            .and_then(|value| value.as_str())
            .unwrap_or("");
          let file_type = image
            .get("type")
            .and_then(|value| value.as_str())
            .unwrap_or("output");
          if filename.is_empty() {
            continue;
          }
          output_paths.push(format!("{subfolder}/{filename} ({file_type})"));
        }
      }
    }
  }
  output_paths = dedup_strings(output_paths);

  Ok(MediaGenerationProof {
    connector_id: "comfyui_video".to_string(),
    ok: true,
    provider: "comfyui".to_string(),
    job_id: Some(clean_id),
    output_paths: output_paths.clone(),
    preview_base64: None,
    queued_at_ms,
    trust: "verified".to_string(),
    message: if output_paths.is_empty() {
      "ComfyUI history loaded. No output files listed yet.".to_string()
    } else {
      format!(
        "ComfyUI history loaded. {} output file(s) detected.",
        output_paths.len()
      )
    },
    error: None,
  })
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::sync::{Mutex, OnceLock};

  fn env_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
  }

  #[test]
  fn github_action_proof_serializes_to_camel_case() {
    let proof = GithubActionProof {
      ok: true,
      action: "create_issue".to_string(),
      http_status: Some(201),
      data: None,
      sent_at_ms: 1000,
      trust: "verified".to_string(),
      error: None,
    };
    let json = serde_json::to_value(&proof).unwrap();
    assert_eq!(json["ok"], true);
    assert_eq!(json["action"], "create_issue");
    assert_eq!(json["httpStatus"], 201);
    assert_eq!(json["sentAtMs"], 1000);
    assert_eq!(json["trust"], "verified");
    assert!(json["error"].is_null());
  }

  #[test]
  fn github_action_proof_serializes_error() {
    let proof = GithubActionProof {
      ok: false,
      action: "bad_action".to_string(),
      http_status: None,
      data: None,
      sent_at_ms: 2000,
      trust: "failed".to_string(),
      error: Some("GITHUB_TOKEN is not configured.".to_string()),
    };
    let json = serde_json::to_value(&proof).unwrap();
    assert_eq!(json["ok"], false);
    assert_eq!(json["error"], "GITHUB_TOKEN is not configured.");
    assert!(json["httpStatus"].is_null());
  }

  #[test]
  fn slack_send_proof_serializes_to_camel_case() {
    let proof = SlackSendProof {
      ok: true,
      channel: "C012345".to_string(),
      ts: Some("1712345678.000001".to_string()),
      sent_at_ms: 3000,
      trust: "verified".to_string(),
      error: None,
    };
    let json = serde_json::to_value(&proof).unwrap();
    assert_eq!(json["ok"], true);
    assert_eq!(json["channel"], "C012345");
    assert_eq!(json["ts"], "1712345678.000001");
    assert_eq!(json["sentAtMs"], 3000);
    assert!(json["error"].is_null());
  }

  #[test]
  fn slack_send_proof_serializes_missing_ts() {
    let proof = SlackSendProof {
      ok: false,
      channel: "".to_string(),
      ts: None,
      sent_at_ms: 4000,
      trust: "failed".to_string(),
      error: Some("channel and text are required.".to_string()),
    };
    let json = serde_json::to_value(&proof).unwrap();
    assert_eq!(json["ok"], false);
    assert!(json["ts"].is_null());
    assert_eq!(json["error"], "channel and text are required.");
  }

  fn run_with_env<F>(f: F)
  where
    F: FnOnce(&tokio::runtime::Runtime) -> () + Send,
  {
    let _guard = env_lock().lock().unwrap();
    let runtime = tokio::runtime::Builder::new_current_thread()
      .enable_all()
      .build()
      .unwrap();
    f(&runtime);
  }

  #[test]
  fn connector_github_action_rejects_empty_action() {
    run_with_env(|runtime| {
      std::env::remove_var("GITHUB_TOKEN");
      std::env::set_var("GITHUB_TOKEN", "test-token");
      let payload = serde_json::json!({});
      let result = runtime
        .block_on(connector_github_action("".to_string(), payload))
        .unwrap();
      assert!(!result.ok);
      assert_eq!(result.trust, "failed");
      assert!(result.error.unwrap().contains("action is required"));
      std::env::remove_var("GITHUB_TOKEN");
    });
  }

  #[test]
  fn connector_github_action_rejects_unsupported_action() {
    run_with_env(|runtime| {
      std::env::remove_var("GITHUB_TOKEN");
      std::env::set_var("GITHUB_TOKEN", "test-token");
      let payload = serde_json::json!({});
      let result = runtime
        .block_on(connector_github_action("fly_to_mars".to_string(), payload))
        .unwrap();
      assert!(!result.ok);
      assert_eq!(result.trust, "failed");
      let error = result.error.unwrap();
      assert!(error.contains("Unsupported GitHub action"));
      assert!(error.contains("fly_to_mars"));
      std::env::remove_var("GITHUB_TOKEN");
    });
  }

  #[test]
  fn connector_github_action_requires_missing_owner_in_create_issue() {
    run_with_env(|runtime| {
      std::env::remove_var("GITHUB_TOKEN");
      std::env::set_var("GITHUB_TOKEN", "test-token");
      let payload = serde_json::json!({
        "title": "Test issue",
        "body": "Description"
      });
      let result = runtime
        .block_on(connector_github_action("create_issue".to_string(), payload))
        .unwrap();
      assert!(!result.ok);
      assert_eq!(result.trust, "failed");
      assert!(result
        .error
        .unwrap()
        .contains("payload must include owner and repo"));
      std::env::remove_var("GITHUB_TOKEN");
    });
  }

  #[test]
  fn connector_github_action_requires_missing_workflow_id() {
    run_with_env(|runtime| {
      std::env::remove_var("GITHUB_TOKEN");
      std::env::set_var("GITHUB_TOKEN", "test-token");
      let payload = serde_json::json!({
        "owner": "test-owner",
        "repo": "test-repo"
      });
      let result = runtime
        .block_on(connector_github_action(
          "dispatch_workflow".to_string(),
          payload,
        ))
        .unwrap();
      assert!(!result.ok);
      assert_eq!(result.trust, "failed");
      assert!(result
        .error
        .unwrap()
        .contains("payload must include workflow_id"));
      std::env::remove_var("GITHUB_TOKEN");
    });
  }

  #[test]
  fn connector_slack_send_rejects_empty_channel() {
    run_with_env(|runtime| {
      std::env::remove_var("SLACK_BOT_TOKEN");
      std::env::set_var("SLACK_BOT_TOKEN", "test-token");
      let result = runtime
        .block_on(connector_slack_send(
          "".to_string(),
          "hello".to_string(),
          None,
        ))
        .unwrap();
      assert!(!result.ok);
      assert_eq!(result.trust, "failed");
      assert!(result
        .error
        .unwrap()
        .contains("channel and text are required"));
      std::env::remove_var("SLACK_BOT_TOKEN");
    });
  }

  #[test]
  fn connector_slack_send_rejects_empty_text() {
    run_with_env(|runtime| {
      std::env::remove_var("SLACK_BOT_TOKEN");
      std::env::set_var("SLACK_BOT_TOKEN", "test-token");
      let result = runtime
        .block_on(connector_slack_send(
          "C012345".to_string(),
          "".to_string(),
          None,
        ))
        .unwrap();
      assert!(!result.ok);
      assert_eq!(result.trust, "failed");
      assert!(result
        .error
        .unwrap()
        .contains("channel and text are required"));
      std::env::remove_var("SLACK_BOT_TOKEN");
    });
  }

  #[test]
  fn connector_github_action_reports_missing_token() {
    run_with_env(|runtime| {
      std::env::remove_var("GITHUB_TOKEN");
      let payload = serde_json::json!({});
      let result = runtime
        .block_on(connector_github_action("get_repo".to_string(), payload))
        .unwrap();
      assert!(!result.ok);
      assert_eq!(result.trust, "unverified");
      assert!(result
        .error
        .unwrap()
        .contains("GITHUB_TOKEN is not configured"));
    });
  }

  #[test]
  fn connector_slack_send_reports_missing_token() {
    run_with_env(|runtime| {
      std::env::remove_var("SLACK_BOT_TOKEN");
      let result = runtime
        .block_on(connector_slack_send(
          "C012345".to_string(),
          "hello".to_string(),
          None,
        ))
        .unwrap();
      assert!(!result.ok);
      assert_eq!(result.trust, "unverified");
      assert!(result
        .error
        .unwrap()
        .contains("SLACK_BOT_TOKEN is not configured"));
    });
  }
}
