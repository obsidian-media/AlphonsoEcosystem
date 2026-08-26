import { describe, it, expect, beforeEach, vi } from 'vitest';

const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args)
}));

const storage: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((k: string) => storage[k] ?? null),
  setItem: vi.fn((k: string, v: string) => { storage[k] = v; }),
  removeItem: vi.fn((k: string) => { delete storage[k]; }),
  clear: vi.fn(() => { Object.keys(storage).forEach((k) => delete storage[k]); })
};
vi.stubGlobal('localStorage', localStorageMock);

const { secureSet, secureGet, secureDelete } = await import('../services/secureStorageService');

describe('secureStorageService', () => {
  beforeEach(() => {
    Object.keys(storage).forEach((k) => delete storage[k]);
    invokeMock.mockReset();
  });

  describe('secureSet', () => {
    it('writes to the keychain via secure_credential_set', async () => {
      invokeMock.mockResolvedValueOnce(undefined);
      await secureSet('my_key', 'my_value');
      expect(invokeMock).toHaveBeenCalledWith('secure_credential_set', { key: 'my_key', value: 'my_value' });
    });

    it('clears any localStorage copy once the keychain write succeeds, so the secret does not sit in plaintext', async () => {
      storage['my_key'] = 'stale-plaintext-copy';
      invokeMock.mockResolvedValueOnce(undefined);
      await secureSet('my_key', 'my_value');
      expect(storage['my_key']).toBeUndefined();
    });

    it('still writes to localStorage even when the keychain write throws (outside Tauri)', async () => {
      invokeMock.mockRejectedValueOnce(new Error('not in Tauri'));
      await secureSet('my_key', 'my_value');
      expect(storage['my_key']).toBe('my_value');
    });
  });

  describe('secureGet', () => {
    it('returns the keychain value when present', async () => {
      invokeMock.mockResolvedValueOnce('from-keychain');
      const value = await secureGet('my_key');
      expect(value).toBe('from-keychain');
    });

    it('falls back to localStorage when the keychain has no entry (returns null)', async () => {
      storage['my_key'] = 'legacy-value';
      invokeMock.mockResolvedValueOnce(null);
      const value = await secureGet('my_key');
      expect(value).toBe('legacy-value');
    });

    it('falls back to localStorage when the keychain call throws (outside Tauri)', async () => {
      storage['my_key'] = 'legacy-value';
      invokeMock.mockRejectedValueOnce(new Error('not in Tauri'));
      const value = await secureGet('my_key');
      expect(value).toBe('legacy-value');
    });

    it('returns null when neither the keychain nor localStorage has the key', async () => {
      invokeMock.mockResolvedValueOnce(null);
      const value = await secureGet('missing_key');
      expect(value).toBeNull();
    });
  });

  describe('secureDelete', () => {
    it('deletes from both the keychain and localStorage', async () => {
      storage['my_key'] = 'value';
      invokeMock.mockResolvedValueOnce(undefined);
      await secureDelete('my_key');
      expect(invokeMock).toHaveBeenCalledWith('secure_credential_delete', { key: 'my_key' });
      expect(storage['my_key']).toBeUndefined();
    });

    it('still deletes from localStorage even when the keychain call throws', async () => {
      storage['my_key'] = 'value';
      invokeMock.mockRejectedValueOnce(new Error('not in Tauri'));
      await secureDelete('my_key');
      expect(storage['my_key']).toBeUndefined();
    });
  });
});
