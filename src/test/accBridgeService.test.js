import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/workspaceArtifactService', () => ({
  writeWorkspaceArtifact: vi.fn(async () => ({ ok: true }))
}));

import {
  getAccBridgeStatus,
  resetAccBridgeConfig,
  sendTaskToACC,
  updateAccBridgeConfig
} from '../services/agentWorkshop/accBridgeService';

beforeEach(() => {
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
});
