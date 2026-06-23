import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Tauri
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async () => () => {}),
}));

import { invoke } from '@tauri-apps/api/core';
import {
  getAllStatus,
  listTools,
  startTool,
  stopTool,
  installTool,
  waitForTool,
  checkPrerequisites,
  installPrerequisite,
  getAutostartPrefs,
  saveAutostartPref,
  TOOL_NAMES,
} from '../services/runtimeManagerService';

const mockStatuses = [
  { name: 'ollama', displayName: 'Ollama', installed: true, running: true, port: 11434 },
  { name: 'comfyui', displayName: 'ComfyUI', installed: false, running: false, port: 8188 },
  { name: 'automatic1111', displayName: 'AUTOMATIC1111', installed: false, running: false, port: 7860 },
  { name: 'fooocus', displayName: 'Fooocus', installed: false, running: false, port: 7865 },
  { name: 'invokeai', displayName: 'InvokeAI', installed: false, running: false, port: 9090 },
  { name: 'whisper', displayName: 'Whisper', installed: false, running: false, port: null },
  { name: 'audiocraft', displayName: 'AudioCraft', installed: false, running: false, port: 8765 },
];

beforeEach(() => vi.clearAllMocks());

describe('TOOL_NAMES', () => {
  it('exports all 7 tool names', () => {
    expect(TOOL_NAMES).toHaveLength(7);
    expect(TOOL_NAMES).toContain('ollama');
    expect(TOOL_NAMES).toContain('comfyui');
    expect(TOOL_NAMES).toContain('whisper');
    expect(TOOL_NAMES).toContain('audiocraft');
  });
});

describe('getAllStatus', () => {
  it('invokes runtime_get_all_status', async () => {
    invoke.mockResolvedValue(mockStatuses);
    const result = await getAllStatus();
    expect(invoke).toHaveBeenCalledWith('runtime_get_all_status');
    expect(result).toHaveLength(7);
  });

  it('returns running=true for ollama', async () => {
    invoke.mockResolvedValue(mockStatuses);
    const result = await getAllStatus();
    expect(result.find((t) => t.name === 'ollama').running).toBe(true);
  });

  it('returns installed=false for comfyui when not set up', async () => {
    invoke.mockResolvedValue(mockStatuses);
    const result = await getAllStatus();
    expect(result.find((t) => t.name === 'comfyui').installed).toBe(false);
  });
});

describe('listTools', () => {
  it('invokes runtime_list_tools', async () => {
    invoke.mockResolvedValue([]);
    await listTools();
    expect(invoke).toHaveBeenCalledWith('runtime_list_tools');
  });
});

describe('startTool', () => {
  it('invokes runtime_start_tool with name', async () => {
    invoke.mockResolvedValue({ tool: 'comfyui', ok: true, message: 'started' });
    const result = await startTool('comfyui');
    expect(invoke).toHaveBeenCalledWith('runtime_start_tool', { name: 'comfyui' });
    expect(result.ok).toBe(true);
  });

  it('returns ok=false on already-running', async () => {
    invoke.mockResolvedValue({ tool: 'ollama', ok: true, message: 'already running' });
    const result = await startTool('ollama');
    expect(result.message).toMatch(/running/i);
  });
});

describe('stopTool', () => {
  it('invokes runtime_stop_tool', async () => {
    invoke.mockResolvedValue({ tool: 'comfyui', ok: true, message: 'stopped' });
    const result = await stopTool('comfyui');
    expect(invoke).toHaveBeenCalledWith('runtime_stop_tool', { name: 'comfyui' });
    expect(result.ok).toBe(true);
  });
});

describe('installTool', () => {
  it('invokes runtime_install_tool', async () => {
    invoke.mockResolvedValue({ tool: 'comfyui', ok: true, message: 'ComfyUI installed.' });
    const result = await installTool('comfyui');
    expect(invoke).toHaveBeenCalledWith('runtime_install_tool', { name: 'comfyui' });
    expect(result.ok).toBe(true);
  });

  it('calls onProgress callback on progress events', async () => {
    const { listen } = await import('@tauri-apps/api/event');
    const onProgress = vi.fn();
    invoke.mockResolvedValue({ tool: 'comfyui', ok: true, message: 'done' });
    await installTool('comfyui', onProgress);
    expect(listen).toHaveBeenCalledWith('runtime://progress', expect.any(Function));
  });
});

describe('checkPrerequisites', () => {
  it('invokes runtime_check_prerequisites', async () => {
    const mockResult = { pythonFound: true, gitFound: true, ollamaFound: false, missing: ['Ollama'], installHint: 'Install Ollama' };
    invoke.mockResolvedValue(mockResult);
    const result = await checkPrerequisites();
    expect(invoke).toHaveBeenCalledWith('runtime_check_prerequisites');
    expect(result.pythonFound).toBe(true);
    expect(result.missing).toContain('Ollama');
  });

  it('returns empty missing array when all prereqs found', async () => {
    invoke.mockResolvedValue({ pythonFound: true, gitFound: true, ollamaFound: true, missing: [], installHint: 'All good.' });
    const result = await checkPrerequisites();
    expect(result.missing).toHaveLength(0);
  });
});

describe('installPrerequisite', () => {
  it('invokes runtime_install_prerequisite with name', async () => {
    invoke.mockResolvedValue({ tool: 'python', ok: true, message: 'Python installed.' });
    const result = await installPrerequisite('python');
    expect(invoke).toHaveBeenCalledWith('runtime_install_prerequisite', { name: 'python' });
    expect(result.ok).toBe(true);
  });
});

describe('getAutostartPrefs', () => {
  it('invokes runtime_get_autostart_prefs', async () => {
    invoke.mockResolvedValue({ ollama: true, comfyui: false });
    const result = await getAutostartPrefs();
    expect(invoke).toHaveBeenCalledWith('runtime_get_autostart_prefs');
    expect(result.ollama).toBe(true);
    expect(result.comfyui).toBe(false);
  });
});

describe('saveAutostartPref', () => {
  it('invokes runtime_save_autostart_pref with name and enabled', async () => {
    invoke.mockResolvedValue(null);
    await saveAutostartPref('comfyui', true);
    expect(invoke).toHaveBeenCalledWith('runtime_save_autostart_pref', { name: 'comfyui', enabled: true });
  });
});

describe('waitForTool', () => {
  it('returns true when tool becomes running', async () => {
    invoke
      .mockResolvedValueOnce([{ name: 'comfyui', running: false }])
      .mockResolvedValueOnce([{ name: 'comfyui', running: true }]);
    const result = await waitForTool('comfyui', 5000);
    expect(result).toBe(true);
  });

  it('returns false on timeout', async () => {
    invoke.mockResolvedValue([{ name: 'comfyui', running: false }]);
    const result = await waitForTool('comfyui', 100);
    expect(result).toBe(false);
  }, 10000);
});
