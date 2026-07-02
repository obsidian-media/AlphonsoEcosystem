import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invoke: mockInvoke } = vi.hoisted(() => ({
  invoke: vi.fn().mockResolvedValue(null)
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args) => mockInvoke(...args),
  isTauri: vi.fn().mockReturnValue(false)
}));

vi.mock('../services/agentActivityService', () => ({
  appendAgentActivity: vi.fn()
}));

vi.mock('../services/orchestrationReceiptService', () => ({
  appendOrchestrationReceipt: vi.fn()
}));

vi.mock('../services/policyDslService', () => ({
  evaluateAction: vi.fn(() => ({ allowed: true, effect: 'allow', ruleId: 'test' }))
}));

vi.mock('../services/policyEnforcementService', () => ({
  evaluatePolicyGate: vi.fn(({ connectorId, actionType }) => {
    if (actionType === 'blocked_action') return { ok: false, reason: 'blocked', riskLevel: 'high' };
    return { ok: true, riskLevel: 'low' };
  })
}));

vi.mock('../services/runtimeLedgerService', () => ({
  persistScopeRows: vi.fn()
}));

vi.mock('../services/approval/approvalService', () => ({
  requireApproval: vi.fn()
}));

import {
  listConnectors,
  listConnectorAudit,
  setConnectorStatus,
  appendConnectorAudit,
  gateConnectorAction,
  recordConnectorFailure,
  recordConnectorSuccess,
  getConnectorCircuitState,
  resetConnectorCircuitState,
  sendQwenConnectorMessage,
  verifyConnectorEnvironment
} from '../services/connectorRegistryService';

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

  // ── listConnectors ────────────────────────────────────────────────────────

  describe('listConnectors', () => {
    it('returns all default connectors', () => {
      const connectors = listConnectors();
      expect(connectors.length).toBeGreaterThanOrEqual(10);
    });

    it('includes telegram connector', () => {
      const connectors = listConnectors();
      const telegram = connectors.find((c) => c.id === 'telegram');
      expect(telegram).toBeDefined();
      expect(telegram.name).toBe('Telegram Bridge');
    });

    it('includes github connector', () => {
      const connectors = listConnectors();
      const github = connectors.find((c) => c.id === 'github');
      expect(github).toBeDefined();
      expect(github.permissions).toContain('repo_read');
    });

    it('includes slack connector', () => {
      const connectors = listConnectors();
      const slack = connectors.find((c) => c.id === 'slack');
      expect(slack).toBeDefined();
      expect(slack.permissions).toContain('message_send');
    });

    it('includes foundation_only connectors like sd_webui', () => {
      const connectors = listConnectors();
      const sd = connectors.find((c) => c.id === 'sd_webui');
      expect(sd).toBeDefined();
      expect(sd.status).toBe('foundation_only');
    });
  });

  // ── listConnectorAudit ────────────────────────────────────────────────────

  describe('listConnectorAudit', () => {
    it('returns empty array when no audit entries exist', () => {
      expect(listConnectorAudit()).toEqual([]);
    });
  });

  // ── setConnectorStatus ────────────────────────────────────────────────────

  describe('setConnectorStatus', () => {
    it('updates connector status and returns updated connector', () => {
      const updated = setConnectorStatus('telegram', 'configured', 'Token set');
      expect(updated.status).toBe('configured');
      expect(updated.note).toBe('Token set');
    });

    it('creates audit entry on status change', () => {
      setConnectorStatus('slack', 'configured');
      const audit = listConnectorAudit();
      expect(audit.length).toBeGreaterThanOrEqual(1);
      expect(audit.some((e) => e.connectorId === 'slack' && e.action === 'status_updated')).toBe(true);
    });
  });

  // ── appendConnectorAudit ──────────────────────────────────────────────────

  describe('appendConnectorAudit', () => {
    it('creates an audit entry with required fields', () => {
      const entry = appendConnectorAudit('github', 'send_message', { summary: 'test' });
      expect(entry.connectorId).toBe('github');
      expect(entry.action).toBe('send_message');
      expect(entry.timestampMs).toBeDefined();
      expect(entry.id).toContain('connector-audit-');
    });

    it('appends to existing audit entries', () => {
      appendConnectorAudit('github', 'action1');
      appendConnectorAudit('github', 'action2');
      const audit = listConnectorAudit();
      expect(audit.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ── gateConnectorAction ───────────────────────────────────────────────────

  describe('gateConnectorAction', () => {
    it('allows a normal action', () => {
      const gate = gateConnectorAction('telegram', 'send_message', 'hello');
      expect(gate.ok).toBe(true);
    });

    it('blocks a blocked_action type', () => {
      const gate = gateConnectorAction('telegram', 'blocked_action', 'dangerous');
      expect(gate.ok).toBe(false);
    });

    it('creates audit entry for policy decision', () => {
      gateConnectorAction('github', 'create_release', 'v1.0.0');
      const audit = listConnectorAudit();
      expect(audit.some((e) => e.action === 'policy_allow' || e.action === 'policy_block')).toBe(true);
    });
  });

  // ── Circuit breaker ───────────────────────────────────────────────────────

  describe('circuit breaker', () => {
    beforeEach(() => {
      resetConnectorCircuitState('telegram', 'send');
      resetConnectorCircuitState('telegram', 'default');
    });

    it('getConnectorCircuitState returns ok when no failures', () => {
      const state = getConnectorCircuitState('telegram');
      expect(state.ok).toBe(true);
      expect(state.failures).toBe(0);
    });

    it('recordConnectorFailure increments failure count', () => {
      recordConnectorFailure('telegram', 'send');
      const state = getConnectorCircuitState('telegram', 'send');
      expect(state.failures).toBe(1);
      expect(state.ok).toBe(true);
    });

    it('opens circuit breaker after threshold failures', () => {
      for (let i = 0; i < 5; i++) {
        recordConnectorFailure('telegram', 'send');
      }
      const state = getConnectorCircuitState('telegram', 'send');
      expect(state.open).toBe(true);
      expect(state.disabledUntil).toBeDefined();
    });

    it('recordConnectorSuccess clears state when circuit not open', () => {
      recordConnectorFailure('telegram', 'send');
      recordConnectorSuccess('telegram', 'send');
      const state = getConnectorCircuitState('telegram', 'send');
      expect(state.failures).toBe(0);
      expect(state.open).toBe(false);
    });

    it('recordConnectorSuccess decrements when circuit is open', () => {
      for (let i = 0; i < 5; i++) {
        recordConnectorFailure('telegram', 'send');
      }
      const before = getConnectorCircuitState('telegram', 'send');
      expect(before.open).toBe(true);
      recordConnectorSuccess('telegram', 'send');
      const after = getConnectorCircuitState('telegram', 'send');
      expect(after.failures).toBe(4);
    });
  });
});
