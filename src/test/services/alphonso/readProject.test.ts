// Agent phase 6: Alphonso reads a project the way git sees it, within the existing limits.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }));

import { listProjectFiles, readProjectFiles } from '../../../services/alphonso/readProject';
import { FILE_LIMITS } from '../../../services/maria/workContext';
import { STEP_INPUT_LIMITS } from '../../../services/jose/stepInput';

beforeEach(() => invoke.mockReset());

describe('readProject', () => {
  it('lists one path per line and cuts at the characters given', async () => {
    invoke.mockResolvedValue({ files: ['a.js', 'src/b.ts'], truncated: false });
    expect(await listProjectFiles('D:/shop', 100)).toEqual({ text: 'a.js\nsrc/b.ts', files: ['a.js', 'src/b.ts'], truncated: false });
    expect(invoke).toHaveBeenCalledWith('list_project_files', { workspaceRoot: 'D:/shop', maxEntries: expect.any(Number) });
    const cut = await listProjectFiles('D:/shop', 6);
    expect(cut.text).toBe('a.js');
    expect(cut.truncated).toBe(true);
  });

  it('reads files within FILE_LIMITS and marks a missing one', async () => {
    invoke.mockImplementation(async (_cmd: string, args: any) => {
      if (args?.relativePath === 'gone.js') throw new Error('not found');
      return { content: 'x'.repeat(FILE_LIMITS.eachChars + 10) };
    });
    const files = await readProjectFiles('D:/shop', ['a.js', 'gone.js', 'b.js', 'c.js', 'd.js'], false);
    expect(files[0]).toEqual({ path: 'a.js', text: 'x'.repeat(FILE_LIMITS.eachChars), cut: 10 });
    expect(files[1]).toEqual({ path: 'gone.js', text: '', cut: 0, missing: true });
    const total = files.reduce((n, f) => n + f.text.length, 0);
    expect(total).toBeLessThanOrEqual(FILE_LIMITS.totalChars);
  });

  it('a paid or cloud model gets the larger total', async () => {
    invoke.mockResolvedValue({ content: 'y'.repeat(FILE_LIMITS.eachChars) });
    const paths = Array.from({ length: 10 }, (_, i) => `f${i}.js`);
    const files = await readProjectFiles('D:/shop', paths, true);
    expect(files.reduce((n, f) => n + f.text.length, 0)).toBe(STEP_INPUT_LIMITS.largeChars);
  });
});
