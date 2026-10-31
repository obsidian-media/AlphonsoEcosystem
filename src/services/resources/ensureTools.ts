// Resource manager (2026-10-30): start an installed tool when a step needs it.
//
// Ollama and ComfyUI are servers: a stopped one is started and awaited (60 s).
// ComfyUI: Alphonso's own copy through Runtime Hub's startTool(); else your own
// install the same way Runtime Hub's ComfyUI card starts it (`launch_comfyui`
// with the install and Python `findComfyuiInstalls()` found). Kokoro, AudioCraft,
// Whisper and ffmpeg run inside the step and end with it, so they are neither
// started nor refused here: the step itself says what it needs (QA, 2026-10-31).
// When Runtime Hub's list can't be read, nothing is started or refused.
import { invoke } from '@tauri-apps/api/core';
import { getAllStatus, startTool, waitForTool, type ToolStatus } from '../runtimeManagerService';
import { findComfyuiInstalls } from '../comfyuiSettingsService';
import { getStorage } from '../../lib/appStorage';
import type { NeededTool } from './stepNeeds';
import { isHermesTool, startHermesTool } from '../hermes/hermesTools';

export type EnsureResult = { ok: true } | { ok: false; reason: string };

const START_WAIT_MS = 60_000;
const PER_CALL: NeededTool[] = ['kokoro', 'audiocraft', 'whisper', 'ffmpeg'];

const notInstalled = (name: string) => `${name} isn't installed. Install it in Runtime Hub.`;
const didNotStart = (name: string) => `${name} didn't start. Open Runtime Hub to see its log.`;

function nameOf(statuses: ToolStatus[], tool: string): string {
  const found = statuses.find((s) => s.name === tool);
  const display = found?.displayName;
  return typeof display === 'string' && display ? display : tool;
}

async function startComfy(statuses: ToolStatus[]): Promise<EnsureResult> {
  const label = nameOf(statuses, 'comfyui');
  const own = statuses.find((s) => s.name === 'comfyui');
  if (own?.installed) {
    await startTool('comfyui');
  } else {
    const savedDir = getStorage<{ comfyuiDir?: string } | null>('alphonso_settings', null)?.comfyuiDir || '';
    const install = (await findComfyuiInstalls(savedDir)).find((i) => !i.alphonsoCopy);
    if (!install) return { ok: false, reason: notInstalled(label) };
    if (!install.running) {
      await invoke('launch_comfyui', { comfyuiDir: install.path, pythonExe: install.python || 'python' });
    }
  }
  return (await waitForTool('comfyui', START_WAIT_MS)) ? { ok: true } : { ok: false, reason: didNotStart(label) };
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
        const result = await startComfy(statuses);
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
