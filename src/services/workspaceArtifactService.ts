import { invoke } from '@tauri-apps/api/core';

export interface WriteWorkspaceArtifactOptions {
  workspaceRoot: string;
  relativePath: string;
  content: string;
}

export async function writeWorkspaceArtifact({ workspaceRoot, relativePath, content }: WriteWorkspaceArtifactOptions) {
  return invoke('write_workspace_text_file', {
    workspaceRoot: String(workspaceRoot || ''),
    relativePath: String(relativePath || ''),
    content: String(content || '')
  });
}

export interface WriteHandoffArtifactOptions {
  workspaceRoot: string;
  fileName: string;
  content: string;
}

export async function writeHandoffArtifact({ workspaceRoot, fileName, content }: WriteHandoffArtifactOptions) {
  return invoke('write_handoff_export_file', {
    workspaceRoot: String(workspaceRoot || ''),
    fileName: String(fileName || ''),
    content: String(content || '')
  });
}
