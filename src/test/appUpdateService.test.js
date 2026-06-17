import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn().mockResolvedValue(null);

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args) => invoke(...args),
  isTauri: vi.fn().mockReturnValue(false)
}));

const { getLastUpdateNotice, setLastUpdateNotice, checkAppUpdate, notifyUpdateAvailable } = await import('../services/appUpdateService');

describe('appUpdateService', () => {
  beforeEach(() => {
    localStorage.clear();
    invoke.mockReset();
    invoke.mockResolvedValue(null);
    vi.clearAllMocks();
  });

  describe('getLastUpdateNotice', () => {
    it('returns null when no notice exists', () => {
      expect(getLastUpdateNotice()).toBeNull();
    });

    it('returns stored notice', () => {
      localStorage.setItem('alphonso_update_notice_v1', JSON.stringify({ latestVersion: '1.0.0', noticedAtMs: 1000 }));
      const notice = getLastUpdateNotice();
      expect(notice.latestVersion).toBe('1.0.0');
    });

    it('returns null on invalid JSON', () => {
      localStorage.setItem('alphonso_update_notice_v1', 'not-json');
      expect(getLastUpdateNotice()).toBeNull();
    });
  });

  describe('setLastUpdateNotice', () => {
    it('stores payload to localStorage', () => {
      setLastUpdateNotice({ latestVersion: '2.0.0', noticedAtMs: 2000 });
      const raw = localStorage.getItem('alphonso_update_notice_v1');
      const stored = JSON.parse(raw);
      expect(stored.latestVersion).toBe('2.0.0');
    });

    it('overwrites previous notice', () => {
      setLastUpdateNotice({ latestVersion: '1.0.0' });
      setLastUpdateNotice({ latestVersion: '2.0.0' });
      const notice = getLastUpdateNotice();
      expect(notice.latestVersion).toBe('2.0.0');
    });
  });

  describe('checkAppUpdate', () => {
    it('returns update proof on success', async () => {
      invoke.mockResolvedValueOnce({ available: true, latestVersion: '1.2.0', trust: 'verified' });
      const result = await checkAppUpdate({ endpoint: 'https://example.com', pubkey: 'key', target: 'win32' });
      expect(result.available).toBe(true);
      expect(result.latestVersion).toBe('1.2.0');
      expect(invoke).toHaveBeenCalledWith('check_app_update', {
        endpoint: 'https://example.com',
        pubkey: 'key',
        target: 'win32'
      });
    });

    it('defaults parameters to null when not provided', async () => {
      invoke.mockResolvedValueOnce({ available: false });
      await checkAppUpdate();
      expect(invoke).toHaveBeenCalledWith('check_app_update', { endpoint: null, pubkey: null, target: null });
    });

    it('returns fallback error result on invoke failure', async () => {
      invoke.mockRejectedValueOnce(new Error('IPC unavailable'));
      const result = await checkAppUpdate();
      expect(result.available).toBe(false);
      expect(result.configured).toBe(false);
      expect(result.trust).toBe('failed');
      expect(result.error).toContain('IPC unavailable');
    });

    it('includes checkedAtMs in error result', async () => {
      invoke.mockRejectedValueOnce(new Error('fail'));
      const before = Date.now();
      const result = await checkAppUpdate();
      expect(result.checkedAtMs).toBeGreaterThanOrEqual(before);
    });

    it('trust defaults to unverified when not in proof', async () => {
      invoke.mockResolvedValueOnce({ available: true });
      const result = await checkAppUpdate();
      expect(result.trust).toBe('unverified');
    });
  });

  describe('notifyUpdateAvailable', () => {
    it('returns false when update is not available', async () => {
      const result = await notifyUpdateAvailable({ available: false });
      expect(result).toBe(false);
    });

    it('returns false when latestVersion is missing', async () => {
      const result = await notifyUpdateAvailable({ available: true });
      expect(result).toBe(false);
    });

    it('returns false when Notification API is unavailable', async () => {
      const original = globalThis.Notification;
      delete globalThis.Notification;
      const result = await notifyUpdateAvailable({ available: true, latestVersion: '1.0.0' });
      expect(result).toBe(false);
      globalThis.Notification = original;
    });

    it('returns false when permission is denied', async () => {
      const original = globalThis.Notification;
      globalThis.Notification = { permission: 'denied', requestPermission: vi.fn() };
      const result = await notifyUpdateAvailable({ available: true, latestVersion: '1.0.0' });
      expect(result).toBe(false);
      globalThis.Notification = original;
    });

    it('returns false when permission request fails', async () => {
      const original = globalThis.Notification;
      globalThis.Notification = {
        permission: 'default',
        requestPermission: vi.fn().mockRejectedValue(new Error('nope'))
      };
      const result = await notifyUpdateAvailable({ available: true, latestVersion: '1.0.0' });
      expect(result).toBe(false);
      globalThis.Notification = original;
    });

    it('returns false when same version was already noticed', async () => {
      localStorage.setItem('alphonso_update_notice_v1', JSON.stringify({ latestVersion: '1.0.0' }));
      const original = globalThis.Notification;
      globalThis.Notification = { permission: 'granted' };
      const result = await notifyUpdateAvailable({ available: true, latestVersion: '1.0.0' });
      expect(result).toBe(false);
      globalThis.Notification = original;
    });

    it('saves update notice after successful notification', async () => {
      const original = globalThis.Notification;
      const mockNotificationInstance = { onclick: null };
      globalThis.Notification = vi.fn().mockImplementation(function() { return mockNotificationInstance; });
      globalThis.Notification.permission = 'granted';

      const result = await notifyUpdateAvailable({ available: true, latestVersion: '2.0.0' });
      expect(result).toBe(true);

      const stored = getLastUpdateNotice();
      expect(stored.latestVersion).toBe('2.0.0');

      globalThis.Notification = original;
    });
  });
});
