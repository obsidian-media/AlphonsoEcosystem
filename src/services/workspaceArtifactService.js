import { invoke } from '@tauri-apps/api/core';

export async function writeWorkspaceArtifact({ workspaceRoot, relativePath, content }) {
  return invoke('write_workspace_text_file', {
    workspaceRoot: String(workspaceRoot || ''),
    relativePath: String(relativePath || ''),
    content: String(content || '')
  });
}

export async function writeHandoffArtifact({ workspaceRoot, fileName, content }) {
  return invoke('write_handoff_export_file', {
    workspaceRoot: String(workspaceRoot || ''),
    fileName: String(fileName || ''),
    content: String(content || '')
  });
}
