import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getComposioConfig,
  setComposioConfig,
  isComposioEnabled,
  fetchComposioToolkits,
  getCachedToolkits,
  executeComposioAction,
  getComposioStatus,
  checkComposioHealth
} from '../services/composioService';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../services/trustModel', () => ({
  timestampMs: vi.fn(() => Date.now()),
  TRUST_STATES: { VERIFIED: 'verified', FAILED: 'failed' }
}));

vi.mock('../services/unifiedMemoryService', () => ({
  pushMemory: vi.fn()
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── localStorage mock ─────────────────────────────────────────────────────────

const localStorageStore = {};
const mockLocalStorage = {
  getItem: vi.fn((k) => localStorageStore[k] ?? null),
  setItem: vi.fn((k, v) => { localStorageStore[k] = String(v); }),
  removeItem: vi.fn((k) => { delete localStorageStore[k]; }),
  clear: vi.fn(() => { Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k]); })
};
vi.stubGlobal('localStorage', mockLocalStorage);

beforeEach(() => {
  mockLocalStorage.clear();
  vi.clearAllMocks();
});

// ── getComposioConfig ─────────────────────────────────────────────────────────

describe('getComposioConfig', () => {
  it('returns default config when nothing stored', () => {
    const config = getComposioConfig();
    expect(config).toEqual({ enabled: false, apiKey: '', userId: 'alphonso-user' });
  });

  it('returns stored config from localStorage', () => {
    const stored = { enabled: true, apiKey: 'test-key-12345', userId: 'my-user' };
    localStorageStore['alphonso_composio_config_v1'] = JSON.stringify(stored);
    const config = getComposioConfig();
    expect(config.enabled).toBe(true);
    expect(config.apiKey).toBe('test-key-12345');
  });

  it('returns default config when localStorage contains invalid JSON', () => {
    localStorageStore['alphonso_composio_config_v1'] = '{{invalid}}';
    const config = getComposioConfig();
    expect(config.enabled).toBe(false);
  });
});

// ── setComposioConfig ─────────────────────────────────────────────────────────

describe('setComposioConfig', () => {
  it('merges partial config with existing config', () => {
    const initial = { enabled: false, apiKey: 'old-key', userId: 'alphonso-user' };
    localStorageStore['alphonso_composio_config_v1'] = JSON.stringify(initial);

    const merged = setComposioConfig({ enabled: true });
    expect(merged.enabled).toBe(true);
    expect(merged.apiKey).toBe('old-key'); // Preserved
  });

  it('persists config to localStorage', () => {
    setComposioConfig({ apiKey: 'new-key-12345' });
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
      'alphonso_composio_config_v1',
      expect.stringContaining('new-key-12345')
    );
  });

  it('returns the merged config object', () => {
    const result = setComposioConfig({ enabled: false, apiKey: 'abc' });
    expect(result).toHaveProperty('enabled');
    expect(result).toHaveProperty('apiKey');
    expect(result).toHaveProperty('userId');
  });
});

// ── isComposioEnabled ─────────────────────────────────────────────────────────

describe('isComposioEnabled', () => {
  it('returns false when config is default (no apiKey)', () => {
    expect(isComposioEnabled()).toBe(false);
  });

  it('returns false when enabled=false even with apiKey', () => {
    localStorageStore['alphonso_composio_config_v1'] = JSON.stringify({
      enabled: false, apiKey: 'valid-api-key-123', userId: 'user'
    });
    expect(isComposioEnabled()).toBe(false);
  });

  it('returns false when apiKey is too short (<= 8 chars)', () => {
    localStorageStore['alphonso_composio_config_v1'] = JSON.stringify({
      enabled: true, apiKey: 'short', userId: 'user'
    });
    expect(isComposioEnabled()).toBe(false);
  });

  it('returns true when enabled=true and apiKey length > 8', () => {
    localStorageStore['alphonso_composio_config_v1'] = JSON.stringify({
      enabled: true, apiKey: 'valid-api-key-long', userId: 'user'
    });
    expect(isComposioEnabled()).toBe(true);
  });
});

// ── getCachedToolkits ─────────────────────────────────────────────────────────

describe('getCachedToolkits', () => {
  it('returns null when nothing cached', () => {
    const result = getCachedToolkits();
    expect(result).toBeNull();
  });

  it('returns null when cache is expired (older than 5 minutes)', () => {
    const expired = {
      toolkits: [{ key: 'github', name: 'GitHub' }],
      cachedAtMs: Date.now() - 400_000 // 6.6 minutes ago
    };
    localStorageStore['alphonso_composio_tools_v1'] = JSON.stringify(expired);
    const result = getCachedToolkits();
    expect(result).toBeNull();
  });

  it('returns toolkits when cache is fresh', () => {
    const fresh = {
      toolkits: [{ key: 'github', name: 'GitHub' }, { key: 'slack', name: 'Slack' }],
      cachedAtMs: Date.now() - 10_000 // 10 seconds ago
    };
    localStorageStore['alphonso_composio_tools_v1'] = JSON.stringify(fresh);
    const result = getCachedToolkits();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(2);
  });

  it('returns null when localStorage contains invalid JSON', () => {
    localStorageStore['alphonso_composio_tools_v1'] = '{bad json}';
    expect(getCachedToolkits()).toBeNull();
  });
});

// ── fetchComposioToolkits ─────────────────────────────────────────────────────

