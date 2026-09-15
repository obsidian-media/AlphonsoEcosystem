import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const store: Record<string, string> = {};
vi.mock('../../services/secureStorageService', () => ({
  secureSet: vi.fn((key: string, value: string) => { store[key] = value; return Promise.resolve(true); }),
  secureGet: vi.fn((key: string) => Promise.resolve(store[key] ?? null)),
  secureDelete: vi.fn((key: string) => { delete store[key]; return Promise.resolve(); })
}));

import { secureSet } from '../../services/secureStorageService';
import {
  startBrokerLogin,
  pollBrokerLogin,
  getCalleMcpToken,
  isCalleMcpConfigured,
  disconnectCalleMcp
} from '../../services/calleMcpAuthService';

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: () => Promise.resolve(body) };
}

beforeEach(() => {
  mockFetch.mockReset();
  for (const key of Object.keys(store)) delete store[key];
});

describe('startBrokerLogin', () => {
  it('POSTs a new session and returns the login URL', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      session_id: 's1', session_secret: 'secret1', login_url: 'https://example.com/login', poll_after_ms: 2000
    }));
    const pending = await startBrokerLogin();
    expect(pending.loginUrl).toBe('https://example.com/login');
    expect(pending.status).toBe('PENDING');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://seleven-mcp-sg.airudder.com/api/v1/openagent-auth/sessions',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('throws on a non-ok response', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}, false));
    await expect(startBrokerLogin()).rejects.toThrow('HTTP 500');
  });
});

describe('pollBrokerLogin', () => {
  const pending = { sessionId: 's1', sessionSecret: 'secret1', loginUrl: 'https://x', status: 'PENDING' as const, pollAfterMs: 2000 };

  it('returns "pending" while the broker still reports PENDING', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ status: 'PENDING' }));
    expect(await pollBrokerLogin(pending)).toBe('pending');
  });

  it('exchanges and stores the token once AUTHORIZED', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ status: 'AUTHORIZED' }))
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok123', expires_at: null }));
    const result = await pollBrokerLogin(pending);
    expect(result).toBe('authorized');
    expect(await getCalleMcpToken()).toBe('tok123');
  });

  it('returns "failed" for FAILED/EXPIRED/EXCHANGED', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ status: 'EXPIRED' }));
    expect(await pollBrokerLogin(pending)).toBe('failed');
  });

  it('throws rather than reporting "authorized" when secure storage rejects the token', async () => {
    (secureSet as any).mockResolvedValueOnce(false);
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ status: 'AUTHORIZED' }))
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok123', expires_at: null }));

    await expect(pollBrokerLogin(pending)).rejects.toThrow('secure storage');
    expect(await getCalleMcpToken()).toBeNull();
  });
});

describe('getCalleMcpToken', () => {
  it('returns null when nothing is stored', async () => {
    expect(await getCalleMcpToken()).toBeNull();
  });

  it('returns null when the stored token expires within 5 minutes', async () => {
    store['CALLE_MCP_TOKEN'] = JSON.stringify({ accessToken: 'tok', expiresAt: new Date(Date.now() + 60_000).toISOString() });
    expect(await getCalleMcpToken()).toBeNull();
  });

  it('returns the token when it has more than 5 minutes left', async () => {
    store['CALLE_MCP_TOKEN'] = JSON.stringify({ accessToken: 'tok', expiresAt: new Date(Date.now() + 3_600_000).toISOString() });
    expect(await getCalleMcpToken()).toBe('tok');
  });

  it('returns the token when expiresAt is null (broker gave no expiry)', async () => {
    store['CALLE_MCP_TOKEN'] = JSON.stringify({ accessToken: 'tok', expiresAt: null });
    expect(await getCalleMcpToken()).toBe('tok');
  });
});

describe('isCalleMcpConfigured / disconnectCalleMcp', () => {
  it('is false with no token, true after one is stored, false after disconnect', async () => {
    expect(await isCalleMcpConfigured()).toBe(false);
    store['CALLE_MCP_TOKEN'] = JSON.stringify({ accessToken: 'tok', expiresAt: null });
    expect(await isCalleMcpConfigured()).toBe(true);
    await disconnectCalleMcp();
    expect(await isCalleMcpConfigured()).toBe(false);
  });
});
