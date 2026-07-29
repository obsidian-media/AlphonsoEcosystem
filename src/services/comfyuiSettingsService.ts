import { invoke } from '@tauri-apps/api/core';
import { getAllStatus } from './runtimeManagerService';

interface PathProof {
  exists: boolean;
  is_dir: boolean;
}

interface RuntimeEnvValueProof {
  present: boolean;
  value?: string | null;
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

async function resolveWindowsUserProfile(): Promise<string> {
  try {
    const result = await invoke<RuntimeEnvValueProof>('read_runtime_env_value', { name: 'USERPROFILE' });
    const value = String(result?.value || '').trim().replace(/[\\/]+$/, '');
    return result?.present && value ? value : '';
  } catch {
    return '';
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

async function normalizeComfyuiPython(
  currentPython: string | null | undefined,
  comfyuiDir: string | null | undefined
): Promise<string> {
  const trimmedPython = String(currentPython || '').trim();
  if (trimmedPython && trimmedPython.toLowerCase() !== 'python' && await pathExists(trimmedPython)) {
    return trimmedPython;
  }

  const resolvedDir = await normalizeComfyuiRoot(comfyuiDir);
  if (!resolvedDir) return '';

  const bundledPython = `${resolvedDir}\\.venv\\Scripts\\python.exe`;
  if (await pathExists(bundledPython)) return bundledPython;

  return trimmedPython && trimmedPython.toLowerCase() !== 'python' ? trimmedPython : '';
}

export async function resolveComfyuiDirectory(currentDir: string | null | undefined): Promise<string> {
  const currentResolved = await normalizeComfyuiRoot(currentDir);
  if (currentResolved) return currentResolved;

  const candidates: string[] = [];
  const windowsUserProfile = await resolveWindowsUserProfile();

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

  if (windowsUserProfile) {
    candidates.push(`${windowsUserProfile}\\ComfyUI-Installs\\ComfyUI`);
  }

  for (const candidate of candidates) {
    const resolved = await normalizeComfyuiRoot(candidate);
    if (resolved) {
      return resolved;
    }
  }

  return '';
}

export async function resolveComfyuiPython(
  currentPython: string | null | undefined,
  comfyuiDir: string | null | undefined
): Promise<string> {
  return normalizeComfyuiPython(currentPython, comfyuiDir);
}
