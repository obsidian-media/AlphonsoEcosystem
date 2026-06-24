import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/verificationService', () => ({
  verifyCommandExecution: vi.fn(),
}));

const store = {};
vi.stubGlobal('localStorage', {
  getItem: vi.fn((k) => store[k] ?? null),
  setItem: vi.fn((k, v) => { store[k] = v; }),
  removeItem: vi.fn((k) => { delete store[k]; }),
});

import { getAutoRunEnabled, setAutoRunEnabled, autoRunDevServer } from '../services/autoRunService';
import { verifyCommandExecution } from '../services/verificationService';

describe('autoRunService', () => {
  beforeEach(() => {
    Object.keys(store).forEach((k) => delete store[k]);
    vi.clearAllMocks();
  });

  it('defaults to enabled', () => {
    expect(getAutoRunEnabled()).toBe(true);
  });

  it('setAutoRunEnabled persists to localStorage', () => {
    setAutoRunEnabled(false);
    expect(store['alphonso_auto_run_v1']).toBe('false');
    expect(getAutoRunEnabled()).toBe(false);
  });

  it('setAutoRunEnabled true re-enables', () => {
    setAutoRunEnabled(false);
    setAutoRunEnabled(true);
    expect(getAutoRunEnabled()).toBe(true);
  });

  it('autoRunDevServer returns null when disabled', async () => {
    setAutoRunEnabled(false);
    const result = await autoRunDevServer('/some/dir');
    expect(result).toBeNull();
    expect(verifyCommandExecution).not.toHaveBeenCalled();
  });

  it('autoRunDevServer returns null when no projectDir', async () => {
    const result = await autoRunDevServer(null);
    expect(result).toBeNull();
  });

  it('autoRunDevServer calls verifyCommandExecution when enabled', async () => {
    verifyCommandExecution.mockResolvedValue({ payload: { success: true, exitCode: 0, stdout: 'http://localhost:5173', stderr: '' } });
    const result = await autoRunDevServer('/project');
    expect(verifyCommandExecution).toHaveBeenCalledWith('npm', ['run', 'dev'], '/project');
    expect(result.success).toBe(true);
    expect(result.url).toBe('http://localhost:5173');
  });

  it('autoRunDevServer returns null on error', async () => {
    verifyCommandExecution.mockRejectedValue(new Error('spawn error'));
    const result = await autoRunDevServer('/project');
    expect(result).toBeNull();
  });
});
