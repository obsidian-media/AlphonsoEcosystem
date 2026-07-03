import { AGENTS, createAgentPacket, updatePacketStatus } from './agentBusService';
import { requireApproval } from './approval/approvalService';
import { appendOrchestrationReceipt } from './orchestrationReceiptService';
import { appendSessionEvent } from './sessionIntelligenceService';
import { TRUST_STATES, timestampMs } from './trustModel';
import { publishMetaContent } from './metaPublishService';
import {
  sendTelegramConnectorMessage,
  sendWhatsAppConnectorMessage,
  sendNotionConnectorEntry,
  sendClickUpConnectorTask,
  uploadYouTubeConnectorVideo,
} from './connectorRegistryService';

export const MARCUS_PUBLISH_PLATFORMS = [
  { id: 'instagram', label: 'Instagram', connector: 'meta', fields: ['caption', 'imageUrl', 'videoUrl'] },
  { id: 'facebook',  label: 'Facebook',  connector: 'meta', fields: ['message', 'link', 'imageUrl'] },
  { id: 'youtube',   label: 'YouTube',   connector: 'youtube', fields: ['filePath', 'title', 'description', 'tags', 'privacyStatus'] },
  { id: 'telegram',  label: 'Telegram',  connector: 'telegram', fields: ['chatId', 'text'] },
  { id: 'whatsapp',  label: 'WhatsApp',  connector: 'whatsapp', fields: ['to', 'text'] },
  { id: 'notion',    label: 'Notion',    connector: 'notion', fields: ['title', 'content', 'parentPageId'] },
  { id: 'clickup',   label: 'ClickUp',   connector: 'clickup', fields: ['title', 'content', 'listId'] },
];

interface PublishPayload {
  caption?: string;
  message?: string;
  title?: string;
  text?: string;
  link?: string;
  imageUrl?: string;
  videoUrl?: string;
  mediaType?: string;
  filePath?: string;
  description?: string;
  tags?: string | string[];
  privacyStatus?: string;
  chatId?: string;
  to?: string;
  content?: string;
  parentPageId?: string;
  listId?: string;
}

interface BuildPacketOptions {
  platform: string;
  payload: PublishPayload;
  workflowId?: string;
  commandId?: string;
}

export function buildMarcusPublishPacket({ platform, payload, workflowId = '', commandId = '' }: BuildPacketOptions) {
  return createAgentPacket({
    fromAgent: AGENTS.MARCUS,
    toAgent: AGENTS.JOSE,
    title: `Marcus publish: ${platform}`,
    packetType: 'marcus_publish_handoff',
    payload: { platform, ...payload, workflowId, commandId },
    source: 'marcus-publish-panel',
    confidence: TRUST_STATES.TEMPORARY,
    verificationState: TRUST_STATES.UNVERIFIED,
    requiresApproval: true,
    riskLevel: 'high',
    actionType: 'external_publish',
    commandPreview: `Publish to ${platform}: ${payload.caption || payload.message || payload.title || payload.text || ''}`.slice(0, 200),
    fileChangePreview: 'No local file change. External publish only.',
    rollbackAvailable: false,
  });
}

interface RequireApprovalOptions {
  platform: string;
  summary: string;
  packetId: string | null;
  commandId: string | null;
  workflowId: string | null;
}

async function requireMarcusApproval({ platform, summary, packetId, commandId, workflowId }: RequireApprovalOptions) {
  return requireApproval({
    actionType: 'external_publish',
    approved: false,
    force: true,
    summary: `Marcus publish to ${platform}: ${summary}`.slice(0, 300),
    riskLevel: 'high',
    requestedBy: AGENTS.MARCUS,
    workflowId: workflowId || 'marcus_publish',
    commandId: commandId || null,
    packetId: packetId || null,
    metadata: { platform },
  } as Record<string, unknown>);
}

interface PublishReceiptOptions {
  ok: boolean;
  platform: string;
  packetId: string | null;
  commandId: string | null;
  workflowId: string | null;
  result?: Record<string, unknown> | null;
  error?: string | null;
}

function publishReceipt({ ok, platform, packetId, commandId, workflowId, result, error }: PublishReceiptOptions): void {
  const status = ok ? 'executed' : 'failed';
  appendOrchestrationReceipt({
    workflowId: workflowId || 'marcus_publish',
    commandId: commandId || null,
    packetId: packetId || null,
    eventType: ok ? `marcus_${platform}_publish_completed` : `marcus_${platform}_publish_failed`,
    status,
    agent: AGENTS.MARCUS,
    connectorId: platform,
    actionType: 'external_publish',
    riskLevel: 'high',
    approved: ok,
    blocked: !ok,
    setupRequired: Boolean(result?.setupRequired),
    details: { platform, error: error || null, ...(result || {}) },
    confidence: ok ? TRUST_STATES.VERIFIED : TRUST_STATES.FAILED,
    verificationState: ok ? TRUST_STATES.VERIFIED : TRUST_STATES.FAILED,
  });
  appendSessionEvent({
    category: 'connector',
    title: ok ? `Marcus published to ${platform}` : `Marcus publish to ${platform} failed`,
    details: { packetId, platform, error: error || null },
    agent: AGENTS.MARCUS,
    confidence: ok ? TRUST_STATES.VERIFIED : TRUST_STATES.FAILED,
    verificationState: ok ? TRUST_STATES.VERIFIED : TRUST_STATES.FAILED,
  });
}

