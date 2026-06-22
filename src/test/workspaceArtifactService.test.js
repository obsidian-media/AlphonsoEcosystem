import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn()
}));

import { invoke } from '@tauri-apps/api/core';
import { writeWorkspaceArtifact, writeHandoffArtifact } from '../services/workspaceArtifactService';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('writeWorkspaceArtifact', () => {
  it('calls invoke with write_workspace_text_file and correct args', async () => {
    invoke.mockResolvedValue(undefined);
    await writeWorkspaceArtifact({ workspaceRoot: '/ws', relativePath: 'src/foo.js', content: 'hello' });
    expect(invoke).toHaveBeenCalledWith('write_workspace_text_file', {
      workspaceRoot: '/ws',
      relativePath: 'src/foo.js',
      content: 'hello'
    });
  });

  it('coerces undefined workspaceRoot to empty string', async () => {
    invoke.mockResolvedValue(undefined);
    await writeWorkspaceArtifact({ workspaceRoot: undefined, relativePath: 'a.txt', content: 'x' });
    const args = invoke.mock.calls[0][1];
    expect(args.workspaceRoot).toBe('');
  });

  it('coerces undefined content to empty string', async () => {
    invoke.mockResolvedValue(undefined);
    await writeWorkspaceArtifact({ workspaceRoot: '/ws', relativePath: 'a.txt', content: undefined });
    const args = invoke.mock.calls[0][1];
    expect(args.content).toBe('');
  });

  it('forwards invoke result to the caller', async () => {
    invoke.mockResolvedValue('file-written');
    const result = await writeWorkspaceArtifact({ workspaceRoot: '/ws', relativePath: 'x.txt', content: 'data' });
    expect(result).toBe('file-written');
  });

  it('propagates invoke errors', async () => {
    invoke.mockRejectedValue(new Error('disk full'));
    await expect(
      writeWorkspaceArtifact({ workspaceRoot: '/ws', relativePath: 'x.txt', content: 'data' })
    ).rejects.toThrow('disk full');
  });
});

describe('writeHandoffArtifact', () => {
  it('calls invoke with write_handoff_export_file and correct args', async () => {
    invoke.mockResolvedValue(undefined);
    await writeHandoffArtifact({ workspaceRoot: '/ws', fileName: 'handoff.json', content: '{}' });
    expect(invoke).toHaveBeenCalledWith('write_handoff_export_file', {
      workspaceRoot: '/ws',
      fileName: 'handoff.json',
      content: '{}'
    });
  });

  it('coerces undefined fileName to empty string', async () => {
    invoke.mockResolvedValue(undefined);
    await writeHandoffArtifact({ workspaceRoot: '/ws', fileName: undefined, content: 'c' });
    const args = invoke.mock.calls[0][1];
    expect(args.fileName).toBe('');
  });

  it('forwards invoke result to caller', async () => {
    invoke.mockResolvedValue('ok');
    const result = await writeHandoffArtifact({ workspaceRoot: '/ws', fileName: 'f.json', content: 'c' });
    expect(result).toBe('ok');
  });
});
