import { invoke } from '@tauri-apps/api/core';
import { LICENSE_TRUST_KEY } from '../config/licenseTrustKey';

/**
 * License service — offline, signature-verified tiers.
 *
 * A license is a signed token: `base64url(payloadJSON).base64url(ECDSA-P256/SHA-256 signature)`.
 * The tier a user is granted comes ONLY from a token whose signature verifies
 * against the vendor public key (`LICENSE_TRUST_KEY`) and whose `exp` is in the
 * future. Storage is treated as untrusted: the verified tier lives in memory
 * (`verified`) and is recomputed by verifying the stored token at boot
 * (`initLicense`) or on `activateLicense`. Writing `{tier:'pro'}` into
 * localStorage — the old bypass — now grants nothing.
 */

const LICENSE_TOKEN_KEY = 'alphonso_license_token';
// Legacy key from the pre-signature scheme; cleared on init so stale insecure
// state can't linger and be misread by anything still looking for it.
const LEGACY_LICENSE_KEY = 'alphonso_license';

export type LicenseTier = 'free' | 'pro' | 'enterprise';

export interface LicenseInfo {
  tier: LicenseTier;
  key: string | null;
  activatedAt: string | null;
  expiresAt: string | null;
  features: string[];
}

interface LicensePayload {
  v: number;
  tier: LicenseTier;
  sub?: string;
  iat?: number;
  exp?: number | null;
  lid?: string;
}

const FREE_FEATURES = [
  'ollama',
  'telegram',
  'brave_search',
  'all_agents',
  'local_memory',
  'community_support'
];

const PRO_FEATURES = [
  ...FREE_FEATURES,
  'claude',
  'chatgpt',
  'youtube',
  'notion',
  'clickup',
  'whatsapp',
  'sd_webui',
  'comfyui',
  'priority_support',
  'early_access'
];

const ENTERPRISE_FEATURES = [
  ...PRO_FEATURES,
  'multi_user',
  'admin_dashboard',
  'sso',
  'audit_logs',
  'custom_agents',
  'dedicated_support'
];

const PREMIUM_CONNECTORS = new Set([
  'claude',
  'chatgpt',
  'youtube',
  'notion',
  'clickup',
  'whatsapp',
  'sd_webui',
  'comfyui'
]);

function getFeaturesForTier(tier: LicenseTier): string[] {
  switch (tier) {
    case 'pro': return PRO_FEATURES;
    case 'enterprise': return ENTERPRISE_FEATURES;
    default: return FREE_FEATURES;
  }
}

function freeLicense(): LicenseInfo {
  return { tier: 'free', key: null, activatedAt: null, expiresAt: null, features: FREE_FEATURES };
}

// --- verified in-memory state (the only source of truth for gating) ---------
let trustedKeyJwk: JsonWebKey | null = LICENSE_TRUST_KEY;
let verified: LicenseInfo = freeLicense();

/**
 * Test-only seam: inject a trusted public JWK so tests can verify tokens they
 * signed with a locally generated key pair. Not part of the runtime surface —
 * production loads the key from `LICENSE_TRUST_KEY`. (It does not weaken the
 * control: an attacker able to call this already has code execution, against
 * which no client-side check can defend.)
 */
export function __setTrustedPublicKeyForTests(jwk: JsonWebKey | null): void {
  trustedKeyJwk = jwk;
}

