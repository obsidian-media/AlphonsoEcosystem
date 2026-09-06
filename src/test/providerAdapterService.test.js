import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/approval/approvalService', () => ({
  createApprovalRequest: vi.fn((opts) => ({
    id: `approval_${Date.now()}`,
    status: 'pending',
    ...opts
  })),
  getApprovalReason: vi.fn(() => 'Paid connector usage requires approval')
}));

vi.mock('../services/orchestrationReceiptService', () => ({
  appendOrchestrationReceipt: vi.fn()
}));

vi.mock('../services/connectorRegistryService', () => ({
  sendChatGptConnectorMessage: vi.fn(async () => ({ ok: true, response: 'ChatGPT response' })),
  sendClaudeConnectorMessage: vi.fn(async () => ({ ok: true, response: 'Claude response' })),
  sendQwenConnectorMessage: vi.fn(async () => ({ ok: true, response: 'Qwen response' }))
}));

vi.mock('../services/trustModel', () => ({
  TRUST_STATES: { VERIFIED: 'verified', UNVERIFIED: 'unverified', PENDING: 'pending' },
  timestampMs: vi.fn(() => Date.now())
}));

import { listOptionalProviderAdapters, executeOptionalProviderAdapter } from '../services/agentWorkshop/providerAdapterService';
import { createApprovalRequest, getApprovalReason } from '../services/approval/approvalService';
import { appendOrchestrationReceipt } from '../services/orchestrationReceiptService';
import { sendChatGptConnectorMessage, sendClaudeConnectorMessage, sendQwenConnectorMessage } from '../services/connectorRegistryService';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('listOptionalProviderAdapters', () => {
  it('returns three adapters', () => {
    const adapters = listOptionalProviderAdapters();
    expect(adapters).toHaveLength(3);
  });

  it('includes chatgpt, claude, qwen', () => {
    const ids = listOptionalProviderAdapters().map((a) => a.id);
    expect(ids).toEqual(['chatgpt', 'claude', 'qwen']);
  });

  it('each has label and setupStatus', () => {
    const adapters = listOptionalProviderAdapters();
    adapters.forEach((a) => {
      expect(a.label).toBeTruthy();
      expect(a.setupStatus).toBeTruthy();
    });
  });
});

describe('executeOptionalProviderAdapter', () => {
  it('returns error for unknown provider', async () => {
    const result = await executeOptionalProviderAdapter('unknown_provider', { prompt: 'test' });
    expect(result.ok).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.setupRequired).toBe(true);
    expect(result.error).toContain('Unknown provider');
  });

  it('returns approval required when not approved', async () => {
    const result = await executeOptionalProviderAdapter('chatgpt', { prompt: 'test' }, { approved: false });
    expect(result.ok).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.requiresApproval).toBe(true);
    expect(result.approvalId).toBeTruthy();
    expect(createApprovalRequest).toHaveBeenCalled();
    expect(getApprovalReason).toHaveBeenCalledWith('paid_connector_send');
  });

  it('executes chatgpt when approved', async () => {
    const result = await executeOptionalProviderAdapter('chatgpt', { prompt: 'hello' }, { approved: true });
    expect(sendChatGptConnectorMessage).toHaveBeenCalledWith('hello', { approved: true, commandId: null, packetId: null });
    expect(result.ok).toBe(true);
    expect(result.response).toBe('ChatGPT response');
    expect(appendOrchestrationReceipt).toHaveBeenCalled();
  });

  it('executes claude when approved', async () => {
    const result = await executeOptionalProviderAdapter('claude', { prompt: 'test' }, { approved: true });
    expect(sendClaudeConnectorMessage).toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });

  it('executes qwen when approved', async () => {
    const result = await executeOptionalProviderAdapter('qwen', { prompt: 'test' }, { approved: true });
    expect(sendQwenConnectorMessage).toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });

  it('passes commandId and packetId options', async () => {
    await executeOptionalProviderAdapter('chatgpt', { prompt: 'test' }, {
      approved: true,
      commandId: 'cmd_123',
      packetId: 'pkt_456'
    });
    expect(sendChatGptConnectorMessage).toHaveBeenCalledWith('test', {
      approved: true,
      commandId: 'cmd_123',
      packetId: 'pkt_456'
    });
  });

  it('truncates prompt in approval metadata', async () => {
    const longPrompt = 'a'.repeat(300);
    await executeOptionalProviderAdapter('chatgpt', { prompt: longPrompt }, { approved: false });
    const call = createApprovalRequest.mock.calls[0][0];
    expect(call.metadata.commandPreview).toHaveLength(180);
  });

  it('records orchestration receipt on success', async () => {
    await executeOptionalProviderAdapter('chatgpt', { prompt: 'test' }, { approved: true });
    expect(appendOrchestrationReceipt).toHaveBeenCalledTimes(1);
    const receipt = appendOrchestrationReceipt.mock.calls[0][0];
    expect(receipt.eventType).toBe('provider_adapter_executed');
    expect(receipt.status).toBe('executed');
    expect(receipt.connectorId).toBe('chatgpt');
  });

  it('records orchestration receipt on failure', async () => {
    sendChatGptConnectorMessage.mockResolvedValueOnce({ ok: false, blocked: true, error: 'rate limited' });
    await executeOptionalProviderAdapter('chatgpt', { prompt: 'test' }, { approved: true });
    const receipt = appendOrchestrationReceipt.mock.calls[0][0];
    expect(receipt.eventType).toBe('provider_adapter_blocked');
    expect(receipt.blocked).toBe(true);
  });
});
