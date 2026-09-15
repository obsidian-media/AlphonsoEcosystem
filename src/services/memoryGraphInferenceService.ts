import { listAllNodes, inferEdges } from './memoryGraphService';

const SCHEDULED_BATCH_SIZE = 20;
const SCHEDULED_MAX_SUGGESTIONS = 20;
const NODE_SAMPLE_POOL = 500;
const DEFAULT_INTERVAL_MS = 30 * 60 * 1000;

/**
 * One scheduled inference pass: samples a random batch of nodes from the
 * graph (no "already processed" tracking -- the simplest thing that keeps
 * this bounded without new bookkeeping) and runs the shared inferEdges
 * primitive against them.
 */
export async function runScheduledInferencePass(): Promise<void> {
  const nodes = await listAllNodes(NODE_SAMPLE_POOL);
  if (nodes.length === 0) return;

  const shuffled = [...nodes].sort(() => Math.random() - 0.5);
  const batch = shuffled.slice(0, SCHEDULED_BATCH_SIZE).map((n) => n.id);
  await inferEdges(batch, SCHEDULED_MAX_SUGGESTIONS);
}

let _inferenceInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Starts the recurring inference pass. Idempotent -- calling this while
 * already running is a no-op, matching echoFileWatcherService's
 * start/stop-pair convention.
 */
export function startMemoryGraphInferenceScheduler(intervalMs: number = DEFAULT_INTERVAL_MS): void {
  if (_inferenceInterval !== null) return;
  _inferenceInterval = setInterval(() => {
    runScheduledInferencePass().catch(() => {});
  }, intervalMs);
}

export function stopMemoryGraphInferenceScheduler(): void {
  if (_inferenceInterval !== null) {
    clearInterval(_inferenceInterval);
    _inferenceInterval = null;
  }
}
