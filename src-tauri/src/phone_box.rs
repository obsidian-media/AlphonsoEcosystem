//! Sealing messages between this computer and a paired phone (phone app; moved to the backend
//! 2026-11-03). The window's security policy blocks WebAssembly, which libsodium needs, and the
//! computer's private key is better kept out of the window anyway: it stays in the OS keychain
//! and only this module reads it. Byte-compatible with the phone's libsodium: `crypto_box_easy`
//! with the 24-byte nonce in front, and `crypto_box_seal`, all base64url without padding
//! (checked against fixed samples libsodium made, `tests/fixtures/phone_box_vectors.json`).
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use crypto_box::aead::{Aead, AeadCore, OsRng};
use crypto_box::{PublicKey, SalsaBox, SecretKey};

/// The keychain slot of this computer's private key (the same one the window used before).
pub(crate) const PRIVATE_KEY_SLOT: &str = "alphonso_phone_link_private_key";
const NONCE_LEN: usize = 24;
const TAG_LEN: usize = 16;
type Nonce = [u8; NONCE_LEN];

fn key32(text: &str) -> Option<[u8; 32]> {
  let bytes = URL_SAFE_NO_PAD.decode(text.trim()).ok()?;
  bytes.try_into().ok()
}

fn salsa(their_public: &str, my_private: &str) -> Option<SalsaBox> {
  let their = PublicKey::from(key32(their_public)?);
  let mine = SecretKey::from(key32(my_private)?);
  Some(SalsaBox::new(&their, &mine))
}

/// The public key (base64url) for a private key (base64url), or None when it isn't one.
pub(crate) fn public_from_private(private_b64: &str) -> Option<String> {
  let secret = SecretKey::from(key32(private_b64)?);
  Some(URL_SAFE_NO_PAD.encode(secret.public_key().as_bytes()))
}

/// `crypto_box_easy` with a given nonce, framed as the phone frames it: nonce, then box.
pub(crate) fn seal_with_nonce(
  message: &[u8],
  nonce: &Nonce,
  their_public: &str,
  my_private: &str,
) -> Result<String, String> {
  if key32(their_public).is_none() {
    return Err("That phone's key isn't valid.".to_string());
  }
  let sealer = salsa(their_public, my_private).ok_or("This computer's key isn't valid.")?;
  let sealed = sealer.encrypt(nonce.into(), message);
  let boxed = sealed.map_err(|_| "The message couldn't be sealed.".to_string())?;
  let mut framed = Vec::with_capacity(NONCE_LEN + boxed.len());
  framed.extend_from_slice(nonce);
  framed.extend_from_slice(&boxed);
  Ok(URL_SAFE_NO_PAD.encode(framed))
}

/// Opens a framed message, or None when it doesn't open with these keys (changed, wrong keys,
/// not a frame).
pub(crate) fn open_with(sealed: &str, their_public: &str, my_private: &str) -> Option<Vec<u8>> {
  let raw = URL_SAFE_NO_PAD.decode(sealed.trim()).ok()?;
  if raw.len() <= NONCE_LEN + TAG_LEN {
    return None;
  }
  let (nonce, boxed) = raw.split_at(NONCE_LEN);
  let opener = salsa(their_public, my_private)?;
  opener.decrypt(nonce.into(), boxed).ok()
}

/// Opens a `crypto_box_seal` frame (the phone's pairing request), or None.
pub(crate) fn open_anonymous_with(sealed: &str, my_private: &str) -> Option<Vec<u8>> {
  let raw = URL_SAFE_NO_PAD.decode(sealed.trim()).ok()?;
  SecretKey::from(key32(my_private)?).unseal(&raw).ok()
}

/// This computer's private key from the keychain, made and saved the first time.
fn private_key() -> Result<String, String> {
  if let Some(saved) = crate::os_keychain_store::backend_get(PRIVATE_KEY_SLOT)? {
    if public_from_private(&saved).is_some() {
      return Ok(saved);
    }
  }
  let fresh = URL_SAFE_NO_PAD.encode(SecretKey::generate(&mut OsRng).to_bytes());
  crate::os_keychain_store::backend_set(PRIVATE_KEY_SLOT, &fresh)
    .map_err(|_| "This computer's keychain refused to keep its phone key.".to_string())?;
  Ok(fresh)
}

