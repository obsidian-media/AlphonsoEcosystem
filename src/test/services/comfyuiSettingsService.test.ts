import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetAllStatus = vi.fn();
const mockInvoke = vi.fn();

vi.mock('../../services/runtimeManagerService', () => ({
  getAllStatus: (...args: unknown[]) => mockGetAllStatus(...args),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

describe('comfyuiSettingsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllStatus.mockReset();
    mockGetAllStatus.mockResolvedValue([]);
    mockInvoke.mockImplementation(async (_cmd: string, args: { paths?: string[] }) => {
      const path = String(args?.paths?.[0] || '');
      if (path === 'D:\\ComfyUI\\main.py') return [{ exists: true, is_dir: false }];
      if (path === 'D:\\ComfyUI\\.venv\\Scripts\\python.exe') return [{ exists: true, is_dir: false }];
      if (path === 'D:\\Comfy-Desktop\\ComfyUI-Installs\\ComfyUI\\main.py') return [{ exists: false, is_dir: false }];
      if (path === 'D:\\Comfy-Desktop\\ComfyUI-Installs\\ComfyUI\\ComfyUI\\main.py') return [{ exists: true, is_dir: false }];
      if (path === 'D:\\Comfy-Desktop\\ComfyUI-Installs\\ComfyUI\\ComfyUI\\.venv\\Scripts\\python.exe') return [{ exists: true, is_dir: false }];
      if (path === 'D:\\Comfy-Desktop\\main.py') return [{ exists: false, is_dir: false }];
      if (path === 'C:\\Users\\Shaya\\ComfyUI-Installs\\ComfyUI\\main.py') return [{ exists: false, is_dir: false }];
      if (path === 'C:\\Users\\Shaya\\ComfyUI-Installs\\ComfyUI\\ComfyUI\\main.py') return [{ exists: true, is_dir: false }];
      if (path === 'C:\\Users\\Shaya\\ComfyUI-Installs\\ComfyUI\\ComfyUI\\.venv\\Scripts\\python.exe') return [{ exists: true, is_dir: false }];
      if (path === 'C:\\Comfy-Desktop\\ComfyUI\\main.py') return [{ exists: true, is_dir: false }];
      if (path === 'C:\\Comfy-Desktop\\ComfyUI-Installs\\ComfyUI\\main.py') return [{ exists: false, is_dir: false }];
      if (path === 'C:\\Comfy-Desktop\\ComfyUI-Installs\\ComfyUI\\ComfyUI\\main.py') return [{ exists: false, is_dir: false }];
      if (path === 'C:\\Comfy-Desktop\\main.py') return [{ exists: false, is_dir: false }];
      if (path === 'D:\\Alphonso\\runtimes\\comfyui\\main.py') return [{ exists: true, is_dir: false }];
      if (path === 'D:\\Alphonso\\runtimes\\comfyui\\.venv\\Scripts\\python.exe') return [{ exists: true, is_dir: false }];
      if (path === 'C:\\Custom\\python.exe') return [{ exists: true, is_dir: false }];
      return [{ exists: false, is_dir: false }];
    });
  });

  it('returns the current ComfyUI directory when already set', async () => {
    const { resolveComfyuiDirectory } = await import('../../services/comfyuiSettingsService');
    const result = await resolveComfyuiDirectory('D:\\ComfyUI');
    expect(result).toBe('D:\\ComfyUI');
    expect(mockGetAllStatus).not.toHaveBeenCalled();
  });

  it('seeds the directory from an installed runtime manager entry', async () => {
    mockGetAllStatus.mockResolvedValue([
      { name: 'ollama', installed: true, installDir: 'D:\\Alphonso\\runtimes\\ollama' },
      { name: 'comfyui', installed: true, installDir: 'D:\\Alphonso\\runtimes\\comfyui ' },
    ]);
    const { resolveComfyuiDirectory } = await import('../../services/comfyuiSettingsService');
    const result = await resolveComfyuiDirectory('');
    expect(mockGetAllStatus).toHaveBeenCalledTimes(1);
    expect(result).toBe('D:\\Alphonso\\runtimes\\comfyui');
  });

  it('normalizes the D:\\Comfy-Desktop container to the nested ComfyUI runtime root', async () => {
    const { resolveComfyuiDirectory } = await import('../../services/comfyuiSettingsService');
    const result = await resolveComfyuiDirectory('D:\\Comfy-Desktop');
    expect(result).toBe('D:\\Comfy-Desktop\\ComfyUI-Installs\\ComfyUI\\ComfyUI');
  });

  it('normalizes the C:\\Comfy-Desktop container to the nested ComfyUI runtime root', async () => {
    const { resolveComfyuiDirectory } = await import('../../services/comfyuiSettingsService');
    const result = await resolveComfyuiDirectory('C:\\Comfy-Desktop');
    expect(result).toBe('C:\\Comfy-Desktop\\ComfyUI');
  });

  it('returns empty string when no runtime directory is available', async () => {
    mockGetAllStatus.mockResolvedValue([
      { name: 'ollama', installed: true, installDir: 'D:\\Alphonso\\runtimes\\ollama' },
      { name: 'comfyui', installed: false, installDir: 'D:\\Alphonso\\runtimes\\comfyui' },
    ]);
    mockInvoke.mockImplementation(async () => [{ exists: false, is_dir: false }]);
    const { resolveComfyuiDirectory } = await import('../../services/comfyuiSettingsService');
    const result = await resolveComfyuiDirectory(null);
    expect(result).toBe('');
  });

  it('falls back to the Shaya install path when that is the discoverable runtime root', async () => {
    mockInvoke.mockImplementation(async (_cmd: string, args: { paths?: string[] }) => {
      const path = String(args?.paths?.[0] || '');
      if (path === 'C:\\Users\\Shaya\\ComfyUI-Installs\\ComfyUI\\main.py') return [{ exists: false, is_dir: false }];
      if (path === 'C:\\Users\\Shaya\\ComfyUI-Installs\\ComfyUI\\ComfyUI\\main.py') return [{ exists: true, is_dir: false }];
      return [{ exists: false, is_dir: false }];
    });
    const { resolveComfyuiDirectory } = await import('../../services/comfyuiSettingsService');
    const result = await resolveComfyuiDirectory('');
    expect(result).toBe('C:\\Users\\Shaya\\ComfyUI-Installs\\ComfyUI\\ComfyUI');
  });

  it('resolves the bundled ComfyUI python from the discovered runtime directory', async () => {
    const { resolveComfyuiPython } = await import('../../services/comfyuiSettingsService');
    const result = await resolveComfyuiPython('python', 'D:\\Comfy-Desktop\\ComfyUI-Installs\\ComfyUI\\ComfyUI');
    expect(result).toBe('D:\\Comfy-Desktop\\ComfyUI-Installs\\ComfyUI\\ComfyUI\\.venv\\Scripts\\python.exe');
  });

  it('keeps an explicit custom python path when it already exists', async () => {
    const { resolveComfyuiPython } = await import('../../services/comfyuiSettingsService');
    const result = await resolveComfyuiPython('C:\\Custom\\python.exe', 'D:\\ComfyUI');
    expect(result).toBe('C:\\Custom\\python.exe');
  });
});
