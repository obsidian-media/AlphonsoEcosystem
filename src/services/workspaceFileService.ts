import { invoke } from '@tauri-apps/api/core';

interface WorkspaceFileOptions {
  workspaceRoot: string;
  relativePath?: string;
  fromRelative?: string;
  toRelative?: string;
  query?: string;
  caseSensitive?: boolean;
  maxResults?: number;
  recursive?: boolean;
}

interface WorkspaceDirectoryResult {
  entries?: { relativePath: string; isFile: boolean; [key: string]: unknown }[];
  totalFiles?: number;
  totalDirs?: number;
}

interface WorkspaceTreeResult {
  tree: Record<string, unknown>;
  totalFiles?: number;
  totalDirs?: number;
}

export async function readWorkspaceFile({ workspaceRoot, relativePath }: WorkspaceFileOptions): Promise<string> {
  return invoke('read_workspace_file', { workspaceRoot, relativePath });
}

export async function deleteWorkspaceFile({ workspaceRoot, relativePath }: WorkspaceFileOptions): Promise<void> {
  return invoke('delete_workspace_file', { workspaceRoot, relativePath });
}

export async function moveWorkspaceFile({ workspaceRoot, fromRelative, toRelative }: WorkspaceFileOptions): Promise<void> {
  return invoke('move_workspace_file', { workspaceRoot, fromRelative, toRelative });
}

export async function searchWorkspaceFiles({ workspaceRoot, query, caseSensitive = false, maxResults = 200 }: WorkspaceFileOptions): Promise<unknown> {
  return invoke('search_workspace_files', { workspaceRoot, query, caseSensitive, maxResults });
}

export async function listWorkspaceDirectory({ workspaceRoot, relativePath = '', recursive = false }: WorkspaceFileOptions): Promise<WorkspaceDirectoryResult> {
  return invoke('list_workspace_directory', { workspaceRoot, relativePath, recursive });
}

export async function getWorkspaceTree({ workspaceRoot, relativePath = '' }: WorkspaceFileOptions): Promise<WorkspaceTreeResult> {
  const result = await listWorkspaceDirectory({ workspaceRoot, relativePath, recursive: true });
  const entries = result.entries || [];

  const tree: Record<string, unknown> = {};
  for (const entry of entries) {
    const parts = entry.relativePath.split(/[\\/]/);
    let current = tree;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!current[part]) {
        current[part] = i === parts.length - 1 && entry.isFile
          ? { _file: true, ...entry }
          : { _dir: true, children: {} };
      }
      current = (current[part] as Record<string, unknown>)._dir
        ? (current[part] as Record<string, unknown>).children as Record<string, unknown>
        : current[part] as Record<string, unknown>;
    }
  }

  return { tree, totalFiles: result.totalFiles, totalDirs: result.totalDirs };
}