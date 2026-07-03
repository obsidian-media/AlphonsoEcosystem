import { invoke } from '@tauri-apps/api/core';

const PROJECT_DIRS_KEY = 'alphonso_project_directories_v1';

interface ProjectDirEntry {
  path: string;
  createdAtMs: number;
}

interface ProjectDirListItem extends ProjectDirEntry {
  id: string;
}

interface PathProof {
  exists: boolean;
  is_dir: boolean;
}

function readProjectDirs(): Record<string, ProjectDirEntry> {
  try {
    const raw = localStorage.getItem(PROJECT_DIRS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function writeProjectDirs(dirs: Record<string, ProjectDirEntry>) {
  localStorage.setItem(PROJECT_DIRS_KEY, JSON.stringify(dirs));
  try { invoke('kv_set', { key: PROJECT_DIRS_KEY, value: JSON.stringify(dirs) }).catch(() => {}); } catch { /* browser */ }
}

export function setProjectDirectory(projectId: string, path: string): ProjectDirEntry {
  const dirs = readProjectDirs();
  dirs[projectId] = { path: String(path || '').trim(), createdAtMs: Date.now() };
  writeProjectDirs(dirs);
  return dirs[projectId];
}

export function getProjectDirectory(projectId: string): ProjectDirEntry | null {
  const dirs = readProjectDirs();
  return dirs[projectId] || null;
}

export function getProjectDirectoryPath(projectId: string): string | null {
  const entry = getProjectDirectory(projectId);
  return entry?.path || null;
}

export function listProjectDirectories(): ProjectDirListItem[] {
  const dirs = readProjectDirs();
  return Object.entries(dirs).map(([id, entry]) => ({ id, ...entry }));
}

export function clearProjectDirectory(projectId: string) {
  const dirs = readProjectDirs();
  delete dirs[projectId];
  writeProjectDirs(dirs);
}

export async function validateProjectDirectory(path: string | null | undefined) {
  if (!path) return { ok: false, error: 'No path provided.' };
  try {
    const result = await invoke('verify_paths', { paths: [path] }) as PathProof[];
    const proof = Array.isArray(result) ? result[0] : null;
    if (!proof?.exists) return { ok: false, error: 'Directory does not exist.' };
    if (!proof?.is_dir) return { ok: false, error: 'Path is not a directory.' };
    return { ok: true, path, exists: true, isDir: true };
  } catch (error: unknown) {
    return { ok: false, error: String((error as Error)?.message || error) };
  }
}
