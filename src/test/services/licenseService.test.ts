import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(null)
}));

import {
  getLicenseInfo,
  isPremiumConnector,
  canUseConnector,
  activateLicense,
  deactivateLicense
} from '../../services/licenseService';

describe('licenseService', () => {
  const storage = {};
  const localStorageMock = {
    getItem: vi.fn((k) => storage[k] ?? null),
    setItem: vi.fn((k, v) => { storage[k] = v; }),
    removeItem: vi.fn((k) => { delete storage[k]; }),
  };

  beforeEach(() => {
    Object.keys(storage).forEach(k => delete storage[k]);
    vi.stubGlobal('localStorage', localStorageMock);
    vi.clearAllMocks();
  });

  describe('getLicenseInfo', () => {
    it('returns free tier defaults when no license stored', () => {
      const info = getLicenseInfo();
      expect(info.tier).toBe('free');
      expect(info.key).toBeNull();
      expect(info.activatedAt).toBeNull();
      expect(info.expiresAt).toBeNull();
      expect(info.features).toContain('ollama');
      expect(info.features).toContain('telegram');
    });

    it('returns stored license info', () => {
      const license = {
        tier: 'pro',
        key: 'ALPHONSO-PRO-ABCD-1234-EFGH',
        activatedAt: '2024-01-01T00:00:00Z',
        expiresAt: '2025-01-01T00:00:00Z'
      };
      storage['alphonso_license'] = JSON.stringify(license);

      const info = getLicenseInfo();
      expect(info.tier).toBe('pro');
      expect(info.key).toBe('ALPHONSO-PRO-ABCD-1234-EFGH');
      expect(info.features).toContain('claude');
      expect(info.features).toContain('chatgpt');
    });

    it('returns free tier on corrupt JSON', () => {
      storage['alphonso_license'] = 'not-valid-json';
      const info = getLicenseInfo();
      expect(info.tier).toBe('free');
    });

    it('returns enterprise features for enterprise tier', () => {
      storage['alphonso_license'] = JSON.stringify({ tier: 'enterprise' });
      const info = getLicenseInfo();
      expect(info.features).toContain('multi_user');
      expect(info.features).toContain('admin_dashboard');
      expect(info.features).toContain('sso');
    });
  });

  describe('isPremiumConnector', () => {
    it('returns true for premium connectors', () => {
      expect(isPremiumConnector('claude')).toBe(true);
      expect(isPremiumConnector('chatgpt')).toBe(true);
      expect(isPremiumConnector('youtube')).toBe(true);
      expect(isPremiumConnector('notion')).toBe(true);
      expect(isPremiumConnector('whatsapp')).toBe(true);
    });

    it('returns false for free connectors', () => {
      expect(isPremiumConnector('ollama')).toBe(false);
      expect(isPremiumConnector('telegram')).toBe(false);
      expect(isPremiumConnector('brave_search')).toBe(false);
    });

    it('is case-insensitive', () => {
      expect(isPremiumConnector('Claude')).toBe(true);
      expect(isPremiumConnector('CHATGPT')).toBe(true);
    });

    it('returns false for empty/null input', () => {
      expect(isPremiumConnector('')).toBe(false);
      expect(isPremiumConnector(null as any)).toBe(false);
    });
  });

  describe('canUseConnector', () => {
    it('allows free connectors on free tier', () => {
      expect(canUseConnector('ollama')).toBe(true);
      expect(canUseConnector('telegram')).toBe(true);
    });

    it('blocks premium connectors on free tier', () => {
      expect(canUseConnector('claude')).toBe(false);
      expect(canUseConnector('chatgpt')).toBe(false);
    });

    it('allows premium connectors on pro tier', () => {
      storage['alphonso_license'] = JSON.stringify({ tier: 'pro' });
      expect(canUseConnector('claude')).toBe(true);
      expect(canUseConnector('chatgpt')).toBe(true);
    });
  });

  describe('activateLicense', () => {
    it('rejects empty key', async () => {
      const result = await activateLicense('');
      expect(result.success).toBe(false);
      expect(result.error).toContain('required');
    });

    it('rejects invalid key format', async () => {
      const result = await activateLicense('INVALID-KEY');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid');
    });

    it('activates valid PRO key', async () => {
      const result = await activateLicense('ALPHONSO-PRO-ABCD-1234-EFGH');
      expect(result.success).toBe(true);
      expect(result.tier).toBe('pro');
    });

    it('activates valid ENT key', async () => {
      const result = await activateLicense('ALPHONSO-ENT-ABCD-1234-EFGH');
      expect(result.success).toBe(true);
      expect(result.tier).toBe('enterprise');
    });

    it('persists license to localStorage', async () => {
      await activateLicense('ALPHONSO-PRO-ABCD-1234-EFGH');
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'alphonso_license',
        expect.stringContaining('"tier":"pro"')
      );
    });
  });

  describe('deactivateLicense', () => {
    it('removes license from localStorage', async () => {
      storage['alphonso_license'] = JSON.stringify({ tier: 'pro' });
      await deactivateLicense();
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('alphonso_license');
    });
  });
});
