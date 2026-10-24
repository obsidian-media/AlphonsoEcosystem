//! The user's own S3-compatible storage (content factory phase 3c).
//!
//! Instagram only takes media by a public address. A user may connect any
//! S3-compatible bucket (Cloudflare R2, Amazon S3, Supabase Storage, Backblaze B2,
//! Wasabi): the bucket stays private, a file is uploaded just before posting, the
//! platform gets a presigned GET link that works for an hour, and the file is
//! deleted afterwards. Requests are signed here with AWS Signature Version 4; the
//! keys never reach an error message or a log line.

use serde::{Deserialize, Serialize};

/// Where a user's storage is and the keys for it (Settings → Connectors → Your storage).
#[derive(Deserialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StorageConfig {
  pub endpoint: String,
  #[serde(default)]
  pub region: String,
  pub bucket: String,
  pub access_key: String,
  pub secret_key: String,
  #[serde(default)]
  pub path_style: bool,
}

/// One object to reach: its full URL and the parts the signature needs.
#[derive(Debug, PartialEq)]
pub(crate) struct ObjectTarget {
  pub url: String,
  pub host: String,
  /// The URI-encoded path, as it goes into the canonical request.
  pub path: String,
}

/// What a signature covers.
pub(crate) struct SignInput<'a> {
  pub method: &'a str,
  pub host: &'a str,
  pub path: &'a str,
  /// The canonical query string (already sorted and encoded).
  pub query: &'a str,
  /// Extra headers to sign besides `host`, lower-case names.
  pub headers: &'a [(String, String)],
  pub payload_hash: &'a str,
  pub service: &'a str,
  pub region: &'a str,
  pub access_key: &'a str,
  pub secret_key: &'a str,
  /// `YYYYMMDDTHHMMSSZ`.
  pub amz_date: &'a str,
}

/// Largest file Alphonso stages for a platform (1 GB).
pub(crate) const STAGED_MAX_BYTES: u64 = 1024 * 1024 * 1024;
/// How long a link given to a platform works.
pub(crate) const LINK_SECONDS: u64 = 3600;
const UNSIGNED_PAYLOAD: &str = "UNSIGNED-PAYLOAD";
const EMPTY_SHA256: &str = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const ADDRESS_HELP: &str =
  "The storage address should look like r2.example.com or https://s3.us-east-1.amazonaws.com.";

fn hex(bytes: &[u8]) -> String {
  use std::fmt::Write as _;
  let mut out = String::with_capacity(bytes.len() * 2);
  for b in bytes {
    let _ = write!(&mut out, "{:02x}", b);
  }
  out
}

fn sha256_hex(data: &[u8]) -> String {
  use sha2::{Digest, Sha256};
  hex(&Sha256::digest(data))
}

fn hmac_sha256(key: &[u8], data: &[u8]) -> Vec<u8> {
  use hmac::{Hmac, KeyInit, Mac};
  let mut mac = Hmac::<sha2::Sha256>::new_from_slice(key).expect("HMAC takes any key length");
  mac.update(data);
  mac.finalize().into_bytes().to_vec()
}

/// AWS URI encoding: unreserved characters stay, everything else is `%XX`.
pub(crate) fn uri_encode(value: &str, encode_slash: bool) -> String {
  let mut out = String::with_capacity(value.len());
  for b in value.bytes() {
    let keep = b.is_ascii_alphanumeric()
      || matches!(b, b'-' | b'_' | b'.' | b'~')
      || (b == b'/' && !encode_slash);
    if keep {
      out.push(b as char);
    } else {
      out.push_str(&format!("%{:02X}", b));
    }
  }
  out
}

