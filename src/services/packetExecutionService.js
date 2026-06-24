import { AGENTS, markPacketExecuted, updatePacketStatus } from './agentBusService';
import { uploadYouTubeConnectorVideo } from './connectorRegistryService';
import { appendSessionEvent } from './sessionIntelligenceService';
import { TRUST_STATES } from './trustModel';
import { appendOrchestrationReceipt } from './orchestrationReceiptService';
import { requireApproval } from './approval/approvalService';
import { executeMarcusPublish } from './marcusPublishService';

function buildExecutionResult(packet, payload = {}) {
  return {
    packetId: packet.id,
    packetType: packet.packetType,
    actionType: packet.actionType,
    ...payload
  };
}

export async function executeApprovedPacket(packet) {
  if (!packet) {
    return { ok: false, error: 'Packet not found.' };
  }

  if (!['approved', 'queued'].includes(packet.status)) {
    return { ok: false, error: `Packet must be approved or queued before execution. Current: ${packet.status}` };
  }

  updatePacketStatus(packet.id, 'executing', {
    executor: AGENTS.JOSE,
    executionStartedAtMs: Date.now(),
    verificationState: TRUST_STATES.PENDING
  });

  try {
    if (packet.packetType === 'youtube_publish_handoff') {
      const request = packet?.payload?.uploadRequest || {};
      const approval = await requireApproval({
        actionType: 'external_publish',
        approved: true,
        force: true,
        summary: request.title || 'YouTube upload request',
        riskLevel: packet.riskLevel || 'high',
        requestedBy: AGENTS.JOSE,
        workflowId: 'packet_execution',
        commandId: packet?.payload?.joseCommandId || null,
        packetId: packet.id,
        metadata: {
          connectorId: 'youtube',
          filePath: request.filePath || ''
        }
      });
      if (!approval.ok) {
        return {
          ok: false,
          error: approval.reason || approval.error || 'approval_required',
          approval
        };
      }
      const result = await uploadYouTubeConnectorVideo({
        filePath: request.filePath || '',
        title: request.title || 'Untitled upload',
        description: request.description || '',
        tags: Array.isArray(request.tags) ? request.tags : [],
        privacyStatus: request.privacyStatus || 'private'
      }, {
        approved: true,
        commandId: packet?.payload?.joseCommandId || null,
        packetId: packet.id
      });
      if (!result?.ok) {
        updatePacketStatus(packet.id, 'failed', {
          failureReason: result?.error || 'YouTube upload failed.',
          verificationState: TRUST_STATES.FAILED,
          confidence: TRUST_STATES.FAILED
        });
        appendSessionEvent({
          category: 'connector',
          title: 'YouTube publish handoff failed',
          details: {
            packetId: packet.id,
            error: result?.error || 'unknown error'
          },
          agent: AGENTS.JOSE,
          confidence: TRUST_STATES.FAILED,
          verificationState: TRUST_STATES.FAILED
        });
        appendOrchestrationReceipt({
          workflowId: 'packet_execution',
          commandId: packet?.payload?.joseCommandId || null,
          packetId: packet.id,
          eventType: 'youtube_publish_failed',
          status: 'failed',
          agent: AGENTS.JOSE,
          connectorId: 'youtube',
          actionType: packet.actionType,
          riskLevel: packet.riskLevel || 'high',
          approved: true,
          blocked: Boolean(result?.blocked),
          setupRequired: false,
          details: {
            error: result?.error || 'YouTube upload failed.'
          },
          confidence: TRUST_STATES.FAILED,
          verificationState: TRUST_STATES.FAILED
        });
        return { ok: false, error: result?.error || 'YouTube upload failed.', result };
      }

      const executionResult = buildExecutionResult(packet, {
        connectorId: 'youtube',
        videoId: result.videoId || null,
        url: result.url || null,
        privacyStatus: result.privacyStatus || request.privacyStatus || 'private'
      });
      markPacketExecuted(packet.id, executionResult, TRUST_STATES.VERIFIED);
      appendSessionEvent({
        category: 'connector',
        title: 'YouTube publish handoff executed',
        details: {
          packetId: packet.id,
          videoId: result.videoId || null,
          url: result.url || null
        },
        agent: AGENTS.JOSE,
        confidence: TRUST_STATES.VERIFIED,
        verificationState: TRUST_STATES.VERIFIED
      });
      appendOrchestrationReceipt({
        workflowId: 'packet_execution',
        commandId: packet?.payload?.joseCommandId || null,
        packetId: packet.id,
        eventType: 'youtube_publish_completed',
        status: 'executed',
        agent: AGENTS.JOSE,
        connectorId: 'youtube',
        actionType: packet.actionType,
        riskLevel: packet.riskLevel || 'high',
        approved: true,
        blocked: false,
        setupRequired: false,
        details: {
          videoId: result.videoId || null,
          url: result.url || null
        },
        confidence: TRUST_STATES.VERIFIED,
        verificationState: TRUST_STATES.VERIFIED
      });
      return { ok: true, executionResult, result };
    }

    if (packet.packetType === 'marcus_publish_handoff') {
      const platform = packet?.payload?.platform || '';
      const result = await executeMarcusPublish({
        platform,
        payload: packet?.payload || {},
        packetId: packet.id,
        commandId: packet?.payload?.commandId || null,
        workflowId: packet?.payload?.workflowId || 'packet_execution',
        preApproved: true,
      });
      if (!result.ok) {
        return { ok: false, error: result.error || 'Marcus publish failed.', result };
      }
      const executionResult = buildExecutionResult(packet, {
        connectorId: platform,
        platform,
        externalId: result.result?.externalId || result.result?.videoId || null,
        url: result.result?.url || null,
      });
      markPacketExecuted(packet.id, executionResult, TRUST_STATES.VERIFIED);
      return { ok: true, executionResult, result };
    }

    const executionResult = buildExecutionResult(packet, {
      note: `Packet "${packet.title}" acknowledged. Type "${packet.packetType}" has no live runtime adapter — see Execution Results panel.`
    });
    markPacketExecuted(packet.id, executionResult, TRUST_STATES.TEMPORARY);
    appendSessionEvent({
      category: 'task',
      title: `Packet acknowledged: ${packet.title}`,
      details: {
        packetId: packet.id,
        packetType: packet.packetType,
        fromAgent: packet.fromAgent,
        toAgent: packet.toAgent,
        note: 'No live runtime adapter for this packet type. Packet marked executed locally.'
      },
      agent: AGENTS.JOSE,
      confidence: TRUST_STATES.TEMPORARY,
      verificationState: TRUST_STATES.UNVERIFIED
    });
    appendOrchestrationReceipt({
      workflowId: 'packet_execution',
      commandId: packet?.payload?.joseCommandId || packet?.payload?.commandId || null,
      packetId: packet.id,
      eventType: 'packet_acknowledged',
      status: 'executed',
      agent: packet.toAgent || AGENTS.JOSE,
      actionType: packet.actionType || packet.packetType,
      riskLevel: packet.riskLevel || 'low',
      approved: true,
      blocked: false,
      setupRequired: true,
      details: {
        title: packet.title,
        packetType: packet.packetType,
        note: 'Packet acknowledged by Jose. No live runtime adapter wired for this type.',
        fromAgent: packet.fromAgent,
        toAgent: packet.toAgent
      },
      confidence: TRUST_STATES.TEMPORARY,
      verificationState: TRUST_STATES.UNVERIFIED
    });
    return { ok: true, executionResult, setupRequired: true, status: 'setup_required' };
  } catch (error) {
    updatePacketStatus(packet.id, 'failed', {
      failureReason: String(error),
      verificationState: TRUST_STATES.FAILED,
      confidence: TRUST_STATES.FAILED
    });
    appendSessionEvent({
      category: 'task',
      title: 'Packet execution failed',
      details: {
        packetId: packet.id,
        error: String(error)
      },
      agent: AGENTS.JOSE,
      confidence: TRUST_STATES.FAILED,
      verificationState: TRUST_STATES.FAILED
    });
    return { ok: false, error: String(error) };
  }
}
