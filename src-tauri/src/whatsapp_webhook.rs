use crate::{now_ms, to_hex};
use hmac::{Hmac, KeyInit, Mac};
use serde::Serialize;
use serde_json::Value;
use sha2::Sha256;
use subtle::ConstantTimeEq;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConnectorInboundMessage {
    pub(crate) update_id: i64,
    pub(crate) chat_id: String,
    pub(crate) from_id: Option<String>,
    pub(crate) text: String,
    pub(crate) date_unix: Option<i64>,
    pub(crate) received_at_ms: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WhatsAppWebhookVerifyProof {
    ok: bool,
    mode: Option<String>,
    verify_token_present: bool,
    challenge: Option<String>,
    response_challenge: Option<String>,
    checked_at_ms: u64,
    trust: String,
    error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WhatsAppWebhookSignatureProof {
    ok: bool,
    signature_header_present: bool,
    app_secret_present: bool,
    expected_signature: Option<String>,
    received_signature: Option<String>,
    checked_at_ms: u64,
    trust: String,
    error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WhatsAppCloudInboundNormalizeProof {
    ok: bool,
    provider: String,
    count: usize,
    messages: Vec<ConnectorInboundMessage>,
    checked_at_ms: u64,
    trust: String,
    error: Option<String>,
}

#[tauri::command]
pub(crate) fn verify_whatsapp_cloud_webhook_challenge(
    mode: Option<String>,
    verify_token: Option<String>,
    challenge: Option<String>,
) -> WhatsAppWebhookVerifyProof {
    let checked_at_ms = now_ms();
    let expected = std::env::var("WHATSAPP_VERIFY_TOKEN").unwrap_or_default();
    let incoming_mode = mode.unwrap_or_default().trim().to_string();
    let incoming_token = verify_token.unwrap_or_default().trim().to_string();
    let incoming_challenge = challenge.unwrap_or_default().trim().to_string();

    if expected.trim().is_empty() {
        return WhatsAppWebhookVerifyProof {
            ok: false,
            mode: Some(incoming_mode),
            verify_token_present: false,
            challenge: Some(incoming_challenge),
            response_challenge: None,
            checked_at_ms,
            trust: "setup_required".to_string(),
            error: Some("WHATSAPP_VERIFY_TOKEN is not configured.".to_string()),
        };
    }

    if incoming_mode != "subscribe" {
        return WhatsAppWebhookVerifyProof {
            ok: false,
            mode: Some(incoming_mode),
            verify_token_present: true,
            challenge: Some(incoming_challenge),
            response_challenge: None,
            checked_at_ms,
            trust: "failed".to_string(),
            error: Some("Webhook mode must be subscribe.".to_string()),
        };
    }

    if incoming_token != expected.trim() {
        return WhatsAppWebhookVerifyProof {
            ok: false,
            mode: Some(incoming_mode),
            verify_token_present: true,
            challenge: Some(incoming_challenge),
            response_challenge: None,
            checked_at_ms,
            trust: "failed".to_string(),
            error: Some("Verify token mismatch.".to_string()),
        };
    }

    WhatsAppWebhookVerifyProof {
        ok: true,
        mode: Some("subscribe".to_string()),
        verify_token_present: true,
        challenge: Some(incoming_challenge.clone()),
        response_challenge: Some(incoming_challenge),
        checked_at_ms,
        trust: "verified".to_string(),
        error: None,
    }
}

#[tauri::command]
pub(crate) fn verify_whatsapp_cloud_webhook_signature(
    raw_body: String,
    signature_header: Option<String>,
) -> WhatsAppWebhookSignatureProof {
    let checked_at_ms = now_ms();
    let app_secret = std::env::var("WHATSAPP_APP_SECRET").unwrap_or_default();
    let received_header = signature_header.unwrap_or_default().trim().to_string();
    if app_secret.trim().is_empty() {
        return WhatsAppWebhookSignatureProof {
            ok: false,
            signature_header_present: !received_header.is_empty(),
            app_secret_present: false,
            expected_signature: None,
            received_signature: if received_header.is_empty() {
                None
            } else {
                Some(received_header)
            },
            checked_at_ms,
            trust: "setup_required".to_string(),
            error: Some("WHATSAPP_APP_SECRET is not configured.".to_string()),
        };
    }
    if received_header.is_empty() {
        return WhatsAppWebhookSignatureProof {
            ok: false,
            signature_header_present: false,
            app_secret_present: true,
            expected_signature: None,
            received_signature: None,
            checked_at_ms,
            trust: "failed".to_string(),
            error: Some("X-Hub-Signature-256 header is missing.".to_string()),
        };
    }

    type HmacSha256 = Hmac<Sha256>;
    let mut mac = match HmacSha256::new_from_slice(app_secret.trim().as_bytes()) {
        Ok(value) => value,
        Err(error) => {
            return WhatsAppWebhookSignatureProof {
                ok: false,
                signature_header_present: true,
                app_secret_present: true,
                expected_signature: None,
                received_signature: Some(received_header),
                checked_at_ms,
                trust: "failed".to_string(),
                error: Some(format!("Failed to initialize HMAC: {error}")),
            };
        }
    };
    mac.update(raw_body.as_bytes());
    let digest = mac.finalize().into_bytes();
    let expected = format!("sha256={}", to_hex(&digest));
    let valid = expected.len() == received_header.len()
        && expected.as_bytes().ct_eq(received_header.as_bytes()).into();

    WhatsAppWebhookSignatureProof {
        ok: valid,
        signature_header_present: true,
        app_secret_present: true,
        expected_signature: Some(expected),
        received_signature: Some(received_header),
        checked_at_ms,
        trust: if valid { "verified" } else { "failed" }.to_string(),
        error: if valid {
            None
        } else {
            Some("Webhook signature mismatch.".to_string())
        },
    }
}

#[tauri::command]
pub(crate) fn normalize_whatsapp_cloud_inbound(
    raw_body: String,
) -> WhatsAppCloudInboundNormalizeProof {
    let checked_at_ms = now_ms();
    let parsed: Value = match serde_json::from_str(raw_body.as_str()) {
        Ok(value) => value,
        Err(error) => {
            return WhatsAppCloudInboundNormalizeProof {
                ok: false,
                provider: "whatsapp_cloud_api".to_string(),
                count: 0,
                messages: vec![],
                checked_at_ms,
                trust: "failed".to_string(),
                error: Some(format!("Invalid JSON payload: {error}")),
            };
        }
    };

    let mut messages: Vec<ConnectorInboundMessage> = vec![];
    let entries = parsed
        .get("entry")
        .and_then(|value| value.as_array())
        .cloned()
        .unwrap_or_default();

    for entry in entries {
        let changes = entry
            .get("changes")
            .and_then(|value| value.as_array())
            .cloned()
            .unwrap_or_default();
        for change in changes {
            let value = change.get("value").cloned().unwrap_or(Value::Null);
            let incoming = value
                .get("messages")
                .and_then(|item| item.as_array())
                .cloned()
                .unwrap_or_default();
            for msg in incoming {
                let text = msg
                    .get("text")
                    .and_then(|node| node.get("body"))
                    .and_then(|node| node.as_str())
                    .unwrap_or("")
                    .trim()
                    .to_string();
                if text.is_empty() {
                    continue;
                }
                let from = msg
                    .get("from")
                    .and_then(|node| node.as_str())
                    .unwrap_or("")
                    .to_string();
                let id = msg
                    .get("id")
                    .and_then(|node| node.as_str())
                    .unwrap_or("")
                    .to_string();
                let timestamp = msg
                    .get("timestamp")
                    .and_then(|node| node.as_str())
                    .and_then(|node| node.parse::<i64>().ok());

                messages.push(ConnectorInboundMessage {
                    update_id: 0,
                    chat_id: from.clone(),
                    from_id: Some(from),
                    text,
                    date_unix: timestamp,
                    received_at_ms: checked_at_ms,
                });

                if id.is_empty() {
                    continue;
                }
            }
        }
    }

    WhatsAppCloudInboundNormalizeProof {
        ok: true,
        provider: "whatsapp_cloud_api".to_string(),
        count: messages.len(),
        messages,
        checked_at_ms,
        trust: "verified".to_string(),
        error: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_valid_payload_with_messages() {
        let payload = r#"{
      "entry": [{
        "changes": [{
          "value": {
            "messages": [
              {
                "from": "15551234567",
                "id": "wamid.abc123",
                "timestamp": "1700000000",
                "text": { "body": "Hello world" }
              }
            ]
          }
        }]
      }]
    }"#;

        let proof = normalize_whatsapp_cloud_inbound(payload.to_string());
        assert!(proof.ok);
        assert_eq!(proof.provider, "whatsapp_cloud_api");
        assert_eq!(proof.count, 1);
        assert_eq!(proof.messages.len(), 1);
        assert_eq!(proof.messages[0].text, "Hello world");
        assert_eq!(proof.messages[0].chat_id, "15551234567");
        assert_eq!(proof.messages[0].from_id, Some("15551234567".to_string()));
        assert_eq!(proof.messages[0].date_unix, Some(1700000000));
        assert_eq!(proof.trust, "verified");
        assert!(proof.error.is_none());
    }

    #[test]
    fn normalize_empty_payload() {
        let payload = r#"{}"#;
        let proof = normalize_whatsapp_cloud_inbound(payload.to_string());
        assert!(proof.ok);
        assert_eq!(proof.count, 0);
        assert!(proof.messages.is_empty());
        assert_eq!(proof.trust, "verified");
    }

    #[test]
    fn normalize_payload_no_messages_array() {
        let payload = r#"{
      "entry": [{
        "changes": [{
          "value": {
            "contacts": [{"wa_id": "15551234567"}]
          }
        }]
      }]
    }"#;
        let proof = normalize_whatsapp_cloud_inbound(payload.to_string());
        assert!(proof.ok);
        assert_eq!(proof.count, 0);
        assert!(proof.messages.is_empty());
    }

    #[test]
    fn normalize_invalid_json_returns_error() {
        let payload = "not json at all";
        let proof = normalize_whatsapp_cloud_inbound(payload.to_string());
        assert!(!proof.ok);
        assert_eq!(proof.count, 0);
        assert!(proof.error.is_some());
        assert!(proof.error.unwrap().contains("Invalid JSON"));
    }

    #[test]
    fn normalize_skips_messages_with_empty_text() {
        let payload = r#"{
      "entry": [{
        "changes": [{
          "value": {
            "messages": [
              {
                "from": "15551234567",
                "id": "wamid.abc123",
                "timestamp": "1700000000",
                "text": { "body": "" }
              }
            ]
          }
        }]
      }]
    }"#;
        let proof = normalize_whatsapp_cloud_inbound(payload.to_string());
        assert!(proof.ok);
        assert_eq!(proof.count, 0);
        assert!(proof.messages.is_empty());
    }
}
