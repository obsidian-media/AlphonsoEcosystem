import { invoke } from '@tauri-apps/api/core';
import { getConnectorCredential } from './connectors/connectorAuth.js';
import {
  gateConnectorAction,
  requireConnectorReady,
  requireConnectorApproval,
  appendConnectorAudit,
  getConnectorCircuitState,
  recordConnectorFailure,
  recordConnectorSuccess
} from './connectors/connectorRegistry.js';
import { isConnectorAuthenticated, logUnauthenticatedConnectorRequest } from './connectors/connectorAuth.js';

interface RunwayVideoRequest {
  promptText: string;
  promptImage: string;
  model: string;
  ratio: string;
  duration: number;
  outputDir: string;
  timeoutSeconds: number;
  apiSecret?: string | null;
}

export interface RunwayResult {
  provider: string;
  ok: boolean;
  taskId: string | null;
  status: string;
  model: string;
  ratio: string;
  duration: number;
  outputDir: string;
  outputUrls: string[];
  outputFiles: string[];
  setupRequired: boolean;
  trust: string;
  message: string;
  error: string | null;
  startedAtMs: number;
  finishedAtMs: number;
}

interface RunwayVideoOptions {
  promptText?: string;
  promptImage?: string;
  model?: string;
  ratio?: string;
  duration?: number;
  outputDir?: string;
  timeoutSeconds?: number;
}

interface RunwayResumeOptions {
  taskId?: string;
  outputDir?: string;
  timeoutSeconds?: number;
}

export function buildRunwayVideoRequest({
  promptText,
  promptImage,
  model = 'gen4.5',
  ratio = '1280:720',
  duration = 5,
  outputDir,
  timeoutSeconds = 600
}: RunwayVideoOptions = {}): RunwayVideoRequest {
  return {
    promptText: String(promptText || '').trim(),
    promptImage: promptImage ? String(promptImage).trim() : '',
    model: String(model || 'gen4.5').trim() || 'gen4.5',
    ratio: String(ratio || '1280:720').trim() || '1280:720',
    duration: Number(duration || 5),
    outputDir: outputDir ? String(outputDir).trim() : '',
    timeoutSeconds: Number(timeoutSeconds || 600)
  };
}

interface RunwayGateOptions {
  approved?: boolean;
  requestedBy?: string;
  reason?: string;
  workflowId?: string;
  commandId?: string | null;
  packetId?: string | null;
}

// Gated the same way every other paid connector send is (connectorOutbound.js's
// established pattern): auth -> circuit breaker -> approval -> readiness ->
// policy gate -> the real call -> audit. Runway generates real video via a
// real paid cloud API (RunwayML) on every call; before this fix it had zero
// policy gate anywhere in its chain, so Zero-Cost Mode / Approval Mode
// (both on by default) never applied to it. Found during the 2026-09-20
// G-T12 connector-DSL fail-closed audit.
export async function generateRunwayVideo(
  options: RunwayVideoOptions = {},
  gateOptions: RunwayGateOptions = {}
): Promise<RunwayResult> {
  const actionType = 'paid_connector_send';
  const promptPreview = String(options.promptText || '').slice(0, 200);

  const auth = isConnectorAuthenticated('runway');
  if (!auth.ok) {
    return logUnauthenticatedConnectorRequest('runway', actionType, promptPreview, gateOptions) as unknown as RunwayResult;
  }

  const circuit = getConnectorCircuitState('runway', actionType);
  if (!circuit.ok) {
    appendConnectorAudit('runway', 'send_blocked_circuit_open', {
      failures: circuit.failures,
      remainingMs: circuit.remainingMs
    });
    return {
      ok: false,
      setupRequired: false,
      trust: 'failed',
      message: `Circuit breaker open — ${Math.ceil(circuit.remainingMs / 1000)}s remaining`,
      error: `Circuit breaker open — ${Math.ceil(circuit.remainingMs / 1000)}s remaining`
    } as unknown as RunwayResult;
  }

  const approval = await requireConnectorApproval('runway', actionType, promptPreview, gateOptions);
  if (!approval.ok) return approval as unknown as RunwayResult;

  const readiness = await requireConnectorReady('runway', actionType, promptPreview, gateOptions);
  if (!readiness.ok) return readiness as unknown as RunwayResult;

  const gate = gateConnectorAction('runway', actionType, promptPreview, gateOptions) as {
    ok: boolean;
    reason?: string;
    verificationState?: string;
  };
  if (!gate.ok) {
    return {
      ok: false,
      setupRequired: false,
      trust: gate.verificationState || 'pending',
      message: gate.reason || 'Runway connector policy gate blocked the action.',
      error: gate.reason || 'Runway connector policy gate blocked the action.'
    } as unknown as RunwayResult;
  }

  const request = buildRunwayVideoRequest(options);
  request.apiSecret = getConnectorCredential('runway', 'RUNWAYML_API_SECRET') || null;

  try {
    const result = await (invoke('runway_generate_video', { request }) as Promise<RunwayResult>);
    if (result?.ok) {
      recordConnectorSuccess('runway', actionType);
    } else {
      recordConnectorFailure('runway', actionType);
    }
    appendConnectorAudit('runway', result?.ok ? 'generate_success' : 'generate_failed', {
      promptPreview,
      taskId: result?.taskId || null,
      error: result?.error || null
    });
    return result;
  } catch (error) {
    const errMsg = String(error || '');
    recordConnectorFailure('runway', actionType);
    appendConnectorAudit('runway', 'generate_failed', { promptPreview, error: errMsg });
    throw error;
  }
}

export async function listPendingRunwayJobs(outputDir?: string | null) {
  return invoke('runway_list_pending_jobs', { outputDir: outputDir ?? null });
}

export async function resumeRunwayTask({ taskId, outputDir, timeoutSeconds }: RunwayResumeOptions = {}): Promise<RunwayResult> {
  return invoke('runway_resume_task', {
    request: {
      taskId: String(taskId || ''),
      outputDir: outputDir ? String(outputDir) : null,
      timeoutSeconds: timeoutSeconds ? Number(timeoutSeconds) : null
    }
  }) as Promise<RunwayResult>;
}
