import { createApprovalRequest, getApprovalReason } from '../approval/approvalService';
import { appendOrchestrationReceipt } from '../orchestrationReceiptService';
import { sendChatGptConnectorMessage, sendClaudeConnectorMessage, sendQwenConnectorMessage } from '../connectorRegistryService';
import { TRUST_STATES, timestampMs } from '../trustModel';

const PROVIDERS = {
  chatgpt: {
    connectorId: 'chatgpt',
    actionType: 'paid_connector_send',
    runner: (input, options) => sendChatGptConnectorMessage(input.prompt, options)
  },
  claude: {
    connectorId: 'claude',
    actionType: 'paid_connector_send',
    runner: (input, options) => sendClaudeConnectorMessage(input.prompt, options)
  },
  qwen: {
    connectorId: 'qwen',
    actionType: 'paid_connector_send',
    runner: (input, options) => sendQwenConnectorMessage(input.prompt, options)
  }
};

export function listOptionalProviderAdapters() {
  return [
    { id: 'chatgpt', label: 'ChatGPT Adapter', setupStatus: 'placeholder' },
    { id: 'claude', label: 'Claude Adapter', setupStatus: 'placeholder' },
    { id: 'qwen', label: 'Qwen Adapter', setupStatus: 'configured' }
  ];
}

export async function executeOptionalProviderAdapter(providerId, input = {}, options = {}) {
  const provider = PROVIDERS[providerId];
  if (!provider) {
    return {
      ok: false,
      blocked: true,
      setupRequired: true,
      error: `Unknown provider adapter: ${providerId}`
    };
  }

  const commandPreview = String(input?.prompt || '').slice(0, 180);
  if (!options.approved) {
    const approval = createApprovalRequest({
      actionType: provider.actionType,
      riskLevel: 'medium',
      summary: `Provider adapter execution requested: ${provider.connectorId}`,
      reason: getApprovalReason(provider.actionType),
      metadata: {
        sourceAgent: 'jose',
        workflowId: 'project_execution_provider_adapter',
        providerId,
        commandPreview
      }
    });
    return {
      ok: false,
      blocked: true,
      requiresApproval: true,
      approvalId: approval.id,
      status: approval.status,
      message: 'Approval required before provider adapter execution.'
    };
  }

  const startedAtMs = timestampMs();
  const result = await provider.runner(input, {
    approved: true,
    commandId: options.commandId || null,
    packetId: options.packetId || null
  });

  appendOrchestrationReceipt({
    workflowId: 'project_execution_provider_adapter',
    commandId: options.commandId || null,
    packetId: options.packetId || null,
    eventType: result?.ok ? 'provider_adapter_executed' : 'provider_adapter_blocked',
    status: result?.ok ? 'executed' : (result?.blocked ? 'blocked' : 'failed'),
    agent: 'jose',
    connectorId: provider.connectorId,
    actionType: provider.actionType,
    riskLevel: 'medium',
    approved: true,
    blocked: Boolean(result?.blocked || !result?.ok),
    setupRequired: Boolean(result?.setupRequired),
    details: {
      providerId,
      startedAtMs,
      finishedAtMs: timestampMs(),
      error: result?.error || null
    },
    confidence: result?.ok ? TRUST_STATES.VERIFIED : TRUST_STATES.UNVERIFIED,
    verificationState: result?.ok ? TRUST_STATES.VERIFIED : TRUST_STATES.PENDING
  });

  return result;
}
