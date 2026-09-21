import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockGetConnectorCredential = vi.fn();
vi.mock('../../services/connectors/connectorAuth.js', () => ({
  getConnectorCredential: (...args) => mockGetConnectorCredential(...args)
}));

const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args) => mockInvoke(...args)
}));

const mockEvaluatePolicyGate = vi.fn().mockReturnValue({
  ok: true, blocked: false, setupRequired: false, reason: null,
  riskLevel: 'low', confidence: 'verified', verificationState: 'verified'
});

vi.mock('../../services/policyEnforcementService', () => ({
  evaluatePolicyGate: (...args) => mockEvaluatePolicyGate(...args)
}));

let mockFetch;

async function getModule() {
  return import('../../services/connectors/braveSearchConnector');
}

describe('braveSearchConnector', () => {
  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    mockGetConnectorCredential.mockReturnValue('');
    mockInvoke.mockResolvedValue({ BRAVE_SEARCH_API_KEY: false });
    mockEvaluatePolicyGate.mockReturnValue({
      ok: true, blocked: false, setupRequired: false, reason: null,
      riskLevel: 'low', confidence: 'verified', verificationState: 'verified'
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('isBraveSearchConfigured', () => {
    it('returns true when a UI-saved credential is present', async () => {
      mockGetConnectorCredential.mockReturnValue('brave-key');
      const { isBraveSearchConfigured } = await getModule();
      expect(await isBraveSearchConfigured()).toBe(true);
    });

    it('returns true when the Rust-side env check reports the key present', async () => {
      mockGetConnectorCredential.mockReturnValue('');
      mockInvoke.mockResolvedValue({ BRAVE_SEARCH_API_KEY: true });
      const { isBraveSearchConfigured } = await getModule();
      expect(await isBraveSearchConfigured()).toBe(true);
    });

    it('returns false when no credential is present anywhere', async () => {
      mockGetConnectorCredential.mockReturnValue('');
      mockInvoke.mockResolvedValue({ BRAVE_SEARCH_API_KEY: false });
      const { isBraveSearchConfigured } = await getModule();
      expect(await isBraveSearchConfigured()).toBe(false);
    });

    it('returns false rather than throwing when the Tauri invoke fails', async () => {
      mockGetConnectorCredential.mockReturnValue('');
      mockInvoke.mockRejectedValue(new Error('no Tauri runtime'));
      const { isBraveSearchConfigured } = await getModule();
      expect(await isBraveSearchConfigured()).toBe(false);
    });
  });

  describe('searchBrave — policy gate (2026-09-20/21 G-T12 fix)', () => {
    it('returns an error result, not a thrown exception, when no API key is configured', async () => {
      mockGetConnectorCredential.mockReturnValue('');
      const { searchBrave } = await getModule();
      const result = await searchBrave('alphonso ecosystem');
      expect(result.success).toBe(false);
      expect(result.error).toContain('BRAVE_SEARCH_API_KEY not configured');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('calls evaluatePolicyGate with connectorId brave_search before any network call', async () => {
      mockGetConnectorCredential.mockReturnValue('brave-key');
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({ web: { results: [] } }) });
      const { searchBrave } = await getModule();
      await searchBrave('test query', 5);
      expect(mockEvaluatePolicyGate).toHaveBeenCalledWith(expect.objectContaining({
        connectorId: 'brave_search',
        actionType: 'search',
        commandPreview: JSON.stringify({ query: 'test query', count: 5 })
      }));
    });

    it('returns an error result and never calls fetch when the policy gate blocks', async () => {
      mockGetConnectorCredential.mockReturnValue('brave-key');
      mockEvaluatePolicyGate.mockReturnValue({
        ok: false, blocked: true, setupRequired: false,
        reason: 'Zero-Cost Mode blocked brave_search', riskLevel: 'low',
        confidence: 'verified', verificationState: 'pending'
      });
      const { searchBrave } = await getModule();
      const result = await searchBrave('query');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Zero-Cost Mode blocked brave_search');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('searchBrave — search behavior (unchanged from the pre-extraction implementation)', () => {
    it('sends the subscription-token header and maps results', async () => {
      mockGetConnectorCredential.mockReturnValue('brave-key');
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          web: { results: [{ title: 'A', url: 'https://a.com', description: 'snippet a' }] }
        })
      });
      const { searchBrave } = await getModule();
      const result = await searchBrave('alphonso', 5);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('https://api.search.brave.com/res/v1/web/search?q=alphonso&count=5'),
        expect.objectContaining({ headers: expect.objectContaining({ 'X-Subscription-Token': 'brave-key' }) })
      );
      expect(result.success).toBe(true);
      expect(result.results).toEqual([{ title: 'A', url: 'https://a.com', snippet: 'snippet a', source: 'brave' }]);
    });

    it('returns success:false with httpStatus on a non-ok response', async () => {
      mockGetConnectorCredential.mockReturnValue('brave-key');
      mockFetch.mockResolvedValue({ ok: false, status: 401, text: async () => 'Unauthorized' });
      const { searchBrave } = await getModule();
      const result = await searchBrave('query');
      expect(result.success).toBe(false);
      expect(result.httpStatus).toBe(401);
    });

    it('retries a network failure with backoff, then returns success:false once retries are exhausted', async () => {
      vi.useFakeTimers();
      mockGetConnectorCredential.mockReturnValue('brave-key');
      mockFetch.mockRejectedValue(new Error('network down'));
      const { searchBrave } = await getModule();

      const promise = searchBrave('query');
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.error).toContain('network down');
      expect(mockFetch).toHaveBeenCalledTimes(4); // 1 initial attempt + 3 retries
    });
  });
});
