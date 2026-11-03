//! OS-backed secure credential storage (Truth-First plan B3).
//!
//! Wraps the `keyring` crate (Windows Credential Manager / macOS Keychain /
//! Linux Secret Service via D-Bus) behind the same thin command shape as
//! `kv_store.rs`, so callers migrate by swapping which Tauri command they
//! invoke rather than learning a new API. Long-lived secrets (connector
//! credentials) move here; `kv_store.rs`'s plain-SQLite-on-disk storage
//! remains for non-secret app state, where OS-keychain storage would be
//! overkill and isn't what it's designed for.
//!
//! Every entry lives under a single service namespace (the app's own Tauri
//! identifier, so it can't collide with another app's keychain entries) with
//! a caller-supplied account name distinguishing individual secrets.

use keyring::Entry;

const SERVICE: &str = "com.shayan.alphonso";

/// Builds the keyring account name for a given logical key. Pure and
/// unit-testable without touching the real OS credential store.
pub(crate) fn account_name(key: &str) -> String {
  key.trim().to_string()
}

/// The keychain service name. An end-to-end test profile (debug builds only)
/// gets its own, so tests never read or overwrite real saved credentials.
fn service_name() -> String {
  match crate::utils::e2e_profile() {
    Some(profile) => format!("{SERVICE}.e2e.{profile}"),
    None => SERVICE.to_string(),
  }
}

fn open_entry(key: &str) -> Result<Entry, String> {
  Entry::new(&service_name(), &account_name(key)).map_err(|e| e.to_string())
}

/// Secrets only the backend reads (2026-11-03): the window's commands below refuse them.
/// The phone sign-in's refresh token and this computer's phone private key.
const BACKEND_ONLY: [&str; 2] = [
  crate::phone_signin::REFRESH_KEY,
  crate::phone_box::PRIVATE_KEY_SLOT,
];
pub(crate) const BACKEND_ONLY_REFUSED: &str = "That secret is kept by the app itself.";

pub(crate) fn is_backend_only(key: &str) -> bool {
  BACKEND_ONLY.contains(&account_name(key).as_str())
}

/// For backend code: any key, including the backend-only ones.
pub(crate) fn backend_set(key: &str, value: &str) -> Result<(), String> {
  if key.trim().is_empty() {
    return Err("secure_credential_set: key must not be empty".to_string());
  }
  open_entry(key)?.set_password(value).map_err(|e| e.to_string())
}

pub(crate) fn backend_get(key: &str) -> Result<Option<String>, String> {
  if key.trim().is_empty() {
    return Ok(None);
  }
  match open_entry(key)?.get_password() {
    Ok(value) => Ok(Some(value)),
    Err(keyring::Error::NoEntry) => Ok(None),
    Err(e) => Err(e.to_string()),
  }
}

pub(crate) fn backend_delete(key: &str) -> Result<(), String> {
  if key.trim().is_empty() {
    return Ok(());
  }
  let entry = open_entry(key)?;
  match entry.delete_credential() {
    Ok(()) => Ok(()),
    // Idempotent: deleting something already absent is not an error —
    // callers (the JS migration path) delete-after-migrate unconditionally.
    Err(keyring::Error::NoEntry) => Ok(()),
    Err(e) => Err(e.to_string()),
  }
}

#[tauri::command]
pub fn secure_credential_set(key: String, value: String) -> Result<(), String> {
  if is_backend_only(&key) {
    return Err(BACKEND_ONLY_REFUSED.to_string());
  }
  backend_set(&key, &value)
}

#[tauri::command]
pub fn secure_credential_get(key: String) -> Result<Option<String>, String> {
  if is_backend_only(&key) {
    return Err(BACKEND_ONLY_REFUSED.to_string());
  }
  backend_get(&key)
}

#[tauri::command]
pub fn secure_credential_delete(key: String) -> Result<(), String> {
  if is_backend_only(&key) {
    return Err(BACKEND_ONLY_REFUSED.to_string());
  }
  backend_delete(&key)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn account_name_trims_whitespace() {
    assert_eq!(
      account_name("  connector_credentials_v1  "),
      "connector_credentials_v1"
    );
  }

  #[test]
  fn account_name_preserves_internal_structure() {
    assert_eq!(
      account_name("connector:telegram:api_key"),
      "connector:telegram:api_key"
    );
  }

  #[test]
  fn secure_credential_set_rejects_empty_key() {
    let result = secure_credential_set(String::new(), "value".to_string());
    assert!(result.is_err());
  }

  #[test]
  fn secure_credential_get_returns_none_for_empty_key_without_touching_os_store() {
    // Empty-key short-circuit must not even attempt to open a keyring entry —
    // verified by the fact this returns Ok(None) rather than propagating
    // whatever error an empty-account Entry::new would produce.
    let result = secure_credential_get(String::new());
    assert_eq!(result, Ok(None));
  }

  const REFRESH: &str = crate::phone_signin::REFRESH_KEY;
  const SLOT: &str = crate::phone_box::PRIVATE_KEY_SLOT;

  #[test]
  fn the_window_cannot_read_or_change_backend_only_secrets() {
    let refused = Err(BACKEND_ONLY_REFUSED.to_string());
    for key in [REFRESH, SLOT, " alphonso_phone_link_private_key "] {
      assert_eq!(secure_credential_get(key.to_string()), refused.clone().map(|()| None));
      assert_eq!(secure_credential_set(key.to_string(), "x".to_string()), refused);
      assert_eq!(secure_credential_delete(key.to_string()), refused);
    }
    assert!(!is_backend_only("connector_credentials_v1"));
  }

  #[test]
  fn secure_credential_delete_is_a_no_op_for_empty_key() {
    let result = secure_credential_delete(String::new());
    assert!(result.is_ok());
  }

  // The following exercise the real OS credential store and are excluded
  // from the default `cargo test` run (CI's ubuntu-latest runner has no
  // D-Bus Secret Service daemon in its headless container, so these would
  // fail or hang there, not because the code is wrong). Run manually with
  // `cargo test -- --ignored` on a machine with a real credential store
  // (this was done on this session's Windows dev machine — see the
  // Truth-First plan B3 evidence for the actual manual run's output).
  #[test]
  #[ignore]
  fn round_trip_set_get_delete_against_the_real_os_credential_store() {
    let key = "alphonso_test_secure_credential_store_round_trip";
    // Clean up any leftover from a previous failed run before asserting.
    let _ = secure_credential_delete(key.to_string());

    assert_eq!(secure_credential_get(key.to_string()), Ok(None));

    secure_credential_set(key.to_string(), "test-value-123".to_string())
      .expect("set should succeed against a real OS credential store");
    assert_eq!(
      secure_credential_get(key.to_string()),
      Ok(Some("test-value-123".to_string()))
    );

    secure_credential_set(key.to_string(), "overwritten-value".to_string())
      .expect("overwrite should succeed");
    assert_eq!(
      secure_credential_get(key.to_string()),
      Ok(Some("overwritten-value".to_string()))
    );

    secure_credential_delete(key.to_string()).expect("delete should succeed");
    assert_eq!(secure_credential_get(key.to_string()), Ok(None));

    // Deleting an already-absent entry must stay a no-op, not an error.
    secure_credential_delete(key.to_string()).expect("second delete should still succeed");
  }
}
