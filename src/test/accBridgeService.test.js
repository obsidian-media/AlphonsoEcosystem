import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/workspaceArtifactService', () => ({
  writeWorkspaceArtifact: vi.fn(async () => ({ ok: true }))
}));

const mockInvoke = vi.fn(async () => { throw new Error('not in the desktop app'); });
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args) => mockInvoke(...args) }));

import {
  checkAccBridge,
  getAccBridgeStatus,
  refreshAccBridgeStatus,
  resetAccBridgeConfig,
  sendTaskToACC,
  updateAccBridgeConfig
} from '../services/agentWorkshop/accBridgeService';

beforeEach(() => {
  mockInvoke.mockReset();
  mockInvoke.mockImplementation(async () => { throw new Error('not in the desktop app'); });
  localStorage.clear();
  resetAccBridgeConfig();
  vi.unstubAllGlobals();
});

describe('acc bridge service', () => {
  it('keeps packets local when the bridge is not configured', async () => {
    const result = await sendTaskToACC({
      id: 'content_001',
      requestId: 'acc_001',
      kind: 'task'
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe('setup_required');
    expect(result.packet.kind).toBe('task');
    expect(getAccBridgeStatus().status).toBe('setup_required');
  });

  it('posts packets to the configured ACC bridge', async () => {
    updateAccBridgeConfig({
      enabled: true,
      baseUrl: 'http://acc.local',
      pathPrefix: '/api/alphonso-bridge',
      token: 'bridge-token',
      timeoutMs: 2500
    });

    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true, received: true })
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendTaskToACC({
      id: 'content_002',
      requestId: 'acc_002',
      kind: 'task'
    }, {
      workspaceRoot: 'C:/tmp'
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://acc.local/api/alphonso-bridge',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer bridge-token',
          'Content-Type': 'application/json'
        })
      })
    );
    expect(result.ok).toBe(true);
    expect(result.status).toBe('synced');
    expect(result.response).toEqual({ ok: true, received: true });
  });

  // QA Bug 64 (2026-10-22): the backend read only environment variables, so a
  // bridge set up in Settings always failed there.
  describe('Settings reach the backend', () => {
    const settings = { enabled: true, baseUrl: 'http://localhost:4000/', pathPrefix: '/api/alphonso-bridge', token: 'bridge-token', timeoutMs: 2500 };

    it('passes the saved address and token when sending a packet', async () => {
      updateAccBridgeConfig(settings);
      mockInvoke.mockResolvedValue({ success: true, httpStatus: 200, status: 'synced' });
      const result = await sendTaskToACC({ id: 'content_002', kind: 'task' });
      expect(result.ok).toBe(true);
      const [command, args] = mockInvoke.mock.calls[0];
      expect(command).toBe('alphonso_bridge_send_packet');
      expect(args).toMatchObject({ baseUrl: 'http://localhost:4000', token: 'bridge-token', pathPrefix: '/api/alphonso-bridge', timeoutMs: 2500 });
    });

    it('asks the backend about the saved settings, and reports off when turned off', async () => {
      updateAccBridgeConfig(settings);
      mockInvoke.mockResolvedValue({ configured: true, status: 'configured', baseUrlConfigured: true, tokenConfigured: true, pathPrefix: '/api/alphonso-bridge' });
      expect((await refreshAccBridgeStatus()).status).toBe('configured');
      expect(mockInvoke.mock.calls[0][1]).toMatchObject({ baseUrl: 'http://localhost:4000', token: 'bridge-token' });
      updateAccBridgeConfig({ enabled: false });
      mockInvoke.mockClear();
      expect((await refreshAccBridgeStatus()).configured).toBe(false);
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it("Test asks ACC itself and names a wrong token", async () => {
      updateAccBridgeConfig(settings);
      mockInvoke.mockResolvedValue({ ok: false, reachable: true, httpStatus: 401, status: 'unauthorized' });
      expect((await checkAccBridge()).status).toBe('unauthorized');
      expect(mockInvoke.mock.calls[0][0]).toBe('alphonso_bridge_check');
    });

    it('Test falls back to the window outside the desktop app', async () => {
      updateAccBridgeConfig(settings);
      const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }));
      vi.stubGlobal('fetch', fetchMock);
      expect((await checkAccBridge()).status).toBe('connected');
      expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:4000/api/alphonso-bridge/status');
      expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer bridge-token');
    });
  });
});
