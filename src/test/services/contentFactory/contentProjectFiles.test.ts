import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

import { invoke } from '@tauri-apps/api/core';
import {
  projectRelativeDir,
  requireOutputRoot,
  writeProjectFile,
  writeStepText,
  saveProjectImage,
  loadProjectFile,
  loadProjectImage,
} from '../../../services/contentFactory/contentProjectFiles';

const brand = { folderName: 'my-brand' } as never;
const project = { id: 'p1', folderName: 'launch-video', name: 'Launch video' } as never;

beforeEach(() => { vi.mocked(invoke).mockReset().mockResolvedValue({}); });

describe('contentProjectFiles', () => {
  it('builds the brand/project folder', () => {
    expect(projectRelativeDir(brand, project)).toBe('my-brand/launch-video');
  });

  it('needs an output folder', () => {
    expect(() => requireOutputRoot({ outputFolder: '  ' })).toThrow('Choose an output folder in Settings first.');
    expect(() => requireOutputRoot({})).toThrow('Choose an output folder in Settings first.');
    expect(requireOutputRoot({ outputFolder: ' D:\\Content ' })).toBe('D:\\Content');
  });

  it('writes project.json inside the project folder', async () => {
    await writeProjectFile('D:\\Content', brand, project);
    expect(invoke).toHaveBeenCalledWith('write_workspace_text_file', expect.objectContaining({
      workspaceRoot: 'D:\\Content',
      relativePath: 'my-brand/launch-video/project.json',
    }));
    const content = vi.mocked(invoke).mock.calls[0][1] as { content: string };
    expect(JSON.parse(content.content).id).toBe('p1');
  });

  it('writes a step version as Markdown', async () => {
    const path = await writeStepText('D:\\Content', brand, project, 'script', 2, '# Script');
    expect(path).toBe('my-brand/launch-video/script/v2.md');
  });

  it('saves a picture into the step folder', async () => {
    vi.mocked(invoke).mockResolvedValue({ path: 'D:\\Content\\my-brand\\launch-video\\scenes\\s1.png' });
    const path = await saveProjectImage('D:\\Content', brand, project, 'scenes', 's1.png', 'AAAA');
    const args = vi.mocked(invoke).mock.calls[0][1] as { folder: string; filename: string; base64Data: string };
    expect(vi.mocked(invoke).mock.calls[0][0]).toBe('save_image_to_folder');
    expect(args.folder).toMatch(/launch-video[\\/]scenes$/);
    expect(args.filename).toBe('s1.png');
    expect(path).toBe('D:\\Content\\my-brand\\launch-video\\scenes\\s1.png');
  });

  it('loads a saved picture as a data URL, or null', async () => {
    vi.mocked(invoke).mockResolvedValueOnce('AAAA');
    expect(await loadProjectImage('D:\Content', 'my-brand/launch-video/thumbnail/t1.png')).toBe('data:image/png;base64,AAAA');
    expect(vi.mocked(invoke).mock.calls[0]).toEqual(['read_workspace_image', { workspaceRoot: 'D:\Content', relativePath: 'my-brand/launch-video/thumbnail/t1.png' }]);
    vi.mocked(invoke).mockRejectedValueOnce(new Error('missing'));
    expect(await loadProjectImage('D:\Content', 'x.png')).toBeNull();
  });

  it('loads project.json, or null when it is missing or broken', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({ content: '{"id":"p1"}' });
    expect((await loadProjectFile('D:\\Content', brand, 'launch-video'))?.id).toBe('p1');
    vi.mocked(invoke).mockRejectedValueOnce(new Error('not found'));
    expect(await loadProjectFile('D:\\Content', brand, 'launch-video')).toBeNull();
    vi.mocked(invoke).mockResolvedValueOnce({ content: 'not json' });
    expect(await loadProjectFile('D:\\Content', brand, 'launch-video')).toBeNull();
  });
});
