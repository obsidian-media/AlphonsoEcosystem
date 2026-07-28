import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetAllStatus = vi.fn();

vi.mock('../../services/runtimeManagerService', () => ({
  getAllStatus: (...args: unknown[]) => mockGetAllStatus(...args),
}));

describe('comfyuiSettingsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it('returns empty string when no runtime directory is available', async () => {
    mockGetAllStatus.mockResolvedValue([
      { name: 'ollama', installed: true, installDir: 'D:\\Alphonso\\runtimes\\ollama' },
      { name: 'comfyui', installed: false, installDir: 'D:\\Alphonso\\runtimes\\comfyui' },
    ]);
    const { resolveComfyuiDirectory } = await import('../../services/comfyuiSettingsService');
    const result = await resolveComfyuiDirectory(null);
    expect(result).toBe('');
  });
});
