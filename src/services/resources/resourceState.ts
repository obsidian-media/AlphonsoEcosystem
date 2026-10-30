// Resource manager (2026-10-30): one reading of this computer's memory and of
// what is loaded. RAM and the tools Alphonso started come from the backend's
// `resource_snapshot`; graphics memory from the NVIDIA card, else ComfyUI's
// own report, else unknown (never guessed). Ollama's loaded models come from
// `ollama_loaded_models`. Never throws: a source that fails reads as unknown.
import { invoke } from '@tauri-apps/api/core';
import { comfyRequest, getComfyUiEndpoint } from '../connectors/connectorImageGenerators';
import { getConfiguredOllamaEndpoint } from '../../lib/ollama';

export type GpuSource = 'nvidia' | 'comfyui' | 'unknown';

export interface LoadedThing {
  kind: 'tool' | 'model';
  name: string;
  label: string;
  /** Measured memory in MB; null when not known. */
  memMb: number | null;
  startedBy: 'alphonso' | 'you';
  lastUsedAtMs: number | null;
  inUse: boolean;
}

export interface ResourceState {
  atMs: number;
  ramTotalMb: number;
  ramFreeMb: number;
  gpuTotalMb: number | null;
  gpuFreeMb: number | null;
  gpuSource: GpuSource;
  loaded: LoadedThing[];
}

/** When each tool or model was last used and whether a step uses it now.
 *  Tools by their name, models as `model:<name>`. */
export interface UsageRecord {
  lastUsedAt(key: string): number | null;
  isInUse(key: string): boolean;
}

export const GPU_UNKNOWN = 'Graphics memory unknown on this computer.';

const NO_USAGE: UsageRecord = { lastUsedAt: () => null, isInUse: () => false };
const MB = 1024 * 1024;

interface Snapshot {
  ramTotalMb: number;
  ramFreeMb: number;
  gpu: { totalMb: number; freeMb: number; source: string } | null;
  processes: { tool: string; pid: number; memMb: number }[];
}
interface StatusRow { name: string; displayName?: string; running: boolean }
interface OllamaModel { name: string; sizeMb: number; vramMb: number }

async function quiet<T>(work: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return (await work()) ?? fallback;
  } catch {
    return fallback;
  }
}

/** ComfyUI's own report of its first device; Apple Silicon (`mps`) shares RAM, so it counts as unknown. */
async function comfyGpu(): Promise<{ totalMb: number; freeMb: number } | null> {
  return quiet(async () => {
    const response = await comfyRequest(getComfyUiEndpoint(), '/system_stats');
    if (!response?.ok) return null;
    const stats = await response.json();
    const device = stats?.devices?.[0];
    if (!device || device.type === 'mps' || device.type === 'cpu') return null;
    const total = Number(device.vram_total);
    const free = Number(device.vram_free);
    if (!(total > 0) || !(free >= 0)) return null;
    return { totalMb: Math.floor(total / MB), freeMb: Math.floor(free / MB) };
  }, null);
}

export async function readResources(usage: UsageRecord = NO_USAGE): Promise<ResourceState> {
  const empty: Snapshot = { ramTotalMb: 0, ramFreeMb: 0, gpu: null, processes: [] };
  const [snap, statuses, models] = await Promise.all([
    quiet(() => invoke<Snapshot>('resource_snapshot'), empty),
    quiet(() => invoke<StatusRow[]>('runtime_get_all_status'), [] as StatusRow[]),
    quiet(() => invoke<OllamaModel[]>('ollama_loaded_models', { endpoint: getConfiguredOllamaEndpoint() }), [] as OllamaModel[]),
  ]);

  let gpuTotalMb: number | null = null;
  let gpuFreeMb: number | null = null;
  let gpuSource: GpuSource = 'unknown';
  if (snap.gpu) {
    gpuTotalMb = snap.gpu.totalMb;
    gpuFreeMb = snap.gpu.freeMb;
    gpuSource = 'nvidia';
  } else {
    const comfy = await comfyGpu();
    if (comfy) {
      gpuTotalMb = comfy.totalMb;
      gpuFreeMb = comfy.freeMb;
      gpuSource = 'comfyui';
    }
  }

  const ours = new Map(snap.processes.map((p) => [p.tool, p.memMb]));
  const tools: LoadedThing[] = statuses
    .filter((s) => s.running)
    .map((s) => ({
      kind: 'tool',
      name: s.name,
      label: s.displayName || s.name,
      memMb: ours.get(s.name) ?? null,
      startedBy: ours.has(s.name) ? 'alphonso' : 'you',
      lastUsedAtMs: usage.lastUsedAt(s.name),
      inUse: usage.isInUse(s.name),
    }));
  const ollamaStarter = ours.has('ollama') ? 'alphonso' : 'you';
  const loadedModels: LoadedThing[] = models.map((m) => ({
    kind: 'model',
    name: m.name,
    label: m.name,
    memMb: m.vramMb || m.sizeMb,
    startedBy: ollamaStarter,
    lastUsedAtMs: usage.lastUsedAt(`model:${m.name}`),
    inUse: usage.isInUse(`model:${m.name}`),
  }));

  return {
    atMs: Date.now(),
    ramTotalMb: snap.ramTotalMb,
    ramFreeMb: snap.ramFreeMb,
    gpuTotalMb,
    gpuFreeMb,
    gpuSource,
    loaded: [...tools, ...loadedModels],
  };
}
