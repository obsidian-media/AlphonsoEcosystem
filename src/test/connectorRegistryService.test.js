import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args) => invoke(...args)
}));

import { verifyConnectorEnvironment } from '../services/connectorRegistryService';

describe('connectorRegistryService', () => {
  beforeEach(() => {
    localStorage.clear();
    invoke.mockReset();
  });

  it('probes local runtime health separately from external setup_required connectors', async () => {
    invoke.mockImplementation(async (command) => {
      if (command === 'connector_check_local_runtime_health') {
        return {
          ok: true,
          connectorId: 'sd_webui',
          provider: 'automatic1111',
          endpoint: 'http://127.0.0.1:7860',
          probePath: '/sdapi/v1/samplers',
          httpStatus: 200,
          checkedAtMs: 123,
          trust: 'verified',
          message: 'automatic1111 runtime is reachable.',
          error: null
        };
      }
      return {};
    });

    const proof = await verifyConnectorEnvironment('sd_webui');

    expect(proof).toMatchObject({
      connectorId: 'sd_webui',
      ok: true,
      status: 'foundation_only',
      lastTestStatus: 'verified'
    });
    expect(invoke).toHaveBeenCalledWith('connector_check_local_runtime_health', { connectorId: 'sd_webui' });
  });

  it('keeps foundation_only connectors truthfully non-operational until a real health proof exists', async () => {
    const proof = await verifyConnectorEnvironment('mobile_bridge');

    expect(proof).toMatchObject({
      connectorId: 'mobile_bridge',
      ok: false,
      status: 'foundation_only',
      lastTestStatus: 'foundation_only'
    });
    expect(invoke).not.toHaveBeenCalled();
  });
});
