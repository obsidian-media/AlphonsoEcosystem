interface ImportResult {
  imported: number;
  errors: string[];
}

const PREFIX = 'alphonso_';

// Keys that hold secrets. They are never written into an export or backup
// file (people share those files), and an import never writes them. Until
// 2026-10-21 Workspace Export included every alphonso_* key, which meant the
// plugin-signing private key and any credentials not yet moved to the OS
// keychain ended up in a plain JSON file.
const SECRET_STORAGE_KEYS = new Set([
  'alphonso_connector_credentials_v1',
  'alphonso_composio_api_key_v1',
  'alphonso_license_token',
  'alphonso_license',
  'alphonso_plugin_signer_keypair_v1',
]);

// Field names inside stored objects that look like secrets. Real keys live in
// the OS keychain, so these should be empty; this is a safety net.
const SECRET_FIELD = /^(api_?key|.*token|.*secret|password|private_?key)$/i;

export function isSecretStorageKey(key: string): boolean {
  return SECRET_STORAGE_KEYS.has(key);
}

/** Copy of `value` with secret-named fields removed, at any depth. */
export function stripSecretFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSecretFields);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (!SECRET_FIELD.test(k)) out[k] = stripSecretFields(v);
    }
    return out;
  }
  return value;
}

/** Every alphonso_* localStorage entry except secrets, parsed where possible. */
export function collectExportableStorage(): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(PREFIX) || isSecretStorageKey(key)) continue;
    const raw = localStorage.getItem(key);
    let value: unknown = raw;
    try { value = JSON.parse(raw as string); } catch { /* keep the raw string */ }
    data[key] = stripSecretFields(value);
  }
  return data;
}

export function exportWorkspace(): string {
  return JSON.stringify(collectExportableStorage(), null, 2);
}

export function importWorkspace(jsonString: string): ImportResult {
  const errors: string[] = [];
  let imported = 0;
  try {
    const data = JSON.parse(jsonString) as Record<string, unknown>;
    Object.entries(data).forEach(([key, value]) => {
      if (!key.startsWith(PREFIX)) { errors.push(`Skipped non-alphonso key: ${key}`); return; }
      if (isSecretStorageKey(key)) { errors.push(`Skipped secret key: ${key}`); return; }
      try {
        localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
        imported++;
      } catch (e: unknown) { errors.push(`Failed to import ${key}: ${(e as Error).message}`); }
    });
  } catch (e) {
    errors.push(`Invalid JSON: ${(e as Error).message}`);
  }
  return { imported, errors };
}