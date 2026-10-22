import { invoke } from '@tauri-apps/api/core';

interface PathProof {
  exists: boolean;
  is_dir: boolean;
}

/** One ComfyUI install found on this machine (backend `comfyui_find_installs`). */
export interface ComfyUiInstall {
  /** The folder that holds ComfyUI's main.py. */
  path: string;
  /** The Python that runs it, when one was found. */
  python: string | null;
  running: boolean;
  /** How it was found: "settings", "running", "alphonso", "usual-place". */
  sources: string[];
  /** Image models in its models/checkpoints folder. */
  checkpoints: number;
  /** Alphonso's own copy, installed from Runtime Hub. */
  alphonsoCopy: boolean;
}

async function pathExists(path: string): Promise<boolean> {
  const trimmed = String(path || '').trim();
  if (!trimmed) return false;
  try {
    const result = await invoke<PathProof[]>('verify_paths', { paths: [trimmed] });
    const proof = Array.isArray(result) ? result[0] : null;
    return Boolean(proof?.exists);
  } catch {
    return false;
  }
}

const samePath = (a: string, b: string) =>
  a.trim().replace(/[\\/]+$/, '').toLowerCase() === b.trim().replace(/[\\/]+$/, '').toLowerCase();

/**
 * Every ComfyUI install the backend can find: running ones, the folder chosen
 * in Settings, Alphonso's own copy, and usual places. Chosen first, then
 * running, then Alphonso's copy, then the one with the most image models.
 * Until 2026-10-22 this searched a few fixed folders from one developer's
 * machine (QA Bug 31). Empty outside the desktop app.
 */
export async function findComfyuiInstalls(savedDir?: string | null): Promise<ComfyUiInstall[]> {
  try {
    const found = await invoke<ComfyUiInstall[]>('comfyui_find_installs', { savedDir: savedDir || null });
    return Array.isArray(found) ? found : [];
  } catch {
    return [];
  }
}

export interface ComfyUiSearchResult {
  installs: ComfyUiInstall[];
  /** True when the 4-minute limit stopped the search before it finished. */
  stoppedEarly: boolean;
}

/** Scan this computer's drives for ComfyUI installs (slow; only when the user asks). */
export async function searchComputerForComfyui(): Promise<ComfyUiSearchResult> {
  return invoke<ComfyUiSearchResult>('comfyui_search_computer');
}

/** The ComfyUI folder to use: the saved one if it is still a ComfyUI, else the best one found. */
export async function resolveComfyuiDirectory(currentDir: string | null | undefined): Promise<string> {
  const installs = await findComfyuiInstalls(currentDir);
  const saved = String(currentDir || '').trim();
  if (saved) {
    const match = installs.find((i) => samePath(i.path, saved) || samePath(i.path, `${saved}\\ComfyUI`) || samePath(i.path, `${saved}/ComfyUI`));
    if (match) return match.path;
  }
  return installs[0]?.path || '';
}

/** The Python for a ComfyUI folder: a real path the user set, else the one found next to that install. */
export async function resolveComfyuiPython(
  currentPython: string | null | undefined,
  comfyuiDir: string | null | undefined
): Promise<string> {
  const chosen = String(currentPython || '').trim();
  if (chosen && chosen.toLowerCase() !== 'python' && await pathExists(chosen)) return chosen;
  const dir = String(comfyuiDir || '').trim();
  if (!dir) return '';
  const installs = await findComfyuiInstalls(dir);
  return installs.find((i) => samePath(i.path, dir))?.python || '';
}
