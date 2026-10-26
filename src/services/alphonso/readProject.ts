// Reading a project for Alphonso (agent phase 6): the listing the way git sees it, and the files
// his model asks for, within the existing limits (FILE_LIMITS, STEP_INPUT_LIMITS).
import { invoke } from '@tauri-apps/api/core';
import { FILE_LIMITS } from '../maria/workContext';
import { STEP_INPUT_LIMITS } from '../jose/stepInput';

export interface ProjectFile { path: string; text: string; cut: number; missing?: boolean }

/** One path per line, cut at a line so the listing fits `maxChars`. */
export async function listProjectFiles(folder: string, maxChars: number): Promise<{ text: string; files: string[]; truncated: boolean }> {
  // A path is at least two characters with its line break, so this never lists fewer than fit.
  const maxEntries = Math.max(1, Math.floor(maxChars / 2));
  const listing = await invoke<{ files: string[]; truncated: boolean }>('list_project_files', { workspaceRoot: folder, maxEntries });
  const all = Array.isArray(listing?.files) ? listing.files.map(String) : [];
  const files: string[] = [];
  let used = 0;
  for (const path of all) {
    const add = (files.length ? 1 : 0) + path.length;
    if (used + add > maxChars) break;
    files.push(path);
    used += add;
  }
  return { text: files.join('\n'), files, truncated: Boolean(listing?.truncated) || files.length < all.length };
}

/** The files asked for, each within FILE_LIMITS.eachChars; a paid or cloud model gets the larger total. */
export async function readProjectFiles(folder: string, paths: string[], large: boolean): Promise<ProjectFile[]> {
  const total = large ? STEP_INPUT_LIMITS.largeChars : FILE_LIMITS.totalChars;
  const files: ProjectFile[] = [];
  let used = 0;
  for (const path of paths) {
    const room = Math.min(FILE_LIMITS.eachChars, total - used);
    if (room <= 0) break;
    try {
      const proof = await invoke<{ content?: string }>('read_workspace_file', { workspaceRoot: folder, relativePath: path });
      const content = typeof proof?.content === 'string' ? proof.content : '';
      const text = content.slice(0, room);
      used += text.length;
      files.push({ path, text, cut: content.length - text.length });
    } catch {
      files.push({ path, text: '', cut: 0, missing: true });
    }
  }
  return files;
}
