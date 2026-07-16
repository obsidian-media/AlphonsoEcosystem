import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(null)
}));

import {
  getLicenseInfo,
  isPremiumConnector,
  canUseConnector,
  activateLicense,
  deactivateLicense,
  initLicense,
  __setTrustedPublicKeyForTests
} from '../../services/licenseService';
import { generateLicenseKeypair, mintLicenseToken, type LicenseKeypair } from '../helpers/mintLicense';

describe('licenseService (signed-token)', () => {
  const storage: Record<string, string> = {};
  const localStorageMock = {
    getItem: vi.fn((k: string) => storage[k] ?? null),
    setItem: vi.fn((k: string, v: string) => { storage[k] = v; }),
    removeItem: vi.fn((k: string) => { delete storage[k]; }),
    clear: vi.fn(() => { Object.keys(storage).forEach(k => delete storage[k]); })
  };

  let kp: LicenseKeypair;

  beforeEach(async () => {
    Object.keys(storage).forEach(k => delete storage[k]);
    vi.stubGlobal('localStorage', localStorageMock);
    vi.clearAllMocks();
    kp = await generateLicenseKeypair();
    __setTrustedPublicKeyForTests(kp.publicJwk);
    // reset in-memory verified state to free
    await deactivateLicense();
  });

  async function proToken(overrides: Record<string, unknown> = {}) {
    return mintLicenseToken(kp.keyPair, { v: 1, tier: 'pro', iat: Date.now(), exp: null, ...overrides });
  }
  async function entToken() {
    return mintLicenseToken(kp.keyPair, { v: 1, tier: 'enterprise', iat: Date.now(), exp: null });
  }

  describe('default / free tier', () => {
    it('is free with no license', () => {
      const info = getLicenseInfo();
      expect(info.tier).toBe('free');
      expect(info.key).toBeNull();
      expect(info.features).toContain('ollama');
      expect(info.features).not.toContain('claude');
    });
  });

  describe('activateLicense — signature enforcement', () => {
    it('activates a validly signed PRO token', async () => {
      const result = await activateLicense(await proToken());
      expect(result.success).toBe(true);
      expect(result.tier).toBe('pro');
      expect(getLicenseInfo().features).toContain('claude');
    });

    it('activates a validly signed ENTERPRISE token', async () => {
      const result = await activateLicense(await entToken());
      expect(result.success).toBe(true);
      expect(result.tier).toBe('enterprise');
      expect(getLicenseInfo().features).toContain('sso');
    });

    it('REJECTS a legacy regex-style key (the old bypass)', async () => {
      const result = await activateLicense('ALPHONSO-PRO-ABCD-1234-EFGH');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid license key');
      expect(getLicenseInfo().tier).toBe('free');
    });

    it('REJECTS a token signed by a different (attacker) key', async () => {
      const attacker = await generateLicenseKeypair();
      const forged = await mintLicenseToken(attacker.keyPair, { v: 1, tier: 'enterprise', iat: Date.now(), exp: null });
      const result = await activateLicense(forged);
      expect(result.success).toBe(false);
      expect(getLicenseInfo().tier).toBe('free');
    });

    it('REJECTS a token whose payload was tampered after signing', async () => {
      const token = await proToken();
      const [, sig] = token.split('.');
      // swap in an enterprise payload but keep the pro signature
      const tampered = btoa(JSON.stringify({ v: 1, tier: 'enterprise' }))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') + '.' + sig;
      const result = await activateLicense(tampered);
      expect(result.success).toBe(false);
      expect(getLicenseInfo().tier).toBe('free');
    });

    it('REJECTS an expired token', async () => {
      const expired = await proToken({ exp: Date.now() - 1000 });
      const result = await activateLicense(expired);
      expect(result.success).toBe(false);
      expect(getLicenseInfo().tier).toBe('free');
    });

    it('rejects empty input', async () => {
      const result = await activateLicense('');
      expect(result.success).toBe(false);
      expect(result.error).toBe('License key is required');
    });

    it('fails closed when no trusted key is configured', async () => {
      __setTrustedPublicKeyForTests(null);
      const result = await activateLicense(await proToken());
      expect(result.success).toBe(false);
      expect(getLicenseInfo().tier).toBe('free');
    });
  });

  describe('storage-tampering resistance', () => {
    it('does NOT grant a tier from a hand-written localStorage entry', async () => {
      storage['alphonso_license'] = JSON.stringify({ tier: 'enterprise' });
      storage['alphonso_license_token'] = 'not.a.valid.token';
      await initLicense();
      expect(getLicenseInfo().tier).toBe('free');
      expect(canUseConnector('claude')).toBe(false);
    });

    it('grants tier at boot only from a stored valid token', async () => {
      storage['alphonso_license_token'] = await proToken();
      await initLicense();
      expect(getLicenseInfo().tier).toBe('pro');
      expect(canUseConnector('claude')).toBe(true);
    });

    it('clears the legacy insecure key on init', async () => {
      storage['alphonso_license'] = JSON.stringify({ tier: 'pro' });
      await initLicense();
      expect(storage['alphonso_license']).toBeUndefined();
    });
  });

  describe('isPremiumConnector', () => {
    it('flags premium connectors, case-insensitively', () => {
      expect(isPremiumConnector('claude')).toBe(true);
      expect(isPremiumConnector('CHATGPT')).toBe(true);
      expect(isPremiumConnector('ollama')).toBe(false);
      expect(isPremiumConnector('')).toBe(false);
      expect(isPremiumConnector(null as unknown as string)).toBe(false);
    });
  });

  describe('canUseConnector', () => {
    it('allows free connectors regardless of tier', () => {
      expect(canUseConnector('ollama')).toBe(true);
      expect(canUseConnector('telegram')).toBe(true);
    });

    it('blocks premium connectors on free tier', () => {
      expect(canUseConnector('claude')).toBe(false);
    });

    it('allows premium connectors after a valid activation', async () => {
      await activateLicense(await proToken());
      expect(canUseConnector('claude')).toBe(true);
    });
  });

  describe('deactivateLicense', () => {
    it('resets to free and clears the token', async () => {
      await activateLicense(await proToken());
      await deactivateLicense();
      expect(getLicenseInfo().tier).toBe('free');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('alphonso_license_token');
    });
  });
});
