import { invoke } from '@tauri-apps/api/core';
import { getAllStatus } from './runtimeManagerService';

interface PathProof {
  exists: boolean;
  is_dir: boolean;
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

async function normalizeComfyuiRoot(basePath: string | null | undefined): Promise<string> {
  const trimmed = String(basePath || '').trim().replace(/[\\/]+$/, '');
  if (!trimmed) return '';

  if (await pathExists(`${trimmed}\\main.py`)) return trimmed;

  const nestedRoot = `${trimmed}\\ComfyUI`;
  if (await pathExists(`${nestedRoot}\\main.py`)) return nestedRoot;

  return '';
}

export async function resolveComfyuiDirectory(currentDir: string | null | undefined): Promise<string> {
  const currentResolved = await normalizeComfyuiRoot(currentDir);
  if (currentResolved) return currentResolved;

  const candidates: string[] = [];

  try {
    const tools = await getAllStatus();
    const comfyui = tools.find(
      (tool) => tool.name === 'comfyui' && tool.installed && typeof tool.installDir === 'string' && tool.installDir.trim()
    );
    if (comfyui?.installDir) candidates.push(comfyui.installDir);
  } catch {
    // Fall through to explicit discovery hints below.
  }

  candidates.push(
    'D:\\Comfy-Desktop\\ComfyUI-Installs\\ComfyUI',
    'D:\\Comfy-Desktop',
    'C:\\Comfy-Desktop\\ComfyUI-Installs\\ComfyUI',
    'C:\\Comfy-Desktop'
  );

  for (const candidate of candidates) {
    const resolved = await normalizeComfyuiRoot(candidate);
    if (resolved) {
      return resolved;
    }
  }

  return '';
}
