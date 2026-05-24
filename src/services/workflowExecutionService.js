import { TRUST_STATES, timestampMs } from './trustModel';
import { persistScopeRows } from './runtimeLedgerService';
import { appendSessionEvent } from './sessionIntelligenceService';
import { listWorkflowOperations } from './workflowOperationsRegistryService';
import { appendWorkflowReceipt } from './workflowReceiptService';
import { appendWorkflowTelemetryEvent, listWorkflowTelemetry } from './workflowTelemetryService';
import { appendWorkflowMemory, listWorkflowMemory } from './workflowMemoryService';
import { evaluateWorkflowGovernance, getAgentWorkflowParticipation } from './workflowGovernanceService';

const WORKFLOW_RUN_KEY = 'alphonso_workflow_runs_v1';
export const WORKFLOW_RUN_SCOPE = 'workflow_runs_v1';

function readRuns() {
  try {
    const raw = localStorage.getItem(WORKFLOW_RUN_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRuns(rows) {
  const next = rows.slice(-1000);
  localStorage.setItem(WORKFLOW_RUN_KEY, JSON.stringify(next));
  persistScopeRows(WORKFLOW_RUN_SCOPE, next, (row) => ({
    id: row.id,
    data: row,
    status: row.status || 'queued',
    confidence: row.confidence || TRUST_STATES.TEMPORARY,
    verificationState: row.verificationState || TRUST_STATES.UNVERIFIED,
    timestampMs: Number(row.updatedAtMs || row.createdAtMs || timestampMs())
  }));
}

function getWorkflowById(workflowId) {
  return listWorkflowOperations().find((workflow) => workflow.id === workflowId) || null;
}

function createRunStages(workflow) {
  const sequence = Array.isArray(workflow?.agentSequence) ? workflow.agentSequence : [];
  return sequence.map((agent, index) => ({
    id: `stage-${index + 1}-${agent}`,
    agent,
    order: index + 1,
    state: 'queued',
    summary: '',
    startedAtMs: null,
    finishedAtMs: null
  }));
}

export function listWorkflowRuns(filters = {}) {
  return readRuns()
    .slice()
    .reverse()
    .filter((row) => {
      if (filters.workflowId && row.workflowId !== filters.workflowId) return false;
      if (filters.status && row.status !== filters.status) return false;
      return true;
    });
}

export function getWorkflowRun(runId) {
  return readRuns().find((row) => row.id === runId) || null;
}

export function startWorkflowRun(workflowId, options = {}) {
  const workflow = getWorkflowById(workflowId);
  if (!workflow) {
    return {
      ok: false,
      error: 'Workflow not found.',
      workflowId
    };
  }

  const governance = evaluateWorkflowGovernance(workflow, options);
  const runs = readRuns();
  const run = {
    id: `wrun-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    workflowId: workflow.id,
    workflowName: workflow.name,
    purpose: workflow.purpose,
    triggerType: options.triggerType || 'manual_command',
    input: options.input || '',
    status: governance.blocked ? 'blocked' : governance.setupRequired ? 'setup_required' : governance.requiresApproval ? 'approval_required' : 'queued',
    riskLevel: workflow.riskLevel || 'medium',
    governance,
    stages: createRunStages(workflow),
    progress: {
      totalStages: Array.isArray(workflow.agentSequence) ? workflow.agentSequence.length : 0,
      completedStages: 0,
      blockedStages: 0,
      failedStages: 0
    },
    finalReport: null,
    confidence: governance.confidence || TRUST_STATES.TEMPORARY,
    verificationState: governance.verificationState || TRUST_STATES.UNVERIFIED,
    createdAtMs: timestampMs(),
    updatedAtMs: timestampMs()
  };

  runs.push(run);
  writeRuns(runs);

  appendWorkflowTelemetryEvent({
    workflowId: run.workflowId,
    workflowRunId: run.id,
    eventType: 'run_started',
    status: run.status,
    riskLevel: run.riskLevel,
    metrics: { totalStages: run.progress.totalStages },
    confidence: run.confidence,
    verificationState: run.verificationState
  });

  appendWorkflowReceipt({
    workflowId: run.workflowId,
    workflowRunId: run.id,
    agent: 'jose',
    actionType: 'workflow_run_start',
    status: run.status === 'blocked'
      ? 'blocked'
      : run.status === 'setup_required'
        ? 'setup_required'
        : run.status === 'approval_required'
          ? 'approval_required'
          : 'queued',
    riskLevel: run.riskLevel,
    approved: !governance.requiresApproval,
    blocked: governance.blocked,
    setupRequired: governance.setupRequired,
    details: {
      triggerType: run.triggerType,
      governance: run.governance
    },
    confidence: run.confidence,
    verificationState: run.verificationState
  });

  appendWorkflowMemory({
    workflowId: run.workflowId,
    workflowRunId: run.id,
    title: `Workflow run created: ${run.workflowName}`,
    content: {
      status: run.status,
      triggerType: run.triggerType,
      governance: run.governance
    },
    sourceAgent: 'jose',
    confidence: run.confidence,
    verificationState: run.verificationState
  });

  appendSessionEvent({
    category: 'workflow',
    title: `Workflow started: ${run.workflowName}`,
    details: {
      workflowId: run.workflowId,
      workflowRunId: run.id,
      status: run.status
    },
    agent: 'jose',
    confidence: run.confidence,
    verificationState: run.verificationState
  });

  return {
    ok: true,
    run
  };
}

export function approveWorkflowRun(runId, approvedBy = 'shayan') {
  const run = getWorkflowRun(runId);
  if (!run) return null;
  return patchRun(runId, {
    status: 'queued',
    governance: {
      ...(run.governance || {}),
      approvedBy,
      approvedAtMs: timestampMs(),
      requiresApproval: false
    },
    confidence: TRUST_STATES.TEMPORARY,
    verificationState: TRUST_STATES.PENDING
  }, {
    eventType: 'run_approved',
    agent: 'jose',
    receiptStatus: 'approved',
    details: { approvedBy }
  });
}

export function executeWorkflowRun(runId, options = {}) {
  const run = getWorkflowRun(runId);
  if (!run) {
    return { ok: false, error: 'Workflow run not found.' };
  }
  if (run.status === 'blocked') {
    return { ok: false, error: 'Workflow run is blocked by governance policy.' };
  }
  if (run.status === 'setup_required') {
    return { ok: false, error: 'Workflow run is setup-required before execution.' };
  }
  if (run.status === 'approval_required') {
    return { ok: false, error: 'Workflow run requires approval before execution.' };
  }

  let nextRun = patchRun(runId, {
    status: 'in_progress',
    confidence: TRUST_STATES.PENDING,
    verificationState: TRUST_STATES.PENDING
  }, {
    eventType: 'run_execution_started',
    agent: 'jose',
    receiptStatus: 'queued',
    details: {}
  });

  const participants = getAgentWorkflowParticipation(getWorkflowById(run.workflowId));
  const stageUpdates = [];
  let blockedStages = 0;

  participants.forEach((participant) => {
    const stageId = `stage-${participant.order}-${participant.agent}`;
    const stage = (nextRun?.stages || []).find((item) => item.id === stageId);
    if (!stage) return;

    const now = timestampMs();
    if (!participant.canExecute) {
      stageUpdates.push({
        ...stage,
        state: 'approval_required',
        summary: 'Human approval checkpoint.',
        startedAtMs: now,
        finishedAtMs: now
      });
      blockedStages += 1;
      appendWorkflowReceipt({
        workflowId: run.workflowId,
        workflowRunId: runId,
        stageId,
        agent: participant.agent,
        actionType: 'approval_checkpoint',
        status: 'queued',
        riskLevel: run.riskLevel,
        approved: false,
        blocked: true,
        setupRequired: false,
        details: { checkpoint: 'human_approval' },
        confidence: TRUST_STATES.PENDING,
        verificationState: TRUST_STATES.PENDING
      });
      return;
    }

    const setupBlocked = shouldMarkSetupRequired(run.workflowId, participant.agent);
    if (setupBlocked) {
      stageUpdates.push({
        ...stage,
        state: 'setup_required',
        summary: 'Agent stage is setup-required before live execution.',
        startedAtMs: now,
        finishedAtMs: now
      });
      blockedStages += 1;
      appendWorkflowReceipt({
        workflowId: run.workflowId,
        workflowRunId: runId,
        stageId,
        agent: participant.agent,
        actionType: 'stage_setup_check',
        status: 'setup_required',
        riskLevel: run.riskLevel,
        approved: false,
        blocked: true,
        setupRequired: true,
        details: { reason: 'connector_or_external_setup_missing' },
        confidence: TRUST_STATES.PENDING,
        verificationState: TRUST_STATES.PENDING
      });
      return;
    }

    stageUpdates.push({
      ...stage,
      state: 'executed',
      summary: `Stage executed under supervised local workflow routing (${participant.agent}).`,
      startedAtMs: now,
      finishedAtMs: now
    });
    appendWorkflowReceipt({
      workflowId: run.workflowId,
      workflowRunId: runId,
      stageId,
      agent: participant.agent,
      actionType: 'stage_execute',
      status: 'executed',
      riskLevel: run.riskLevel,
      approved: true,
      blocked: false,
      setupRequired: false,
      details: { supervised: true },
      confidence: TRUST_STATES.VERIFIED,
      verificationState: TRUST_STATES.VERIFIED
    });
  });

  nextRun = patchRun(runId, (existing) => {
    const stageMap = new Map(stageUpdates.map((stage) => [stage.id, stage]));
    const mergedStages = (existing.stages || []).map((stage) => stageMap.get(stage.id) || stage);
    const completedStages = mergedStages.filter((stage) => stage.state === 'executed').length;
    const setupStages = mergedStages.filter((stage) => stage.state === 'setup_required').length;
    const approvalStages = mergedStages.filter((stage) => stage.state === 'approval_required').length;
    const hasBlockers = setupStages > 0 || approvalStages > 0;
    const status = hasBlockers ? 'partial' : 'completed';
    const finalReport = buildFinalReport(existing, mergedStages, options, status);
    return {
      ...existing,
      stages: mergedStages,
      progress: {
        ...existing.progress,
        completedStages,
        blockedStages: setupStages + approvalStages,
        failedStages: 0
      },
      status,
      finalReport,
      confidence: hasBlockers ? TRUST_STATES.INFERRED : TRUST_STATES.VERIFIED,
      verificationState: hasBlockers ? TRUST_STATES.TEMPORARY : TRUST_STATES.VERIFIED,
      updatedAtMs: timestampMs()
    };
  });

  appendWorkflowTelemetryEvent({
    workflowId: nextRun.workflowId,
    workflowRunId: nextRun.id,
    eventType: 'run_execution_completed',
    status: nextRun.status,
    riskLevel: nextRun.riskLevel,
    metrics: {
      completedStages: nextRun.progress.completedStages,
      blockedStages: nextRun.progress.blockedStages
    },
    confidence: nextRun.confidence,
    verificationState: nextRun.verificationState
  });

  appendWorkflowMemory({
    workflowId: nextRun.workflowId,
    workflowRunId: nextRun.id,
    title: `Workflow execution report: ${nextRun.workflowName}`,
    content: nextRun.finalReport,
    sourceAgent: 'jose',
    confidence: nextRun.confidence,
    verificationState: nextRun.verificationState
  });

  appendSessionEvent({
    category: 'workflow',
    title: `Workflow execution ${nextRun.status}: ${nextRun.workflowName}`,
    details: {
      workflowId: nextRun.workflowId,
      workflowRunId: nextRun.id,
      completedStages: nextRun.progress.completedStages,
      blockedStages: nextRun.progress.blockedStages
    },
    agent: 'jose',
    confidence: nextRun.confidence,
    verificationState: nextRun.verificationState
  });

  appendWorkflowReceipt({
    workflowId: nextRun.workflowId,
    workflowRunId: nextRun.id,
    agent: 'jose',
    actionType: 'workflow_run_finalize',
    status: nextRun.status === 'completed' ? 'executed' : 'partial',
    riskLevel: nextRun.riskLevel,
    approved: true,
    blocked: nextRun.status !== 'completed',
    setupRequired: blockedStages > 0,
    details: {
      completedStages: nextRun.progress.completedStages,
      blockedStages: nextRun.progress.blockedStages
    },
    confidence: nextRun.confidence,
    verificationState: nextRun.verificationState
  });

  return {
    ok: true,
    run: nextRun
  };
}

export function listWorkflowRunTimeline(runId) {
  const run = getWorkflowRun(runId);
  if (!run) return [];
  const telemetry = listWorkflowTelemetry({ workflowRunId: runId });
  const memory = listWorkflowMemory(run.workflowId, runId).map((item) => ({
    id: item.id,
    type: 'memory',
    label: item.title,
    timestampMs: item.timestampMs
  }));
  const stageEvents = (run.stages || []).map((stage) => ({
    id: `timeline-${run.id}-${stage.id}`,
    type: 'stage',
    label: `${stage.agent}: ${stage.state}`,
    timestampMs: stage.finishedAtMs || stage.startedAtMs || run.updatedAtMs
  }));
  return [...stageEvents, ...memory, ...telemetry.map((row) => ({
    id: row.id,
    type: 'telemetry',
    label: `${row.eventType} (${row.status})`,
    timestampMs: row.timestampMs
  }))]
    .filter((row) => Number(row.timestampMs) > 0)
    .sort((a, b) => Number(b.timestampMs) - Number(a.timestampMs));
}

function patchRun(runId, updates, event = null) {
  const rows = readRuns();
  let next = null;
  const patched = rows.map((row) => {
    if (row.id !== runId) return row;
    next = typeof updates === 'function'
      ? updates(row)
      : {
        ...row,
        ...updates,
        updatedAtMs: timestampMs()
      };
    return next;
  });
  writeRuns(patched);
  if (next && event?.eventType) {
    appendWorkflowTelemetryEvent({
      workflowId: next.workflowId,
      workflowRunId: next.id,
      eventType: event.eventType,
      status: next.status,
      riskLevel: next.riskLevel,
      metrics: {
        completedStages: next.progress?.completedStages || 0,
        blockedStages: next.progress?.blockedStages || 0
      },
      confidence: next.confidence || TRUST_STATES.TEMPORARY,
      verificationState: next.verificationState || TRUST_STATES.UNVERIFIED
    });
    appendWorkflowReceipt({
      workflowId: next.workflowId,
      workflowRunId: next.id,
      agent: event.agent || 'jose',
      actionType: event.eventType,
      status: event.receiptStatus || 'queued',
      riskLevel: next.riskLevel,
      approved: event.receiptStatus === 'approved',
      blocked: event.receiptStatus === 'blocked',
      setupRequired: event.receiptStatus === 'setup_required',
      details: event.details || {},
      confidence: next.confidence || TRUST_STATES.TEMPORARY,
      verificationState: next.verificationState || TRUST_STATES.UNVERIFIED
    });
  }
  return next;
}

function shouldMarkSetupRequired(workflowId, agent) {
  const setupByWorkflow = {
    'wf-social-media-management': ['marcus'],
    'wf-content-production': ['marcus'],
    'wf-marketing-operations': ['marcus'],
    'wf-construction-operations': ['marcus'],
    'wf-reputation-brand-monitoring-operations': ['marcus']
  };
  const setupAgents = setupByWorkflow[workflowId] || [];
  return setupAgents.includes(agent);
}

function buildFinalReport(run, stages, options, status) {
  const executed = stages.filter((stage) => stage.state === 'executed').map((stage) => stage.agent);
  const blocked = stages.filter((stage) => stage.state === 'setup_required' || stage.state === 'approval_required').map((stage) => stage.agent);
  return {
    workflowId: run.workflowId,
    workflowName: run.workflowName,
    status,
    input: run.input,
    executedAgents: executed,
    blockedAgents: blocked,
    setupRequired: blocked.length > 0,
    triggerType: run.triggerType,
    generatedAtMs: timestampMs(),
    notes: [
      blocked.length
        ? 'Some stages remain setup-required or approval-gated before live external execution.'
        : 'All planned stages executed in supervised local workflow foundation.',
      options?.note || null
    ].filter(Boolean)
  };
}
