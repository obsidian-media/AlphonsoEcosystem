import { TRUST_STATES, timestampMs } from './trustModel';

const RESOURCE_KEY = 'alphonso_resource_snapshots_v1';

interface ResourceSnapshot {
  id: string;
  timestampMs: number;
  cpuCores: number | null;
  deviceMemoryGb: number | undefined;
  jsHeapLimit: number | undefined;
  jsHeapUsed: number | undefined;
  ollamaConnected: boolean;
  modelName: string;
  tokenEstimate: number;
  cloudUsage: number;
  trust: string;
}

interface ResourceSummary {
  hours: number;
  points: number;
  avgTokenEstimate: number;
  maxJsHeapUsed: number;
  disconnectedCount?: number;
  recommendations: string[];
}

function readSnapshots(): ResourceSnapshot[] {
  try {
    const raw = localStorage.getItem(RESOURCE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeSnapshots(items: ResourceSnapshot[]) {
  localStorage.setItem(RESOURCE_KEY, JSON.stringify(items.slice(-400)));
}

export function collectResourceSnapshot({ ollamaConnected, modelName, tokenEstimate = 0 }: { ollamaConnected: boolean; modelName?: unknown; tokenEstimate?: number }): ResourceSnapshot {
  const snapshot: ResourceSnapshot = {
    id: `rs-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    timestampMs: timestampMs(),
    cpuCores: navigator.hardwareConcurrency || null,
    deviceMemoryGb: (navigator as unknown as Record<string, unknown>).deviceMemory as number || undefined,
    jsHeapLimit: (performance as unknown as Record<string, unknown>).memory ? ((performance as unknown as Record<string, unknown>).memory as Record<string, unknown>).jsHeapSizeLimit as number : undefined,
    jsHeapUsed: (performance as unknown as Record<string, unknown>).memory ? ((performance as unknown as Record<string, unknown>).memory as Record<string, unknown>).usedJSHeapSize as number : undefined,
    ollamaConnected: Boolean(ollamaConnected),
    modelName: String(modelName || ''),
    tokenEstimate,
    cloudUsage: 0,
    trust: String(TRUST_STATES.TEMPORARY)
  };

  const rows = readSnapshots();
  rows.push(snapshot);
  writeSnapshots(rows);
  return snapshot;
}

export function listResourceSnapshots(): ResourceSnapshot[] {
  return readSnapshots();
}

export function summarizeResourceUsage(hours = 24): ResourceSummary {
  const now = timestampMs();
  const start = now - (hours * 60 * 60 * 1000);
  const rows = readSnapshots().filter((item) => item.timestampMs >= start);
  if (rows.length === 0) {
    return {
      hours,
      points: 0,
      avgTokenEstimate: 0,
      maxJsHeapUsed: 0,
      recommendations: ['Collect runtime snapshots to enable resource-cost trend analysis.']
    };
  }

  const avgTokenEstimate = Math.round(rows.reduce((sum, row) => sum + (row.tokenEstimate || 0), 0) / rows.length);
  const maxJsHeapUsed = Math.max(...rows.map((row) => row.jsHeapUsed || 0));
  const disconnectedCount = rows.filter((row) => !row.ollamaConnected).length;

  return {
    hours,
    points: rows.length,
    avgTokenEstimate,
    maxJsHeapUsed,
    disconnectedCount,
    recommendations: [
      disconnectedCount > 0 ? 'Ollama disconnects detected. Keep runtime checks active and review endpoint stability.' : 'Ollama connectivity appears stable in this window.',
      avgTokenEstimate > 9000 ? 'Token estimate is trending high. Consider shorter prompts and targeted workflows.' : 'Token estimate is within expected local range.'
    ]
  };
}
