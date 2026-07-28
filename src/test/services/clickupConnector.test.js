import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockInvoke = vi.fn();
const mockIsConnectorAuthenticated = vi.fn(() => ({ ok: true }));
const mockGetConnectorCredential = vi.fn(() => 'unused');
const mockGateConnectorAction = vi.fn(() => ({ ok: true, verificationState: 'verified' }));
const mockRequireConnectorApproval = vi.fn(() => Promise.resolve({ ok: true }));
const mockRequireConnectorReady = vi.fn(() => Promise.resolve({ ok: true }));
const mockGetConnectorCircuitState = vi.fn(() => ({ ok: true }));
const mockAppendConnectorAudit = vi.fn();
const mockAppendConnectorAuditEntry = vi.fn();
const mockRecordConnectorFailure = vi.fn();
const mockRecordConnectorSuccess = vi.fn();
const mockLogUnauthenticatedConnectorRequest = vi.fn(() => ({ ok: false, connectorId: 'clickup', blocked: true }));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args) => mockInvoke(...args)
}));

vi.mock('../../services/connectors/connectorAuth.js', () => ({
  isConnectorAuthenticated: (...args) => mockIsConnectorAuthenticated(...args),
  getConnectorCredential: (...args) => mockGetConnectorCredential(...args),
  logUnauthenticatedConnectorRequest: (...args) => mockLogUnauthenticatedConnectorRequest(...args)
}));

vi.mock('../../services/connectors/connectorRegistry.js', () => ({
  gateConnectorAction: (...args) => mockGateConnectorAction(...args),
  requireConnectorReady: (...args) => mockRequireConnectorReady(...args),
  requireConnectorApproval: (...args) => mockRequireConnectorApproval(...args),
  getConnectorCircuitState: (...args) => mockGetConnectorCircuitState(...args),
  appendConnectorAudit: (...args) => mockAppendConnectorAudit(...args),
  recordConnectorFailure: (...args) => mockRecordConnectorFailure(...args),
  recordConnectorSuccess: (...args) => mockRecordConnectorSuccess(...args)
}));

vi.mock('../../services/connectorAuditLogService', () => ({
  appendConnectorAuditEntry: (...args) => mockAppendConnectorAuditEntry(...args)
}));

describe('connectorOutbound clickup bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsConnectorAuthenticated.mockReturnValue({ ok: true });
    mockGetConnectorCircuitState.mockReturnValue({ ok: true });
    mockGateConnectorAction.mockReturnValue({ ok: true, verificationState: 'verified' });
    mockRequireConnectorApproval.mockResolvedValue({ ok: true });
    mockRequireConnectorReady.mockResolvedValue({ ok: true });
    mockInvoke.mockImplementation(async (command) => {
      if (command === 'check_env_vars_presence') {
        return { CLICKUP_API_KEY: true };
      }
      if (command === 'connector_send_clickup') {
        return {
          ok: true,
          connectorId: 'clickup',
          taskId: 'task-123',
          url: 'https://app.clickup.com/t/task-123',
          trust: 'verified'
        };
      }
      return {};
    });
  });

  it('fails closed when the backend environment check reports a missing key', async () => {
    const { sendClickUpConnectorTask } = await import('../../services/connectors/connectorOutbound');
    mockInvoke.mockImplementationOnce(async (command) => {
      if (command === 'check_env_vars_presence') {
        return { CLICKUP_API_KEY: false };
      }
      return {};
    });

    const result = await sendClickUpConnectorTask({ title: 'Task', content: 'Body' });

    expect(result.ok).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.error).toContain('CLICKUP_API_KEY');
    expect(mockInvoke).toHaveBeenCalledWith('check_env_vars_presence', { names: ['CLICKUP_API_KEY'] });
    expect(mockInvoke).not.toHaveBeenCalledWith('connector_send_clickup', expect.anything());
  });

  it('invokes the Tauri command when the gate passes', async () => {
    const { sendClickUpConnectorTask } = await import('../../services/connectors/connectorOutbound');

    const result = await sendClickUpConnectorTask({ title: 'Task', content: 'Body', listId: 'list-1' });

    expect(mockInvoke).toHaveBeenCalledWith('connector_send_clickup', {
      title: 'Task',
      content: 'Body',
      listId: 'list-1'
    });
    expect(result.ok).toBe(true);
    expect(result.taskId).toBe('task-123');
    expect(result.url).toBe('https://app.clickup.com/t/task-123');
    expect(mockRecordConnectorSuccess).toHaveBeenCalledWith('clickup', 'external_write');
    expect(mockAppendConnectorAudit).toHaveBeenCalledWith('clickup', 'send_success', expect.objectContaining({
      target: 'list-1'
    }));
  });
});