/// The signature's parts: signed header names, credential scope, signature.
fn signature_parts(input: &SignInput) -> (String, String, String) {
  let mut headers: Vec<(String, String)> = vec![("host".to_string(), input.host.to_string())];
  headers.extend(
    input
      .headers
      .iter()
      .map(|(k, v)| (k.to_ascii_lowercase(), v.trim().to_string())),
  );
  headers.sort_by(|a, b| a.0.cmp(&b.0));
  let canonical_headers: String = headers.iter().map(|(k, v)| format!("{k}:{v}\n")).collect();
  let signed: Vec<&str> = headers.iter().map(|(k, _)| k.as_str()).collect();
  let signed = signed.join(";");
  let request = format!(
    "{}\n{}\n{}\n{}\n{}\n{}",
    input.method, input.path, input.query, canonical_headers, signed, input.payload_hash
  );
  let date = &input.amz_date[..8.min(input.amz_date.len())];
  let scope = format!("{date}/{}/{}/aws4_request", input.region, input.service);
  let to_sign = format!(
    "AWS4-HMAC-SHA256\n{}\n{scope}\n{}",
    input.amz_date,
    sha256_hex(request.as_bytes())
  );
  let k_date = hmac_sha256(
    format!("AWS4{}", input.secret_key).as_bytes(),
    date.as_bytes(),
  );
  let k_region = hmac_sha256(&k_date, input.region.as_bytes());
  let k_service = hmac_sha256(&k_region, input.service.as_bytes());
  let k_signing = hmac_sha256(&k_service, b"aws4_request");
  (
    signed,
    scope,
    hex(&hmac_sha256(&k_signing, to_sign.as_bytes())),
  )
}

/// The `Authorization` header for a request (AWS Signature Version 4).
pub(crate) fn sign_v4(input: &SignInput) -> String {
  let (signed, scope, signature) = signature_parts(input);
  format!(
    "AWS4-HMAC-SHA256 Credential={}/{scope}, SignedHeaders={signed}, Signature={signature}",
    input.access_key
  )
}

/// Scheme, host (with port) and base path of the storage address.
fn endpoint_parts(endpoint: &str) -> Result<(&'static str, String, String), String> {
  let e = endpoint.trim().trim_end_matches('/');
  let (scheme, rest) = if let Some(r) = e.strip_prefix("https://") {
    ("https", r)
  } else if let Some(r) = e.strip_prefix("http://") {
    ("http", r)
  } else {
    ("https", e)
  };
  if rest.is_empty() || rest.contains(['@', '?', '#', '\\', ' ']) {
    return Err(ADDRESS_HELP.to_string());
  }
  let (host, base) = match rest.find('/') {
    Some(i) => (&rest[..i], &rest[i..]),
    None => (rest, ""),
  };
  if host.is_empty() || base.split('/').any(|seg| seg == "..") {
    return Err(ADDRESS_HELP.to_string());
  }
  if scheme == "http" {
    let name = host.rsplit_once(':').map(|(h, _)| h).unwrap_or(host);
    if !matches!(name, "localhost" | "127.0.0.1" | "[::1]") {
      return Err("Use an https:// storage address.".to_string());
    }
  }
  Ok((scheme, host.to_string(), base.to_string()))
}

fn region(cfg: &StorageConfig) -> String {
  let r = cfg.region.trim();
  if r.is_empty() {
    "us-east-1".to_string()
  } else {
    r.to_string()
  }
}

/// The bucket itself (for listing), or an object in it.
fn target(cfg: &StorageConfig, key: Option<&str>) -> Result<ObjectTarget, String> {
  let bucket = cfg.bucket.trim();
  if bucket.is_empty() || bucket.contains(['/', '\\', ' ']) {
    return Err("Fill in the bucket name.".to_string());
  }
  let key_path = match key {
    None => String::new(),
    Some(k) => {
      let bad = k.is_empty()
        || k.starts_with('/')
        || k.contains('\\')
        || k.chars().any(char::is_control)
        || k.split('/').any(|seg| seg == ".." || seg == ".");
      if bad {
        return Err("That file name can't be stored.".to_string());
      }
      uri_encode(k, false)
    }
  };
  let (scheme, host, base) = endpoint_parts(&cfg.endpoint)?;
  let (host, path) = if cfg.path_style {
    (
      host,
      format!("{base}/{}/{key_path}", uri_encode(bucket, true)),
    )
  } else {
    (format!("{bucket}.{host}"), format!("{base}/{key_path}"))
  };
  Ok(ObjectTarget {
    url: format!("{scheme}://{host}{path}"),
    host,
    path,
  })
}

/// An object in the user's storage: its URL and the parts the signature needs.
pub(crate) fn object_target(cfg: &StorageConfig, key: &str) -> Result<ObjectTarget, String> {
  target(cfg, Some(key))
}

