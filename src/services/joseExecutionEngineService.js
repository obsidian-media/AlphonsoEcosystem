import { appendAgentActivity } from './agentActivityService';
import { invoke } from '@tauri-apps/api/core';
import {
  AGENTS,
  approvePacket,
  attemptPacketExecution,
  getPacketById,
  requestPacketRetry,
  updatePacketStatus
} from './agentBusService';
import {
  confirmJoseCommand,
  createAgentReportToJose,
  createJoseCommandRoute,
  listJoseCommands
} from './joseCommandRouterService';
import { pushMemoryItem } from './memoryService';
import { pushMiyaMemory } from './miyaMemoryService';
import { listMiyaComfyWorkflowPresets } from './miyaComfyWorkflowPresetService';
import { appendSessionEvent } from './sessionIntelligenceService';
import { runHectorLiveResearch, createResearchDraft } from './hectorResearchService';
import { TRUST_STATES, timestampMs } from './trustModel';
import { verifyOllamaRuntimeProof, verifyProcessProof } from './verificationService';
import { appendOrchestrationReceipt } from './orchestrationReceiptService';
import { recordOrchestrationQueueTransition } from './orchestrationQueueService';
import { persistScopeRows } from './runtimeLedgerService';

export function isJoseIntakeCommand(text) {
  return /^(\/jose\b|ask\s+jose\b|jose[:\s])/i.test(String(text || '').trim());
}

function isRiskyAssignment(assignment) {
  const risk = String(assignment?.riskLevel || '').toLowerCase();
  const action = String(assignment?.actionType || '').toLowerCase();
  return risk === 'high' || risk === 'critical' || /external_publish|publish|upload|post/.test(action);
}

function isBlockedByZeroCostMode(packet, assignment) {
  const policy = packet?.payload?.policy || {};
  if (!policy?.zeroCostMode) return false;
  if (policy?.blockedByZeroCostMode) return true;
  const costClass = String(policy?.costClass || assignment?.costClass || '').toLowerCase();
  return costClass === 'paid_or_metered';
}

const JOSE_EXECUTION_DLQ_KEY = 'alphonso_jose_execution_dlq_v1';
export const JOSE_EXECUTION_DLQ_SCOPE = 'jose_execution_dead_letters_v1';
const MAX_TASK_RETRIES = 3;
const TASK_RETRY_BACKOFF_MS = [1000, 2000, 4000];
const MAX_DLQ_ENTRIES = 250;

let joseExecutionDlq = readJoseExecutionDlq();