/// This computer's public key; its private key stays here.
#[tauri::command]
pub fn phone_link_public_key() -> Result<String, String> {
  let key = private_key()?;
  public_from_private(&key).ok_or_else(|| "This computer's phone key isn't valid.".to_string())
}

#[tauri::command]
pub fn phone_seal(message: String, their_public: String) -> Result<String, String> {
  let nonce: Nonce = SalsaBox::generate_nonce(&mut OsRng).into();
  seal_with_nonce(message.as_bytes(), &nonce, &their_public, &private_key()?)
}

#[tauri::command]
pub fn phone_open(sealed: String, their_public: String) -> Option<String> {
  let key = private_key().ok()?;
  String::from_utf8(open_with(&sealed, &their_public, &key)?).ok()
}

#[tauri::command]
pub fn phone_open_anonymous(sealed: String) -> Option<String> {
  let key = private_key().ok()?;
  String::from_utf8(open_anonymous_with(&sealed, &key)?).ok()
}

#[cfg(test)]
mod tests {
  use super::*;
  use serde_json::Value;

  const VECTORS: &str = include_str!("../tests/fixtures/phone_box_vectors.json");

  fn v(path: &[&str]) -> String {
    let all: Value = serde_json::from_str(VECTORS).unwrap();
    let found = path.iter().fold(&all, |at, key| &at[*key]);
    found.as_str().unwrap().to_string()
  }

  #[test]
  fn seal_matches_libsodium() {
    let nonce: Nonce = URL_SAFE_NO_PAD.decode(v(&["nonce"])).unwrap().try_into().unwrap();
    let message = v(&["message"]);
    let sealed = seal_with_nonce(
      message.as_bytes(),
      &nonce,
      &v(&["b", "publicKey"]),
      &v(&["a", "privateKey"]),
    );
    assert_eq!(sealed.unwrap(), v(&["framed"]));
  }

  #[test]
  fn opens_libsodium_frame() {
    let opened = open_with(&v(&["framed"]), &v(&["a", "publicKey"]), &v(&["b", "privateKey"]));
    assert_eq!(String::from_utf8(opened.unwrap()).unwrap(), v(&["message"]));
  }

  #[test]
  fn opens_libsodium_sealed_box() {
    let opened = open_anonymous_with(&v(&["sealedToB"]), &v(&["b", "privateKey"]));
    assert_eq!(String::from_utf8(opened.unwrap()).unwrap(), v(&["message"]));
  }

  #[test]
  fn wrong_key_is_none() {
    let framed = v(&["framed"]);
    assert!(open_with(&framed, &v(&["b", "publicKey"]), &v(&["b", "privateKey"])).is_none());
    assert!(open_anonymous_with(&v(&["sealedToB"]), &v(&["a", "privateKey"])).is_none());
  }

  #[test]
  fn short_or_bad_base64_is_none() {
    let (pk, sk) = (v(&["a", "publicKey"]), v(&["b", "privateKey"]));
    assert!(open_with("", &pk, &sk).is_none());
    assert!(open_with("not base64!!", &pk, &sk).is_none());
    assert!(open_with(&URL_SAFE_NO_PAD.encode([0u8; 40]), &pk, &sk).is_none());
    assert!(open_anonymous_with("@@", &sk).is_none());
  }

  #[test]
  fn an_existing_private_key_is_reused() {
    let derived = public_from_private(&v(&["a", "privateKey"]));
    assert_eq!(derived.unwrap(), v(&["a", "publicKey"]));
    assert!(public_from_private("short").is_none());
  }

  #[test]
  fn errors_never_carry_the_key() {
    let sk = v(&["a", "privateKey"]);
    let err = seal_with_nonce(b"x", &[0u8; NONCE_LEN], "bad", &sk).unwrap_err();
    assert!(!err.contains(&sk));
    let pk = v(&["b", "publicKey"]);
    let err = seal_with_nonce(b"x", &[0u8; NONCE_LEN], &pk, "bad-private").unwrap_err();
    assert!(!err.contains("bad-private"));
  }
}