/// A link that lets anyone holding it read this one object for `expires_secs`.
pub(crate) fn presign_get(
  cfg: &StorageConfig,
  key: &str,
  expires_secs: u64,
  amz_date: &str,
) -> Result<String, String> {
  let t = object_target(cfg, key)?;
  let region = region(cfg);
  let date = &amz_date[..8.min(amz_date.len())];
  let credential = format!("{}/{date}/{region}/s3/aws4_request", cfg.access_key.trim());
  let query = format!(
    "X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential={}&X-Amz-Date={amz_date}&X-Amz-Expires={expires_secs}&X-Amz-SignedHeaders=host",
    uri_encode(&credential, true)
  );
  let (_, _, signature) = signature_parts(&SignInput {
    method: "GET",
    host: &t.host,
    path: &t.path,
    query: &query,
    headers: &[],
    payload_hash: UNSIGNED_PAYLOAD,
    service: "s3",
    region: &region,
    access_key: cfg.access_key.trim(),
    secret_key: cfg.secret_key.trim(),
    amz_date,
  });
  Ok(format!("{}?{query}&X-Amz-Signature={signature}", t.url))
}

/// Refuses a file too large to stage.
pub(crate) fn staged_size_ok(bytes: u64) -> Result<(), String> {
  if bytes > STAGED_MAX_BYTES {
    return Err("This file is too large to put in your storage (1 GB at most).".to_string());
  }
  Ok(())
}

/// Now as `YYYYMMDDTHHMMSSZ`.
fn amz_now() -> String {
  let secs = std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .map(|d| d.as_secs())
    .unwrap_or(0);
  amz_date_from_secs(secs)
}

/// Seconds since 1970 as `YYYYMMDDTHHMMSSZ` (civil date from days, UTC).
fn amz_date_from_secs(secs: u64) -> String {
  let days = (secs / 86_400) as i64;
  let rem = secs % 86_400;
  let z = days + 719_468;
  let era = z.div_euclid(146_097);
  let doe = z - era * 146_097;
  let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
  let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
  let mp = (5 * doy + 2) / 153;
  let day = doy - (153 * mp + 2) / 5 + 1;
  let month = if mp < 10 { mp + 3 } else { mp - 9 };
  let year = yoe + era * 400 + i64::from(month <= 2);
  format!(
    "{year:04}{month:02}{day:02}T{:02}{:02}{:02}Z",
    rem / 3600,
    (rem % 3600) / 60,
    rem % 60
  )
}

fn http_client() -> Result<reqwest::Client, String> {
  reqwest::Client::builder()
    .redirect(reqwest::redirect::Policy::none())
    .timeout(std::time::Duration::from_secs(600))
    .build()
    .map_err(|_| "Could not reach your storage.".to_string())
}

/// S3's error code from an error answer, for a plain message (never the body itself).
fn s3_error_code(body: &str) -> String {
  between(body, "<Code>", "</Code>")
    .map(|code| {
      code
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .take(60)
        .collect()
    })
    .unwrap_or_default()
}

async fn signed_request(
  cfg: &StorageConfig,
  method: reqwest::Method,
  t: &ObjectTarget,
  query: &str,
  body: Vec<u8>,
  content_type: Option<&str>,
) -> Result<reqwest::Response, String> {
  let amz_date = amz_now();
  let payload = if body.is_empty() {
    EMPTY_SHA256
  } else {
    UNSIGNED_PAYLOAD
  };
  let headers = vec![
    ("x-amz-content-sha256".to_string(), payload.to_string()),
    ("x-amz-date".to_string(), amz_date.clone()),
  ];
  let region = region(cfg);
  let auth = sign_v4(&SignInput {
    method: method.as_str(),
    host: &t.host,
    path: &t.path,
    query,
    headers: &headers,
    payload_hash: payload,
    service: "s3",
    region: &region,
    access_key: cfg.access_key.trim(),
    secret_key: cfg.secret_key.trim(),
    amz_date: &amz_date,
  });
  let url = if query.is_empty() {
    t.url.clone()
  } else {
    format!("{}?{query}", t.url)
  };
  let mut req = http_client()?
    .request(method, url)
    .header("authorization", auth)
    .header("x-amz-content-sha256", payload)
    .header("x-amz-date", amz_date);
  if let Some(ct) = content_type {
    req = req.header("content-type", ct);
  }
  req
    .body(body)
    .send()
    .await
    .map_err(|_| "Could not reach your storage.".to_string())
}

