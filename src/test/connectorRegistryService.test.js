import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invoke: mockInvoke } = vi.hoisted(() => ({
  invoke: vi.fn().mockResolvedValue(null)
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args) => mockInvoke(...args),
  isTauri: vi.fn().mockReturnValue(false)
}));

import { listConnectors, sendQwenConnectorMessage, verifyConnectorEnvironment } from '../services/connectorRegistryService';

describe('connectorRegistryService', () => {
  beforeEach(() => {
    localStorage.clear();
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(null);
  });

  it('probes local runtime health separately from external setup_required connectors', async () => {
    mockInvoke.mockImplementation(async (command) => {
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
    expect(mockInvoke).toHaveBeenCalledWith('connector_check_local_runtime_health', { connectorId: 'sd_webui' });
  });

  it('registers Alibaba Qwen as an approval-gated paid prompt connector', () => {
    const qwen = listConnectors().find((connector) => connector.id === 'qwen');

    expect(qwen).toMatchObject({
      name: 'Alibaba Qwen Connector',
      status: 'not_configured',
      transport: 'dashscope_openai_compatible_adapter',
      requiredEnv: ['DASHSCOPE_API_KEY']
    });
    expect(qwen.permissions).toEqual(expect.arrayContaining(['prompt_exchange', 'approval_requests', 'paid_connector_send']));
  });

  it('blocks Qwen sends before network when DashScope key is missing', async () => {
    localStorage.setItem('alphonso_connector_auth_profiles_v1', JSON.stringify({
      qwen: { enabled: true, allowlist: [], mode: 'allowlist_required' }
    }));
    mockInvoke.mockResolvedValue({ DASHSCOPE_API_KEY: false });
    const result = await sendQwenConnectorMessage('hello qwen', { approved: true });

    expect(result).toMatchObject({
      ok: false,
      blocked: true,
      connectorId: 'qwen',
      code: 'MISSING_KEY'
    });
    expect(mockInvoke).toHaveBeenCalledWith('check_env_vars_presence', { names: ['DASHSCOPE_API_KEY'] });
    expect(mockInvoke).not.toHaveBeenCalledWith('connector_send_qwen', expect.anything());
  });

  it('keeps foundation_only connectors truthfully non-operational until a real health proof exists', async () => {
    const proof = await verifyConnectorEnvironment('mobile_bridge');

    expect(proof).toMatchObject({
      connectorId: 'mobile_bridge',
      ok: false,
      status: 'foundation_only',
      lastTestStatus: 'foundation_only'
    });
    expect(mockInvoke).not.toHaveBeenCalledWith('check_env_vars_presence', expect.anything());
    expect(mockInvoke).not.toHaveBeenCalledWith('connector_check_local_runtime_health', expect.anything());
  });
});
