import { describe, it, expect, vi, beforeEach } from 'vitest';

// Simulate a persistent KV store so key pairs survive between getOrCreateSignerKeys() calls
const _kvStore = {};

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd, args) => {
    if (cmd === 'kv_set') { _kvStore[args.key] = args.value; return null; }
    if (cmd === 'kv_get') { return _kvStore[args.key] ?? null; }
    return null;
  })
}));

vi.mock('../services/pluginRegistryService', () => ({
  appendPluginAuditEntry: vi.fn(),
  listPlugins: vi.fn().mockReturnValue([])
}));

const {
  getOrCreateSignerKeys,
  signPluginManifest,
  verifyPluginSignature,
  getTrustedSignerKeys,
  addTrustedSignerKey,
  removeTrustedSignerKey,
  exportPublicKeyJwk,
  verifyAndAddPlugin,
  _resetTrustedSignerKeysForTesting
} = await import('../services/pluginSigningService');

describe('pluginSigningService', () => {
  beforeEach(() => {
    localStorage.clear();
    // Clear the in-memory KV store so each test gets fresh keys
    Object.keys(_kvStore).forEach((k) => delete _kvStore[k]);
    // Reset module-level trusted keys cache
    _resetTrustedSignerKeysForTesting();
  });

  describe('getOrCreateSignerKeys', () => {
    it('generates a new key pair when none exists', async () => {
      const keys = await getOrCreateSignerKeys();
      expect(keys.privateKey).toBeDefined();
      expect(keys.publicKey).toBeDefined();
      expect(keys.publicKeyJwk).toBeDefined();
      expect(keys.publicKeyJwk.kty).toBe('EC');
    });

    it('returns existing key pair on second call', async () => {
      const first = await getOrCreateSignerKeys();
      const second = await getOrCreateSignerKeys();
      expect(second.publicKeyJwk).toEqual(first.publicKeyJwk);
    });
  });

  describe('signPluginManifest', () => {
    it('returns manifest with signature and signedAt', async () => {
      const manifest = { id: 'test-plugin', name: 'Test', version: '1.0.0' };
      const signed = await signPluginManifest(manifest);
      expect(signed.signature).toBeDefined();
      expect(signed.signedAt).toBeDefined();
      expect(signed.id).toBe('test-plugin');
    });

    it('produces a base64url signature string', async () => {
      const signed = await signPluginManifest({ id: 'p1' });
      expect(signed.signature).toMatch(/^[A-Za-z0-9_-]+$/);
    });
  });

  describe('verifyPluginSignature', () => {
    it('returns ok false when no signature present', async () => {
      const result = await verifyPluginSignature({ id: 'p1' });
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('No signature');
    });

    it('returns ok false for null manifest', async () => {
      const result = await verifyPluginSignature(null);
      expect(result.ok).toBe(false);
    });

    it('verifies a locally signed manifest as ok', async () => {
      const manifest = { id: 'verify-test', name: 'V', version: '1.0.0' };
      const signed = await signPluginManifest(manifest);
      const result = await verifyPluginSignature(signed);
      expect(result.ok).toBe(true);
      expect(result.trusted).toBe('local_signer');
    });
  });

  describe('getTrustedSignerKeys', () => {
    it('returns empty array when none stored', () => {
      expect(getTrustedSignerKeys()).toEqual([]);
    });
  });

  describe('addTrustedSignerKey', () => {
    it('returns false for invalid key', () => {
      expect(addTrustedSignerKey(null)).toBe(false);
      expect(addTrustedSignerKey({})).toBe(false);
    });

    it('adds a valid JWK key', () => {
      const key = { kty: 'EC', x: 'abc', y: 'def', crv: 'P-256' };
      const result = addTrustedSignerKey(key);
      expect(result).toBe(true);
      expect(getTrustedSignerKeys()).toHaveLength(1);
    });

    it('returns false for duplicate key', () => {
      const key = { kty: 'EC', x: 'abc', y: 'def', crv: 'P-256' };
      addTrustedSignerKey(key);
      expect(addTrustedSignerKey(key)).toBe(false);
      expect(getTrustedSignerKeys()).toHaveLength(1);
    });
  });

  describe('removeTrustedSignerKey', () => {
    it('removes key at valid index', () => {
      addTrustedSignerKey({ kty: 'EC', x: 'a', y: 'b', crv: 'P-256' });
      expect(removeTrustedSignerKey(0)).toBe(true);
      expect(getTrustedSignerKeys()).toHaveLength(0);
    });

    it('returns false for out-of-bounds index', () => {
      expect(removeTrustedSignerKey(0)).toBe(false);
      expect(removeTrustedSignerKey(-1)).toBe(false);
    });
  });

  describe('exportPublicKeyJwk', () => {
    it('returns the public key JWK', async () => {
      const jwk = await exportPublicKeyJwk();
      expect(jwk).toBeDefined();
      expect(jwk.kty).toBe('EC');
    });
  });

  describe('verifyAndAddPlugin', () => {
    it('rejects unsigned manifest', async () => {
      const result = await verifyAndAddPlugin({ id: 'bad' });
      expect(result.ok).toBe(false);
    });

    it('installs a signed plugin not already installed', async () => {
      const manifest = { id: 'new-plugin', name: 'New', version: '1.0.0' };
      const signed = await signPluginManifest(manifest);
      const result = await verifyAndAddPlugin(signed);
      expect(result.ok).toBe(true);
      expect(result.plugin).toBeDefined();
      expect(result.plugin.id).toBe('new-plugin');
    });

    it('rejects duplicate plugin id', async () => {
      const { listPlugins } = await import('../services/pluginRegistryService');
      listPlugins.mockReturnValue([{ id: 'dup-plugin' }]);
      const signed = await signPluginManifest({ id: 'dup-plugin', name: 'Dup' });
      const result = await verifyAndAddPlugin(signed);
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('already installed');
    });
  });
});