fn check_config(cfg: &StorageConfig) -> Result<(), String> {
  if cfg.access_key.trim().is_empty() || cfg.secret_key.trim().is_empty() {
    return Err("Fill in your storage's access key and secret key.".to_string());
  }
  Ok(())
}

fn content_type_for(path: &str) -> &'static str {
  match path
    .rsplit('.')
    .next()
    .unwrap_or("")
    .to_ascii_lowercase()
    .as_str()
  {
    "mp4" => "video/mp4",
    "mov" => "video/quicktime",
    "jpg" | "jpeg" => "image/jpeg",
    "png" => "image/png",
    "webp" => "image/webp",
    _ => "application/octet-stream",
  }
}

async fn put_bytes(
  cfg: &StorageConfig,
  key: &str,
  bytes: Vec<u8>,
  content_type: &str,
) -> Result<String, String> {
  check_config(cfg)?;
  let t = object_target(cfg, key)?;
  let res = signed_request(cfg, reqwest::Method::PUT, &t, "", bytes, Some(content_type)).await?;
  let status = res.status();
  if !status.is_success() {
    let code = s3_error_code(&res.text().await.unwrap_or_default());
    let detail = if code.is_empty() {
      status.as_u16().to_string()
    } else {
      format!("{} {code}", status.as_u16())
    };
    return Err(format!("Your storage refused the upload ({detail})."));
  }
  presign_get(cfg, key, LINK_SECONDS, &amz_now())
}

