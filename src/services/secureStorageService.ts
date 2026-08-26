import { invoke } from '@tauri-apps/api/core';

/**
 * Shared wrapper over the OS-backed secure credential store
 * (`src-tauri/src/os_keychain_store.rs`'s `secure_credential_*` commands —
 * Windows Credential Manager / macOS Keychain / Linux Secret Service).
 *
 * Most connector credentials already go through this store via
 * `connectorAuth.ts`'s own inline `secure_credential_set` calls. This module
 * exists for callers that don't share connectorAuth's single-JSON-blob
 * shape — a standalone secret keyed by its own name (the license token is
 * the first caller; see `licenseService.ts`).
 *
 * `secureGet` falls back to `localStorage` when the keychain has no entry —
 * this is a read-path migration for a value written before this module
 * existed, not a general offline mode. A get that finds nothing in either
 * place returns `null`, same as an empty keychain.
 */

export async function secureSet(key: string, value: string): Promise<void> {
  let keychainOk = false;
  try {
    await invoke('secure_credential_set', { key, value });
    keychainOk = true;
  } catch {
    // Keychain unavailable (browser dev mode, OS keychain access denied,
    // etc.) — fall through to the localStorage fallback below.
  }
  if (keychainOk) {
    // The keychain has it now — clear any localStorage copy so the secret
    // doesn't sit there in plaintext. (An earlier version of this function
    // always mirrored to localStorage regardless of keychain outcome, which
    // CodeQL correctly flagged as clear-text storage of sensitive data: it
    // meant every "migrated" secret was still permanently readable from
    // localStorage, defeating the entire point of this module.)
    try {
      localStorage.removeItem(key);
    } catch {
      /* localStorage unavailable */
    }
    return;
  }
  try {
    localStorage.setItem(key, value);
  } catch {
    /* localStorage unavailable */
  }
}

export async function secureGet(key: string): Promise<string | null> {
  try {
    const value = await invoke<string | null>('secure_credential_get', { key });
    if (value !== null && value !== undefined) return value;
  } catch {
    /* keychain unavailable */
  }
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function secureDelete(key: string): Promise<void> {
  try {
    await invoke('secure_credential_delete', { key });
  } catch {
    /* keychain unavailable */
  }
  try {
    localStorage.removeItem(key);
  } catch {
    /* localStorage unavailable */
  }
}
