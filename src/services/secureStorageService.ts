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
 *
 * `secureSet` does NOT fall back to writing the value into localStorage on a
 * keychain failure — matching the precedent `connectorAuth.ts`'s own
 * `writeAllCredentials` already established (fire-and-forget the keychain
 * write, keep the caller's own in-memory state as the only in-session
 * fallback). Two earlier versions of this function did write to localStorage
 * on failure (or unconditionally); CodeQL correctly flagged both as
 * clear-text storage of sensitive data — a value tainted as sensitive
 * reaching `localStorage.setItem` on any reachable path is a real finding
 * regardless of which branch guards it. A keychain write failing means the
 * value isn't durably persisted outside the current session (browser dev
 * mode, OS keychain access denied); callers that need the value to survive
 * that already hold it in their own in-memory cache for as long as the
 * session lasts.
 */

export async function secureSet(key: string, value: string): Promise<boolean> {
  try {
    await invoke('secure_credential_set', { key, value });
  } catch {
    // Keychain unavailable (browser dev mode, OS keychain access denied,
    // etc.) — the caller's own in-memory state is the only fallback; see
    // the module doc comment above for why this doesn't write localStorage.
    return false;
  }
  // The keychain has it now — clear any localStorage copy so a legacy
  // pre-migration value (which secureGet's fallback would otherwise keep
  // finding) doesn't linger in plaintext once it's safely in the keychain.
  try {
    localStorage.removeItem(key);
  } catch {
    /* localStorage unavailable */
  }
  return true;
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
