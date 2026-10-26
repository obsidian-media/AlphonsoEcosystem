import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getComposioConfig,
  setComposioConfig,
  isComposioEnabled,
  fetchComposioToolkits,
  getCachedToolkits,
  executeComposioTool,
  getComposioStatus,
  checkComposioHealth,
  hydrateComposioApiKeyFromKeychain,
  __resetComposioApiKeyCacheForTests,
  listToolkitTools,
  isReadOnlyTool
} from '../services/composioService';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../services/trustModel', () => ({
  timestampMs: vi.fn(() => Date.now()),
  TRUST_STATES: { VERIFIED: 'verified', FAILED: 'failed' }
}));

vi.mock('../services/unifiedMemoryService', () => ({
  pushMemory: vi.fn()
}));

const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args) => invokeMock(...args)
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
  invokeMock.mockResolvedValue(null);
  __resetComposioApiKeyCacheForTests();
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

  it('does NOT persist the apiKey to localStorage — it goes to the OS keychain instead', () => {
    setComposioConfig({ apiKey: 'new-key-12345' });
    const persisted = mockLocalStorage.setItem.mock.calls.find(([k]) => k === 'alphonso_composio_config_v1');
    expect(persisted).toBeTruthy();
    expect(persisted[1]).not.toContain('new-key-12345');
    expect(invokeMock).toHaveBeenCalledWith('secure_credential_set', {
      key: 'alphonso_composio_api_key_v1',
      value: 'new-key-12345'
    });
  });

  it('still persists enabled/userId to localStorage (not secrets)', () => {
    setComposioConfig({ enabled: true, userId: 'someone' });
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
      'alphonso_composio_config_v1',
      expect.stringContaining('someone')
    );
  });

  it('does not lose a legacy blob apiKey on a config-only update (e.g. toggling enabled) before it has been migrated', () => {
    localStorageStore['alphonso_composio_config_v1'] = JSON.stringify({
      enabled: false, apiKey: 'legacy-key-not-yet-migrated', userId: 'alphonso-user'
    });
    const merged = setComposioConfig({ enabled: true });
    expect(merged.apiKey).toBe('legacy-key-not-yet-migrated');
    expect(invokeMock).toHaveBeenCalledWith('secure_credential_set', {
      key: 'alphonso_composio_api_key_v1',
      value: 'legacy-key-not-yet-migrated'
    });
    expect(getComposioConfig().apiKey).toBe('legacy-key-not-yet-migrated');
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

// ── executeComposioTool (agent phase 5: Composio's v3.1 API) ─────────────────

describe('executeComposioTool', () => {
  const configured = () => {
    localStorageStore['alphonso_composio_config_v1'] = JSON.stringify({ enabled: true, apiKey: 'valid-key-12345', userId: 'user-1' });
    localStorageStore['alphonso_composio_toolkits_enabled_v1'] = JSON.stringify(['github', 'gmail']);
  };

  it('returns error when no API key configured', async () => {
    const result = await executeComposioTool('GITHUB_CREATE_ISSUE', {}, { toolkit: 'github' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/No API key/i);
  });

  it('v3.1 address and fields', async () => {
    configured();
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ data: { issue_number: 42 }, error: null, successful: true }) });
    const result = await executeComposioTool('GITHUB_CREATE_ISSUE', { title: 'Bug fix' }, { toolkit: 'github', approved: true });
    expect(mockFetch).toHaveBeenCalledWith('https://backend.composio.dev/api/v3.1/tools/execute/GITHUB_CREATE_ISSUE', expect.objectContaining({ method: 'POST' }));
    const init = mockFetch.mock.calls[0][1];
    expect(init.headers['x-api-key']).toBe('valid-key-12345');
    expect(JSON.parse(init.body)).toEqual({ arguments: { title: 'Bug fix' }, user_id: 'user-1' });
    expect(result).toEqual({ success: true, data: { issue_number: 42 }, error: null });
  });

  it("Composio's own refusal is the error", async () => {
    configured();
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ data: {}, error: 'No connected account for gmail', successful: false }) });
    const result = await executeComposioTool('GMAIL_SEND_EMAIL', {}, { toolkit: 'gmail', approved: true });
    expect(result).toEqual({ success: false, data: {}, error: 'No connected account for gmail' });
  });

  it('a toolkit not switched on is refused', async () => {
    configured();
    const result = await executeComposioTool('SLACK_SEND_MESSAGE', {}, { toolkit: 'slack', approved: true });
    expect(result.success).toBe(false);
    expect(result.error).toBe('The slack toolkit is not switched on in Settings → Composio.');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns error on non-ok HTTP response', async () => {
    configured();
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({ message: 'Forbidden' }) });
    const result = await executeComposioTool('GITHUB_CREATE_ISSUE', {}, { toolkit: 'github', approved: true });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Forbidden');
  });
});

