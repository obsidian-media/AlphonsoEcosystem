import { invoke } from '@tauri-apps/api/core';

export async function readWorkspaceFile({ workspaceRoot, relativePath }) {
  return invoke('read_workspace_file', { workspaceRoot, relativePath });
}

export async function deleteWorkspaceFile({ workspaceRoot, relativePath }) {
  return invoke('delete_workspace_file', { workspaceRoot, relativePath });
}

export async function moveWorkspaceFile({ workspaceRoot, fromRelative, toRelative }) {
  return invoke('move_workspace_file', { workspaceRoot, fromRelative, toRelative });
}

export async function searchWorkspaceFiles({ workspaceRoot, query, caseSensitive = false, maxResults = 200 }) {
  return invoke('search_workspace_files', { workspaceRoot, query, caseSensitive, maxResults });
}

export async function listWorkspaceDirectory({ workspaceRoot, relativePath = '', recursive = false }) {
  return invoke('list_workspace_directory', { workspaceRoot, relativePath, recursive });
}

export async function getWorkspaceTree({ workspaceRoot, relativePath = '' }) {
  const result = await listWorkspaceDirectory({ workspaceRoot, relativePath, recursive: true });
  const entries = result.entries || [];

  // Build tree structure
  const tree = {};
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
      current = current[part]._dir ? current[part].children : current[part];
    }
  }

  return { tree, totalFiles: result.totalFiles, totalDirs: result.totalDirs };
}
