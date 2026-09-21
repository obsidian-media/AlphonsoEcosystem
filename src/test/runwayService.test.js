import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockInvoke = vi.fn().mockResolvedValue({ ok: true, taskId: 'task-1' });
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args) => mockInvoke(...args)
}));

vi.mock('../services/connectors/connectorAuth.js', () => ({
  getConnectorCredential: vi.fn().mockReturnValue('secret-key'),
  isConnectorAuthenticated: vi.fn().mockReturnValue({ ok: true }),
  logUnauthenticatedConnectorRequest: vi.fn().mockResolvedValue({ ok: false, blocked: true, error: 'not authenticated' })
}));

vi.mock('../services/connectors/connectorRegistry.js', () => ({
  gateConnectorAction: vi.fn().mockReturnValue({ ok: true }),
  requireConnectorReady: vi.fn().mockResolvedValue({ ok: true }),
  requireConnectorApproval: vi.fn().mockResolvedValue({ ok: true }),
  appendConnectorAudit: vi.fn(),
  getConnectorCircuitState: vi.fn().mockReturnValue({ ok: true }),
  recordConnectorFailure: vi.fn(),
  recordConnectorSuccess: vi.fn()
}));

import { buildRunwayVideoRequest, generateRunwayVideo } from '../services/runwayService';

describe('buildRunwayVideoRequest', () => {
  it('normalizes the runway request payload', () => {
    const request = buildRunwayVideoRequest({
      promptText: '  Launch teaser  ',
      model: ' gen4.5 ',
      ratio: ' 1280:720 ',
      duration: '6',
      outputDir: ' release/miya/runway ',
      timeoutSeconds: '900'
    });

    expect(request).toEqual({
      promptText: 'Launch teaser',
      promptImage: '',
      model: 'gen4.5',
      ratio: '1280:720',
      duration: 6,
      outputDir: 'release/miya/runway',
      timeoutSeconds: 900
    });
  });

  it('keeps the default runway video settings stable', () => {
    expect(buildRunwayVideoRequest()).toEqual({
      promptText: '',
      promptImage: '',
      model: 'gen4.5',
      ratio: '1280:720',
      duration: 5,
      outputDir: '',
      timeoutSeconds: 600
    });
  });
});

// Regression coverage for the 2026-09-20 G-T12 fix: generateRunwayVideo used to
// call the real paid RunwayML API with zero policy gate of any kind. These
// tests prove the same fail-closed pattern connectorOutbound.js's other paid
// connectors already use is now applied here too.
describe('generateRunwayVideo policy gating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue({ ok: true, taskId: 'task-1' });
  });

  it('calls the real Runway API when authenticated, approved, and gate allows', async () => {
    const { isConnectorAuthenticated } = await import('../services/connectors/connectorAuth.js');
    isConnectorAuthenticated.mockReturnValueOnce({ ok: true });

    const result = await generateRunwayVideo({ promptText: 'a teaser' }, { approved: true });

    expect(mockInvoke).toHaveBeenCalledWith('runway_generate_video', expect.objectContaining({
      request: expect.objectContaining({ promptText: 'a teaser' })
    }));
    expect(result).toEqual({ ok: true, taskId: 'task-1' });
  });

  it('blocks and never calls the API when not authenticated', async () => {
    const { isConnectorAuthenticated } = await import('../services/connectors/connectorAuth.js');
    isConnectorAuthenticated.mockReturnValueOnce({ ok: false });

    const result = await generateRunwayVideo({ promptText: 'a teaser' });

    expect(mockInvoke).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
  });

  it('blocks and never calls the API when the circuit breaker is open', async () => {
    const { getConnectorCircuitState } = await import('../services/connectors/connectorRegistry.js');
    getConnectorCircuitState.mockReturnValueOnce({ ok: false, failures: 5, remainingMs: 15000 });

    const result = await generateRunwayVideo({ promptText: 'a teaser' });

    expect(mockInvoke).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
  });

  it('blocks and never calls the API when approval is required and not given (Approval Mode)', async () => {
    const { requireConnectorApproval } = await import('../services/connectors/connectorRegistry.js');
    requireConnectorApproval.mockResolvedValueOnce({ ok: false, blocked: true, error: 'Approval Mode requires explicit approval for this action.' });

    const result = await generateRunwayVideo({ promptText: 'a teaser' });

    expect(mockInvoke).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
  });

  it('blocks and never calls the API when the DSL/policy gate denies (Zero-Cost Mode)', async () => {
    const { gateConnectorAction } = await import('../services/connectors/connectorRegistry.js');
    gateConnectorAction.mockReturnValueOnce({ ok: false, reason: 'Zero-Cost Mode blocked runway without explicit override.' });

    const result = await generateRunwayVideo({ promptText: 'a teaser' });

    expect(mockInvoke).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Zero-Cost Mode');
  });

  it('blocks and never calls the API when the connector is not yet configured', async () => {
    const { requireConnectorReady } = await import('../services/connectors/connectorRegistry.js');
    requireConnectorReady.mockResolvedValueOnce({ ok: false, blocked: true, setupRequired: true, error: 'Connector runway is not configured in runtime env.' });

    const result = await generateRunwayVideo({ promptText: 'a teaser' });

    expect(mockInvoke).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
  });
});