describe('fetchComposioToolkits', () => {
  it('returns error when no API key configured', async () => {
    const result = await fetchComposioToolkits();
    expect(result.toolkits).toEqual([]);
    expect(result.error).toMatch(/No API key/i);
  });

  it('returns toolkits on successful API response', async () => {
    localStorageStore['alphonso_composio_config_v1'] = JSON.stringify({
      enabled: true, apiKey: 'valid-key-12345', userId: 'user'
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
          { key: 'github', name: 'GitHub', description: 'GitHub integration', categories: ['dev'] },
          { key: 'slack', name: 'Slack', description: 'Slack integration', categories: ['comm'] }
        ]
      })
    });

    const result = await fetchComposioToolkits();
    expect(result.error).toBeNull();
    expect(result.toolkits.length).toBe(2);
    expect(result.toolkits[0].key).toBe('github');
  });

  it('returns error on non-ok HTTP response', async () => {
    localStorageStore['alphonso_composio_config_v1'] = JSON.stringify({
      enabled: true, apiKey: 'valid-key-12345', userId: 'user'
    });

    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });

    const result = await fetchComposioToolkits();
    expect(result.toolkits).toEqual([]);
    expect(result.error).toContain('401');
  });

  it('returns error on network failure', async () => {
    localStorageStore['alphonso_composio_config_v1'] = JSON.stringify({
      enabled: true, apiKey: 'valid-key-12345', userId: 'user'
    });

    mockFetch.mockRejectedValueOnce(new Error('Network offline'));

    const result = await fetchComposioToolkits();
    expect(result.toolkits).toEqual([]);
    expect(result.error).toContain('Network offline');
  });

  it('caches fetched toolkits in localStorage', async () => {
    localStorageStore['alphonso_composio_config_v1'] = JSON.stringify({
      enabled: true, apiKey: 'valid-key-12345', userId: 'user'
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [{ key: 'github', name: 'GitHub' }] })
    });

    await fetchComposioToolkits();
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
      'alphonso_composio_tools_v1',
      expect.stringContaining('github')
    );
  });
});

// ── executeComposioAction ─────────────────────────────────────────────────────

describe('executeComposioAction', () => {
  it('returns error when no API key configured', async () => {
    const result = await executeComposioAction({ toolkit: 'github', actionName: 'CREATE_ISSUE', params: {} });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/No API key/i);
  });

  it('returns success and data on successful action', async () => {
    localStorageStore['alphonso_composio_config_v1'] = JSON.stringify({
      enabled: true, apiKey: 'valid-key-12345', userId: 'user'
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ issue_number: 42, url: 'https://github.com/...' })
    });

    const result = await executeComposioAction({
      toolkit: 'github',
      actionName: 'GITHUB_CREATE_ISSUE',
      params: { title: 'Bug fix', body: 'Description' }
    });
    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('issue_number', 42);
    expect(result.error).toBeNull();
  });

  it('returns error on non-ok HTTP response', async () => {
    localStorageStore['alphonso_composio_config_v1'] = JSON.stringify({
      enabled: true, apiKey: 'valid-key-12345', userId: 'user'
    });

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ message: 'Forbidden' })
    });

    const result = await executeComposioAction({ toolkit: 'github', actionName: 'CREATE_ISSUE', params: {} });
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

// ── getComposioStatus ─────────────────────────────────────────────────────────

describe('getComposioStatus', () => {
  it('returns status object with expected fields', () => {
    const status = getComposioStatus();
    expect(status).toHaveProperty('enabled');
    expect(status).toHaveProperty('hasApiKey');
    expect(status).toHaveProperty('userId');
    expect(status).toHaveProperty('cachedToolkits');
  });

  it('shows hasApiKey false when apiKey is empty', () => {
    const status = getComposioStatus();
    expect(status.hasApiKey).toBe(false);
  });

  it('shows hasApiKey true when apiKey is set', () => {
    localStorageStore['alphonso_composio_config_v1'] = JSON.stringify({
      enabled: true, apiKey: 'some-api-key-here', userId: 'user'
    });
    const status = getComposioStatus();
    expect(status.hasApiKey).toBe(true);
  });

  it('shows masked apiKey prefix', () => {
    localStorageStore['alphonso_composio_config_v1'] = JSON.stringify({
      enabled: true, apiKey: 'my-secret-api-key-12345', userId: 'user'
    });
    const status = getComposioStatus();
    expect(status.apiKeyPrefix).toContain('...');
    expect(status.apiKeyPrefix.length).toBeLessThan(20);
  });
});

// ── checkComposioHealth ───────────────────────────────────────────────────────

describe('checkComposioHealth', () => {
  it('returns not_configured when no API key', async () => {
    const result = await checkComposioHealth();
    expect(result.status).toBe('not_configured');
    expect(result.enabled).toBe(false);
  });

  it('returns healthy status when API responds ok', async () => {
    localStorageStore['alphonso_composio_config_v1'] = JSON.stringify({
      enabled: true, apiKey: 'valid-key-12345', userId: 'user'
    });
    mockFetch.mockResolvedValueOnce({ ok: true });

    const result = await checkComposioHealth();
    expect(result.status).toBe('healthy');
    expect(result.enabled).toBe(true);
  });

  it('returns error status when API responds with non-ok status', async () => {
    localStorageStore['alphonso_composio_config_v1'] = JSON.stringify({
      enabled: true, apiKey: 'valid-key-12345', userId: 'user'
    });
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });

    const result = await checkComposioHealth();
    expect(result.status).toBe('error');
    expect(result.enabled).toBe(false);
  });

  it('returns error status on network failure', async () => {
    localStorageStore['alphonso_composio_config_v1'] = JSON.stringify({
      enabled: true, apiKey: 'valid-key-12345', userId: 'user'
    });
    mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

    const result = await checkComposioHealth();
    expect(result.status).toBe('error');
    expect(result.message).toContain('Connection refused');
  });
});
