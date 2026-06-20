import { describe, it, expect, beforeEach } from 'vitest';
import {
  getLicenseInfo,
  activateLicense,
  deactivateLicense,
  canUseConnector,
  isPremiumConnector,
  LicenseTier
} from '../services/licenseService';

describe('licenseService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('getLicenseInfo', () => {
    it('returns free tier by default', () => {
      const info = getLicenseInfo();
      expect(info.tier).toBe('free');
      expect(info.key).toBeNull();
      expect(info.features).toContain('ollama');
      expect(info.features).toContain('telegram');
    });

    it('includes free features for free tier', () => {
      const info = getLicenseInfo();
      expect(info.features).toContain('ollama');
      expect(info.features).toContain('telegram');
      expect(info.features).toContain('brave_search');
      expect(info.features).toContain('all_agents');
    });

    it('does not include premium features for free tier', () => {
      const info = getLicenseInfo();
      expect(info.features).not.toContain('claude');
      expect(info.features).not.toContain('chatgpt');
      expect(info.features).not.toContain('youtube');
    });
  });

  describe('activateLicense', () => {
    it('activates pro license with valid key', async () => {
      const result = await activateLicense('ALPHONSO-PRO-ABCD-1234-EFGH');
      expect(result.success).toBe(true);
      expect(result.tier).toBe('pro');
    });

    it('activates enterprise license with valid key', async () => {
      const result = await activateLicense('ALPHONSO-ENT-ABCD-1234-EFGH');
      expect(result.success).toBe(true);
      expect(result.tier).toBe('enterprise');
    });

    it('rejects invalid key', async () => {
      const result = await activateLicense('invalid-key');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid license key');
    });

    it('rejects empty key', async () => {
      const result = await activateLicense('');
      expect(result.success).toBe(false);
      expect(result.error).toBe('License key is required');
    });

    it('persists license to localStorage', async () => {
      await activateLicense('ALPHONSO-PRO-ABCD-1234-EFGH');
      const info = getLicenseInfo();
      expect(info.tier).toBe('pro');
      expect(info.key).toBe('ALPHONSO-PRO-ABCD-1234-EFGH');
      expect(info.activatedAt).not.toBeNull();
    });

    it('pro tier includes premium features', async () => {
      await activateLicense('ALPHONSO-PRO-ABCD-1234-EFGH');
      const info = getLicenseInfo();
      expect(info.features).toContain('claude');
      expect(info.features).toContain('chatgpt');
      expect(info.features).toContain('youtube');
      expect(info.features).toContain('notion');
    });
  });

  describe('deactivateLicense', () => {
    it('resets to free tier', async () => {
      await activateLicense('ALPHONSO-PRO-ABCD-1234-EFGH');
      await deactivateLicense();
      const info = getLicenseInfo();
      expect(info.tier).toBe('free');
      expect(info.key).toBeNull();
    });
  });

  describe('isPremiumConnector', () => {
    it('returns true for premium connectors', () => {
      expect(isPremiumConnector('claude')).toBe(true);
      expect(isPremiumConnector('chatgpt')).toBe(true);
      expect(isPremiumConnector('youtube')).toBe(true);
      expect(isPremiumConnector('notion')).toBe(true);
    });

    it('returns false for free connectors', () => {
      expect(isPremiumConnector('telegram')).toBe(false);
      expect(isPremiumConnector('brave_search')).toBe(false);
      expect(isPremiumConnector('ollama')).toBe(false);
    });
  });

  describe('canUseConnector', () => {
    it('allows free connectors on free tier', () => {
      expect(canUseConnector('telegram')).toBe(true);
      expect(canUseConnector('brave_search')).toBe(true);
    });

    it('blocks premium connectors on free tier', () => {
      expect(canUseConnector('claude')).toBe(false);
      expect(canUseConnector('youtube')).toBe(false);
    });

    it('allows premium connectors on pro tier', async () => {
      await activateLicense('ALPHONSO-PRO-ABCD-1234-EFGH');
      expect(canUseConnector('claude')).toBe(true);
      expect(canUseConnector('youtube')).toBe(true);
    });
  });
});
