import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isN8nHealthy,
  triggerN8nWebhook,
  listN8nWorkflows,
  setN8nWorkflowActive
} from '../services/connectors/n8nConnector';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../services/connectors/connectorAuth', () => ({
  getConnectorCredential: vi.fn((connectorId, key) => {
    if (connectorId === 'n8n' && key === 'N8N_BASE_URL') return 'http://localhost:5678';
    return null;
  })
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

// ── isN8nHealthy ──────────────────────────────────────────────────────────────

describe('isN8nHealthy', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('returns ok when n8n healthz returns 200', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
    const result = await isN8nHealthy();
    expect(result.ok).toBe(true);
    expect(result.status).toBe('healthy');
    expect(result.statusCode).toBe(200);
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:5678/healthz', expect.any(Object));
  });

  it('returns not ok when n8n healthz returns 500', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    const result = await isN8nHealthy();
    expect(result.ok).toBe(false);
    expect(result.status).toBe('unhealthy');
    expect(result.statusCode).toBe(500);
  });

  it('returns not ok when n8n is unreachable', async () => {
    mockFetch.mockRejectedValueOnce(new Error('fetch failed'));
    const result = await isN8nHealthy();
    expect(result.ok).toBe(false);
    expect(result.status).toContain('connection_failed');
  });
});

// ── triggerN8nWebhook ─────────────────────────────────────────────────────────

describe('triggerN8nWebhook', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('triggers webhook successfully with JSON response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ success: true, result: 'done' }),
    });
    const result = await triggerN8nWebhook('my-workflow', { data: 'test' });
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
    const result = await triggerN8nWebhook('hook/abc');
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
    const result = await triggerN8nWebhook('missing');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('404');
  });

  it('returns error on network failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const result = await triggerN8nWebhook('test');
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
    await triggerN8nWebhook('/my-workflow', {});
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:5678/webhook/my-workflow',
      expect.any(Object)
    );
  });
});

// ── listN8nWorkflows ──────────────────────────────────────────────────────────

describe('listN8nWorkflows', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('lists workflows successfully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ id: '1', name: 'Test Workflow' }] }),
    });
    const result = await listN8nWorkflows();
    expect(result.ok).toBe(true);
    expect(result.workflows).toEqual([{ id: '1', name: 'Test Workflow' }]);
  });

  it('returns error on failure', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    const result = await listN8nWorkflows();
    expect(result.ok).toBe(false);
    expect(result.error).toContain('500');
  });
});

// ── setN8nWorkflowActive ──────────────────────────────────────────────────────

describe('setN8nWorkflowActive', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('activates workflow successfully', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    const result = await setN8nWorkflowActive('wf-1', true);
    expect(result.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:5678/api/v1/workflows/wf-1/activate',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ active: true }),
      })
    );
  });

  it('returns error on failure', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403 });
    const result = await setN8nWorkflowActive('wf-1', false);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('403');
  });
});
