// Resource manager (2026-10-30): making room. An idle model is unloaded (the
// next step that needs it loads it again); your ComfyUI is asked to drop its
// models through `POST /free`, never stopped; a tool Alphonso started is
// stopped. Nothing in use, the Ollama program itself, and no other tool you
// started is ever touched (design §5). Never throws: what couldn't be freed is
// listed in `failed`, and the caller reads memory again.
import { freeOllamaGpuMemory, getConfiguredOllamaEndpoint } from '../../lib/ollama';
import { comfyRequest, getComfyUiEndpoint } from '../connectors/connectorImageGenerators';
import { stopTool } from '../runtimeManagerService';
import { isHermesTool, stopHermesTool } from '../hermes/hermesTools';
import type { LoadedThing } from './resourceState';

export interface FreeResult {
  freed: string[];
  failed: string[];
}

function mayTouch(thing: LoadedThing): boolean {
  if (thing.inUse) return false;
  if (thing.kind === 'model') return true;
  if (thing.name === 'ollama') return false;
  return thing.startedBy === 'alphonso' || thing.name === 'comfyui';
}

async function unloadComfy(): Promise<boolean> {
  try {
    const response = await comfyRequest(getComfyUiEndpoint(), '/free', {
      method: 'POST',
      body: JSON.stringify({ unload_models: true, free_memory: true }),
    });
    return Boolean(response?.ok);
  } catch {
    return false;
  }
}

async function stop(name: string): Promise<boolean> {
  try {
    const result = isHermesTool(name) ? await stopHermesTool(name) : await stopTool(name);
    return Boolean(result?.ok);
  } catch {
    return false;
  }
}

export async function freeThings(things: LoadedThing[]): Promise<FreeResult> {
  const allowed = things.filter(mayTouch);
  const outcome = new Map<LoadedThing, boolean>();
  const note = (thing: LoadedThing, ok: boolean) => outcome.set(thing, ok);

  const models = allowed.filter((t) => t.kind === 'model');
  if (models.length) {
    let report: { unloaded: string[]; error: string | null };
    try {
      report = await freeOllamaGpuMemory(getConfiguredOllamaEndpoint(), models.map((m) => m.name));
    } catch (error) {
      report = { unloaded: [], error: String(error) };
    }
    // A model missing from the report with no error was already gone: that counts as freed.
    for (const model of models) note(model, report.unloaded.includes(model.name) || !report.error);
  }

  for (const tool of allowed.filter((t) => t.kind === 'tool')) {
    const ok = tool.startedBy === 'alphonso' ? await stop(tool.name) : await unloadComfy();
    note(tool, ok);
  }
  // Reported in the order asked.
  return {
    freed: allowed.filter((t) => outcome.get(t)).map((t) => t.label),
    failed: allowed.filter((t) => outcome.get(t) === false).map((t) => t.label),
  };
}
