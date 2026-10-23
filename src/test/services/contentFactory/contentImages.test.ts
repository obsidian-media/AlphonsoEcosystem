import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../services/connectors/connectorImageGenerators', () => ({
  generateComfyUiImage: vi.fn(),
  checkComfyUiImage: vi.fn(),
  getComfyUiEndpoint: vi.fn(() => 'http://127.0.0.1:8188'),
}));
vi.mock('../../../services/contentFactory/contentProjectFiles', async () => {
  const actual = await vi.importActual<typeof import('../../../services/contentFactory/contentProjectFiles')>('../../../services/contentFactory/contentProjectFiles');
  return { ...actual, saveProjectImage: vi.fn(async (_r, _b, _p, sub, file) => `D:\\Content\\${sub}\\${file}`), writeProjectFile: vi.fn(async () => undefined) };
});
vi.mock('../../../services/contentFactory/thumbnailRenderer', async () => {
  const actual = await vi.importActual<typeof import('../../../services/contentFactory/thumbnailRenderer')>('../../../services/contentFactory/thumbnailRenderer');
  return { ...actual, drawHeadline: vi.fn(async () => 'DRAWN') };
});
vi.mock('../../../services/miyaMemoryService', () => ({ listMiyaMemory: vi.fn(() => []) }));

import { generateComfyUiImage, checkComfyUiImage } from '../../../services/connectors/connectorImageGenerators';
import { drawHeadline } from '../../../services/contentFactory/thumbnailRenderer';
import { saveBrand } from '../../../services/contentFactory/contentBrandService';
import { createProject, emptyBrief, getProject, saveStepVersion } from '../../../services/contentFactory/contentProjectService';
import { renderScenePictures, renderThumbnails, checkPendingPictures } from '../../../services/contentFactory/contentImages';

const settings = { outputFolder: 'D:\\Content' };

function projectWith(step: 'scenes' | 'thumbnail', output: unknown, outputs: string[] = ['long video']) {
  const brand = saveBrand({ name: 'B', visualStyle: 'cinematic', characterRefs: 'two llamas' });
  const p = createProject(brand.id, 'P', { ...emptyBrief(), outputs });
  saveStepVersion(p.id, step, { output, summary: '', joseCommandId: null });
  return getProject(p.id)!;
}

const scenes = { miya: { style: 'warm film', scenes: [
  { id: 's1', imagePrompt: 'a clock', negativePrompt: '', description: 'd' },
  { id: 's2', imagePrompt: 'a desk', negativePrompt: '', description: 'd' },
] } };

beforeEach(() => {
  localStorage.clear();
  vi.mocked(generateComfyUiImage).mockReset();
  vi.mocked(checkComfyUiImage).mockReset();
  vi.mocked(drawHeadline).mockClear();
});

describe('renderScenePictures', () => {
  it('makes one picture per scene with a shared look, one at a time', async () => {
    vi.mocked(generateComfyUiImage).mockResolvedValue({ ok: true, previewBase64: 'AAAA' } as never);
    const p = projectWith('scenes', scenes);
    const results = await renderScenePictures(p.id, settings);
    expect(results.map((r) => r.status)).toEqual(['done', 'done']);
    const first = vi.mocked(generateComfyUiImage).mock.calls[0][0] as { prompt: string; width: number; height: number };
    expect(first.prompt).toContain('a clock');
    expect(first.prompt).toContain('warm film');
    expect(first.prompt).toContain('cinematic');
    expect([first.width, first.height]).toEqual([832, 480]);
    expect(getProject(p.id)!.steps.scenes.versions[0].output).toMatchObject({ pictures: [
      { sceneId: 's1', status: 'done', relativePath: `${'b'}/p/scenes/v1-s1.png` },
      { sceneId: 's2', status: 'done' },
    ] });
  });

  it('uses portrait pictures when every output is vertical', async () => {
    vi.mocked(generateComfyUiImage).mockResolvedValue({ ok: true, previewBase64: 'AAAA' } as never);
    const p = projectWith('scenes', scenes, ['YouTube Short', 'Instagram Reel']);
    await renderScenePictures(p.id, settings);
    const first = vi.mocked(generateComfyUiImage).mock.calls[0][0] as { width: number; height: number };
    expect([first.width, first.height]).toEqual([480, 832]);
  });

  it('keeps a picture that is still in ComfyUI as waiting, and carries on', async () => {
    vi.mocked(generateComfyUiImage)
      .mockResolvedValueOnce({ ok: false, pending: true, jobId: 'j1' } as never)
      .mockResolvedValueOnce({ ok: true, previewBase64: 'BBBB' } as never);
    const p = projectWith('scenes', scenes);
    const results = await renderScenePictures(p.id, settings);
    expect(results[0]).toMatchObject({ sceneId: 's1', status: 'pending', jobId: 'j1' });
    expect(results[1].status).toBe('done');
    vi.mocked(checkComfyUiImage).mockResolvedValue({ ok: true, previewBase64: 'CCCC' } as never);
    const checked = await checkPendingPictures(p.id, 'scenes', settings);
    expect(checked[0]).toMatchObject({ sceneId: 's1', status: 'done' });
    expect(checkComfyUiImage).toHaveBeenCalledWith('j1');
  });

  it('records ComfyUI\'s error when a picture fails', async () => {
    vi.mocked(generateComfyUiImage).mockResolvedValue({ ok: false, error: 'ComfyUI not running' } as never);
    const p = projectWith('scenes', scenes);
    const results = await renderScenePictures(p.id, settings);
    expect(results[0]).toMatchObject({ status: 'failed', error: 'ComfyUI not running' });
    expect(generateComfyUiImage).toHaveBeenCalledTimes(2);
  });
});

describe('renderThumbnails', () => {
  it('makes exactly 3 finished 1280×720 thumbnails with the headline drawn on', async () => {
    vi.mocked(generateComfyUiImage).mockResolvedValue({ ok: true, previewBase64: 'AAAA' } as never);
    const concepts = [1, 2, 3].map((n) => ({ id: `t${n}`, headline: `HEADLINE ${n}`, imagePrompt: `picture ${n}`, layout: 'left' }));
    const p = projectWith('thumbnail', { miya: { concepts } });
    const results = await renderThumbnails(p.id, settings);
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.status === 'done')).toBe(true);
    const call = vi.mocked(generateComfyUiImage).mock.calls[0][0] as { width: number; height: number; prompt: string };
    expect([call.width, call.height]).toEqual([1280, 720]);
    expect(call.prompt).toContain('no text');
    expect(drawHeadline).toHaveBeenCalledTimes(3);
    expect(vi.mocked(drawHeadline).mock.calls[0][1]).toBe('HEADLINE 1');
  });
});
