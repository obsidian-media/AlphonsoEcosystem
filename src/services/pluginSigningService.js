import { TRUST_STATES, timestampMs } from './trustModel';
import { appendPluginAuditEntry } from './pluginRegistryService';

const KEYPAIR_KEY = 'alphonso_plugin_signer_keypair_v1';
const TRUSTED_KEYS_KEY = 'alphonso_plugin_trusted_signer_keys_v1';
const SIGNATURE_ALGO = { name: 'ECDSA', namedCurve: 'P-256', hash: { name: 'SHA-256' } };

function base64UrlEncode(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str) {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)).buffer;
}

async function getKeyPair() {
  try {
    const raw = localStorage.getItem(KEYPAIR_KEY);
    if (raw) {
      const stored = JSON.parse(raw);
      const privateKey = await crypto.subtle.importKey(
        'pkcs8', base64UrlDecode(stored.privateKey),
        SIGNATURE_ALGO, false, ['sign']
      );
      const publicKey = await crypto.subtle.importKey(
        'spki', base64UrlDecode(stored.publicKey),
        SIGNATURE_ALGO, true, ['verify']
      );
      return { privateKey, publicKey, publicKeyJwk: stored.publicKeyJwk };
    }
  } catch { /* generate new */ }
  return null;
}

async function generateAndStoreKeyPair() {
  const keyPair = await crypto.subtle.generateKey(SIGNATURE_ALGO, true, ['sign', 'verify']);
  const privateKeyRaw = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
  const publicKeyRaw = await crypto.subtle.exportKey('spki', keyPair.publicKey);
  const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  localStorage.setItem(KEYPAIR_KEY, JSON.stringify({
    privateKey: base64UrlEncode(privateKeyRaw),
    publicKey: base64UrlEncode(publicKeyRaw),
    publicKeyJwk,
    createdAt: Date.now()
  }));
  return { privateKey: keyPair.privateKey, publicKey: keyPair.publicKey, publicKeyJwk };
}

export async function getOrCreateSignerKeys() {
  const existing = await getKeyPair();
  if (existing) return existing;
  return generateAndStoreKeyPair();
}

export async function signPluginManifest(manifestObj) {
  const { privateKey } = await getOrCreateSignerKeys();
  const manifestJson = JSON.stringify(manifestObj, Object.keys(manifestObj).sort());
  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    privateKey,
    encoder.encode(manifestJson)
  );
  const signatureB64 = base64UrlEncode(signature);
  appendPluginAuditEntry({
    pluginId: manifestObj.id || 'unknown',
    action: 'manifest_signed',
    trust: TRUST_STATES.VERIFIED,
    details: { signatureLength: signatureB64.length }
  });
  return {
    ...manifestObj,
    signature: signatureB64,
    signedAt: new Date().toISOString()
  };
}

export async function verifyPluginSignature(manifestObj) {
  if (!manifestObj || !manifestObj.signature) {
    return { ok: false, reason: 'No signature present on manifest.' };
  }
  const signature = base64UrlDecode(manifestObj.signature);
  const { signature: _, signedAt: __, ...cleanManifest } = manifestObj;
  const manifestJson = JSON.stringify(cleanManifest, Object.keys(cleanManifest).sort());
  const encoder = new TextEncoder();

  const keyPair = await getKeyPair();
  if (keyPair) {
    try {
      const valid = await crypto.subtle.verify(
        { name: 'ECDSA', hash: { name: 'SHA-256' } },
        keyPair.publicKey,
        signature,
        encoder.encode(manifestJson)
      );
      if (valid) return { ok: true, trusted: 'local_signer' };
    } catch { /* fall through */ }
  }

  const trustedKeys = getTrustedSignerKeys();
  for (const trustedKeyJwk of trustedKeys) {
    try {
      const trustedKey = await crypto.subtle.importKey(
        'jwk', trustedKeyJwk, SIGNATURE_ALGO, false, ['verify']
      );
      const valid = await crypto.subtle.verify(
        { name: 'ECDSA', hash: { name: 'SHA-256' } },
        trustedKey, signature, encoder.encode(manifestJson)
      );
      if (valid) return { ok: true, trusted: 'trusted_signer' };
    } catch { /* continue */ }
  }
  return { ok: false, reason: 'Signature does not match any trusted signer key.' };
}

export function getTrustedSignerKeys() {
  try { return JSON.parse(localStorage.getItem(TRUSTED_KEYS_KEY) || '[]'); }
  catch { return []; }
}

export function addTrustedSignerKey(publicKeyJwk) {
  const current = getTrustedSignerKeys();
  if (!publicKeyJwk || !publicKeyJwk.kty) return false;
  const exists = current.some((k) => JSON.stringify(k) === JSON.stringify(publicKeyJwk));
  if (exists) return false;
  current.push({ ...publicKeyJwk, addedAt: Date.now() });
  localStorage.setItem(TRUSTED_KEYS_KEY, JSON.stringify(current));
  appendPluginAuditEntry({
    pluginId: 'system', action: 'trusted_signer_added',
    trust: TRUST_STATES.VERIFIED, details: { keyType: publicKeyJwk.kty }
  });
  return true;
}

export function removeTrustedSignerKey(index) {
  const current = getTrustedSignerKeys();
  if (index < 0 || index >= current.length) return false;
  current.splice(index, 1);
  localStorage.setItem(TRUSTED_KEYS_KEY, JSON.stringify(current));
  appendPluginAuditEntry({ pluginId: 'system', action: 'trusted_signer_removed', trust: TRUST_STATES.VERIFIED });
  return true;
}

export function exportPublicKeyJwk() {
  return getOrCreateSignerKeys().then((k) => k.publicKeyJwk).catch(() => null);
}

export async function verifyAndAddPlugin(manifestObj) {
  const verification = await verifyPluginSignature(manifestObj);
  if (!verification.ok) {
    return { ok: false, reason: verification.reason, plugin: null };
  }
  const { listPlugins } = await import('./pluginRegistryService');
  const existing = listPlugins();
  if (existing.some((p) => p.id === manifestObj.id)) {
    return { ok: false, reason: `Plugin '${manifestObj.id}' is already installed.`, plugin: null };
  }
  const newPlugin = {
    id: manifestObj.id, name: manifestObj.name || manifestObj.id,
    description: manifestObj.description || '', version: manifestObj.version || '1.0.0',
    author: manifestObj.author || 'Unknown', enabled: false,
    permissions: manifestObj.permissions || [], panels: manifestObj.panels || [],
    tools: manifestObj.tools || [], workflows: manifestObj.workflows || [],
    memoryHandlers: manifestObj.memoryHandlers || [], status: 'marketplace',
    trust: TRUST_STATES.VERIFIED, manifestVersion: '1.0.0',
    signature: manifestObj.signature, signedBy: verification.trusted,
    installedAt: timestampMs()
  };
  existing.push(newPlugin);
  localStorage.setItem('alphonso_plugins_v1', JSON.stringify(existing));
  appendPluginAuditEntry({
    pluginId: manifestObj.id, action: 'installed_from_marketplace',
    trust: TRUST_STATES.VERIFIED, details: { signedBy: verification.trusted, version: manifestObj.version }
  });
  return { ok: true, plugin: newPlugin };
}