async fn delete_key(cfg: &StorageConfig, key: &str) -> Result<(), String> {
  check_config(cfg)?;
  let t = object_target(cfg, key)?;
  let res = signed_request(cfg, reqwest::Method::DELETE, &t, "", Vec::new(), None).await?;
  let status = res.status().as_u16();
  if matches!(status, 200 | 204 | 404) {
    Ok(())
  } else {
    Err(format!("Your storage did not delete the file ({status})."))
  }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StoragePutResult {
  pub ok: bool,
  pub url: Option<String>,
  pub key: String,
  pub reason: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StorageResult {
  pub ok: bool,
  pub reason: Option<String>,
}

impl StorageResult {
  fn from(result: Result<(), String>) -> Self {
    match result {
      Ok(()) => StorageResult {
        ok: true,
        reason: None,
      },
      Err(reason) => StorageResult {
        ok: false,
        reason: Some(reason),
      },
    }
  }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StagedObject {
  pub key: String,
  /// As the storage reports it (ISO 8601).
  pub last_modified: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StorageTestResult {
  pub upload: StorageResult,
  pub link: StorageResult,
  pub delete: StorageResult,
}

/// Uploads a file from the workspace and returns a link that works for an hour.
#[tauri::command]
pub(crate) async fn storage_put_file(
  config: StorageConfig,
  workspace_root: String,
  relative_path: String,
  key: String,
) -> StoragePutResult {
  let result = async {
    let path = crate::media_tools::checked_file(
      &workspace_root,
      &relative_path,
      &["mp4", "mov", "jpg", "jpeg", "png", "webp"],
    )?;
    let size = std::fs::metadata(&path)
      .map_err(|_| "That file was not found.".to_string())?
      .len();
    staged_size_ok(size)?;
    let bytes = tokio::fs::read(&path)
      .await
      .map_err(|_| "That file could not be read.".to_string())?;
    put_bytes(&config, &key, bytes, content_type_for(&relative_path)).await
  }
  .await;
  match result {
    Ok(url) => StoragePutResult {
      ok: true,
      url: Some(url),
      key,
      reason: None,
    },
    Err(reason) => StoragePutResult {
      ok: false,
      url: None,
      key,
      reason: Some(reason),
    },
  }
}

/// Deletes one staged file (a file already gone counts as deleted).
#[tauri::command]
pub(crate) async fn storage_delete(config: StorageConfig, key: String) -> StorageResult {
  StorageResult::from(delete_key(&config, &key).await)
}

/// The staged files under `prefix` (at most 1000), for cleaning up leftovers.
#[tauri::command]
pub(crate) async fn storage_list_staged(
  config: StorageConfig,
  prefix: String,
) -> Result<Vec<StagedObject>, String> {
  check_config(&config)?;
  if !prefix.starts_with("alphonso-staged/") {
    return Err("Only Alphonso's staged files can be listed.".to_string());
  }
  let t = target(&config, None)?;
  let query = format!("list-type=2&prefix={}", uri_encode(&prefix, true));
  let res = signed_request(&config, reqwest::Method::GET, &t, &query, Vec::new(), None).await?;
  if !res.status().is_success() {
    return Err(format!(
      "Your storage did not list its files ({}).",
      res.status().as_u16()
    ));
  }
  Ok(parse_list(&res.text().await.unwrap_or_default()))
}

fn between<'a>(text: &'a str, open: &str, close: &str) -> Option<&'a str> {
  text
    .split_once(open)
    .and_then(|(_, rest)| rest.split_once(close))
    .map(|(v, _)| v)
}

/// Keys and times from a ListObjectsV2 answer.
pub(crate) fn parse_list(xml: &str) -> Vec<StagedObject> {
  xml
    .split("<Contents>")
    .skip(1)
    .filter_map(|item| {
      Some(StagedObject {
        key: between(item, "<Key>", "</Key>")?.replace("&amp;", "&"),
        last_modified: between(item, "<LastModified>", "</LastModified>")
          .unwrap_or("")
          .to_string(),
      })
    })
    .collect()
}

/// Settings' Test: uploads a 16-byte file, reads it through its link, deletes it.
#[tauri::command]
pub(crate) async fn storage_test(config: StorageConfig) -> StorageTestResult {
  let key = format!("alphonso-staged/test-{}.txt", uuid::Uuid::new_v4());
  let not_tried = || StorageResult {
    ok: false,
    reason: Some("Not tried.".to_string()),
  };
  let url = match put_bytes(&config, &key, b"alphonso storage".to_vec(), "text/plain").await {
    Ok(url) => url,
    Err(reason) => {
      return StorageTestResult {
        upload: StorageResult::from(Err(reason)),
        link: not_tried(),
        delete: not_tried(),
      }
    }
  };
  let link = match http_client() {
    Ok(client) => match client.get(&url).send().await {
      Ok(res) if res.status().is_success() => Ok(()),
      Ok(res) => Err(format!(
        "The link did not open the file ({}).",
        res.status().as_u16()
      )),
      Err(_) => Err("The link could not be opened.".to_string()),
    },
    Err(e) => Err(e),
  };
  StorageTestResult {
    upload: StorageResult {
      ok: true,
      reason: None,
    },
    link: StorageResult::from(link),
    delete: StorageResult::from(delete_key(&config, &key).await),
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  // AWS's published examples use these documentation keys (not real ones).
  fn doc_keys(region: &str) -> StorageConfig {
    StorageConfig {
      endpoint: "s3.amazonaws.com".into(),
      region: region.into(),
      bucket: "examplebucket".into(),
      access_key: ["AKIA", "IOSFODNN7EXAMPLE"].concat(),
      secret_key: ["wJalrXUtnFEMI/K7MDENG/", "bPxRfiCYEXAMPLEKEY"].concat(),
      path_style: false,
    }
  }

  #[test]
  fn sigv4_matches_aws_get_vanilla() {
    // AWS Signature Version 4 test suite, "get-vanilla".
    let access = ["AKID", "EXAMPLE"].concat();
    let secret = ["wJalrXUtnFEMI/K7MDENG+", "bPxRfiCYEXAMPLEKEY"].concat();
    let headers = vec![("x-amz-date".to_string(), "20150830T123600Z".to_string())];
    let auth = sign_v4(&SignInput {
      method: "GET",
      host: "example.amazonaws.com",
      path: "/",
      query: "",
      headers: &headers,
      payload_hash: EMPTY_SHA256,
      service: "service",
      region: "us-east-1",
      access_key: &access,
      secret_key: &secret,
      amz_date: "20150830T123600Z",
    });
    assert_eq!(
      auth,
      "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, \
       SignedHeaders=host;x-amz-date, \
       Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31"
    );
  }

  #[test]
  fn presign_get_matches_aws_s3_example() {
    // Amazon S3 docs, "Authenticating Requests: Using Query Parameters".
    let url = presign_get(
      &doc_keys("us-east-1"),
      "test.txt",
      86400,
      "20130524T000000Z",
    )
    .unwrap();
    assert!(url.starts_with(
      "https://examplebucket.s3.amazonaws.com/test.txt?X-Amz-Algorithm=AWS4-HMAC-SHA256"
    ));
    assert!(url.ends_with(
      "&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404"
    ));
  }

  #[test]
  fn object_url_handles_endpoint_forms() {
    let mut cfg = doc_keys("auto");
    cfg.bucket = "media".into();
    for endpoint in [
      "r2.example.com",
      "https://r2.example.com",
      "https://r2.example.com/",
    ] {
      cfg.endpoint = endpoint.into();
      cfg.path_style = true;
      assert_eq!(
        object_target(&cfg, "a b/c.mp4").unwrap().url,
        "https://r2.example.com/media/a%20b/c.mp4"
      );
      cfg.path_style = false;
      let target = object_target(&cfg, "a b/c.mp4").unwrap();
      assert_eq!(target.url, "https://media.r2.example.com/a%20b/c.mp4");
      assert_eq!(target.host, "media.r2.example.com");
      assert_eq!(target.path, "/a%20b/c.mp4");
    }
  }

  #[test]
  fn plain_http_is_only_for_this_computer() {
    let mut cfg = doc_keys("auto");
    cfg.endpoint = "http://r2.example.com".into();
    assert!(object_target(&cfg, "x").is_err());
    cfg.endpoint = "http://127.0.0.1:9000".into();
    cfg.path_style = true;
    assert_eq!(
      object_target(&cfg, "x").unwrap().url,
      "http://127.0.0.1:9000/examplebucket/x"
    );
  }

  #[test]
  fn a_key_cannot_climb_out_or_be_empty() {
    let cfg = doc_keys("auto");
    assert!(object_target(&cfg, "../x").is_err());
    assert!(object_target(&cfg, "").is_err());
  }

  #[test]
  fn files_over_limit_refused() {
    assert!(staged_size_ok(1024).is_ok());
    assert!(staged_size_ok(1024 * 1024 * 1024 + 1)
      .unwrap_err()
      .contains("too large"));
  }

  #[test]
  fn errors_never_hold_the_secret() {
    let mut cfg = doc_keys("auto");
    cfg.endpoint = "http://r2.example.com".into();
    let err = object_target(&cfg, "x").unwrap_err();
    assert!(!err.contains(&cfg.secret_key));
  }

  #[test]
  fn dates_are_written_the_way_aws_wants() {
    assert_eq!(amz_date_from_secs(0), "19700101T000000Z");
    assert_eq!(amz_date_from_secs(1_369_353_600), "20130524T000000Z");
    assert_eq!(amz_date_from_secs(951_825_600), "20000229T120000Z");
  }

  #[test]
  fn supabase_style_address_keeps_its_path() {
    let mut cfg = doc_keys("auto");
    cfg.endpoint = "https://abc.supabase.co/storage/v1/s3".into();
    cfg.bucket = "media".into();
    cfg.path_style = true;
    assert_eq!(
      object_target(&cfg, "x.png").unwrap().url,
      "https://abc.supabase.co/storage/v1/s3/media/x.png"
    );
  }

  #[test]
  fn list_answer_is_read() {
    let xml = "<ListBucketResult><Contents><Key>alphonso-staged/2026-10-24/a.mp4</Key><LastModified>2026-10-24T10:00:00.000Z</LastModified></Contents><Contents><Key>alphonso-staged/b&amp;c.png</Key></Contents></ListBucketResult>";
    let items = parse_list(xml);
    assert_eq!(items.len(), 2);
    assert_eq!(items[0].last_modified, "2026-10-24T10:00:00.000Z");
    assert_eq!(items[1].key, "alphonso-staged/b&c.png");
  }

  #[test]
  fn only_an_error_code_reaches_a_message() {
    assert_eq!(
      s3_error_code("<Error><Code>AccessDenied</Code><Message>x</Message></Error>"),
      "AccessDenied"
    );
    assert_eq!(s3_error_code("not xml"), "");
  }
}
