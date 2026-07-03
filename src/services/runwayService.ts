import { invoke } from '@tauri-apps/api/core';
import { getConnectorCredential } from './connectors/connectorAuth.js';

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

export async function generateRunwayVideo(options: RunwayVideoOptions = {}): Promise<RunwayResult> {
  const request = buildRunwayVideoRequest(options);
  request.apiSecret = getConnectorCredential('runway', 'RUNWAYML_API_SECRET') || null;
  return invoke('runway_generate_video', { request }) as Promise<RunwayResult>;
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
