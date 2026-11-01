// Resource manager (2026-10-30): start an installed tool when a step needs it.
//
// Ollama and ComfyUI are servers: a stopped one is started and awaited (60 s).
// ComfyUI: the install chosen in Settings first, else one with image models (your own
// through `launch_comfyui`, like Runtime Hub's card; Alphonso's own copy through
// startTool()), else Alphonso's copy. 2.11.0 QA (owner, 2026-11-01): Alphonso's old copy
// crashed at start and had no models, and Start always ran it instead of the chosen one. Kokoro, AudioCraft,
// Whisper and ffmpeg run inside the step and end with it, so they are neither
// started nor refused here: the step itself says what it needs (QA, 2026-10-31).
// When Runtime Hub's list can't be read, nothing is started or refused.
import { invoke } from '@tauri-apps/api/core';
import { getAllStatus, startTool, waitForTool, type ToolStatus } from '../runtimeManagerService';
import { findComfyuiInstalls, type ComfyUiInstall } from '../comfyuiSettingsService';
import { getStorage } from '../../lib/appStorage';
import type { NeededTool } from './stepNeeds';
import { isHermesTool, startHermesTool } from '../hermes/hermesTools';

export type EnsureResult = { ok: true } | { ok: false; reason: string };

const START_WAIT_MS = 60_000;
/** A first ComfyUI start loads PyTorch from disk: 130 s on a real computer (2026-11-01). */
export const COMFY_START_WAIT_MS = 240_000;
const PER_CALL: NeededTool[] = ['kokoro', 'audiocraft', 'whisper', 'ffmpeg'];

const notInstalled = (name: string) => `${name} isn't installed. Install it in Runtime Hub.`;
const didNotStart = (name: string) => `${name} didn't start. Open Runtime Hub to see its log.`;

function nameOf(statuses: Array<{ name: string; displayName?: string; installed?: boolean }>, tool: string): string {
  const found = statuses.find((s) => s.name === tool);
  const display = found?.displayName;
  return typeof display === 'string' && display ? display : tool;
}

/** Which ComfyUI to start: chosen in Settings, else one with image models, else Alphonso's copy. */
export function pickComfyInstall(installs: ComfyUiInstall[]): ComfyUiInstall | null {
  const chosen = installs.find((i) => i.sources.includes('settings'));
  if (chosen) return chosen;
  const withModels = installs.filter((i) => i.checkpoints > 0).sort((a, b) => b.checkpoints - a.checkpoints);
  return withModels[0] ?? installs.find((i) => i.alphonsoCopy) ?? installs[0] ?? null;
}

/** Starts ComfyUI (the one pickComfyInstall() picks) and waits for it; Runtime Hub's Start uses it too. */
export async function startComfyUi(statuses: Array<{ name: string; displayName?: string; installed?: boolean }>): Promise<EnsureResult> {
  const label = nameOf(statuses, 'comfyui');
  const own = statuses.find((s) => s.name === 'comfyui');
  const savedDir = getStorage<{ comfyuiDir?: string } | null>('alphonso_settings', null)?.comfyuiDir || '';
  const pick = pickComfyInstall(await findComfyuiInstalls(savedDir));
  if (pick && !pick.alphonsoCopy) {
    if (!pick.running) await invoke('launch_comfyui', { comfyuiDir: pick.path, pythonExe: pick.python || 'python' });
  } else if (own?.installed) {
    await startTool('comfyui');
  } else {
    return { ok: false, reason: notInstalled(label) };
  }
  return (await waitForTool('comfyui', COMFY_START_WAIT_MS)) ? { ok: true } : { ok: false, reason: didNotStart(label) };
}

export async function ensureTools(tools: NeededTool[]): Promise<EnsureResult> {
  if (!tools.length) return { ok: true };
  // A Hermes profile has its own way to start (Hermes gateway, 2026-10-30).
  for (const tool of tools.filter(isHermesTool)) {
    const result = await startHermesTool(tool);
    if (!result.ok) return result;
  }
  tools = tools.filter((t) => !isHermesTool(t));
  if (!tools.length) return { ok: true };
  const statuses = await getAllStatus().catch(() => [] as ToolStatus[]) ?? [];

  // Kokoro, AudioCraft, Whisper and ffmpeg run inside the step, which says what it needs (and
  // Music skips itself without AudioCraft); refusing here failed those steps first (QA, 2026-10-31).
  for (const tool of tools.filter((t) => !PER_CALL.includes(t))) {
    const current = statuses.find((s) => s.name === tool);
    // Not in Runtime Hub's list (no backend): nothing to start; the step says what it needs.
    if (!current || current.running) continue;
    try {
      if (tool === 'comfyui') {
        const result = await startComfyUi(statuses);
        if (!result.ok) return result;
        continue;
      }
      const label = nameOf(statuses, tool);
      if (current && !current.installed) return { ok: false, reason: notInstalled(label) };
      await startTool(tool);
      if (!(await waitForTool(tool, START_WAIT_MS))) return { ok: false, reason: didNotStart(label) };
    } catch {
      return { ok: false, reason: didNotStart(nameOf(statuses, tool)) };
    }
  }
  return { ok: true };
}