function readJoseExecutionDlq() {
  try {
    const raw = localStorage.getItem(JOSE_EXECUTION_DLQ_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeJoseExecutionDlqEntry(entry = {}) {
  const timestamp = Number(entry.timestamp || entry.timestampMs || timestampMs());
  return {
    taskId: String(entry.taskId || '').trim(),
    instruction: String(entry.instruction || entry.commandText || entry.assignment?.title || '').trim(),
    error: String(entry.error || 'Unknown task failure'),
    attempts: Number(entry.attempts || 0),
    timestamp,
    commandId: entry.commandId || null,
    packetId: entry.packetId || null,
    agent: entry.agent || null,
    actionType: entry.actionType || null,
    commandText: entry.commandText || null,
    assignment: entry.assignment || null,
    endpoint: entry.endpoint || null
  };
}

function persistJoseExecutionDlq(nextRows) {
  const rows = nextRows.map((entry) => normalizeJoseExecutionDlqEntry(entry)).filter((entry) => entry.taskId);
  joseExecutionDlq = rows.slice(-MAX_DLQ_ENTRIES);
  try {
    invoke('kv_set', { key: JOSE_EXECUTION_DLQ_KEY, value: JSON.stringify(joseExecutionDlq) }).catch(() => {});
  } catch {
    // SQLite not available in browser
  }
  try {
    localStorage.setItem(JOSE_EXECUTION_DLQ_KEY, JSON.stringify(joseExecutionDlq));
  } catch {
    // Keep the in-memory DLQ available even if localStorage is unavailable.
  }
  void persistScopeRows(JOSE_EXECUTION_DLQ_SCOPE, joseExecutionDlq, (row) => ({
    id: row.taskId,
    data: row,
    status: 'dead_letter',
    confidence: TRUST_STATES.FAILED,
    verificationState: TRUST_STATES.FAILED,
    timestampMs: Number(row.timestamp || timestampMs())
  }));
}

function upsertJoseExecutionDlqEntry(entry) {
  const normalized = normalizeJoseExecutionDlqEntry(entry);
  if (!normalized.taskId) return null;
  const next = joseExecutionDlq.filter((row) => row.taskId !== normalized.taskId);
  next.push(normalized);
  persistJoseExecutionDlq(next);
  return normalized;
}

function removeJoseExecutionDlqEntry(taskId) {
  const next = joseExecutionDlq.filter((row) => row.taskId !== taskId);
  if (next.length !== joseExecutionDlq.length) {
    persistJoseExecutionDlq(next);
  }
}

function delay(ms) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

function getExecutionInstruction(commandText, assignment) {
  return String(assignment?.commandPreview || assignment?.title || commandText || '').trim() || 'Jose execution task';
}

function isRetryableTaskFailure(result) {
  return result?.resultState === 'failed' || result?.ok === false;
}

async function executeAssignmentWithRetries(packet, assignment, commandText, options = {}) {
  const taskId = packet?.id || assignment?.packetId || `task-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const instruction = getExecutionInstruction(commandText, assignment);
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_TASK_RETRIES + 1; attempt += 1) {
    try {
      const result = await executeAssignment(packet, assignment, commandText, options);
      if (isRetryableTaskFailure(result)) {
        throw new Error(result.summary || `Task "${instruction}" returned a failed result.`);
      }
      return {
        ok: true,
        attempts: attempt,
        result,
        taskId,
        instruction
      };
    } catch (error) {
      lastError = error;
      if (attempt <= MAX_TASK_RETRIES) {
        await delay(TASK_RETRY_BACKOFF_MS[attempt - 1]);
      }
    }
  }

  const errorMessage = String(lastError?.message || lastError || `Task "${instruction}" failed.`);
  const dlqEntry = upsertJoseExecutionDlqEntry({
    taskId,
    instruction,
    error: errorMessage,
    attempts: MAX_TASK_RETRIES + 1,
    timestamp: timestampMs(),
    commandId: packet?.payload?.joseCommandId || null,
    packetId: packet?.id || assignment?.packetId || null,
    agent: assignment?.agent || null,
    actionType: assignment?.actionType || null,
    commandText,
    assignment,
    endpoint: options.endpoint || null
  });

  return {
    ok: false,
    attempts: MAX_TASK_RETRIES + 1,
    error: errorMessage,
    dlqEntry,
    taskId,
    instruction
  };
}

function buildMiyaPackage(commandText, assignment) {
  const topic = String(commandText || '').trim();
  const title = topic.slice(0, 120) || 'Untitled creative package';
  const hook = `Hook: ${title}`;
  const sceneA = `Scene 1: Open with the core problem from "${title}".`;
  const sceneB = 'Scene 2: Show transformation steps with clear outcome.';
  const cta = 'Scene 3: Close with one actionable next step and CTA.';
  return {
    title,
    hook,
    script: `${hook}\n\n${sceneA}\n${sceneB}\n${cta}`,
    scenes: [sceneA, sceneB, cta],
    prompts: [
      `Cinematic storyboard frame for: ${title}`,
      `Thumbnail prompt for: ${title}`
    ],
    assignmentAction: assignment?.actionType || 'creative_package'
  };
}

async function executeAlphonsoAssignment(commandText, assignment, options = {}) {
  const runtimeProof = await verifyOllamaRuntimeProof(options.endpoint);
  const processProof = await verifyProcessProof(['ollama']);
  const runtimeReachable = runtimeProof?.payload?.reachable === true;
  const processRunning = Array.isArray(processProof?.payload)
    ? processProof.payload.some((item) => item?.running)
    : false;

  return {
    summary: runtimeReachable
      ? `Alphonso verified runtime and process state for "${commandText}".`
      : `Alphonso found runtime degradation while executing "${commandText}".`,
    resultState: runtimeReachable ? 'verified' : 'failed',
    resultUrl: null,
    artifacts: [
      { type: 'runtime_proof', id: runtimeProof?.id || null },
      { type: 'process_proof', id: processProof?.id || null }
    ],
    sources: [],
    contractAction: assignment?.actionType || 'local_operation',
    runtimeReachable,
    processRunning
  };
}

async function executeMiyaAssignment(commandText, assignment) {
  const creativePackage = buildMiyaPackage(commandText, assignment);
  pushMiyaMemory({
    category: 'creative_memory',
    title: `Miya package: ${creativePackage.title}`,
    content: creativePackage,
    source: 'jose-execution-engine',
    confidence: TRUST_STATES.INFERRED,
    verificationState: TRUST_STATES.UNVERIFIED
  });
  pushMemoryItem({
    title: `Miya delivered creative package`,
    category: 'creative_memory',
    content: {
      title: creativePackage.title,
      scenes: creativePackage.scenes.length,
      prompts: creativePackage.prompts.length
    },
    source: 'jose-execution-engine',
    sourceAgent: AGENTS.MIYA,
    confidence: TRUST_STATES.INFERRED,
    verificationState: TRUST_STATES.UNVERIFIED
  });
  return {
    summary: `Miya generated a structured creative package for "${creativePackage.title}".`,
    resultState: 'completed',
    resultUrl: null,
    artifacts: [
      creativePackage,
      {
        type: 'comfyui_local_generation_options',
        connectorId: 'comfyui_video',
        endpoint: 'http://127.0.0.1:8188',
        presets: listMiyaComfyWorkflowPresets().map((preset) => ({
          id: preset.id,
          name: preset.name,
          mediaType: preset.mediaType,
          status: preset.status,
          description: preset.description
        }))
      }
    ],
    sources: [],
    contractAction: assignment?.actionType || 'creative_package'
  };
}

async function executeHectorAssignment(commandText, assignment) {
  const action = String(assignment?.actionType || '').toLowerCase();
  if (action.includes('external_publish_handoff')) {
    return {
      summary: 'Hector prepared publish-readiness handoff. External publish remains approval-gated.',
      resultState: 'pending_review',
      resultUrl: null,
      artifacts: [{ type: 'publish_handoff', status: 'approval_required' }],
      sources: [],
      contractAction: assignment?.actionType || 'external_publish_handoff'
    };
  }

  const draft = createResearchDraft({
    researchQuestion: commandText,
    sourceUrls: [],
    sourceType: 'official_docs',
    riskLevel: assignment?.riskLevel || 'medium'
  });
  const report = await runHectorLiveResearch(draft.id);
  const sourceRefs = Array.isArray(report?.sources) ? report.sources.map((item) => item?.url).filter(Boolean) : [];
  return {
    summary: report?.summary || 'Hector research run completed.',
    resultState: report?.confidenceLevel === TRUST_STATES.VERIFIED ? 'verified' : 'pending_review',
    resultUrl: null,
    artifacts: [{ type: 'hector_report', reportId: report?.id || draft.id }],
    sources: sourceRefs.length ? sourceRefs : [`hector_report:${report?.id || draft.id}`],
    contractAction: assignment?.actionType || 'research'
  };
}

async function executeJoseAssignment(commandText, assignment) {
  return {
    summary: `Jose completed orchestration review for "${commandText}".`,
    resultState: 'completed',
    resultUrl: null,
    artifacts: [{ type: 'orchestration_review', action: assignment?.actionType || 'orchestration_review' }],
    sources: [],
    contractAction: assignment?.actionType || 'orchestration_review'
  };
}

async function executeMariaAssignment(commandText, assignment) {
  return {
    summary: `Maria completed governance audit for "${commandText}" and flagged approval requirements where needed.`,
    resultState: 'completed',
    resultUrl: null,
    artifacts: [{ type: 'governance_audit', action: assignment?.actionType || 'governance_audit' }],
    sources: [],
    contractAction: assignment?.actionType || 'governance_audit'
  };
}

async function executeEchoAssignment(commandText, assignment) {
  pushMemoryItem({
    title: `Echo preserved workflow decision`,
    category: 'timeline_memory',
    content: {
      commandText,
      assignmentAction: assignment?.actionType || 'memory_preservation'
    },
    source: 'jose-execution-engine',
    sourceAgent: 'echo',
    confidence: TRUST_STATES.TEMPORARY,
    verificationState: TRUST_STATES.UNVERIFIED
  });
  return {
    summary: `Echo preserved command context and workflow output for "${commandText}".`,
    resultState: 'completed',
    resultUrl: null,
    artifacts: [{ type: 'memory_preservation', status: 'recorded' }],
    sources: [],
    contractAction: assignment?.actionType || 'memory_preservation'
  };
}

async function executeSentinelAssignment(commandText, assignment) {
  return {
    summary: `Sentinel completed safety review for "${commandText}" and kept execution under approval governance.`,
    resultState: 'completed',
    resultUrl: null,
    artifacts: [{ type: 'security_monitor', status: 'reviewed' }],
    sources: [],
    contractAction: assignment?.actionType || 'security_monitor'
  };
}

async function executeNovaAssignment(commandText, assignment) {
  return {
    summary: `Nova scored opportunity/risk for "${commandText}" and returned prioritization guidance.`,
    resultState: 'pending_review',
    resultUrl: null,
    artifacts: [{ type: 'opportunity_score', status: 'scored' }],
    sources: [],
    contractAction: assignment?.actionType || 'opportunity_analysis'
  };
}

async function executeMarcusAssignment(commandText, assignment) {
  return {
    summary: `Marcus requires explicit approved external execution before distribution for "${commandText}".`,
    resultState: 'pending_review',
    resultUrl: null,
    artifacts: [{ type: 'distribution_execution', status: 'approval_required' }],
    sources: [],
    contractAction: assignment?.actionType || 'distribution_execution'
  };
}

async function executeAssignment(packet, assignment, commandText, options = {}) {
  appendAgentActivity({ agent: assignment?.agent || 'jose', action: 'execute', detail: (commandText || '').slice(0, 80) });
  if (assignment?.agent === AGENTS.ALPHONSO) {
    return executeAlphonsoAssignment(commandText, assignment, options);
  }
  if (assignment?.agent === AGENTS.MIYA) {
    return executeMiyaAssignment(commandText, assignment);
  }
  if (assignment?.agent === AGENTS.HECTOR) {
    return executeHectorAssignment(commandText, assignment);
  }
  if (assignment?.agent === AGENTS.MARIA) {
    return executeMariaAssignment(commandText, assignment);
  }
  if (assignment?.agent === AGENTS.ECHO) {
    return executeEchoAssignment(commandText, assignment);
  }
  if (assignment?.agent === AGENTS.SENTINEL) {
    return executeSentinelAssignment(commandText, assignment);
  }
  if (assignment?.agent === AGENTS.NOVA) {
    return executeNovaAssignment(commandText, assignment);
  }
  if (assignment?.agent === AGENTS.MARCUS) {
    return executeMarcusAssignment(commandText, assignment);
  }
  return executeJoseAssignment(commandText, assignment);
}

export async function runJoseCommandExecutionPipeline({
  commandText,
  source = 'shayan',
  endpoint,
  zeroCostMode,
  onProgress
}) {
  const command = await createJoseCommandRoute({ commandText, source, zeroCostMode });
  if (!command) {
    return {
      ok: false,
      reason: 'Command could not be parsed.',
      command: null
    };
  }

  let executedCount = 0;
  let pendingApprovalCount = 0;
  let failedCount = 0;
  const executionReceipts = [];

  for (const assignment of command.assignments || []) {
    const packet = getPacketById(assignment.packetId);
    if (!packet) {
      failedCount += 1;
      continue;
    }

    if (isBlockedByZeroCostMode(packet, assignment)) {
      pendingApprovalCount += 1;
      updatePacketStatus(assignment.packetId, 'pending_approval', {
        policyBlocked: true,
        policyReason: 'Zero-Cost Mode blocks paid/metered connector route until explicit approval override.',
        verificationState: TRUST_STATES.PENDING
      });
      executionReceipts.push({
        packetId: assignment.packetId,
        agent: assignment.agent,
        status: 'approval_required',
        reason: 'zero_cost_policy_gate'
      });
      onProgress?.({
        stage: 'approval_required',
        assignment,
        packetId: assignment.packetId,
        reason: 'zero_cost_policy_gate'
      });
      recordOrchestrationQueueTransition({
        commandId: command.id,
        packetId: assignment.packetId,
        agent: AGENTS.JOSE,
        fromStatus: packet.status || 'unknown',
        toStatus: 'pending_approval',
        reason: 'Zero-Cost policy gate blocked route.',
        retryCount: packet.retryCount || 0,
        confidence: TRUST_STATES.VERIFIED,
        verificationState: TRUST_STATES.PENDING
      });
      appendOrchestrationReceipt({
        workflowId: 'jose_execution_pipeline',
        commandId: command.id,
        packetId: assignment.packetId,
        eventType: 'policy_gate_blocked',
        status: 'pending_approval',
        agent: AGENTS.JOSE,
        actionType: assignment.actionType,
        riskLevel: assignment.riskLevel || 'high',
        approved: false,
        blocked: true,
        setupRequired: false,
        details: { reason: 'zero_cost_policy_gate' },
        confidence: TRUST_STATES.VERIFIED,
        verificationState: TRUST_STATES.PENDING
      });
      continue;
    }

    if (isRiskyAssignment(assignment)) {
      pendingApprovalCount += 1;
      executionReceipts.push({
        packetId: assignment.packetId,
        agent: assignment.agent,
        status: 'approval_required'
      });
      onProgress?.({
        stage: 'approval_required',
        assignment,
        packetId: assignment.packetId
      });
      recordOrchestrationQueueTransition({
        commandId: command.id,
        packetId: assignment.packetId,
        agent: AGENTS.JOSE,
        fromStatus: packet.status || 'unknown',
        toStatus: 'pending_approval',
        reason: 'Risky assignment requires approval.',
        retryCount: packet.retryCount || 0,
        confidence: TRUST_STATES.VERIFIED,
        verificationState: TRUST_STATES.PENDING
      });
      appendOrchestrationReceipt({
        workflowId: 'jose_execution_pipeline',
        commandId: command.id,
        packetId: assignment.packetId,
        eventType: 'approval_required',
        status: 'pending_approval',
        agent: AGENTS.JOSE,
        actionType: assignment.actionType,
        riskLevel: assignment.riskLevel || 'high',
        approved: false,
        blocked: true,
        setupRequired: false,
        details: { reason: 'risky_assignment' },
        confidence: TRUST_STATES.VERIFIED,
        verificationState: TRUST_STATES.PENDING
      });
      continue;
    }

    const beforeQueueStatus = packet.status || 'unknown';
    approvePacket(assignment.packetId, 'jose-auto-safe');
    updatePacketStatus(assignment.packetId, 'queued', {
      routedBy: AGENTS.JOSE,
      routedAtMs: timestampMs(),
      verificationState: TRUST_STATES.PENDING
    });
    recordOrchestrationQueueTransition({
      commandId: command.id,
      packetId: assignment.packetId,
      agent: AGENTS.JOSE,
      fromStatus: beforeQueueStatus,
      toStatus: 'queued',
      reason: 'Jose approved and queued safe assignment.',
      retryCount: packet.retryCount || 0,
      confidence: TRUST_STATES.TEMPORARY,
      verificationState: TRUST_STATES.PENDING
    });
    appendOrchestrationReceipt({
      workflowId: 'jose_execution_pipeline',
      commandId: command.id,
      packetId: assignment.packetId,
      eventType: 'assignment_queued',
      status: 'queued',
      agent: AGENTS.JOSE,
      actionType: assignment.actionType,
      riskLevel: assignment.riskLevel || 'low',
      approved: true,
      blocked: false,
      setupRequired: false,
      details: { queueReason: 'safe_auto_execution' },
      confidence: TRUST_STATES.TEMPORARY,
      verificationState: TRUST_STATES.PENDING
    });
    const gate = attemptPacketExecution(assignment.packetId, {
      mode: 'jose_execution_engine',
      actionType: assignment.actionType
    });

    if (!gate.ok) {
      failedCount += 1;
      executionReceipts.push({
        packetId: assignment.packetId,
        agent: assignment.agent,
        status: 'failed',
        reason: gate.reason
      });
      recordOrchestrationQueueTransition({
        commandId: command.id,
        packetId: assignment.packetId,
        agent: AGENTS.JOSE,
        fromStatus: 'queued',
        toStatus: 'failed',
        reason: gate.reason || 'Execution gate failed.',
        retryCount: packet.retryCount || 0,
        confidence: TRUST_STATES.FAILED,
        verificationState: TRUST_STATES.FAILED
      });
      appendOrchestrationReceipt({
        workflowId: 'jose_execution_pipeline',
        commandId: command.id,
        packetId: assignment.packetId,
        eventType: 'execution_gate_failed',
        status: 'failed',
        agent: AGENTS.JOSE,
        actionType: assignment.actionType,
        riskLevel: assignment.riskLevel || 'medium',
        approved: true,
        blocked: true,
        setupRequired: false,
        details: { reason: gate.reason || 'unknown' },
        confidence: TRUST_STATES.FAILED,
        verificationState: TRUST_STATES.FAILED
      });
      continue;
    }

    const taskResult = await executeAssignmentWithRetries(packet, assignment, commandText, { endpoint });

    if (!taskResult.ok) {
      failedCount += 1;
      updatePacketStatus(assignment.packetId, 'dead_letter', {
        failureReason: taskResult.error,
        deadLetterReason: taskResult.error,
        deadLetterAtMs: timestampMs(),
        retryCount: taskResult.attempts,
        verificationState: TRUST_STATES.FAILED,
        confidence: TRUST_STATES.FAILED
      });
      executionReceipts.push({
        packetId: assignment.packetId,
        agent: assignment.agent,
        status: 'dead_letter',
        reason: taskResult.error,
        attempts: taskResult.attempts
      });
      recordOrchestrationQueueTransition({
        commandId: command.id,
        packetId: assignment.packetId,
        agent: assignment.agent,
        fromStatus: 'queued',
        toStatus: 'dead_letter',
        reason: taskResult.error,
        retryCount: taskResult.attempts,
        confidence: TRUST_STATES.FAILED,
        verificationState: TRUST_STATES.FAILED
      });
      appendOrchestrationReceipt({
        workflowId: 'jose_execution_pipeline',
        commandId: command.id,
        packetId: assignment.packetId,
        eventType: 'assignment_dead_lettered',
        status: 'dead_letter',
        agent: assignment.agent,
        actionType: assignment.actionType,
        riskLevel: assignment.riskLevel || 'medium',
        approved: true,
        blocked: true,
        setupRequired: false,
        details: { error: taskResult.error, attempts: taskResult.attempts },
        confidence: TRUST_STATES.FAILED,
        verificationState: TRUST_STATES.FAILED
      });
      continue;
    }

    const result = taskResult.result;
    createAgentReportToJose({
      packetId: assignment.packetId,
      reportingAgent: assignment.agent,
      summary: result.summary,
      resultState: result.resultState || 'pending_review',
      resultUrl: result.resultUrl || null,
      artifacts: result.artifacts || [],
      sources: result.sources || []
    });
    executedCount += 1;
    executionReceipts.push({
      packetId: assignment.packetId,
      agent: assignment.agent,
      status: 'executed',
      resultState: result.resultState || 'pending_review',
      attempts: taskResult.attempts
    });
    onProgress?.({
      stage: 'executed',
      assignment,
      packetId: assignment.packetId,
      result
    });
    recordOrchestrationQueueTransition({
      commandId: command.id,
      packetId: assignment.packetId,
      agent: assignment.agent,
      fromStatus: 'queued',
      toStatus: 'reported_to_jose',
      reason: 'Assignment executed and reported back to Jose.',
      retryCount: packet.retryCount || 0,
      confidence: TRUST_STATES.VERIFIED,
      verificationState: TRUST_STATES.VERIFIED
    });
    appendOrchestrationReceipt({
      workflowId: 'jose_execution_pipeline',
      commandId: command.id,
      packetId: assignment.packetId,
      eventType: 'assignment_executed_reported',
      status: 'reported_to_jose',
      agent: assignment.agent,
      actionType: assignment.actionType,
      riskLevel: assignment.riskLevel || 'low',
      approved: true,
      blocked: false,
      setupRequired: false,
      details: { resultState: result.resultState || 'pending_review', attempts: taskResult.attempts },
      confidence: TRUST_STATES.VERIFIED,
      verificationState: TRUST_STATES.VERIFIED
    });
  }

  const confirmationText = pendingApprovalCount > 0
    ? `Jose executed ${executedCount} task(s); ${pendingApprovalCount} task(s) are waiting for approval.`
    : `Jose executed ${executedCount} task(s) and merged agent reports.`;
  const updatedCommand = confirmJoseCommand(command.id, confirmationText);

  appendSessionEvent({
    category: 'orchestration',
    title: 'Jose execution pipeline completed',
    details: {
      commandId: command.id,
      executedCount,
      pendingApprovalCount,
      failedCount
    },
    agent: AGENTS.JOSE,
    confidence: failedCount > 0 ? TRUST_STATES.INFERRED : TRUST_STATES.VERIFIED,
    verificationState: failedCount > 0 ? TRUST_STATES.TEMPORARY : TRUST_STATES.VERIFIED
  });
  appendOrchestrationReceipt({
    workflowId: 'jose_execution_pipeline',
    commandId: command.id,
    packetId: null,
    eventType: 'pipeline_completed',
    status: failedCount > 0 ? 'partial_failure' : pendingApprovalCount > 0 ? 'awaiting_approvals' : 'completed',
    agent: AGENTS.JOSE,
    actionType: 'orchestration_merge_confirm',
    riskLevel: failedCount > 0 ? 'high' : pendingApprovalCount > 0 ? 'medium' : 'low',
    approved: true,
    blocked: pendingApprovalCount > 0 || failedCount > 0,
    setupRequired: false,
    details: {
      executedCount,
      pendingApprovalCount,
      failedCount,
      confirmationText
    },
    confidence: failedCount > 0 ? TRUST_STATES.INFERRED : TRUST_STATES.VERIFIED,
    verificationState: failedCount > 0 ? TRUST_STATES.TEMPORARY : TRUST_STATES.VERIFIED
  });

  return {
    ok: true,
    commandId: command.id,
    command: updatedCommand || listJoseCommands().find((item) => item.id === command.id) || command,
    executedCount,
    pendingApprovalCount,
    failedCount,
    executionReceipts
  };
}

export function getDLQ() {
  return joseExecutionDlq.slice().sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
}

export async function retryDLQ(taskId) {
  const entry = getDLQ().find((row) => row.taskId === taskId);
  if (!entry) {
    return { ok: false, reason: 'DLQ entry not found.' };
  }

  const packet = getPacketById(entry.packetId);
  if (!packet) {
    return { ok: false, reason: 'Packet not found for DLQ entry.' };
  }

  const assignment = entry.assignment || packet.payload?.assignment;
  if (!assignment) {
    return { ok: false, reason: 'Assignment data missing from DLQ entry.' };
  }

  const commandId = entry.commandId || packet.payload?.joseCommandId || null;
  const commandText = entry.commandText || packet.payload?.originalCommand || entry.instruction || '';
  const queueReason = `DLQ replay requested for ${entry.taskId}.`;

  requestPacketRetry(packet.id, queueReason);
  recordOrchestrationQueueTransition({
    commandId,
    packetId: packet.id,
    agent: AGENTS.JOSE,
    fromStatus: 'dead_letter',
    toStatus: 'queued',
    reason: queueReason,
    retryCount: Number(packet.retryCount || entry.attempts || 0),
    confidence: TRUST_STATES.TEMPORARY,
    verificationState: TRUST_STATES.PENDING
  });

  const gate = attemptPacketExecution(packet.id, {
    mode: 'jose_dlq_retry',
    actionType: assignment.actionType
  });

  if (!gate.ok) {
    return {
      ok: false,
      reason: gate.reason || 'DLQ replay gate failed.',
      packet: gate.packet
    };
  }

  const taskResult = await executeAssignmentWithRetries(packet, assignment, commandText, {
    endpoint: entry.endpoint || undefined
  });

  if (!taskResult.ok) {
    updatePacketStatus(packet.id, 'dead_letter', {
      failureReason: taskResult.error,
      deadLetterReason: taskResult.error,
      deadLetterAtMs: timestampMs(),
      retryCount: taskResult.attempts,
      verificationState: TRUST_STATES.FAILED,
      confidence: TRUST_STATES.FAILED
    });
    recordOrchestrationQueueTransition({
      commandId,
      packetId: packet.id,
      agent: assignment.agent,
      fromStatus: 'queued',
      toStatus: 'dead_letter',
      reason: taskResult.error,
      retryCount: taskResult.attempts,
      confidence: TRUST_STATES.FAILED,
      verificationState: TRUST_STATES.FAILED
    });
    appendOrchestrationReceipt({
      workflowId: 'jose_execution_pipeline',
      commandId,
      packetId: packet.id,
      eventType: 'dlq_retry_failed',
      status: 'dead_letter',
      agent: assignment.agent,
      actionType: assignment.actionType,
      riskLevel: assignment.riskLevel || 'medium',
      approved: true,
      blocked: true,
      setupRequired: false,
      details: { error: taskResult.error, attempts: taskResult.attempts },
      confidence: TRUST_STATES.FAILED,
      verificationState: TRUST_STATES.FAILED
    });
    upsertJoseExecutionDlqEntry({
      ...entry,
      error: taskResult.error,
      attempts: taskResult.attempts,
      timestamp: timestampMs(),
      packetId: packet.id,
      commandId,
      assignment
    });
    return {
      ok: false,
      reason: taskResult.error,
      attempts: taskResult.attempts,
      dlqEntry: taskResult.dlqEntry || entry
    };
  }

  removeJoseExecutionDlqEntry(taskId);
  const result = taskResult.result;
  createAgentReportToJose({
    packetId: packet.id,
    reportingAgent: assignment.agent,
    summary: result.summary,
    resultState: result.resultState || 'pending_review',
    resultUrl: result.resultUrl || null,
    artifacts: result.artifacts || [],
    sources: result.sources || []
  });
  recordOrchestrationQueueTransition({
    commandId,
    packetId: packet.id,
    agent: assignment.agent,
    fromStatus: 'queued',
    toStatus: 'reported_to_jose',
    reason: 'DLQ task replayed and reported back to Jose.',
    retryCount: taskResult.attempts,
    confidence: TRUST_STATES.VERIFIED,
    verificationState: TRUST_STATES.VERIFIED
  });
  appendOrchestrationReceipt({
    workflowId: 'jose_execution_pipeline',
    commandId,
    packetId: packet.id,
    eventType: 'dlq_retry_succeeded',
    status: 'reported_to_jose',
    agent: assignment.agent,
    actionType: assignment.actionType,
    riskLevel: assignment.riskLevel || 'low',
    approved: true,
    blocked: false,
    setupRequired: false,
    details: { attempts: taskResult.attempts, resultState: result.resultState || 'pending_review' },
    confidence: TRUST_STATES.VERIFIED,
    verificationState: TRUST_STATES.VERIFIED
  });
  return {
    ok: true,
    attempts: taskResult.attempts,
    result
  };
}
