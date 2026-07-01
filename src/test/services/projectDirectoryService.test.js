import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  setProjectDirectory, getProjectDirectory, getProjectDirectoryPath,
  listProjectDirectories, clearProjectDirectory, validateProjectDirectory
} from '../../services/projectDirectoryService';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn()
}));

describe('projectDirectoryService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('setProjectDirectory stores a project path', () => {
    const result = setProjectDirectory('proj1', '/path/to/project');
    expect(result.path).toBe('/path/to/project');
    expect(result.createdAtMs).toBeGreaterThan(0);
  });

  it('getProjectDirectory returns stored entry', () => {
    setProjectDirectory('proj1', '/path/to/project');
    const entry = getProjectDirectory('proj1');
    expect(entry).toBeDefined();
    expect(entry.path).toBe('/path/to/project');
  });

  it('getProjectDirectory returns null for unknown id', () => {
    expect(getProjectDirectory('unknown')).toBeNull();
  });

  it('getProjectDirectoryPath returns just the path', () => {
    setProjectDirectory('proj1', '/my/path');
    expect(getProjectDirectoryPath('proj1')).toBe('/my/path');
  });

  it('getProjectDirectoryPath returns null for unknown', () => {
    expect(getProjectDirectoryPath('unknown')).toBeNull();
  });

  it('listProjectDirectories returns array', () => {
    setProjectDirectory('proj1', '/path1');
    setProjectDirectory('proj2', '/path2');
    const list = listProjectDirectories();
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBe(2);
    expect(list.map(p => p.id)).toContain('proj1');
    expect(list.map(p => p.id)).toContain('proj2');
  });

  it('listProjectDirectories returns empty array when none', () => {
    expect(listProjectDirectories()).toEqual([]);
  });

  it('clearProjectDirectory removes a project', () => {
    setProjectDirectory('proj1', '/path1');
    clearProjectDirectory('proj1');
    expect(getProjectDirectory('proj1')).toBeNull();
  });

  it('clearProjectDirectory is safe on unknown id', () => {
    expect(() => clearProjectDirectory('unknown')).not.toThrow();
  });

  it('setProjectDirectory trims whitespace from path', () => {
    const result = setProjectDirectory('proj1', '  /path/to/project  ');
    expect(result.path).toBe('/path/to/project');
  });
});
