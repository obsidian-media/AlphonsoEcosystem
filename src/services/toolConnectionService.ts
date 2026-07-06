import { invoke } from '@tauri-apps/api/core';
import { appendOrchestrationReceipt } from './orchestrationReceiptService';
import { appendSessionEvent } from './sessionIntelligenceService';
import { requireApproval } from './approval/approvalService';
import { TRUST_STATES, timestampMs } from './trustModel';
import { persistScopeRows } from './runtimeLedgerService';

const CONNECTION_KEY = 'alphonso_tool_connections_v1';
const CONNECTION_AUDIT_KEY = 'alphonso_tool_connection_audit_v1';
export const TOOL_CONNECTION_SCOPE = 'tool_connections_v1';
export const TOOL_CONNECTION_AUDIT_SCOPE = 'tool_connection_audit_v1';

export interface ToolConnectionType {
  id: string;
  label: string;
  platform: string;
  description: string;
}

export interface ToolConnection {
  id: string;
  type: string;
  platform: string;
  label: string;
  webhookUrl: string;
  messagePrefix: string;
  payloadTemplate: string;
  notifyOn: string[];
  active: boolean;
  note: string;
  createdAtMs: number;
  updatedAtMs: number;
  lastTestAtMs: number | null;
  lastTestStatus: string | null;
  lastTestError: string | null;
  trust: string;
  status?: string;
  timestampMs?: number;
  [key: string]: unknown;
}

export interface ToolConnectionAuditEntry {
  id: string;
  action: string;
  details: Record<string, unknown>;
  timestampMs: number;
  trust: string;
}

export interface ToolConnectionPatch {
  id?: string;
  type?: string;
  label?: string;
  webhookUrl?: string;
  messagePrefix?: string;
  payloadTemplate?: string;
  notifyOn?: string | string[];
  active?: boolean;
  note?: string;
  [key: string]: unknown;
}

export interface ToolConnectionResult {
  ok: boolean;
  error?: string;
  connection?: ToolConnection | null;
  blocked?: boolean;
  trust?: string;
}

export interface SendToolConnectionOptions {
  internalDispatch?: boolean;
  approved?: boolean;
  reason?: string;
  requestedBy?: string;
  workflowId?: string;
  commandId?: string | null;
  packetId?: string | null;
  notificationPayload?: Record<string, unknown>;
  notificationReceiptId?: string;
  [key: string]: unknown;
}

const CONNECTION_TYPES: ToolConnectionType[] = [
  {
    id: 'slack_webhook',
    label: 'Slack Incoming Webhook',
    platform: 'slack',
    description: 'Posts human-readable updates into a Slack channel.'
  },
  {
    id: 'discord_webhook',
    label: 'Discord Webhook',
    platform: 'discord',
    description: 'Posts concise updates into a Discord channel.'
  },
  {
    id: 'custom_webhook',
    label: 'Custom Webhook',
    platform: 'custom',
    description: 'Posts a JSON payload to any approved webhook endpoint.'
  }
];

