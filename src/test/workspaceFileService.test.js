import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  readWorkspaceFile,
  deleteWorkspaceFile,
  moveWorkspaceFile,
  searchWorkspaceFiles,
  listWorkspaceDirectory,
  getWorkspaceTree
} from '../services/workspaceFileService';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args) => mockInvoke(...args) }));

beforeEach(() => {
  vi.clearAllMocks();
});

// ── readWorkspaceFile ─────────────────────────────────────────────────────────

describe('readWorkspaceFile', () => {
  it('calls invoke with read_workspace_file and correct args', async () => {
    mockInvoke.mockResolvedValueOnce({ content: 'file content' });
    const result = await readWorkspaceFile({ workspaceRoot: '/root', relativePath: 'src/App.jsx' });
    expect(mockInvoke).toHaveBeenCalledWith('read_workspace_file', {
      workspaceRoot: '/root',
      relativePath: 'src/App.jsx'
    });
    expect(result).toEqual({ content: 'file content' });
  });

  it('propagates errors from invoke', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('File not found'));
    await expect(readWorkspaceFile({ workspaceRoot: '/root', relativePath: 'missing.txt' })).rejects.toThrow('File not found');
  });

  it('handles empty relativePath', async () => {
    mockInvoke.mockResolvedValueOnce({ content: '' });
    await readWorkspaceFile({ workspaceRoot: '/root', relativePath: '' });
    expect(mockInvoke).toHaveBeenCalledWith('read_workspace_file', { workspaceRoot: '/root', relativePath: '' });
  });
});

// ── deleteWorkspaceFile ───────────────────────────────────────────────────────

describe('deleteWorkspaceFile', () => {
  it('calls invoke with delete_workspace_file and correct args', async () => {
    mockInvoke.mockResolvedValueOnce({ deleted: true });
    const result = await deleteWorkspaceFile({ workspaceRoot: '/root', relativePath: 'old.txt' });
    expect(mockInvoke).toHaveBeenCalledWith('delete_workspace_file', {
      workspaceRoot: '/root',
      relativePath: 'old.txt'
    });
    expect(result).toEqual({ deleted: true });
  });

  it('propagates deletion errors', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('Permission denied'));
    await expect(deleteWorkspaceFile({ workspaceRoot: '/root', relativePath: 'readonly.txt' })).rejects.toThrow('Permission denied');
  });
});

// ── moveWorkspaceFile ─────────────────────────────────────────────────────────

describe('moveWorkspaceFile', () => {
  it('calls invoke with move_workspace_file and correct args', async () => {
    mockInvoke.mockResolvedValueOnce({ moved: true });
    const result = await moveWorkspaceFile({
      workspaceRoot: '/root',
      fromRelative: 'src/old.js',
      toRelative: 'src/new.js'
    });
    expect(mockInvoke).toHaveBeenCalledWith('move_workspace_file', {
      workspaceRoot: '/root',
      fromRelative: 'src/old.js',
      toRelative: 'src/new.js'
    });
    expect(result).toEqual({ moved: true });
  });

  it('propagates move errors', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('Source not found'));
    await expect(moveWorkspaceFile({ workspaceRoot: '/root', fromRelative: 'a.js', toRelative: 'b.js' })).rejects.toThrow('Source not found');
  });
});

// ── searchWorkspaceFiles ──────────────────────────────────────────────────────

describe('searchWorkspaceFiles', () => {
  it('calls invoke with search_workspace_files and default args', async () => {
    mockInvoke.mockResolvedValueOnce({ matches: [] });
    const result = await searchWorkspaceFiles({ workspaceRoot: '/root', query: 'useState' });
    expect(mockInvoke).toHaveBeenCalledWith('search_workspace_files', {
      workspaceRoot: '/root',
      query: 'useState',
      caseSensitive: false,
      maxResults: 200
    });
    expect(result).toEqual({ matches: [] });
  });

  it('passes custom caseSensitive and maxResults', async () => {
    mockInvoke.mockResolvedValueOnce({ matches: ['src/App.jsx:12'] });
    await searchWorkspaceFiles({ workspaceRoot: '/root', query: 'MyComponent', caseSensitive: true, maxResults: 50 });
    expect(mockInvoke).toHaveBeenCalledWith('search_workspace_files', {
      workspaceRoot: '/root',
      query: 'MyComponent',
      caseSensitive: true,
      maxResults: 50
    });
  });

  it('propagates search errors', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('Search failed'));
    await expect(searchWorkspaceFiles({ workspaceRoot: '/root', query: 'anything' })).rejects.toThrow('Search failed');
  });
});

// ── listWorkspaceDirectory ────────────────────────────────────────────────────

describe('listWorkspaceDirectory', () => {
  it('calls invoke with list_workspace_directory and default args', async () => {
    mockInvoke.mockResolvedValueOnce({ entries: [], totalFiles: 0, totalDirs: 0 });
    const result = await listWorkspaceDirectory({ workspaceRoot: '/root' });
    expect(mockInvoke).toHaveBeenCalledWith('list_workspace_directory', {
      workspaceRoot: '/root',
      relativePath: '',
      recursive: false
    });
    expect(result.entries).toEqual([]);
  });

  it('passes relativePath and recursive flag', async () => {
    mockInvoke.mockResolvedValueOnce({ entries: [], totalFiles: 0, totalDirs: 0 });
    await listWorkspaceDirectory({ workspaceRoot: '/root', relativePath: 'src', recursive: true });
    expect(mockInvoke).toHaveBeenCalledWith('list_workspace_directory', {
      workspaceRoot: '/root',
      relativePath: 'src',
      recursive: true
    });
  });
});

// ── getWorkspaceTree ──────────────────────────────────────────────────────────

describe('getWorkspaceTree', () => {
  it('builds a nested tree from flat entries', async () => {
    mockInvoke.mockResolvedValueOnce({
      entries: [
        { relativePath: 'src/App.jsx', isFile: true },
        { relativePath: 'src/index.js', isFile: true }
      ],
      totalFiles: 2,
      totalDirs: 1
    });
    const result = await getWorkspaceTree({ workspaceRoot: '/root' });
    expect(result).toHaveProperty('tree');
    expect(result.totalFiles).toBe(2);
    expect(result.tree).toHaveProperty('src');
  });

  it('returns empty tree for empty directory', async () => {
    mockInvoke.mockResolvedValueOnce({ entries: [], totalFiles: 0, totalDirs: 0 });
    const result = await getWorkspaceTree({ workspaceRoot: '/root' });
    expect(result.tree).toEqual({});
    expect(result.totalFiles).toBe(0);
  });

  it('propagates errors from listWorkspaceDirectory', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('Directory not found'));
    await expect(getWorkspaceTree({ workspaceRoot: '/missing' })).rejects.toThrow('Directory not found');
  });

  it('handles deeply nested paths', async () => {
    mockInvoke.mockResolvedValueOnce({
      entries: [
        { relativePath: 'a/b/c/file.ts', isFile: true }
      ],
      totalFiles: 1,
      totalDirs: 3
    });
    const result = await getWorkspaceTree({ workspaceRoot: '/root' });
    expect(result.tree).toHaveProperty('a');
  });
});
