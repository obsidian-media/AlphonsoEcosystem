import { describe, it, expect, vi, beforeEach } from 'vitest';

// QA Bug 31 (2026-10-22): ComfyUI folders now come from the backend's
// comfyui_find_installs (running ComfyUIs, the folder chosen in Settings,
// Alphonso's own copy, usual places), not a list of one machine's folders.

const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

const install = (path: string, extra: Record<string, unknown> = {}) => ({
  path, python: `${path}\\..\\venv\\Scripts\\python.exe`, running: false, sources: ['usual-place'], checkpoints: 0, alphonsoCopy: false, ...extra,
});

describe('comfyuiSettingsService', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it('keeps the folder chosen in Settings when it is still a ComfyUI install', async () => {
    mockInvoke.mockImplementation(async (cmd: string) => cmd === 'comfyui_find_installs'
      ? [install('D:\\Running\\ComfyUI', { running: true }), install('E:\\Mine\\ComfyUI', { sources: ['settings'] })]
      : []);
    const { resolveComfyuiDirectory } = await import('../../services/comfyuiSettingsService');
    expect(await resolveComfyuiDirectory('E:\\Mine\\ComfyUI\\')).toBe('E:\\Mine\\ComfyUI');
    expect(mockInvoke).toHaveBeenCalledWith('comfyui_find_installs', { savedDir: 'E:\\Mine\\ComfyUI\\' });
  });

  it('accepts a saved folder that holds ComfyUI one level down', async () => {
    mockInvoke.mockResolvedValue([install('E:\\Portable\\ComfyUI')]);
    const { resolveComfyuiDirectory } = await import('../../services/comfyuiSettingsService');
    expect(await resolveComfyuiDirectory('E:\\Portable')).toBe('E:\\Portable\\ComfyUI');
  });

  it('uses the best install found when nothing is saved, or the saved one is gone', async () => {
    mockInvoke.mockResolvedValue([install('D:\\Running\\ComfyUI', { running: true }), install('C:\\Users\\x\\Documents\\ComfyUI')]);
    const { resolveComfyuiDirectory } = await import('../../services/comfyuiSettingsService');
    expect(await resolveComfyuiDirectory('')).toBe('D:\\Running\\ComfyUI');
    expect(await resolveComfyuiDirectory('Z:\\Deleted')).toBe('D:\\Running\\ComfyUI');
  });

  it('returns empty when no ComfyUI is found, or outside the desktop app', async () => {
    mockInvoke.mockResolvedValue([]);
    const { resolveComfyuiDirectory } = await import('../../services/comfyuiSettingsService');
    expect(await resolveComfyuiDirectory('')).toBe('');
    mockInvoke.mockRejectedValue(new Error('not in Tauri'));
    expect(await resolveComfyuiDirectory('')).toBe('');
  });

  it("keeps a Python path the user set, else uses the one found next to the install", async () => {
    mockInvoke.mockImplementation(async (cmd: string, args: { paths?: string[] }) => {
      if (cmd === 'verify_paths') return [{ exists: args.paths?.[0] === 'C:\\Custom\\python.exe', is_dir: false }];
      if (cmd === 'comfyui_find_installs') return [install('D:\\Mine\\ComfyUI', { python: 'D:\\Mine\\venv\\Scripts\\python.exe' })];
      return null;
    });
    const { resolveComfyuiPython } = await import('../../services/comfyuiSettingsService');
    expect(await resolveComfyuiPython('C:\\Custom\\python.exe', 'D:\\Mine\\ComfyUI')).toBe('C:\\Custom\\python.exe');
    expect(await resolveComfyuiPython('python', 'D:\\Mine\\ComfyUI')).toBe('D:\\Mine\\venv\\Scripts\\python.exe');
    expect(await resolveComfyuiPython('', 'D:\\Other')).toBe('');
  });
});