function readRows(key: string): ToolConnection[] | ToolConnectionAuditEntry[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRows(key: string, rows: ToolConnection[] | ToolConnectionAuditEntry[]): void {
  const nextRows = rows.slice(-500);
  localStorage.setItem(key, JSON.stringify(nextRows));
  const scope = key === CONNECTION_KEY
    ? TOOL_CONNECTION_SCOPE
    : key === CONNECTION_AUDIT_KEY
      ? TOOL_CONNECTION_AUDIT_SCOPE
      : null;
  if (scope) {
    persistScopeRows(scope, nextRows, (row: ToolConnection | ToolConnectionAuditEntry) => ({
      id: row.id,
      data: row,
      status: (row as ToolConnection).status || (row as ToolConnectionAuditEntry).action || 'recorded',
      confidence: (row as ToolConnection).trust || (row as ToolConnectionAuditEntry).trust || TRUST_STATES.TEMPORARY,
      verificationState: (row as ToolConnection).trust || (row as ToolConnectionAuditEntry).trust || TRUST_STATES.UNVERIFIED,
      timestampMs: Number((row as ToolConnection).updatedAtMs || (row as ToolConnection).timestampMs || (row as ToolConnectionAuditEntry).timestampMs || timestampMs())
    }));
  }
}

function appendAudit(action: string, details: Record<string, unknown> = {}): ToolConnectionAuditEntry {
  const rows = readRows(CONNECTION_AUDIT_KEY) as ToolConnectionAuditEntry[];
  const entry: ToolConnectionAuditEntry = {
    id: `tool-connection-audit-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    action,
    details,
    timestampMs: timestampMs(),
    trust: TRUST_STATES.TEMPORARY
  };
  rows.push(entry);
  writeRows(CONNECTION_AUDIT_KEY, rows);
  return entry;
}

function defaultLabelForType(type: string): string {
  const descriptor = CONNECTION_TYPES.find((item) => item.id === type);
  return descriptor?.label || 'Webhook Connection';
}

function normalizeType(value: string): string {
  const clean = String(value || '').trim();
  if (!clean) return 'custom_webhook';
  if (CONNECTION_TYPES.some((item) => item.id === clean)) return clean;
  return 'custom_webhook';
}

function normalizeNotifyOn(value: unknown): string[] {
  return String(value || '')
    .split(/\r?\n|,/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 20);
}

function platformForType(type: string): string {
  return CONNECTION_TYPES.find((item) => item.id === type)?.platform || 'custom';
}

function safeHostFromUrl(webhookUrl: string): string | null {
  try {
    return new URL(webhookUrl).host || null;
  } catch {
    return null;
  }
}

function renderTemplate(template: string, context: Record<string, unknown>): string {
  return String(template || '').replace(/\{\{(message|connectionName|platform|title|host|timestampMs)\}\}/g, (_: string, token: string) => {
    if (token === 'timestampMs') return String(context.timestampMs || '');
    return String(context[token] || '');
  });
}

function buildCustomPayload(connection: ToolConnection, message: string, options: { title?: string } = {}): Record<string, unknown> {
  const host = safeHostFromUrl(connection.webhookUrl);
  const context: Record<string, unknown> = {
    message,
    title: options.title || connection.label,
    connectionName: connection.label,
    platform: connection.platform,
    host,
    timestampMs: timestampMs()
  };

  const template = String(connection.payloadTemplate || '').trim();
  if (template) {
    try {
      const rendered = renderTemplate(template, context);
      return JSON.parse(rendered);
    } catch {
      // Fall through to a safe JSON envelope.
    }
  }

  return {
    title: context.title,
    text: message,
    connectionName: connection.label,
    platform: connection.platform,
    host,
    source: 'alphonso'
  };
}

export function listToolConnectionTypes(): ToolConnectionType[] {
  return CONNECTION_TYPES.map((item) => ({ ...item }));
}

export function listToolConnections(): ToolConnection[] {
  return readRows(CONNECTION_KEY) as ToolConnection[];
}

export function listToolConnectionAudit(): ToolConnectionAuditEntry[] {
  return readRows(CONNECTION_AUDIT_KEY) as ToolConnectionAuditEntry[];
}

export function upsertToolConnection(patch: ToolConnectionPatch = {}): ToolConnectionResult {
  const id = String(patch.id || '').trim() || `tool-connection-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const rows = listToolConnections();
  const current = rows.find((row) => row.id === id) || ({} as ToolConnection);
  const type = normalizeType(patch.type || current.type);
  const label = String(patch.label || current.label || defaultLabelForType(type)).trim() || defaultLabelForType(type);
  const webhookUrl = String(patch.webhookUrl ?? current.webhookUrl ?? '').trim();

  if (!webhookUrl) {
    return {
      ok: false,
      error: 'webhookUrl is required.',
      connection: null
    };
  }

  const next: ToolConnection = {
    id,
    type,
    platform: platformForType(type),
    label,
    webhookUrl,
    messagePrefix: String(patch.messagePrefix ?? current.messagePrefix ?? '').trim(),
    payloadTemplate: String(patch.payloadTemplate ?? current.payloadTemplate ?? '').trim(),
    notifyOn: Array.isArray(patch.notifyOn)
      ? patch.notifyOn.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean)
      : patch.notifyOn !== undefined
        ? normalizeNotifyOn(patch.notifyOn)
        : Array.isArray(current.notifyOn)
          ? current.notifyOn
          : normalizeNotifyOn(current.notifyOn),
    active: typeof patch.active === 'boolean' ? patch.active : Boolean(current.active ?? true),
    note: String(patch.note ?? current.note ?? '').trim(),
    createdAtMs: current.createdAtMs || timestampMs(),
    updatedAtMs: timestampMs(),
    lastTestAtMs: current.lastTestAtMs || null,
    lastTestStatus: current.lastTestStatus || null,
    lastTestError: current.lastTestError || null,
    trust: current.trust || TRUST_STATES.TEMPORARY
  };

  const merged = [
    ...rows.filter((row) => row.id !== id),
    next
  ];
  writeRows(CONNECTION_KEY, merged);
  appendAudit('connection_upserted', {
    connectionId: next.id,
    type: next.type,
    platform: next.platform,
    host: safeHostFromUrl(next.webhookUrl)
  });
  return {
    ok: true,
    connection: next
  };
}

export function removeToolConnection(connectionId: string): { ok: boolean; removed: boolean } {
  const rows = listToolConnections();
  const next = rows.filter((row) => row.id !== connectionId);
  writeRows(CONNECTION_KEY, next);
  appendAudit('connection_removed', {
    connectionId
  });
  return {
    ok: true,
    removed: rows.length !== next.length
  };
}

export function setToolConnectionStatus(connectionId: string, patch: Partial<ToolConnection> = {}): ToolConnection | null {
  const rows = listToolConnections();
  const next = rows.map((row) => {
    if (row.id !== connectionId) return row;
    return {
      ...row,
      ...patch,
      updatedAtMs: timestampMs(),
      trust: patch.trust || row.trust || TRUST_STATES.TEMPORARY
    };
  });
  writeRows(CONNECTION_KEY, next);
  appendAudit('connection_status_updated', {
    connectionId,
    active: typeof patch.active === 'boolean' ? patch.active : undefined,
    lastTestStatus: patch.lastTestStatus || null
  });
  return next.find((row) => row.id === connectionId) || null;
}

export function buildToolConnectionPayload(connection: ToolConnection | null, message: string, options: Record<string, unknown> = {}): Record<string, unknown> {
  const cleanMessage = String(message || '').trim();
  const prefixedMessage = connection?.messagePrefix
    ? `${String(connection.messagePrefix).trim()} ${cleanMessage}`.trim()
    : cleanMessage;

  if (connection?.platform === 'slack') {
    return {
      text: prefixedMessage,
      unfurl_links: false,
      unfurl_media: false,
      mrkdwn: true
    };
  }

  if (connection?.platform === 'discord') {
    return {
      content: prefixedMessage.slice(0, 1800),
      allowed_mentions: { parse: [] }
    };
  }

  return buildCustomPayload(connection || {} as ToolConnection, prefixedMessage, options);
}

async function postWebhook(connection: ToolConnection, payload: Record<string, unknown>, options: SendToolConnectionOptions = {}): Promise<Record<string, unknown>> {
  const proof = await invoke('tool_connection_post_webhook', {
    webhookUrl: connection.webhookUrl,
    payload,
    platform: connection.platform,
    connectionName: connection.label
  }) as { ok?: boolean; error?: string; [key: string]: unknown };

  const updated = setToolConnectionStatus(connection.id, {
    lastTestAtMs: timestampMs(),
    lastTestStatus: proof?.ok ? 'verified' : 'failed',
    lastTestError: proof?.error || null,
    trust: proof?.ok ? TRUST_STATES.VERIFIED : TRUST_STATES.FAILED
  });

  if (!options.internalDispatch) {
    appendOrchestrationReceipt({
      workflowId: 'tool_connection_registry',
      commandId: options.commandId || null,
      packetId: options.packetId || null,
      eventType: proof?.ok ? 'tool_connection_webhook_posted' : 'tool_connection_webhook_failed',
      status: proof?.ok ? 'executed' : 'failed',
      agent: 'jose',
      connectorId: connection.platform,
      actionType: 'external_publish',
      riskLevel: 'high',
      approved: Boolean(options.approved),
      blocked: !proof?.ok,
      setupRequired: false,
      details: {
        connectionId: connection.id,
        connectionName: connection.label,
        platform: connection.platform,
        host: safeHostFromUrl(connection.webhookUrl),
        error: proof?.error || null
      },
      confidence: proof?.ok ? TRUST_STATES.VERIFIED : TRUST_STATES.FAILED,
      verificationState: proof?.ok ? TRUST_STATES.VERIFIED : TRUST_STATES.FAILED
    });

    appendSessionEvent({
      category: 'connector',
      title: proof?.ok
        ? `Tool connection posted to ${connection.label}`
        : `Tool connection failed for ${connection.label}`,
      details: {
        connectionId: connection.id,
        platform: connection.platform,
        ok: Boolean(proof?.ok),
        error: proof?.error || null
      },
      agent: 'jose',
      confidence: proof?.ok ? TRUST_STATES.VERIFIED : TRUST_STATES.FAILED,
      verificationState: proof?.ok ? TRUST_STATES.VERIFIED : TRUST_STATES.FAILED
    });
  }

  appendAudit(proof?.ok ? 'send_success' : 'send_failed', {
    connectionId: connection.id,
    platform: connection.platform,
    host: safeHostFromUrl(connection.webhookUrl),
    error: proof?.error || null
  });

  return {
    ...proof,
    connection: updated
  };
}

export async function sendToolConnectionMessage(connectionId: string, message: string, options: SendToolConnectionOptions = {}): Promise<Record<string, unknown>> {
  const connection = listToolConnections().find((row) => row.id === connectionId);
  if (!connection) {
    return {
      ok: false,
      blocked: true,
      error: 'Connection not found.',
      trust: TRUST_STATES.FAILED
    };
  }

  if (!connection.active) {
    appendAudit('send_blocked_inactive', {
      connectionId: connection.id,
      platform: connection.platform
    });
    return {
      ok: false,
      blocked: true,
      error: 'Connection is disabled.',
      trust: TRUST_STATES.FAILED
    };
  }

  if (!options.internalDispatch) {
    const approval = await requireApproval({
      actionType: 'external_publish',
      approved: Boolean(options.approved),
      force: true,
      summary: `Send message to ${connection.label}`,
      reason: options.reason || '',
      riskLevel: 'high',
      requestedBy: options.requestedBy || 'jose',
      workflowId: options.workflowId || 'tool_connection_registry',
      commandId: options.commandId || null,
      packetId: options.packetId || null,
      metadata: {
        connectionId: connection.id,
        connectionType: connection.type,
        platform: connection.platform,
        host: safeHostFromUrl(connection.webhookUrl)
      }
    } as Record<string, unknown>);
    if (!approval.ok) {
      appendAudit('send_rejected', {
        connectionId: connection.id,
        platform: connection.platform,
        reason: approval.reason || null
      });
      return approval;
    }
  }

  const payload = options.notificationPayload || buildToolConnectionPayload(connection, message, options);
  appendAudit('send_requested', {
    connectionId: connection.id,
    platform: connection.platform,
    host: safeHostFromUrl(connection.webhookUrl)
  });
  return postWebhook(connection, payload as Record<string, unknown>, options);
}

export async function testToolConnection(connectionId: string, message = 'Alphonso connection test', options: SendToolConnectionOptions = {}): Promise<Record<string, unknown>> {
  return sendToolConnectionMessage(connectionId, message, {
    ...options,
    workflowId: options.workflowId || 'tool_connection_registry_test'
  });
}

export async function proveToolConnectionPath(connectionId: string, message = 'Alphonso webhook live proof', options: SendToolConnectionOptions = {}): Promise<Record<string, unknown>> {
  const connection = listToolConnections().find((row) => row.id === connectionId);
  if (!connection) {
    return {
      ok: false,
      blocked: true,
      error: 'Connection not found.',
      trust: TRUST_STATES.FAILED,
      proofMode: 'webhook_live_proof'
    };
  }

  const proofText = String(message || '').trim() || 'Alphonso webhook live proof';
  const result = await sendToolConnectionMessage(connection.id, proofText, {
    ...options,
    approved: options.approved ?? true,
    requestedBy: options.requestedBy || 'jose',
    reason: options.reason || `Live proof for ${connection.label}`,
    workflowId: options.workflowId || 'tool_connection_live_proof'
  });

  appendAudit(result?.ok ? 'live_proof_success' : 'live_proof_failed', {
    connectionId: connection.id,
    platform: connection.platform,
    host: safeHostFromUrl(connection.webhookUrl),
    error: result?.error || null
  });

  return {
    ...result,
    proofMode: 'webhook_live_proof',
    proofType: 'webhook_live_send',
    proofTarget: connection.webhookUrl,
    proofMessage: proofText,
    setupRequired: false,
    verifiedAtMs: timestampMs()
  };
}
