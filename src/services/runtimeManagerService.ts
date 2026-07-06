import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

export const TOOL_NAMES = [
  'ollama',
  'comfyui',
  'automatic1111',
  'fooocus',
  'invokeai',
  'whisper',
  'audiocraft',
] as const;

export type ToolName = typeof TOOL_NAMES[number];

export interface ToolStatus {
  name: string;
  running: boolean;
  installed: boolean;
  [key: string]: unknown;
}

export interface ToolResult {
  tool: string;
  ok: boolean;
  message: string;
}

export interface ProgressEvent {
  tool: string;
  stage: string;
  message: string;
  pct: number;
}

export interface LogEvent {
  tool: string;
  line: string;
  stream: string;
}

export interface PrereqStatus {
  missing: string[];
  installHint: string;
  pythonFound?: boolean;
  pythonVersion?: string;
  pythonPath?: string;
  gitFound?: boolean;
  gitVersion?: string;
  gitPath?: string;
  ollamaFound?: boolean;
  ollamaPath?: string;
  dockerFound?: boolean;
  dockerPath?: string;
  nodeFound?: boolean;
  nodePath?: string;
}

export async function getAllStatus(): Promise<ToolStatus[]> {
  return invoke('runtime_get_all_status');
}

export async function listTools(): Promise<ToolStatus[]> {
  return invoke('runtime_list_tools');
}

export async function installTool(name: string, onProgress?: (progress: ProgressEvent) => void): Promise<ToolResult> {
  let unlisten: UnlistenFn | null = null;
  if (typeof onProgress === 'function') {
    unlisten = await listen<ProgressEvent>('runtime://progress', ({ payload }) => {
      if (payload.tool === name) onProgress(payload);
    });
  }
  try {
    return await invoke('runtime_install_tool', { name });
  } finally {
    if (unlisten) unlisten();
  }
}

export async function startTool(name: string): Promise<ToolResult> {
  return invoke('runtime_start_tool', { name });
}

export async function stopTool(name: string): Promise<ToolResult> {
  return invoke('runtime_stop_tool', { name });
}

export async function onAnyProgress(cb: (progress: ProgressEvent) => void): Promise<UnlistenFn> {
  return listen<ProgressEvent>('runtime://progress', ({ payload }) => cb(payload));
}

export async function checkPrerequisites(): Promise<PrereqStatus> {
  return invoke('runtime_check_prerequisites');
}

export async function installPrerequisite(name: string): Promise<ToolResult> {
  return invoke('runtime_install_prerequisite', { name });
}

export async function getAutostartPrefs(): Promise<Record<string, boolean>> {
  return invoke('runtime_get_autostart_prefs');
}

export async function saveAutostartPref(name: string, enabled: boolean): Promise<void> {
  return invoke('runtime_save_autostart_pref', { name, enabled });
}

export async function onLogLine(tool: string | null, cb: (event: LogEvent) => void): Promise<UnlistenFn> {
  return listen<LogEvent>('runtime://log', ({ payload }) => {
    if (!tool || payload.tool === tool) cb(payload);
  });
}

export async function waitForTool(name: string, timeoutMs = 60_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const statuses = await getAllStatus().catch(() => [] as ToolStatus[]);
    const s = statuses.find((t) => t.name === name);
    if (s?.running) return true;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}
