import { TRUST_STATES, timestampMs } from './trustModel';
import { appendSessionEvent } from './sessionIntelligenceService';
import { listToolConnections, sendToolConnectionMessage } from './toolConnectionService';

const IMPORTANT_EVENTS = new Set([
  'approval_created',
  'approval_check_blocked',
  'approval_check_passed',
  'approval_status_changed',
  'connector_policy_allow',
  'connector_policy_block',
  'connector_setup_required',
  'jose_merge_confirm_reported',
  'policy_gate_blocked',
  'pipeline_completed',
  'assignment_executed_reported',
  'blocked',
  'failed',
  'executed',
  'partial',
  'dead_letter',
  'retry_exhausted_dead_letter',
  'connector_request_rejected'
]);

const EXCLUDED_WORKFLOWS = new Set([
  'tool_connection_registry',
  'tool_connection_registry_test'
]);

const DEFAULT_NOTIFY_ON = new Set([
  'approval',
  'blocked',
  'executed',
  'failed',
  'policy',
  'connector',
  'dead_letter'
]);

function normalizeList(value) {
  return String(value || '')
    .split(/\r?\n|,/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function receiptCategory(receipt = {}) {
  const eventType = String(receipt.eventType || '').toLowerCase();
  if (eventType.includes('approval')) return 'approval';
  if (eventType.includes('policy')) return 'policy';
  if (eventType.includes('connector')) return 'connector';
  if (eventType.includes('dead_letter')) return 'dead_letter';
  if (['blocked', 'failed'].includes(eventType)) return 'blocked';
  if (['executed', 'pipeline_completed', 'assignment_executed_reported', 'jose_merge_confirm_reported'].includes(eventType)) {
    return 'executed';
  }
  return 'general';
}

function shouldNotifyReceipt(receipt, connection) {
  const eventType = String(receipt?.eventType || '').trim();
  if (!eventType || !IMPORTANT_EVENTS.has(eventType)) return false;
  if (EXCLUDED_WORKFLOWS.has(String(receipt.workflowId || '').trim())) return false;
  if (!connection?.active) return false;
  if (!['slack', 'discord', 'custom'].includes(String(connection.platform || '').trim())) return false;

  const configured = Array.isArray(connection.notifyOn)
    ? connection.notifyOn
    : normalizeList(connection.notifyOn);
  const notifyOn = configured.length > 0
    ? new Set(configured.map((item) => item.toLowerCase()))
    : DEFAULT_NOTIFY_ON;
  const category = receiptCategory(receipt);
  return notifyOn.has(category) || notifyOn.has('all');
}

function formatReceiptMessage(receipt) {
  const status = String(receipt.status || receipt.eventType || 'event').replace(/_/g, ' ');
  const connector = receipt.connectorId ? ` on ${receipt.connectorId}` : '';
  const action = receipt.actionType ? ` ${receipt.actionType}` : '';
  const workflow = receipt.workflowId ? ` [${receipt.workflowId}]` : '';
  return `Alphonso ${status}${connector}${action}${workflow}`;
}

function buildReceiptPayload(receipt, connection) {
  const summary = formatReceiptMessage(receipt);
  const details = {
    eventType: receipt.eventType,
    workflowId: receipt.workflowId || null,
    commandId: receipt.commandId || null,
    packetId: receipt.packetId || null,
    connectorId: receipt.connectorId || null,
    actionType: receipt.actionType || null,
    riskLevel: receipt.riskLevel || null,
    approved: Boolean(receipt.approved),
    blocked: Boolean(receipt.blocked),
    setupRequired: Boolean(receipt.setupRequired),
    timestampMs: receipt.timestampMs || timestampMs()
  };

  if (connection.platform === 'slack') {
    return {
      text: `${summary}\n\`${JSON.stringify(details)}\``,
      unfurl_links: false,
      unfurl_media: false,
      mrkdwn: true
    };
  }

  if (connection.platform === 'discord') {
    return {
      content: `${summary}\n${JSON.stringify(details).slice(0, 1500)}`,
      allowed_mentions: { parse: [] }
    };
  }

  return {
    summary,
    details,
    connectionName: connection.label,
    platform: connection.platform,
    source: 'alphonso'
  };
}

export async function dispatchReceiptNotifications(receipt) {
  if (!receipt || EXCLUDED_WORKFLOWS.has(String(receipt.workflowId || '').trim())) {
    return { ok: false, skipped: true };
  }

  const connections = listToolConnections();
  const eligible = connections.filter((connection) => shouldNotifyReceipt(receipt, connection));
  if (eligible.length === 0) {
    return { ok: true, sent: 0, skipped: true };
  }

  const payloadMessage = formatReceiptMessage(receipt);
  let sent = 0;
  for (const connection of eligible) {
    try {
      const result = await sendToolConnectionMessage(connection.id, payloadMessage, {
        approved: true,
        internalDispatch: true,
        reason: 'Automated receipt notification',
        workflowId: receipt.workflowId || 'orchestration_receipt_notifications',
        commandId: receipt.commandId || null,
        packetId: receipt.packetId || null,
        notificationReceiptId: receipt.id,
        notificationPayload: buildReceiptPayload(receipt, connection)
      });
      if (result?.ok) {
        sent += 1;
      }
    } catch (error) {
      appendSessionEvent({
        category: 'connector',
        title: `Tool connection notification failed for ${connection.label}`,
        details: { error: String(error), connectionId: connection.id },
        agent: 'jose',
        confidence: TRUST_STATES.FAILED,
        verificationState: TRUST_STATES.FAILED
      });
    }
  }

  return {
    ok: true,
    sent,
    eligible: eligible.length
  };
}