describe('listToolkitTools and isReadOnlyTool', () => {
  it('lists a toolkit\'s tools from v3.1', async () => {
    localStorageStore['alphonso_composio_config_v1'] = JSON.stringify({ enabled: true, apiKey: 'valid-key-12345', userId: 'user-1' });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ items: [
      { slug: 'GMAIL_SEND_EMAIL', name: 'Send email', description: 'Send an email', toolkit: { slug: 'gmail' }, input_parameters: { properties: { recipient_email: {}, body: {} } }, tags: [] },
    ] }) });
    const { tools, error } = await listToolkitTools('gmail');
    expect(error).toBeNull();
    expect(mockFetch.mock.calls[0][0]).toBe('https://backend.composio.dev/api/v3.1/tools?toolkit_slug=gmail&limit=100');
    expect(tools[0]).toMatchObject({ name: 'GMAIL_SEND_EMAIL', toolkit: 'gmail', description: 'Send an email', parameters: { properties: { recipient_email: {}, body: {} } } });
  });

  it('read or send', () => {
    expect(isReadOnlyTool({ name: 'GMAIL_FETCH_EMAILS', toolkit: 'gmail' })).toBe(true);
    expect(isReadOnlyTool({ name: 'GOOGLECALENDAR_LIST_EVENTS', toolkit: 'googlecalendar' })).toBe(true);
    expect(isReadOnlyTool({ name: 'GMAIL_SEND_EMAIL', toolkit: 'gmail' })).toBe(false);
    expect(isReadOnlyTool({ name: 'SOMETHING', toolkit: '' })).toBe(false);
    expect(isReadOnlyTool({ name: 'GMAIL_SEND_EMAIL', toolkit: 'gmail', tags: ['readOnlyHint'] })).toBe(true);
    expect(isReadOnlyTool({ name: 'GMAIL_GET_AND_DELETE', toolkit: 'gmail', tags: ['destructiveHint'] })).toBe(false);
  });

  it('Alphonso no longer reaches Composio', async () => {
    const { readFileSync } = await import('node:fs');
    expect(readFileSync('src/services/agentBrainService.js', 'utf8')).not.toContain('executeViaComposio');
    expect(readFileSync('src/services/toolRegistryService.ts', 'utf8')).not.toContain('use_composio_tool');
    expect(readFileSync('src/services/composioService.ts', 'utf8')).not.toContain('executeViaComposio');
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

// ── hydrateComposioApiKeyFromKeychain ──────────────────────────────────────────

describe('hydrateComposioApiKeyFromKeychain', () => {
  it('adopts the keychain value when the keychain already has an entry', async () => {
    invokeMock.mockResolvedValueOnce('from-keychain');
    await hydrateComposioApiKeyFromKeychain();
    expect(getComposioConfig().apiKey).toBe('from-keychain');
  });

  it('migrates a legacy blob apiKey into the keychain and strips it from the blob when the keychain is empty', async () => {
    localStorageStore['alphonso_composio_config_v1'] = '{"enabled":true,"apiKey":"legacy-key","userId":"user"}';
    invokeMock.mockResolvedValueOnce(null); // keychain get: nothing yet

    await hydrateComposioApiKeyFromKeychain();

    expect(getComposioConfig().apiKey).toBe('legacy-key');
    expect(invokeMock).toHaveBeenCalledWith('secure_credential_set', {
      key: 'alphonso_composio_api_key_v1',
      value: 'legacy-key'
    });
    const blobAfter = JSON.parse(localStorageStore['alphonso_composio_config_v1']);
    expect(blobAfter.apiKey).toBe('');
    expect(blobAfter.enabled).toBe(true); // non-secret fields preserved
  });

  it('does NOT strip the legacy blob apiKey when the keychain write fails during migration (would otherwise lose the key)', async () => {
    localStorageStore['alphonso_composio_config_v1'] = '{"enabled":true,"apiKey":"legacy-key","userId":"user"}';
    invokeMock.mockResolvedValueOnce(null); // keychain get: nothing yet
    invokeMock.mockRejectedValueOnce(new Error('keychain unavailable')); // keychain set: fails

    await hydrateComposioApiKeyFromKeychain();

    // Still usable this session via the in-memory cache...
    expect(getComposioConfig().apiKey).toBe('legacy-key');
    // ...and NOT wiped from the only place it's actually durably stored.
    const blobAfter = JSON.parse(localStorageStore['alphonso_composio_config_v1']);
    expect(blobAfter.apiKey).toBe('legacy-key');
  });

  it('does nothing when neither the keychain nor the legacy blob has a key', async () => {
    invokeMock.mockResolvedValueOnce(null);
    await hydrateComposioApiKeyFromKeychain();
    expect(getComposioConfig().apiKey).toBe('');
  });
});
