// Resource manager Task 7: start an installed tool when a step needs it.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getAllStatus = vi.fn();
const startTool = vi.fn();
const waitForTool = vi.fn();
vi.mock('../../../services/runtimeManagerService', () => ({
  getAllStatus: (...a: unknown[]) => getAllStatus(...a),
  startTool: (...a: unknown[]) => startTool(...a),
  waitForTool: (...a: unknown[]) => waitForTool(...a),
}));
const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }));
const findComfyuiInstalls = vi.fn();
vi.mock('../../../services/comfyuiSettingsService', () => ({ findComfyuiInstalls: (...a: unknown[]) => findComfyuiInstalls(...a) }));

import { ensureTools } from '../../../services/resources/ensureTools';

function status(name: string, over: Record<string, unknown> = {}) {
  const labels: Record<string, string> = { comfyui: 'ComfyUI', ollama: 'Ollama', kokoro: 'Kokoro', audiocraft: 'AudioCraft', whisper: 'Whisper' };
  return { name, displayName: labels[name] ?? name, running: false, installed: true, ...over };
}

let media: Record<string, unknown>;
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  media = { ffmpeg: 'C:/ffmpeg.exe', ffprobe: 'C:/ffprobe.exe', kokoro: true, audiocraft: true, whisper: true };
  invoke.mockImplementation(async (cmd: string) => {
    if (cmd === 'media_tools_status') return media;
    if (cmd === 'launch_comfyui') return { message: 'started' };
    throw new Error(cmd);
  });
  startTool.mockResolvedValue({ ok: true, message: 'started' });
  waitForTool.mockResolvedValue(true);
  findComfyuiInstalls.mockResolvedValue([]);
});

describe('ensureTools', () => {
  it('starts a stopped Alphonso ComfyUI and waits for it', async () => {
    getAllStatus.mockResolvedValue([status('comfyui')]);
    expect(await ensureTools(['comfyui'])).toEqual({ ok: true });
    expect(startTool).toHaveBeenCalledWith('comfyui');
    expect(waitForTool).toHaveBeenCalledWith('comfyui', 60_000);
  });

  it('does not start one already running', async () => {
    getAllStatus.mockResolvedValue([status('comfyui', { running: true }), status('ollama', { running: true })]);
    expect(await ensureTools(['comfyui', 'ollama'])).toEqual({ ok: true });
    expect(startTool).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalledWith('launch_comfyui', expect.anything());
  });

  it('starts your own ComfyUI the way Runtime Hub does when Alphonso has none', async () => {
    getAllStatus.mockResolvedValue([status('comfyui', { installed: false })]);
    findComfyuiInstalls.mockResolvedValue([{ path: 'D:/Comfy', python: 'D:/Comfy/.venv/python.exe', running: false, sources: ['usual-place'], checkpoints: 1, alphonsoCopy: false }]);
    expect(await ensureTools(['comfyui'])).toEqual({ ok: true });
    expect(invoke).toHaveBeenCalledWith('launch_comfyui', { comfyuiDir: 'D:/Comfy', pythonExe: 'D:/Comfy/.venv/python.exe' });
    expect(startTool).not.toHaveBeenCalled();
    expect(waitForTool).toHaveBeenCalledWith('comfyui', 60_000);
  });

  it('says what to install when there is no ComfyUI', async () => {
    getAllStatus.mockResolvedValue([status('comfyui', { installed: false })]);
    expect(await ensureTools(['comfyui'])).toEqual({ ok: false, reason: "ComfyUI isn't installed. Install it in Runtime Hub." });
  });

  it('says so when a tool did not start in time', async () => {
    getAllStatus.mockResolvedValue([status('ollama')]);
    waitForTool.mockResolvedValue(false);
    expect(await ensureTools(['ollama'])).toEqual({ ok: false, reason: "Ollama didn't start. Open Runtime Hub to see its log." });
  });

  it('never starts the tools a step runs itself, only checks they are installed', async () => {
    getAllStatus.mockResolvedValue([status('kokoro'), status('audiocraft'), status('whisper')]);
    expect(await ensureTools(['ffmpeg', 'kokoro', 'audiocraft', 'whisper'])).toEqual({ ok: true });
    expect(startTool).not.toHaveBeenCalled();
    media.kokoro = false;
    expect(await ensureTools(['kokoro'])).toEqual({ ok: false, reason: "Kokoro isn't installed. Install it in Runtime Hub." });
    media.ffmpeg = null;
    expect(await ensureTools(['ffmpeg'])).toEqual({ ok: false, reason: "ffmpeg wasn't found on this computer, so the video can't be put together." });
  });

  it('nothing needed is fine', async () => {
    expect(await ensureTools([])).toEqual({ ok: true });
    expect(getAllStatus).not.toHaveBeenCalled();
  });
});
