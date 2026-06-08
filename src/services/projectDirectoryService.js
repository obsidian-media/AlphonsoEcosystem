import { invoke } from '@tauri-apps/api/core';

const PROJECT_DIRS_KEY = 'alphonso_project_directories_v1';

function readProjectDirs() {
  try {
    const raw = localStorage.getItem(PROJECT_DIRS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function writeProjectDirs(dirs) {
  localStorage.setItem(PROJECT_DIRS_KEY, JSON.stringify(dirs));
  try { invoke('kv_set', { key: PROJECT_DIRS_KEY, value: JSON.stringify(dirs) }).catch(() => {}); } catch { /* browser */ }
}

export function setProjectDirectory(projectId, path) {
  const dirs = readProjectDirs();
  dirs[projectId] = { path: String(path || '').trim(), createdAtMs: Date.now() };
  writeProjectDirs(dirs);
  return dirs[projectId];
}

export function getProjectDirectory(projectId) {
  const dirs = readProjectDirs();
  return dirs[projectId] || null;
}

export function getProjectDirectoryPath(projectId) {
  const entry = getProjectDirectory(projectId);
  return entry?.path || null;
}

export function listProjectDirectories() {
  const dirs = readProjectDirs();
  return Object.entries(dirs).map(([id, entry]) => ({ id, ...entry }));
}

export function clearProjectDirectory(projectId) {
  const dirs = readProjectDirs();
  delete dirs[projectId];
  writeProjectDirs(dirs);
}

export async function validateProjectDirectory(path) {
  if (!path) return { ok: false, error: 'No path provided.' };
  try {
    const result = await invoke('verify_paths', { paths: [path] });
    const proof = Array.isArray(result) ? result[0] : null;
    if (!proof?.exists) return { ok: false, error: 'Directory does not exist.' };
    if (!proof?.is_dir) return { ok: false, error: 'Path is not a directory.' };
    return { ok: true, path, exists: true, isDir: true };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
}
