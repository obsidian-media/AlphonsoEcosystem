#![expect(dead_code)]

use std::time::{Duration, SystemTime, UNIX_EPOCH};

pub(crate) fn now_ms() -> u64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|duration| duration.as_millis() as u64)
    .unwrap_or(0)
}

pub(crate) fn to_hex(bytes: &[u8]) -> String {
  let mut out = String::with_capacity(bytes.len() * 2);
  for byte in bytes {
    out.push_str(&format!("{:02x}", byte));
  }
  out
}

pub(crate) fn unix_now_iso() -> String {
  let seconds = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|duration| duration.as_secs())
    .unwrap_or(0);
  format!("unix:{}", seconds)
}

pub(crate) fn dedup_strings(mut values: Vec<String>) -> Vec<String> {
  values.sort();
  values.dedup();
  values
}

pub(crate) fn trim_trailing_slashes(raw: &str) -> String {
  raw.trim().trim_end_matches('/').to_string()
}

pub(crate) fn normalize_bridge_path_prefix(raw: &str) -> String {
  let trimmed = raw.trim();
  if trimmed.is_empty() {
    "/api/alphonso-bridge".to_string()
  } else if trimmed.starts_with('/') {
    trimmed.to_string()
  } else {
    format!("/{}", trimmed)
  }
}

pub(crate) fn build_http_client(timeout_ms: u64) -> Result<reqwest::Client, String> {
  reqwest::Client::builder()
    .timeout(Duration::from_millis(timeout_ms))
    .build()
    .map_err(|error| error.to_string())
}

pub(crate) fn truncate_string(s: &str, max_len: usize) -> String {
  if s.len() <= max_len {
    s.to_string()
  } else {
    format!("{}...", &s[..max_len.saturating_sub(3)])
  }
}

pub(crate) fn generate_id() -> String {
  use std::time::{SystemTime, UNIX_EPOCH};
  let now = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|d| d.as_nanos())
    .unwrap_or(0);
  format!("{:x}", now)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn trim_trailing_slashes_removes_trailing_slashes() {
    assert_eq!(trim_trailing_slashes("http://localhost:11434/"), "http://localhost:11434");
    assert_eq!(trim_trailing_slashes("http://localhost:11434///"), "http://localhost:11434");
    assert_eq!(trim_trailing_slashes("  http://localhost:11434/  "), "http://localhost:11434");
  }

  #[test]
  fn trim_trailing_slashes_leaves_clean_urls_unchanged() {
    assert_eq!(trim_trailing_slashes("http://localhost:11434"), "http://localhost:11434");
    assert_eq!(trim_trailing_slashes(""), "");
  }

  #[test]
  fn to_hex_produces_correct_lowercase_hex() {
    assert_eq!(to_hex(&[0x00, 0xff, 0xab, 0x12]), "00ffab12");
    assert_eq!(to_hex(&[]), "");
    assert_eq!(to_hex(&[0x0a]), "0a");
  }

  #[test]
  fn dedup_strings_removes_duplicates() {
    let input = vec!["b".to_string(), "a".to_string(), "b".to_string(), "c".to_string(), "a".to_string()];
    let result = dedup_strings(input);
    assert_eq!(result, vec!["a", "b", "c"]);
  }

  #[test]
  fn dedup_strings_handles_empty() {
    let input: Vec<String> = vec![];
    let result = dedup_strings(input);
    assert!(result.is_empty());
  }

  #[test]
  fn normalize_bridge_path_prefix_empty() {
    assert_eq!(normalize_bridge_path_prefix(""), "/api/alphonso-bridge");
    assert_eq!(normalize_bridge_path_prefix("  "), "/api/alphonso-bridge");
  }

  #[test]
  fn normalize_bridge_path_prefix_with_slash() {
    assert_eq!(normalize_bridge_path_prefix("/custom/path"), "/custom/path");
  }

  #[test]
  fn normalize_bridge_path_prefix_without_slash() {
    assert_eq!(normalize_bridge_path_prefix("custom/path"), "/custom/path");
  }

  #[test]
  fn truncate_string_short() {
    assert_eq!(truncate_string("hello", 10), "hello");
  }

  #[test]
  fn truncate_string_long() {
    assert_eq!(truncate_string("hello world", 8), "hello...");
  }

  #[test]
  fn truncate_string_exact() {
    assert_eq!(truncate_string("hello", 5), "hello");
  }

  #[test]
  fn generate_id_not_empty() {
    let id = generate_id();
    assert!(!id.is_empty());
  }

  #[test]
  fn generate_id_unique() {
    let id1 = generate_id();
    let id2 = generate_id();
    assert_ne!(id1, id2);
  }

  #[test]
  fn build_http_client_success() {
    let client = build_http_client(5000);
    assert!(client.is_ok());
  }
}
