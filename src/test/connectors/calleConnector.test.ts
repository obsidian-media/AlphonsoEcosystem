import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../services/policyEnforcementService', () => ({
  evaluatePolicyGate: vi.fn(() => ({ ok: true, blocked: false, reason: null }))
}));
vi.mock('../../services/connectors/connectorAuth.js', () => ({
  getConnectorCredential: vi.fn(() => 'test-api-key')
}));

import { evaluatePolicyGate } from '../../services/policyEnforcementService';
import {
  createCall,
  getCall,
  pollCallUntilTerminal,
  isCalleConfigured
} from '../../services/connectors/calleConnector';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', mockFetch);
  (evaluatePolicyGate as any).mockReturnValue({ ok: true, blocked: false, reason: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockJsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
    statusText: 'OK'
  };
}

describe('createCall', () => {
  it('POSTs to /v1/calls with Authorization and Idempotency-Key headers', async () => {
    mockFetch.mockResolvedValue(mockJsonResponse({ id: 'call_1', status: 'queued' }));

    await createCall('test-api-key', { task: 'Call and ask about the website.' }, 'idem-key-1', { approved: true });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.heycall-e.com/v1/calls',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-api-key',
          'Content-Type': 'application/json',
          'Idempotency-Key': 'idem-key-1'
        }),
        body: JSON.stringify({ task: 'Call and ask about the website.' })
      })
    );
  });

  it('sends the same Idempotency-Key unchanged across a repeated call', async () => {
    mockFetch.mockResolvedValue(mockJsonResponse({ id: 'call_1', status: 'queued' }));

    await createCall('test-api-key', { task: 'task A' }, 'stable-key', { approved: true });
    await createCall('test-api-key', { task: 'task A' }, 'stable-key', { approved: true });

    const firstHeaders = mockFetch.mock.calls[0][1].headers;
    const secondHeaders = mockFetch.mock.calls[1][1].headers;
    expect(firstHeaders['Idempotency-Key']).toBe('stable-key');
    expect(secondHeaders['Idempotency-Key']).toBe('stable-key');
  });

  it('calls evaluatePolicyGate with the actionType external_call and the approved flag before hitting fetch', async () => {
    mockFetch.mockResolvedValue(mockJsonResponse({ id: 'call_1', status: 'queued' }));

    await createCall('test-api-key', { task: 'task A' }, 'idem-key', { approved: true });

    expect(evaluatePolicyGate).toHaveBeenCalledWith(
      expect.objectContaining({ connectorId: 'calle', actionType: 'external_call', approved: true })
    );
  });

  it('throws and never calls fetch when the policy gate blocks', async () => {
    (evaluatePolicyGate as any).mockReturnValue({ ok: false, blocked: true, reason: 'Approval Mode requires explicit approval for this action.' });

    await expect(createCall('test-api-key', { task: 'task A' }, 'idem-key', { approved: false }))
      .rejects.toThrow('Approval Mode requires explicit approval for this action.');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('throws a descriptive error on a non-ok response', async () => {
    mockFetch.mockResolvedValue(mockJsonResponse({ message: 'Invalid phone number' }, false, 400));

    await expect(createCall('test-api-key', { task: 'task A' }, 'idem-key', { approved: true }))
      .rejects.toThrow('CALL-E API error (400): Invalid phone number');
  });
});

describe('getCall', () => {
  it('GETs /v1/calls/{id} with no Idempotency-Key header', async () => {
    mockFetch.mockResolvedValue(mockJsonResponse({ id: 'call_1', status: 'completed' }));

    await getCall('test-api-key', 'call_1');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.heycall-e.com/v1/calls/call_1',
      expect.objectContaining({ method: 'GET' })
    );
    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers['Idempotency-Key']).toBeUndefined();
  });
});

describe('pollCallUntilTerminal', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires onProgress with a queued status immediately, before the initial delay', async () => {
    const onProgress = vi.fn();
    mockFetch.mockResolvedValue(mockJsonResponse({ id: 'call_1', status: 'completed' }));

    const promise = pollCallUntilTerminal('test-api-key', 'call_1', { onProgress });
    // Immediately, before any timers advance:
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ status: 'queued' }));

    await vi.runAllTimersAsync();
    await promise;
  });

  it('returns immediately once a terminal status is observed', async () => {
    mockFetch.mockResolvedValue(mockJsonResponse({ id: 'call_1', status: 'completed', structuredResult: { interested_in_website: 'yes' } }));

    const promise = pollCallUntilTerminal('test-api-key', 'call_1');
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.status).toBe('completed');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('keeps polling on a non-terminal status until one is reached', async () => {
    mockFetch
      .mockResolvedValueOnce(mockJsonResponse({ id: 'call_1', status: 'in_progress' }))
      .mockResolvedValueOnce(mockJsonResponse({ id: 'call_1', status: 'in_progress' }))
      .mockResolvedValueOnce(mockJsonResponse({ id: 'call_1', status: 'completed' }));

    const promise = pollCallUntilTerminal('test-api-key', 'call_1', { intervalMs: 1000 });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.status).toBe('completed');
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('throws a timeout error if no terminal status is reached within timeoutMs', async () => {
    mockFetch.mockResolvedValue(mockJsonResponse({ id: 'call_1', status: 'in_progress' }));

    const promise = pollCallUntilTerminal('test-api-key', 'call_1', { intervalMs: 1000, timeoutMs: 5000 });
    const assertion = expect(promise).rejects.toThrow(/did not reach a terminal state/);
    await vi.runAllTimersAsync();
    await assertion;
  });
});

describe('isCalleConfigured', () => {
  it('returns true when CALLE_API_KEY is present', () => {
    expect(isCalleConfigured()).toBe(true);
  });
});