interface ExecutePublishOptions {
  platform: string;
  payload: PublishPayload;
  packetId?: string | null;
  commandId?: string | null;
  workflowId?: string | null;
  preApproved?: boolean;
}

interface ExecutePublishResult {
  ok: boolean;
  result?: unknown;
  platform?: string;
  error?: string;
  approval?: { ok: boolean; reason?: string };
}

export async function executeMarcusPublish({ platform, payload, packetId = null, commandId = null, workflowId = null, preApproved = false }: ExecutePublishOptions): Promise<ExecutePublishResult> {
  const summary = payload.caption || payload.message || payload.title || payload.text || platform;

  if (packetId) {
    updatePacketStatus(packetId, 'executing', {
      executor: AGENTS.MARCUS,
      executionStartedAtMs: timestampMs(),
      verificationState: TRUST_STATES.PENDING,
    });
  }

  if (!preApproved) {
    const approval = await requireMarcusApproval({ platform, summary, packetId, commandId, workflowId });
    if (!approval.ok) {
      if (packetId) updatePacketStatus(packetId, 'rejected', { failureReason: approval.reason || 'approval_denied', verificationState: TRUST_STATES.FAILED });
      publishReceipt({ ok: false, platform, packetId, commandId, workflowId, error: approval.reason || 'Approval denied.' });
      return { ok: false, error: approval.reason || 'Approval denied.', approval };
    }
  }

  try {
    let result: Record<string, unknown> | null = null;

    if (platform === 'instagram' || platform === 'facebook') {
      result = await publishMetaContent({}, {
        approved: true,
        platform,
        caption: payload.caption || '',
        message: payload.message || payload.caption || '',
        title: payload.title || '',
        link: payload.link || '',
        imageUrl: payload.imageUrl || '',
        videoUrl: payload.videoUrl || '',
        mediaType: payload.mediaType || '',
      }) as Record<string, unknown>;
    } else if (platform === 'youtube') {
      result = await uploadYouTubeConnectorVideo({
        filePath: payload.filePath || '',
        title: payload.title || 'Untitled',
        description: payload.description || '',
        tags: Array.isArray(payload.tags) ? payload.tags : [],
        privacyStatus: payload.privacyStatus || 'private',
      }, { approved: true, packetId, commandId }) as Record<string, unknown>;
    } else if (platform === 'telegram') {
      result = await sendTelegramConnectorMessage(payload.chatId || '', payload.text || '', { approved: true, packetId, commandId }) as Record<string, unknown>;
    } else if (platform === 'whatsapp') {
      result = await sendWhatsAppConnectorMessage(payload.to || '', payload.text || '', { approved: true, packetId, commandId }) as Record<string, unknown>;
    } else if (platform === 'notion') {
      result = await sendNotionConnectorEntry({ title: payload.title || '', content: payload.content || '', parentPageId: payload.parentPageId || '' }, { approved: true, packetId, commandId }) as Record<string, unknown>;
    } else if (platform === 'clickup') {
      result = await sendClickUpConnectorTask({ title: payload.title || '', content: payload.content || '', listId: payload.listId || '' }, { approved: true, packetId, commandId }) as Record<string, unknown>;
    } else {
      throw new Error(`Unsupported Marcus publish platform: ${platform}`);
    }

    const ok = Boolean(result?.ok);
    if (packetId) {
      updatePacketStatus(packetId, ok ? 'executed' : 'failed', {
        failureReason: ok ? null : result?.error || 'Publish failed.',
        verificationState: ok ? TRUST_STATES.VERIFIED : TRUST_STATES.FAILED,
        confidence: ok ? TRUST_STATES.VERIFIED : TRUST_STATES.FAILED,
        executionResult: result,
      });
    }
    publishReceipt({ ok, platform, packetId, commandId, workflowId, result, error: ok ? null : (result?.error as string) || null });
    return { ok, result, platform };

  } catch (error) {
    if (packetId) updatePacketStatus(packetId, 'failed', { failureReason: String(error), verificationState: TRUST_STATES.FAILED });
    publishReceipt({ ok: false, platform, packetId, commandId, workflowId, error: String(error) });
    return { ok: false, error: String(error) };
  }
}
