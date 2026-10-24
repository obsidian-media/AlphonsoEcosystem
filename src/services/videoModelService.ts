// Video models for Miya's AI clips (content factory phase 2b). The backend
// knows the graphics card's memory and suggests the model that fits; the user
// may pick another (owner, 2026-10-23). Installed into the ComfyUI chosen in
// Settings → Runtime → ComfyUI, else the best one found.
import { invoke } from '@tauri-apps/api/core';

export interface VideoModel {
  id: string;
  name: string;
  minVramGb: number;
  maxSeconds: number;
  fps: number;
  license: string;
  sizeBytes: number;
  installed: boolean;
}

export interface VideoModelsInfo {
  vramGb: number | null;
  /** Under 8 GB of graphics memory (phase 3d): clips are made smaller unless switched off. */
  smallCard?: boolean;
  suggested: string | null;
  comfyuiDir: string | null;
  models: VideoModel[];
}

const SELECTED_KEY = 'alphonso_comfyui_video_model_v1';
const FULL_SIZE_KEY = 'alphonso_full_size_clips_v1';

/** "Full size clips on this card" (Runtime Hub's video models; phase 3d). */
export function getFullSizeClips(): boolean {
  try { return localStorage.getItem(FULL_SIZE_KEY) === 'true'; } catch { return false; }
}

export function setFullSizeClips(on: boolean): void {
  try { localStorage.setItem(FULL_SIZE_KEY, on ? 'true' : 'false'); } catch { /* the default stays */ }
}

/** On a small card, clips are smaller and at most 3 seconds, unless full size was chosen. */
export function clipSizeFor(info: { smallCard?: boolean } | null): { lowRes: boolean; maxSeconds: number } {
  return info?.smallCard && !getFullSizeClips() ? { lowRes: true, maxSeconds: 3 } : { lowRes: false, maxSeconds: Infinity };
}

function savedComfyDir(): string | null {
  try {
    const settings = JSON.parse(localStorage.getItem('alphonso_settings') || '{}');
    const dir = String(settings?.comfyuiDir || '').trim();
    return dir || null;
  } catch {
    return null;
  }
}

export function listVideoModels(): Promise<VideoModelsInfo> {
  return invoke<VideoModelsInfo>('comfyui_video_models', { savedDir: savedComfyDir() });
}

export function installVideoModel(id: string): Promise<void> {
  return invoke<void>('comfyui_install_video_model', { savedDir: savedComfyDir(), id });
}

/** The model the user picked, or null for the suggested one. */
export function getSelectedVideoModel(): string | null {
  try {
    return localStorage.getItem(SELECTED_KEY) || null;
  } catch {
    return null;
  }
}

export function setSelectedVideoModel(id: string | null): void {
  try {
    if (id) localStorage.setItem(SELECTED_KEY, id);
    else localStorage.removeItem(SELECTED_KEY);
  } catch { /* storage unavailable: the suggestion is used */ }
}

/** The model AI clips use: the user's pick if it is still listed, else the suggestion. */
export function effectiveVideoModel(info: VideoModelsInfo): VideoModel | null {
  const picked = getSelectedVideoModel();
  return info.models.find((m) => m.id === picked)
    || info.models.find((m) => m.id === info.suggested)
    || null;
}
