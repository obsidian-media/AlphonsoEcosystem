import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetConnectorCredential = vi.fn();
vi.mock('../../services/connectors/connectorAuth', () => ({
  getConnectorCredential: (...args) => mockGetConnectorCredential(...args)
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
  return import('../../services/connectors/n8nConnector.js');
}

describe('n8nConnector', () => {
  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    mockGetConnectorCredential.mockImplementation((id, key) => {
      if (id === 'n8n' && key === 'N8N_BASE_URL') return 'http://localhost:5678';
      return '';
    });
    mockEvaluatePolicyGate.mockReturnValue({
      ok: true, blocked: false, setupRequired: false, reason: null,
      riskLevel: 'low', confidence: 'verified', verificationState: 'verified'
    });
  });

  describe('policy gate blocking', () => {
    it('isN8nHealthy throws when policy gate blocks', async () => {
      mockEvaluatePolicyGate.mockReturnValue({
        ok: false, blocked: true, setupRequired: false,
        reason: 'Approval Mode requires explicit approval',
        riskLevel: 'low', confidence: 'verified', verificationState: 'pending'
      });
      const { isN8nHealthy } = await getModule();
      await expect(isN8nHealthy()).rejects.toThrow('Approval Mode requires explicit approval');
    });

    it('triggerN8nWebhook returns error when policy gate blocks', async () => {
      mockEvaluatePolicyGate.mockReturnValue({
        ok: false, blocked: true, setupRequired: false,
        reason: 'Zero-Cost Mode blocked n8n',
        riskLevel: 'low', confidence: 'verified', verificationState: 'pending'
      });
      const { triggerN8nWebhook } = await getModule();
      const result = await triggerN8nWebhook('hook', {});
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Zero-Cost Mode blocked n8n');
    });

    it('listN8nWorkflows returns error when policy gate blocks', async () => {
      mockEvaluatePolicyGate.mockReturnValue({
        ok: false, blocked: true, setupRequired: false,
        reason: 'Connector blocked',
        riskLevel: 'low', confidence: 'verified', verificationState: 'pending'
      });
      const { listN8nWorkflows } = await getModule();
      const result = await listN8nWorkflows();
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Connector blocked');
    });

    it('setN8nWorkflowActive returns error when policy gate blocks', async () => {
      mockEvaluatePolicyGate.mockReturnValue({
        ok: false, blocked: true, setupRequired: false,
        reason: 'Approval required',
        riskLevel: 'low', confidence: 'verified', verificationState: 'pending'
      });
      const { setN8nWorkflowActive } = await getModule();
      const result = await setN8nWorkflowActive('wf-1', true);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Approval required');
    });

    it('calls evaluatePolicyGate with correct connectorId', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200 });
      const { isN8nHealthy } = await getModule();
      await isN8nHealthy();
      expect(mockEvaluatePolicyGate).toHaveBeenCalledWith(
        expect.objectContaining({ connectorId: 'n8n' })
      );
    });

    it('passes correct actionType for each operation', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: [] }) });
      const { isN8nHealthy, triggerN8nWebhook, listN8nWorkflows, setN8nWorkflowActive } = await getModule();

      await isN8nHealthy();
      expect(mockEvaluatePolicyGate).toHaveBeenCalledWith(
        expect.objectContaining({ actionType: 'health' })
      );

      mockEvaluatePolicyGate.mockClear();
      mockFetch.mockResolvedValue({
        ok: true, status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({})
      });
      await triggerN8nWebhook('hook', {});
      expect(mockEvaluatePolicyGate).toHaveBeenCalledWith(
        expect.objectContaining({ actionType: 'webhook' })
      );

      mockEvaluatePolicyGate.mockClear();
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });
      await listN8nWorkflows();
      expect(mockEvaluatePolicyGate).toHaveBeenCalledWith(
        expect.objectContaining({ actionType: 'list_workflows' })
      );

      mockEvaluatePolicyGate.mockClear();
      mockFetch.mockResolvedValue({ ok: true });
      await setN8nWorkflowActive('wf-1', true);
      expect(mockEvaluatePolicyGate).toHaveBeenCalledWith(
        expect.objectContaining({ actionType: 'activate_workflow' })
      );
    });
  });

  describe('isN8nHealthy', () => {
    it('returns ok when n8n healthz returns 200', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
      const result = await (await getModule()).isN8nHealthy();
      expect(result.ok).toBe(true);
      expect(result.status).toBe('healthy');
      expect(result.statusCode).toBe(200);
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:5678/healthz', expect.any(Object));
    });

    it('returns not ok when n8n healthz returns 500', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
      const result = await (await getModule()).isN8nHealthy();
      expect(result.ok).toBe(false);
      expect(result.status).toBe('unhealthy');
      expect(result.statusCode).toBe(500);
    });

    it('returns not ok when n8n is unreachable', async () => {
      mockFetch.mockRejectedValueOnce(new Error('fetch failed'));
      const result = await (await getModule()).isN8nHealthy();
      expect(result.ok).toBe(false);
      expect(result.status).toContain('connection_failed');
    });

    it('truncates error message to 100 chars', async () => {
      const longMsg = 'A'.repeat(200);
      mockFetch.mockRejectedValueOnce(new Error(longMsg));
      const result = await (await getModule()).isN8nHealthy();
      expect(result.status.length).toBeLessThanOrEqual(100 + 'connection_failed: '.length);
    });

    it('uses custom base URL from credential store', async () => {
      mockGetConnectorCredential.mockImplementation((id, key) => {
        if (id === 'n8n' && key === 'N8N_BASE_URL') return 'http://custom-host:9999';
        return '';
      });
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
      const result = await (await getModule()).isN8nHealthy();
      expect(mockFetch).toHaveBeenCalledWith('http://custom-host:9999/healthz', expect.any(Object));
      expect(result.ok).toBe(true);
    });
  });

  describe('triggerN8nWebhook', () => {
    it('triggers webhook successfully with JSON response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ success: true, result: 'done' }),
      });
      const result = await (await getModule()).triggerN8nWebhook('my-workflow', { data: 'test' });
      expect(result.ok).toBe(true);
      expect(result.data).toEqual({ success: true, result: 'done' });
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:5678/webhook/my-workflow',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: 'test' }),
        })
      );
    });

    it('handles non-JSON response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'text/plain' },
        text: async () => 'OK',
      });
      const result = await (await getModule()).triggerN8nWebhook('hook/abc');
      expect(result.ok).toBe(true);
      expect(result.data).toEqual({ raw: 'OK' });
    });

    it('returns error on non-200 response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        headers: { get: () => 'application/json' },
        json: async () => ({ error: 'not found' }),
      });
      const result = await (await getModule()).triggerN8nWebhook('missing');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('404');
    });

    it('returns error on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      const result = await (await getModule()).triggerN8nWebhook('test');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('ECONNREFUSED');
    });

    it('strips leading slashes from webhook path', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({}),
      });
      await (await getModule()).triggerN8nWebhook('/my-workflow', {});
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:5678/webhook/my-workflow',
        expect.any(Object)
      );
    });

    it('strips multiple leading slashes from webhook path', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({}),
      });
      await (await getModule()).triggerN8nWebhook('///hook', {});
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:5678/webhook/hook',
        expect.any(Object)
      );
    });

    it('returns timeout error for AbortError', async () => {
      const abortError = new Error('aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValueOnce(abortError);
      const result = await (await getModule()).triggerN8nWebhook('slow-hook');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('timeout');
    });

    it('returns timeout error for TimeoutError', async () => {
      const timeoutError = new Error('timed out');
      timeoutError.name = 'TimeoutError';
      mockFetch.mockRejectedValueOnce(timeoutError);
      const result = await (await getModule()).triggerN8nWebhook('slow-hook');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('timeout');
    });

    it('defaults payload to empty object', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({}),
      });
      await (await getModule()).triggerN8nWebhook('hook');
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body).toEqual({});
    });

    it('truncates error response to 200 chars', async () => {
      const longError = 'E'.repeat(300);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: { get: () => 'application/json' },
        json: async () => ({ error: longError }),
      });
      const result = await (await getModule()).triggerN8nWebhook('hook');
      expect(result.error.length).toBeLessThanOrEqual(200 + 'n8n webhook returned 500: '.length);
    });
  });

  describe('listN8nWorkflows', () => {
    it('lists workflows successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ id: '1', name: 'Test Workflow' }] }),
      });
      const result = await (await getModule()).listN8nWorkflows();
      expect(result.ok).toBe(true);
      expect(result.workflows).toEqual([{ id: '1', name: 'Test Workflow' }]);
    });

    it('returns error on failure', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
      const result = await (await getModule()).listN8nWorkflows();
      expect(result.ok).toBe(false);
      expect(result.error).toContain('500');
    });

    it('handles response without data wrapper', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: '1', name: 'WF' }],
      });
      const result = await (await getModule()).listN8nWorkflows();
      expect(result.ok).toBe(true);
      expect(result.workflows).toEqual([{ id: '1', name: 'WF' }]);
    });

    it('returns empty array when no workflows', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      });
      const result = await (await getModule()).listN8nWorkflows();
      expect(result.workflows).toEqual([]);
    });

    it('returns error on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      const result = await (await getModule()).listN8nWorkflows();
      expect(result.ok).toBe(false);
      expect(result.error).toContain('ECONNREFUSED');
    });
  });

  describe('setN8nWorkflowActive', () => {
    it('activates workflow successfully', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });
      const result = await (await getModule()).setN8nWorkflowActive('wf-1', true);
      expect(result.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:5678/api/v1/workflows/wf-1/activate',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ active: true }),
        })
      );
    });

    it('deactivates workflow successfully', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });
      const result = await (await getModule()).setN8nWorkflowActive('wf-1', false);
      expect(result.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({ active: false }),
        })
      );
    });

    it('returns error on failure', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 403 });
      const result = await (await getModule()).setN8nWorkflowActive('wf-1', false);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('403');
    });

    it('returns error on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('timeout'));
      const result = await (await getModule()).setN8nWorkflowActive('wf-1', true);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('timeout');
    });
  });
});
