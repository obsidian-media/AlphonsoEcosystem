import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockInvoke = vi.fn();
const mockIsConnectorAuthenticated = vi.fn(() => ({ ok: true }));
const mockGetConnectorCredential = vi.fn(() => 'unused');
const mockGateConnectorAction = vi.fn(() => ({ ok: true, verificationState: 'verified' }));
const mockRequireConnectorApproval = vi.fn(() => Promise.resolve({ ok: true }));
const mockRequireConnectorReady = vi.fn(() => Promise.resolve({ ok: true }));
const mockGetConnectorCircuitState = vi.fn(() => ({ ok: true }));
const mockAppendConnectorAudit = vi.fn();
const mockAppendConnectorAuditEntry = vi.fn();
const mockRecordConnectorFailure = vi.fn();
const mockRecordConnectorSuccess = vi.fn();
const mockLogUnauthenticatedConnectorRequest = vi.fn(() => ({ ok: false, connectorId: 'youtube', blocked: true }));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args) => mockInvoke(...args)
}));

vi.mock('../../services/connectors/connectorAuth.js', () => ({
  isConnectorAuthenticated: (...args) => mockIsConnectorAuthenticated(...args),
  getConnectorCredential: (...args) => mockGetConnectorCredential(...args),
  logUnauthenticatedConnectorRequest: (...args) => mockLogUnauthenticatedConnectorRequest(...args)
}));

vi.mock('../../services/connectors/connectorRegistry.js', () => ({
  gateConnectorAction: (...args) => mockGateConnectorAction(...args),
  requireConnectorReady: (...args) => mockRequireConnectorReady(...args),
  requireConnectorApproval: (...args) => mockRequireConnectorApproval(...args),
  getConnectorCircuitState: (...args) => mockGetConnectorCircuitState(...args),
  appendConnectorAudit: (...args) => mockAppendConnectorAudit(...args),
  recordConnectorFailure: (...args) => mockRecordConnectorFailure(...args),
  recordConnectorSuccess: (...args) => mockRecordConnectorSuccess(...args)
}));

vi.mock('../../services/connectorAuditLogService', () => ({
  appendConnectorAuditEntry: (...args) => mockAppendConnectorAuditEntry(...args)
}));

describe('connectorOutbound youtube bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsConnectorAuthenticated.mockReturnValue({ ok: true });
    mockGetConnectorCircuitState.mockReturnValue({ ok: true });
    mockGateConnectorAction.mockReturnValue({ ok: true, verificationState: 'verified' });
    mockRequireConnectorApproval.mockResolvedValue({ ok: true });
    mockRequireConnectorReady.mockResolvedValue({ ok: true });
    mockInvoke.mockImplementation(async (command) => {
      if (command === 'check_env_vars_presence') {
        return { YOUTUBE_CLIENT_ID: true, YOUTUBE_CLIENT_SECRET: true };
      }
      if (command === 'connector_upload_youtube') {
        return {
          ok: true,
          connectorId: 'youtube',
          videoId: 'abc123',
          url: 'https://www.youtube.com/watch?v=abc123',
          trust: 'verified'
        };
      }
      return {};
    });
  });

  it('fails closed when the backend environment check reports missing credentials', async () => {
    const { uploadYouTubeConnectorVideo } = await import('../../services/connectors/connectorOutbound');
    mockInvoke.mockImplementationOnce(async (command) => {
      if (command === 'check_env_vars_presence') {
        return { YOUTUBE_CLIENT_ID: false, YOUTUBE_CLIENT_SECRET: false };
      }
      return {};
    });

    const result = await uploadYouTubeConnectorVideo({
      filePath: 'C:/tmp/video.mp4',
      title: 'Test video'
    });

    expect(result.ok).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.error).toContain('YOUTUBE_CLIENT_ID');
    expect(mockInvoke).toHaveBeenCalledWith('check_env_vars_presence', { names: ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET'] });
    expect(mockInvoke).not.toHaveBeenCalledWith('connector_upload_youtube', expect.anything());
  });

  it('invokes the Tauri command when the gate passes', async () => {
    const { uploadYouTubeConnectorVideo } = await import('../../services/connectors/connectorOutbound');

    const result = await uploadYouTubeConnectorVideo({
      filePath: 'C:/tmp/video.mp4',
      title: 'Test video',
      description: 'demo',
      tags: ['alpha', 'beta'],
      privacyStatus: 'unlisted'
    });

    expect(mockInvoke).toHaveBeenCalledWith('connector_upload_youtube', {
      filePath: 'C:/tmp/video.mp4',
      title: 'Test video',
      description: 'demo',
      tags: ['alpha', 'beta'],
      privacyStatus: 'unlisted'
    });
    expect(result.ok).toBe(true);
    expect(result.videoId).toBe('abc123');
    expect(result.url).toBe('https://www.youtube.com/watch?v=abc123');
    expect(mockRecordConnectorSuccess).toHaveBeenCalledWith('youtube', 'external_publish');
    expect(mockAppendConnectorAudit).toHaveBeenCalledWith('youtube', 'upload_success', expect.objectContaining({
      filePath: 'C:/tmp/video.mp4',
      title: 'Test video'
    }));
  });
});
