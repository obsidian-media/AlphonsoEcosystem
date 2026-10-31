import { listModules, type ModuleRecord } from './moduleRegistryService';

const BRIDGE_BASE = 'http://localhost:4444';
const DEFAULT_TIMEOUT_MS = 10_000;

async function bridgeFetch<T>(
  path: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<T | { error: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(`${BRIDGE_BASE}${path}`, {
      ...init,
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) {
      return { error: `Bridge returned ${resp.status}` };
    }
    return (await resp.json()) as T;
  } catch (e) {
    clearTimeout(timer);
    const msg = (e as Error).message || String(e);
    if (msg.includes('aborted') || msg.includes('AbortError')) {
      return { error: `Request timed out after ${timeoutMs}ms` };
    }
    return { error: msg };
  }
}

export async function listModulesRemote(): Promise<ModuleRecord[]> {
  const result = await bridgeFetch<ModuleRecord[]>('/modules');
  if ('error' in result) {
    // Bridge offline — fall back to local registry
    return listModules();
  }
  return result;
}

export async function runModule(
  id: string,
  context: object
): Promise<{ runId: string } | { error: string }> {
  return bridgeFetch<{ runId: string }>(
    '/modules/run',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, context }),
    }
  );
}

export async function getRunStatus(
  runId: string
): Promise<{ status: string; logs: string[] } | { error: string }> {
  return bridgeFetch<{ status: string; logs: string[] }>(`/runs/${runId}`);
}

export async function publishEvent(
  type: string,
  payload: object
): Promise<void> {
  await bridgeFetch<void>(
    '/events/publish',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, payload }),
    }
  );
}
