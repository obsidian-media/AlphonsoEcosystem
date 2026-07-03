import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args) => invoke(...args),
  isTauri: vi.fn().mockReturnValue(false)
}));

import { validateWorkspaceRoot } from '../services/workspaceRootService';

describe('workspaceRootService', () => {
  beforeEach(() => {
    localStorage.clear();
    invoke.mockReset();
  });

  it('requires docs as part of the approved workspace root', async () => {
    invoke.mockResolvedValueOnce([
      { exists: true, is_dir: true },
      { exists: true, is_file: true },
      { exists: true, is_dir: true },
      { exists: true, is_dir: true },
      { exists: false, is_dir: false }
    ]);

    const result = await validateWorkspaceRoot('/home/user/workspace/alphonso');

    expect(result.ok).toBe(false);
    expect(result.status).toBe('setup_required');
    expect(result.missingEntries).toContain('docs');
  });
});