// --- base64url helpers (mirrors pluginSigningService) -----------------------
// Return type is Uint8Array<ArrayBuffer> (not the generic Uint8Array) so it
// satisfies crypto.subtle's BufferSource WebIDL type-check — same pattern
// pluginSigningService uses.
function base64UrlDecode(str: string): Uint8Array<ArrayBuffer> {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

interface VerifyResult {
  valid: boolean;
  payload?: LicensePayload;
  error?: string;
}

async function verifyLicenseToken(token: string): Promise<VerifyResult> {
  if (!trustedKeyJwk) {
    return { valid: false, error: 'No trusted license key configured' };
  }
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { valid: false, error: 'Malformed license token' };
  }
  const [payloadB64, sigB64] = parts;

  let payload: LicensePayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64)));
  } catch {
    return { valid: false, error: 'Malformed license payload' };
  }

  let ok = false;
  try {
    const key = await crypto.subtle.importKey(
      'jwk',
      trustedKeyJwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );
    ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: { name: 'SHA-256' } },
      key,
      base64UrlDecode(sigB64),
      new TextEncoder().encode(payloadB64)
    );
  } catch {
    return { valid: false, error: 'License verification failed' };
  }
  if (!ok) return { valid: false, error: 'Invalid license signature' };

  if (payload.tier !== 'pro' && payload.tier !== 'enterprise') {
    return { valid: false, error: 'Invalid license tier' };
  }
  if (payload.exp != null && Date.now() > payload.exp) {
    return { valid: false, error: 'License expired' };
  }
  return { valid: true, payload };
}

function licenseFromPayload(p: LicensePayload, token: string): LicenseInfo {
  return {
    tier: p.tier,
    key: p.lid ?? `${token.slice(0, 12)}…`,
    activatedAt: p.iat ? new Date(p.iat).toISOString() : new Date().toISOString(),
    expiresAt: p.exp != null ? new Date(p.exp).toISOString() : null,
    features: getFeaturesForTier(p.tier)
  };
}

/**
 * Boot-time initialization: clears legacy insecure state, then verifies any
 * stored token and sets the in-memory tier. Until this resolves the tier is
 * free (fail-closed). Call once at app startup.
 */
export async function initLicense(): Promise<LicenseInfo> {
  try { localStorage.removeItem(LEGACY_LICENSE_KEY); } catch { /* localStorage unavailable */ }

  let token: string | null = null;
  try { token = localStorage.getItem(LICENSE_TOKEN_KEY); } catch { /* localStorage unavailable */ }

  if (!token) {
    verified = freeLicense();
    return getLicenseInfo();
  }
  const res = await verifyLicenseToken(token);
  verified = res.valid && res.payload ? licenseFromPayload(res.payload, token) : freeLicense();
  return getLicenseInfo();
}

export function getLicenseInfo(): LicenseInfo {
  return { ...verified, features: [...verified.features] };
}

export function isPremiumConnector(connectorId: string): boolean {
  return PREMIUM_CONNECTORS.has(String(connectorId || '').toLowerCase());
}

export function canUseConnector(connectorId: string): boolean {
  const id = String(connectorId || '').toLowerCase();
  if (!isPremiumConnector(id)) return true;
  return verified.features.includes(id);
}

export async function activateLicense(
  token: string
): Promise<{ success: boolean; tier: LicenseTier; error?: string }> {
  const trimmed = String(token || '').trim();
  if (!trimmed) {
    return { success: false, tier: 'free', error: 'License key is required' };
  }

  const res = await verifyLicenseToken(trimmed);
  if (!res.valid || !res.payload) {
    // Generic message to the user; specific reason (bad signature / expired /
    // malformed) is intentionally not leaked to avoid aiding forgery probing.
    return { success: false, tier: 'free', error: 'Invalid license key' };
  }

  verified = licenseFromPayload(res.payload, trimmed);
  try { localStorage.setItem(LICENSE_TOKEN_KEY, trimmed); } catch { /* localStorage unavailable */ }
  try {
    await invoke('kv_set', { key: LICENSE_TOKEN_KEY, value: trimmed });
  } catch { /* SQLite not available outside Tauri — localStorage write above already succeeded */ }

  return { success: true, tier: res.payload.tier };
}

export async function deactivateLicense(): Promise<void> {
  verified = freeLicense();
  try { localStorage.removeItem(LICENSE_TOKEN_KEY); } catch { /* localStorage unavailable */ }
  try {
    await invoke('kv_set', { key: LICENSE_TOKEN_KEY, value: '' });
  } catch { /* SQLite not available outside Tauri — localStorage removal above already succeeded */ }
}
