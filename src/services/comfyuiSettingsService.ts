import { getAllStatus } from './runtimeManagerService';

export async function resolveComfyuiDirectory(currentDir: string | null | undefined): Promise<string> {
  const trimmedCurrent = String(currentDir || '').trim();
  if (trimmedCurrent) return trimmedCurrent;

  try {
    const tools = await getAllStatus();
    const comfyui = tools.find(
      (tool) => tool.name === 'comfyui' && tool.installed && typeof tool.installDir === 'string' && tool.installDir.trim()
    );
    return comfyui?.installDir?.trim() || '';
  } catch {
    return '';
  }
}
