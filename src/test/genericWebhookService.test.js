import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(null),
  isTauri: vi.fn().mockReturnValue(false)
}));

const mockGetConnectorCredential = vi.fn();
vi.mock('../services/connectors/connectorAuth', () => ({
  getConnectorCredential: (...args) => mockGetConnectorCredential(...args)
}));

const mockAppendOrchestrationReceipt = vi.fn();
vi.mock('../services/orchestrationReceiptService', () => ({
  appendOrchestrationReceipt: (...args) => mockAppendOrchestrationReceipt(...args)
}));

import {
  pollGenericWebhookGateway,
  startGenericWebhookPolling,
  stopGenericWebhookPolling
} from '../services/genericWebhookService';

let mockFetch;

beforeEach(() => {
  localStorage.clear();
  mockFetch = vi.fn();
  vi.stubGlobal('fetch', mockFetch);
  mockGetConnectorCredential.mockReset();
  mockAppendOrchestrationReceipt.mockClear();
});

afterEach(() => {
  stopGenericWebhookPolling();
  vi.useRealTimers();
});

describe('pollGenericWebhookGateway', () => {
  it('throws when drain URL is not configured', async () => {
    mockGetConnectorCredential.mockReturnValue('');
    await expect(pollGenericWebhookGateway()).rejects.toThrow('GENERIC_WEBHOOK_DRAIN_URL not set in connector credentials');
  });

  it('fetches the drain URL with limit and auth header', async () => {
    mockGetConnectorCredential.mockImplementation((_id, key) => {
      if (key === 'GENERIC_WEBHOOK_DRAIN_URL') return 'https://gw.example.com/queue/drain';
      if (key === 'GENERIC_WEBHOOK_TOKEN') return 'secret-token';
      return '';
    });
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ events: [] }) });

    await pollGenericWebhookGateway({ limit: 25 });

    const [calledUrl, calledOptions] = mockFetch.mock.calls[0];
    expect(calledUrl).toBe('https://gw.example.com/queue/drain?limit=25');
    expect(calledOptions.headers.Authorization).toBe('Bearer secret-token');
  });

  it('omits Authorization header when no token configured', async () => {
    mockGetConnectorCredential.mockImplementation((_id, key) => {
      if (key === 'GENERIC_WEBHOOK_DRAIN_URL') return 'https://gw.example.com/queue/drain';
      return '';
    });
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ events: [] }) });

    await pollGenericWebhookGateway();
    const [, calledOptions] = mockFetch.mock.calls[0];
    expect(calledOptions.headers.Authorization).toBeUndefined();
  });

  it('throws when the gateway responds with a non-ok status', async () => {
    mockGetConnectorCredential.mockReturnValue('https://gw.example.com/queue/drain');
    mockFetch.mockResolvedValue({ ok: false, status: 401 });
    await expect(pollGenericWebhookGateway()).rejects.toThrow('Gateway drain failed: HTTP 401');
  });

  it('returns the drained events', async () => {
    mockGetConnectorCredential.mockReturnValue('https://gw.example.com/queue/drain');
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        events: [
          { sourceId: 'stripe', payload: { type: 'payment_intent.succeeded' }, queuedAtMs: 111 },
          { sourceId: 'zapier', payload: { hello: 'world' }, queuedAtMs: 222 }
        ]
      })
    });

    const result = await pollGenericWebhookGateway();
    expect(result.ok).toBe(true);
    expect(result.events).toHaveLength(2);
    expect(result.events[0].sourceId).toBe('stripe');
  });

  it('returns an empty array when the response has no events field', async () => {
    mockGetConnectorCredential.mockReturnValue('https://gw.example.com/queue/drain');
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const result = await pollGenericWebhookGateway();
    expect(result.events).toEqual([]);
  });

  it('appends an orchestration receipt for each drained event', async () => {
    mockGetConnectorCredential.mockReturnValue('https://gw.example.com/queue/drain');
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        events: [{ sourceId: 'stripe', payload: {}, queuedAtMs: 111 }]
      })
    });

    await pollGenericWebhookGateway();
    expect(mockAppendOrchestrationReceipt).toHaveBeenCalledTimes(1);
    expect(mockAppendOrchestrationReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: 'generic_webhook_gateway',
        eventType: 'inbound_webhook_received',
        details: expect.objectContaining({ sourceId: 'stripe' })
      })
    );
  });
});

describe('startGenericWebhookPolling / stopGenericWebhookPolling', () => {
  it('does not poll when no drain URL is configured', async () => {
    vi.useFakeTimers();
    mockGetConnectorCredential.mockReturnValue('');
    const callback = vi.fn();

    startGenericWebhookPolling(callback);
    await vi.advanceTimersByTimeAsync(30_000);

    expect(mockFetch).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
  });

  it('polls on interval and invokes callback when events are drained', async () => {
    vi.useFakeTimers();
    mockGetConnectorCredential.mockReturnValue('https://gw.example.com/queue/drain');
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ events: [{ sourceId: 'stripe', payload: {}, queuedAtMs: 111 }] })
    });
    const callback = vi.fn();

    startGenericWebhookPolling(callback);
    await vi.advanceTimersByTimeAsync(30_000);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({ events: [{ sourceId: 'stripe', payload: {}, queuedAtMs: 111 }] });
  });

  it('does not invoke callback when no events are drained', async () => {
    vi.useFakeTimers();
    mockGetConnectorCredential.mockReturnValue('https://gw.example.com/queue/drain');
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ events: [] }) });
    const callback = vi.fn();

    startGenericWebhookPolling(callback);
    await vi.advanceTimersByTimeAsync(30_000);

    expect(callback).not.toHaveBeenCalled();
  });

  it('swallows fetch errors without throwing', async () => {
    vi.useFakeTimers();
    mockGetConnectorCredential.mockReturnValue('https://gw.example.com/queue/drain');
    mockFetch.mockRejectedValue(new Error('network down'));
    const callback = vi.fn();

    startGenericWebhookPolling(callback);
    await expect(vi.advanceTimersByTimeAsync(30_000)).resolves.not.toThrow();
    expect(callback).not.toHaveBeenCalled();
  });

  it('stopGenericWebhookPolling clears the interval', async () => {
    vi.useFakeTimers();
    mockGetConnectorCredential.mockReturnValue('https://gw.example.com/queue/drain');
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ events: [] }) });
    const callback = vi.fn();

    startGenericWebhookPolling(callback);
    stopGenericWebhookPolling();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('calling startGenericWebhookPolling twice stops the previous interval', async () => {
    vi.useFakeTimers();
    mockGetConnectorCredential.mockReturnValue('https://gw.example.com/queue/drain');
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ events: [] }) });

    startGenericWebhookPolling(vi.fn());
    startGenericWebhookPolling(vi.fn());
    await vi.advanceTimersByTimeAsync(30_000);

    // Only the second interval should be active — one fetch, not two.
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
