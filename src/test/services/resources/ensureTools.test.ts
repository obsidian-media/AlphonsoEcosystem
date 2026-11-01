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

const startHermesTool = vi.fn();
vi.mock('../../../services/hermes/hermesTools', () => ({
  isHermesTool: (name: string) => name.startsWith('hermes:'),
  startHermesTool: (...a: unknown[]) => startHermesTool(...a),
}));

import { ensureTools, COMFY_START_WAIT_MS } from '../../../services/resources/ensureTools';

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
  it('starts a Hermes profile through its own path, and passes on why it failed (Hermes gateway)', async () => {
    getAllStatus.mockResolvedValue([status('ollama', { running: true })]);
    startHermesTool.mockResolvedValueOnce({ ok: true });
    expect(await ensureTools(['hermes:hector', 'ollama'])).toEqual({ ok: true });
    expect(startHermesTool).toHaveBeenCalledWith('hermes:hector');
    expect(startTool).not.toHaveBeenCalled();
    startHermesTool.mockResolvedValueOnce({ ok: false, reason: "Hector's Hermes profile didn't start. Open Runtime Hub to see its log." });
    expect(await ensureTools(['hermes:hector'])).toEqual({ ok: false, reason: "Hector's Hermes profile didn't start. Open Runtime Hub to see its log." });
  });

  it('starts a stopped Alphonso ComfyUI and waits for it', async () => {
    getAllStatus.mockResolvedValue([status('comfyui')]);
    expect(await ensureTools(['comfyui'])).toEqual({ ok: true });
    expect(startTool).toHaveBeenCalledWith('comfyui');
    expect(waitForTool).toHaveBeenCalledWith('comfyui', COMFY_START_WAIT_MS);
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
    expect(waitForTool).toHaveBeenCalledWith('comfyui', COMFY_START_WAIT_MS);
  });

  // 2.11.0 QA (owner, 2026-11-01): Alphonso's old copy crashed at start (a missing library) and
  // had no image models; Start ran it instead of the ComfyUI chosen in Settings.
  const ownCopy = { path: 'C:/Alphonso/runtimes/comfyui', python: 'C:/Alphonso/runtimes/comfyui/venv/python.exe', running: false, sources: ['alphonso'], checkpoints: 0, alphonsoCopy: true };
  const mine = { path: 'D:/Programs/comfyui/ComfyUI', python: 'D:/Programs/comfyui/venv/python.exe', running: false, sources: ['settings'], checkpoints: 3, alphonsoCopy: false };

  it("starts the ComfyUI chosen in Settings, not Alphonso's own copy", async () => {
    localStorage.setItem('alphonso_settings', JSON.stringify({ comfyuiDir: mine.path }));
    getAllStatus.mockResolvedValue([status('comfyui')]);
    findComfyuiInstalls.mockResolvedValue([ownCopy, mine]);
    expect(await ensureTools(['comfyui'])).toEqual({ ok: true });
    expect(findComfyuiInstalls).toHaveBeenCalledWith(mine.path);
    expect(invoke).toHaveBeenCalledWith('launch_comfyui', { comfyuiDir: mine.path, pythonExe: mine.python });
    expect(startTool).not.toHaveBeenCalled();
  });

  it('with nothing chosen, an install with image models wins over a copy with none', async () => {
    getAllStatus.mockResolvedValue([status('comfyui')]);
    findComfyuiInstalls.mockResolvedValue([ownCopy, { ...mine, sources: ['usual-place'] }]);
    expect(await ensureTools(['comfyui'])).toEqual({ ok: true });
    expect(invoke).toHaveBeenCalledWith('launch_comfyui', { comfyuiDir: mine.path, pythonExe: mine.python });
    expect(startTool).not.toHaveBeenCalled();
  });

  it('waits long enough for a first start (130 s seen on a real computer)', () => {
    expect(COMFY_START_WAIT_MS).toBeGreaterThanOrEqual(180_000);
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

  // QA, 2026-10-31: refusing here failed a step before it could say it itself, and failed Music,
  // which is optional and skips itself without AudioCraft. The step's own message wins (Kokoro:
  // "Install Kokoro in Runtime Hub."; ffmpeg: the backend's, with Homebrew on a Mac).
  it('never starts or refuses the tools a step runs itself: the step says what it needs', async () => {
    getAllStatus.mockResolvedValue([status('kokoro'), status('audiocraft'), status('whisper')]);
    media.kokoro = false;
    media.audiocraft = false;
    media.ffmpeg = null;
    expect(await ensureTools(['ffmpeg', 'kokoro', 'audiocraft', 'whisper'])).toEqual({ ok: true });
    expect(startTool).not.toHaveBeenCalled();
  });

  it("when the tool list or the media check can't be read, nothing is started and nothing fails", async () => {
    getAllStatus.mockResolvedValue([]);
    invoke.mockRejectedValue(new Error('no backend'));
    expect(await ensureTools(['ollama', 'kokoro'])).toEqual({ ok: true });
    expect(startTool).not.toHaveBeenCalled();
  });

  it('nothing needed is fine', async () => {
    expect(await ensureTools([])).toEqual({ ok: true });
    expect(getAllStatus).not.toHaveBeenCalled();
  });
});
