import { appendOrchestrationReceipt } from '../orchestrationReceiptService';
import { TRUST_STATES } from '../trustModel';
const APPROVAL_KEY = 'alphonso_project_execution_approvals_v1';

const APPROVAL_REQUIRED_TYPES = new Set([
  'file_write',
  'dependency_install',
  'terminal_command',
  'deployment',
  'external_api_connection',
  'production_config_change',
  'secret_rotation',
  'payout_payment_action',
  'external_posting_uploading'
]);

const APPROVAL_REASONS = {
  file_write: 'File writes may alter project state and require human supervision.',
  dependency_install: 'Dependency installation may impact security and build reproducibility.',
  terminal_command: 'Terminal execution can affect local runtime and project files.',
  deployment: 'Deployment changes live environments and must be approved.',
  external_api_connection: 'External connectors may consume cost or expose data.',
  production_config_change: 'Production configuration changes can cause outages.',
  secret_rotation: 'Secret lifecycle actions require strict supervision.',
  payout_payment_action: 'Payment and payout actions carry financial and fraud risk.',
  external_posting_uploading: 'Public posting/uploading requires content approval.'
};

function readRows() {
  try {
    const raw = localStorage.getItem(APPROVAL_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRows(rows) {
  localStorage.setItem(APPROVAL_KEY, JSON.stringify(rows.slice(-500)));
}

export function requiresApproval(actionType) {
  return APPROVAL_REQUIRED_TYPES.has(String(actionType || '').trim());
}

export function getApprovalReason(actionType) {
  return APPROVAL_REASONS[actionType] || 'This action requires explicit supervision.';
}

export function createApprovalRequest(payload = {}) {
  const actionType = payload.actionType || 'unknown';
  const request = {
    id: `approval-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    status: 'pending',
    riskLevel: payload.riskLevel || 'medium',
    actionType,
    reason: payload.reason || getApprovalReason(actionType),
    summary: payload.summary || '',
    createdAt: new Date().toISOString(),
    expiresAt: payload.expiresAt || null,
    metadata: payload.metadata || {}
  };
  const rows = readRows();
  rows.push(request);
  writeRows(rows);
  appendOrchestrationReceipt({
    workflowId: payload.workflowId || payload.metadata?.workflowId || 'approval_center',
    commandId: payload.commandId || payload.metadata?.commandId || null,
    packetId: payload.packetId || payload.metadata?.packetId || null,
    eventType: 'approval_created',
    status: 'pending',
    agent: payload.requestedBy || payload.metadata?.sourceAgent || 'jose',
    actionType,
    riskLevel: request.riskLevel || 'medium',
    approved: false,
    blocked: false,
    setupRequired: false,
    details: {
      approvalId: request.id,
      summary: request.summary || '',
      reason: request.reason || ''
    },
    confidence: TRUST_STATES.VERIFIED,
    verificationState: TRUST_STATES.VERIFIED
  });
  return request;
}

export async function requireApproval({
  actionType,
  approved = false,
  force = false,
  summary = '',
  reason = '',
  riskLevel = 'medium',
  requestedBy = 'jose',
  workflowId = 'approval_center',
  commandId = null,
  packetId = null,
  metadata = {}
} = {}) {
  const normalizedAction = String(actionType || 'unknown').trim();
  const approvalRequired = force || requiresApproval(normalizedAction);

  if (!approvalRequired) {
    appendOrchestrationReceipt({
      workflowId,
      commandId,
      packetId,
      eventType: 'approval_check_not_required',
      status: 'allowed',
      agent: requestedBy || 'jose',
      actionType: normalizedAction,
      riskLevel,
      approved: true,
      blocked: false,
      setupRequired: false,
      details: {
        actionType: normalizedAction
      },
      confidence: TRUST_STATES.VERIFIED,
      verificationState: TRUST_STATES.VERIFIED
    });
    return {
      ok: true,
      success: true,
      required: false,
      approval: null
    };
  }

  if (approved) {
    appendOrchestrationReceipt({
      workflowId,
      commandId,
      packetId,
      eventType: 'approval_check_passed',
      status: 'approved',
      agent: requestedBy || 'jose',
      actionType: normalizedAction,
      riskLevel,
      approved: true,
      blocked: false,
      setupRequired: false,
      details: {
        actionType: normalizedAction,
        summary
      },
      confidence: TRUST_STATES.VERIFIED,
      verificationState: TRUST_STATES.VERIFIED
    });
    return {
      ok: true,
      success: true,
      required: true,
      approval: null
    };
  }

  const request = createApprovalRequest({
    actionType: normalizedAction,
    summary,
    reason: reason || getApprovalReason(normalizedAction),
    riskLevel,
    requestedBy,
    workflowId,
    commandId,
    packetId,
    metadata
  });
  appendOrchestrationReceipt({
    workflowId,
    commandId,
    packetId,
    eventType: 'approval_check_blocked',
    status: 'pending',
    agent: requestedBy || 'jose',
    actionType: normalizedAction,
    riskLevel,
    approved: false,
    blocked: true,
    setupRequired: false,
    details: {
      approvalId: request.id,
      actionType: normalizedAction,
      reason: request.reason
    },
    confidence: TRUST_STATES.VERIFIED,
    verificationState: TRUST_STATES.PENDING
  });
  return {
    ok: false,
    success: false,
    required: true,
    approval: request,
    error: 'approval_required',
    reason: request.reason,
    actionType: normalizedAction
  };
}

function updateApprovalStatus(id, status) {
  const rows = readRows();
  const next = rows.map((row) => (row.id === id ? { ...row, status, updatedAt: new Date().toISOString() } : row));
  writeRows(next);
  const updated = next.find((row) => row.id === id) || null;
  if (updated) {
    appendOrchestrationReceipt({
      workflowId: updated.metadata?.workflowId || 'approval_center',
      commandId: updated.metadata?.commandId || null,
      packetId: updated.metadata?.packetId || null,
      eventType: 'approval_status_changed',
      status,
      agent: updated.metadata?.sourceAgent || 'jose',
      actionType: updated.actionType || 'unknown',
      riskLevel: updated.riskLevel || 'medium',
      approved: status === 'approved',
      blocked: status === 'rejected',
      setupRequired: false,
      details: {
        approvalId: updated.id,
        summary: updated.summary || '',
        reason: updated.reason || ''
      },
      confidence: TRUST_STATES.VERIFIED,
      verificationState: TRUST_STATES.VERIFIED
    });
  }
  return updated;
}

export function approveRequest(id) {
  return updateApprovalStatus(id, 'approved');
}

export function rejectRequest(id) {
  return updateApprovalStatus(id, 'rejected');
}

export function listPendingApprovals() {
  return readRows().filter((row) => row.status === 'pending');
}

export function listAllApprovals() {
  return readRows();
}
