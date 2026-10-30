// Resource manager (2026-10-30): what a step needs on this computer. One table
// says which tools a kind of step uses; the memory comes from what is known
// (an Ollama model's size plus 20% for its working memory, a video model's
// listed graphics memory), and once a kind of step has run, from the average
// of what it actually used (the last 5 readings). A kind of step not in the
// table counts as the agent's model: counted, never treated as free.
import { invoke } from '@tauri-apps/api/core';
import { getAgentProvider } from '../modelSelectionService';
import { getAgentModelOverride, getConfiguredOllamaModel, getConfiguredOllamaEndpoint } from '../../lib/ollama';
import { projectEngines } from '../contentFactory/engineChoice';
import { getProject } from '../contentFactory/contentProjectService';
import { effectiveVideoModel, listVideoModels } from '../videoModelService';
import { durableGet, durableSet } from '../../lib/durableStore';

export type NeededTool = 'ollama' | 'comfyui' | 'kokoro' | 'audiocraft' | 'whisper' | 'ffmpeg';

export interface StepAssignment {
  agent: string;
  actionType: string;
  model?: string;
  contentStep?: unknown;
}

export interface StepNeed {
  /** The kind of step and its model or engine, e.g. `research_report|llama3.2:3b`. */
  key: string;
  tools: NeededTool[];
  ramMb: number;
  gpuMb: number;
  /** Only an Ollama model: what doesn't fit on the card runs from RAM instead. */
  gpuSpillsToRam: boolean;
  /** The Ollama model this step loads, as `model:<name>`. */
  modelKey?: string;
  learned: boolean;
  /** False when part of the need has no known size yet (shown as unknown, learned after a run). */
  known: boolean;
}

export const MODEL_WORKING_MEMORY = 1.2;
const USAGE_KEY = 'alphonso_resource_usage_v1';
const KEEP_READINGS = 5;
const CLOUD = new Set(['nvidia_nim', 'gemini', 'hermes', 'openrouter']);
const PAID = /^(claude|chatgpt):/;
const PICTURE_STEPS = new Set(['creative_scenes', 'creative_thumbnails', 'creative_carousel']);

type Engines = ReturnType<typeof projectEngines>;

function enginesFor(assignment: StepAssignment): Engines | null {
  const step = assignment.contentStep as { projectId?: string; brand?: unknown } | undefined;
  if (!step) return null;
  try {
    const project = step.projectId ? getProject(step.projectId) : null;
    return project && step.brand ? projectEngines(project, step.brand as never) : null;
  } catch {
    return null;
  }
}

/** The Ollama model a step loads, or null when its model isn't local. */
function localModel(assignment: StepAssignment): string | null {
  if (assignment.model && PAID.test(assignment.model)) return null;
  if (CLOUD.has(getAgentProvider(assignment.agent)?.provider)) return null;
  return assignment.model || getAgentModelOverride(assignment.agent) || getConfiguredOllamaModel();
}

export function toolsForStep(assignment: StepAssignment): NeededTool[] {
  const model: NeededTool[] = localModel(assignment) ? ['ollama'] : [];
  const engines = enginesFor(assignment);
  switch (assignment.actionType) {
    case 'creative_voice':
      return engines?.voice.engine === 'elevenlabs' ? [] : ['kokoro'];
    case 'creative_music':
      return ['audiocraft'];
    case 'research_broll':
    case 'creative_higgsfield':
    case 'creative_character_train':
      return [];
    case 'creative_video_clips':
      return !engines || engines.clips === 'local' || engines.clips === null ? ['comfyui'] : [];
    case 'creative_assemble_video':
      return ['ffmpeg'];
    case 'creative_shorts':
      return [...model, 'comfyui', 'kokoro', 'ffmpeg'];
    default:
      if (PICTURE_STEPS.has(assignment.actionType)) {
        return engines?.pictures === 'higgsfield' ? model : [...model, 'comfyui'];
      }
      return model;
  }
}

interface Reading { ramMb: number; gpuMb: number }

function readUsage(): Record<string, Reading[]> {
  try {
    const parsed = JSON.parse(durableGet(USAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function recordStepUse(key: string, used: Reading): void {
  const all = readUsage();
  const list = [...(all[key] || []), { ramMb: Math.max(0, Math.round(used.ramMb)), gpuMb: Math.max(0, Math.round(used.gpuMb)) }];
  all[key] = list.slice(-KEEP_READINGS);
  durableSet(USAGE_KEY, JSON.stringify(all));
}

export function resetUsageForTests(): void {
  try { localStorage.removeItem(USAGE_KEY); } catch { /* unavailable */ }
}

async function modelSizeMb(name: string): Promise<number | null> {
  try {
    const proof = await invoke<{ models?: { name: string; size?: number | null }[] }>('ollama_list_models', { endpoint: getConfiguredOllamaEndpoint() });
    const size = proof?.models?.find((m) => m.name === name)?.size;
    return size && size > 0 ? size / (1024 * 1024) : null;
  } catch {
    return null;
  }
}

async function videoModel(): Promise<{ id: string; gpuMb: number } | null> {
  try {
    const model = effectiveVideoModel(await listVideoModels());
    return model ? { id: model.id, gpuMb: Math.round(model.minVramGb * 1024) } : null;
  } catch {
    return null;
  }
}

async function whisperInstalled(): Promise<boolean> {
  try {
    return Boolean((await invoke<{ whisper?: boolean }>('media_tools_status'))?.whisper);
  } catch {
    return false;
  }
}

export async function estimateNeed(assignment: StepAssignment): Promise<StepNeed> {
  const tools = toolsForStep(assignment);
  const engines = enginesFor(assignment);
  const model = tools.includes('ollama') ? localModel(assignment) : null;
  if (assignment.actionType === 'creative_assemble_video' && engines?.voice.engine !== 'elevenlabs' && await whisperInstalled()) {
    tools.push('whisper');
  }

  let gpuMb = 0;
  let known = true;
  let detail: string = model || tools.join('+') || 'none';
  if (model) {
    const size = await modelSizeMb(model);
    if (size === null) known = false;
    else gpuMb = Math.ceil(size * MODEL_WORKING_MEMORY);
  }
  if (tools.includes('comfyui')) {
    if (assignment.actionType === 'creative_video_clips') {
      const video = await videoModel();
      if (video) {
        gpuMb = Math.max(gpuMb, video.gpuMb);
        detail = video.id;
      } else known = false;
    } else {
      // A picture checkpoint's size isn't known here; learned after a run.
      known = false;
      detail = 'comfyui';
    }
  }
  if (tools.some((t) => t === 'kokoro' || t === 'audiocraft' || t === 'whisper' || t === 'ffmpeg')) known = false;

  const key = `${assignment.actionType}|${detail}`;
  const base: StepNeed = {
    key,
    tools,
    ramMb: 0,
    gpuMb,
    gpuSpillsToRam: Boolean(model) && !tools.includes('comfyui'),
    ...(model ? { modelKey: `model:${model}` } : {}),
    learned: false,
    known,
  };
  const readings = readUsage()[key] || [];
  if (!readings.length) return base;
  const avg = (pick: (r: Reading) => number) => Math.round(readings.reduce((sum, r) => sum + pick(r), 0) / readings.length);
  return { ...base, ramMb: avg((r) => r.ramMb), gpuMb: avg((r) => r.gpuMb), learned: true, known: true };
}
