import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/moduleRegistryService', () => ({
  listModules: vi.fn(() => [])
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(null),
  isTauri: vi.fn().mockReturnValue(false)
}));

import { listModulesRemote, runModule, getRunStatus, publishEvent } from '../../services/runtimeApiService';

describe('runtimeApiService', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  describe('listModulesRemote', () => {
    it('returns local modules when bridge offline', async () => {
      const mockFetch = vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
      const result = await listModulesRemote();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('runModule', () => {
    it('returns runId on success', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ runId: 'run-123' })
      }));

      const result = await runModule('mod-1', { input: 'test' });
      expect((result as { runId: string }).runId).toBe('run-123');
    });

    it('returns error on bridge failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 500
      }));

      const result = await runModule('mod-1', {});
      expect(result).toHaveProperty('error');
    });
  });

  describe('getRunStatus', () => {
    it('returns status on success', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ status: 'running', logs: [] })
      }));

      const result = await getRunStatus('run-123');
      expect((result as { status: string }).status).toBe('running');
    });
  });

  describe('publishEvent', () => {
    it('posts to bridge', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn()
      });
      vi.stubGlobal('fetch', mockFetch);

      await publishEvent('test.event', { data: 1 });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/events/publish'),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });
});