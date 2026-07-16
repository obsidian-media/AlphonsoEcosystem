import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(null)
}));

import {
  getLicenseInfo,
  activateLicense,
  deactivateLicense,
  canUseConnector,
  isPremiumConnector,
  __setTrustedPublicKeyForTests
} from '../services/licenseService';
import { generateLicenseKeypair, mintLicenseToken, type LicenseKeypair } from './helpers/mintLicense';

describe('licenseService', () => {
  let kp: LicenseKeypair;

  beforeEach(async () => {
    localStorage.clear();
    kp = await generateLicenseKeypair();
    __setTrustedPublicKeyForTests(kp.publicJwk);
    await deactivateLicense();
  });

  const proToken = () => mintLicenseToken(kp.keyPair, { v: 1, tier: 'pro', iat: Date.now(), exp: null });

  describe('getLicenseInfo', () => {
    it('returns free tier by default', () => {
      const info = getLicenseInfo();
      expect(info.tier).toBe('free');
      expect(info.key).toBeNull();
      expect(info.features).toContain('ollama');
      expect(info.features).toContain('telegram');
    });

    it('does not include premium features for free tier', () => {
      const info = getLicenseInfo();
      expect(info.features).not.toContain('claude');
      expect(info.features).not.toContain('chatgpt');
    });
  });

  describe('activateLicense', () => {
    it('activates pro tier with a validly signed token', async () => {
      const result = await activateLicense(await proToken());
      expect(result.success).toBe(true);
      expect(result.tier).toBe('pro');
    });

    it('rejects a legacy regex key', async () => {
      const result = await activateLicense('ALPHONSO-PRO-ABCD-1234-EFGH');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid license key');
    });

    it('rejects empty key', async () => {
      const result = await activateLicense('');
      expect(result.success).toBe(false);
      expect(result.error).toBe('License key is required');
    });

    it('pro token unlocks premium features', async () => {
      await activateLicense(await proToken());
      const info = getLicenseInfo();
      expect(info.features).toContain('claude');
      expect(info.features).toContain('youtube');
    });
  });

  describe('deactivateLicense', () => {
    it('resets to free tier', async () => {
      await activateLicense(await proToken());
      await deactivateLicense();
      expect(getLicenseInfo().tier).toBe('free');
      expect(getLicenseInfo().key).toBeNull();
    });
  });

  describe('isPremiumConnector', () => {
    it('returns true for premium connectors', () => {
      expect(isPremiumConnector('claude')).toBe(true);
      expect(isPremiumConnector('youtube')).toBe(true);
    });
    it('returns false for free connectors', () => {
      expect(isPremiumConnector('telegram')).toBe(false);
      expect(isPremiumConnector('ollama')).toBe(false);
    });
  });

  describe('canUseConnector', () => {
    it('allows free connectors on free tier', () => {
      expect(canUseConnector('telegram')).toBe(true);
    });
    it('blocks premium connectors on free tier', () => {
      expect(canUseConnector('claude')).toBe(false);
    });
    it('allows premium connectors after valid activation', async () => {
      await activateLicense(await proToken());
      expect(canUseConnector('claude')).toBe(true);
    });
  });
});
