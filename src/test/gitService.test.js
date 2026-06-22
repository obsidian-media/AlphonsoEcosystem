import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../services/verificationService', () => ({
  verifyCommandExecution: vi.fn()
}));

import { verifyCommandExecution } from '../services/verificationService';
import { getGitLog, getGitStatus, gitRevert, gitRevertLast, gitDiffStat } from '../services/gitService';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getGitLog', () => {
  it('returns parsed commits on success', async () => {
    verifyCommandExecution.mockResolvedValue({
      payload: { stdout: 'abc123|Initial commit|2024-01-01T00:00:00Z\ndef456|Second commit|2024-01-02T00:00:00Z' }
    });
    const log = await getGitLog('/some/dir', 10);
    expect(log).toHaveLength(2);
    expect(log[0].hash).toBe('abc123');
    expect(log[0].subject).toBe('Initial commit');
  });

  it('returns [] when projectDir is missing', async () => {
    const log = await getGitLog(null);
    expect(log).toEqual([]);
    expect(verifyCommandExecution).not.toHaveBeenCalled();
  });

  it('returns [] when stdout is empty', async () => {
    verifyCommandExecution.mockResolvedValue({ payload: { stdout: '' } });
    const log = await getGitLog('/dir');
    expect(log).toEqual([]);
  });

  it('returns [] on thrown error', async () => {
    verifyCommandExecution.mockRejectedValue(new Error('git not found'));
    const log = await getGitLog('/dir');
    expect(log).toEqual([]);
  });
});

describe('getGitStatus', () => {
  it('returns clean: true when stdout is empty', async () => {
    verifyCommandExecution.mockResolvedValue({ payload: { stdout: '' } });
    const status = await getGitStatus('/dir');
    expect(status.clean).toBe(true);
    expect(status.files).toEqual([]);
  });

  it('returns dirty files when stdout has content', async () => {
    verifyCommandExecution.mockResolvedValue({ payload: { stdout: 'M  src/foo.js\nA  src/bar.js' } });
    const status = await getGitStatus('/dir');
    expect(status.clean).toBe(false);
    expect(status.files).toHaveLength(2);
    expect(status.files[0].path).toBe('src/foo.js');
  });

  it('returns null when projectDir is falsy', async () => {
    const status = await getGitStatus('');
    expect(status).toBeNull();
  });

  it('returns null on thrown error', async () => {
    verifyCommandExecution.mockRejectedValue(new Error('fail'));
    const status = await getGitStatus('/dir');
    expect(status).toBeNull();
  });
});

describe('gitRevert', () => {
  it('returns success: true when exit code is 0', async () => {
    verifyCommandExecution.mockResolvedValue({ payload: { exitCode: 0, stdout: 'Revert done' } });
    const result = await gitRevert('/dir', 'abc123');
    expect(result.success).toBe(true);
  });

  it('returns success: false when dir or hash is missing', async () => {
    const result = await gitRevert('', 'abc');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/missing/i);
  });

  it('returns success: false on thrown error', async () => {
    verifyCommandExecution.mockRejectedValue(new Error('conflict'));
    const result = await gitRevert('/dir', 'abc123');
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

describe('gitRevertLast', () => {
  it('returns success: false when projectDir is missing', async () => {
    const result = await gitRevertLast('');
    expect(result.success).toBe(false);
  });

  it('calls verifyCommandExecution with HEAD', async () => {
    verifyCommandExecution.mockResolvedValue({ payload: { exitCode: 0, stdout: '' } });
    await gitRevertLast('/dir');
    expect(verifyCommandExecution).toHaveBeenCalledWith('git', ['revert', 'HEAD', '--no-edit'], '/dir');
  });
});

describe('gitDiffStat', () => {
  it('returns stdout string on success', async () => {
    verifyCommandExecution.mockResolvedValue({ payload: { stdout: '3 files changed' } });
    const result = await gitDiffStat('/dir', 'abc', 'def');
    expect(result).toBe('3 files changed');
  });

  it('returns null when projectDir is falsy', async () => {
    const result = await gitDiffStat('', 'a', 'b');
    expect(result).toBeNull();
  });

  it('returns null on thrown error', async () => {
    verifyCommandExecution.mockRejectedValue(new Error('fail'));
    const result = await gitDiffStat('/dir');
    expect(result).toBeNull();
  });
});
