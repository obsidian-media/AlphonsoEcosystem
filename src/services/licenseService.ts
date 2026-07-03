import { invoke } from '@tauri-apps/api/core';

const LICENSE_KEY = 'alphonso_license';

export type LicenseTier = 'free' | 'pro' | 'enterprise';

export interface LicenseInfo {
  tier: LicenseTier;
  key: string | null;
  activatedAt: string | null;
  expiresAt: string | null;
  features: string[];
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

export function getLicenseInfo(): LicenseInfo {
  try {
    const raw = localStorage.getItem(LICENSE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        tier: parsed.tier || 'free',
        key: parsed.key || null,
        activatedAt: parsed.activatedAt || null,
        expiresAt: parsed.expiresAt || null,
        features: getFeaturesForTier(parsed.tier || 'free')
      };
    }
  } catch { /* fall back to free tier below */ }
  return {
    tier: 'free',
    key: null,
    activatedAt: null,
    expiresAt: null,
    features: FREE_FEATURES
  };
}

export function isPremiumConnector(connectorId: string): boolean {
  return PREMIUM_CONNECTORS.has(String(connectorId || '').toLowerCase());
}

export function canUseConnector(connectorId: string): boolean {
  const license = getLicenseInfo();
  const id = String(connectorId || '').toLowerCase();
  if (!isPremiumConnector(id)) return true;
  return license.features.includes(id);
}

export async function activateLicense(key: string): Promise<{ success: boolean; tier: LicenseTier; error?: string }> {
  const trimmed = String(key || '').trim();
  if (!trimmed) {
    return { success: false, tier: 'free', error: 'License key is required' };
  }

  const tier = validateLicenseKey(trimmed);
  if (!tier) {
    return { success: false, tier: 'free', error: 'Invalid license key' };
  }

  const license: LicenseInfo = {
    tier,
    key: trimmed,
    activatedAt: new Date().toISOString(),
    expiresAt: null,
    features: getFeaturesForTier(tier)
  };

  localStorage.setItem(LICENSE_KEY, JSON.stringify(license));
  try {
    await invoke('kv_set', { key: LICENSE_KEY, value: JSON.stringify(license) });
  } catch { /* SQLite not available outside Tauri — localStorage write above already succeeded */ }

  return { success: true, tier };
}

export async function deactivateLicense(): Promise<void> {
  localStorage.removeItem(LICENSE_KEY);
  try {
    await invoke('kv_set', { key: LICENSE_KEY, value: '' });
  } catch { /* SQLite not available outside Tauri — localStorage removal above already succeeded */ }
}

function validateLicenseKey(key: string): LicenseTier | null {
  const pattern = /^ALPHONSO-(PRO|ENT)-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
  const match = key.match(pattern);
  if (!match) return null;
  if (match[1] === 'PRO') return 'pro';
  if (match[1] === 'ENT') return 'enterprise';
  return null;
}
