// Phase 4c: the brand's character in every picture, with the reason when it can't be kept.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const backend: Record<string, (args: any) => unknown> = {};
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string, args: any) => {
    if (cmd === 'kv_set' || cmd === 'kv_get' || cmd === 'save_image_to_folder' || cmd === 'write_workspace_text_file') return null;
    if (!backend[cmd]) throw new Error(`unexpected command ${cmd}`);
    return backend[cmd](args);
  }),
}));
const creds: Record<string, string> = {};
vi.mock('../../../services/connectors/connectorAuth', () => ({ getConnectorCredential: (_c: string, k: string) => creds[k] || '' }));
vi.mock('../../../services/connectors/connectorImageGenerators', () => ({
  generateComfyUiImage: vi.fn(async () => ({ ok: true, previewBase64: 'COMFY' })),
  checkComfyUiImage: vi.fn(),
  getComfyUiEndpoint: vi.fn(() => 'http://127.0.0.1:8188'),
  comfyRequest: vi.fn(async () => ({ ok: true, json: async () => ({ prompt_id: 'pid-1' }) })),
  pollComfyUiHistory: vi.fn(async () => ({ ok: true, previewBase64: 'CHAR' })),
}));
vi.mock('../../../lib/ollama', () => ({ freeOllamaGpuMemory: vi.fn(async () => ({ ok: true })) }));
vi.mock('../../../services/contentFactory/contentProjectFiles', async () => {
  const actual = await vi.importActual<typeof import('../../../services/contentFactory/contentProjectFiles')>('../../../services/contentFactory/contentProjectFiles');
  return { ...actual, saveProjectImage: vi.fn(async (_r, _b, _p, sub, file) => `D:\\Content\\${sub}\\${file}`), writeProjectFile: vi.fn(async () => undefined), loadProjectImage: vi.fn(async () => 'data:image/png;base64,HF') };
});
vi.mock('../../../services/contentFactory/thumbnailRenderer', async () => {
  const actual = await vi.importActual<typeof import('../../../services/contentFactory/thumbnailRenderer')>('../../../services/contentFactory/thumbnailRenderer');
  return { ...actual, drawHeadline: vi.fn(async () => 'DRAWN'), drawSlide: vi.fn(async () => 'SLIDE') };
});
vi.mock('../../../services/miyaMemoryService', () => ({ listMiyaMemory: vi.fn(() => []) }));

import { invoke } from '@tauri-apps/api/core';
import { comfyRequest, generateComfyUiImage } from '../../../services/connectors/connectorImageGenerators';
import { resetReferenceCacheForTests } from '../../../services/contentFactory/comfyCharacter';
import { saveBrand } from '../../../services/contentFactory/contentBrandService';
import { addCharacter, updateCharacter, setPermission, deleteCharacter } from '../../../services/contentFactory/contentCharacters';
import { createProject, emptyBrief, getProject, saveStepVersion, chosenVersionOf, setVideoSettings, setSceneCharacter } from '../../../services/contentFactory/contentProjectService';
import { renderScenePictures, renderThumbnails } from '../../../services/contentFactory/contentImages';
import { refreshHiggsfieldEstimate } from '../../../services/connectors/higgsfieldConnector';
import { resolveCharacter } from '../../../services/contentFactory/engineChoice';

const settings = { outputFolder: 'D:\\Content' };
const PICS = ['a', 'b', 'c', 'd', 'e'];

function setup(opts: { engine?: 'higgsfield' | 'comfyui'; kind?: 'made_up' | 'real_person'; trained?: boolean; scenes?: unknown[] } = {}) {
  const brand = saveBrand({ name: 'B', visualStyle: 'warm', engines: { pictures: opts.engine || 'higgsfield' } } as any);
  const c = addCharacter(brand.id, { name: 'Ana', kind: opts.kind || 'made_up', description: 'a teacher with red glasses' });
  updateCharacter(brand.id, c.id, { pictures: PICS, ...(opts.trained === false ? {} : { higgsfield: { status: 'ready', characterId: 'soul-9' } }) });
  const p = createProject(brand.id, 'P', { ...emptyBrief(), idea: 'x', lengthSec: 30 } as any);
  saveStepVersion(p.id, 'scenes', { output: { miya: { style: 'film', scenes: opts.scenes || [
    { id: 's1', imagePrompt: 'a classroom', description: 'd', character: true },
    { id: 's2', imagePrompt: 'a blackboard', description: 'd', character: false },
  ] } }, summary: '', joseCommandId: null });
  return { brandId: brand.id, characterId: c.id, project: getProject(p.id)! };
}
const runs = () => vi.mocked(invoke).mock.calls.filter((c) => c[0] === 'higgsfield_run').map((c) => (c[1] as any).job);
const note = (id: string) => (chosenVersionOf(getProject(id)!, 'scenes')!.output as any).pictureNote as string | undefined;

beforeEach(async () => {
  localStorage.clear();
  localStorage.setItem('alphonso_settings', JSON.stringify({ outputFolder: 'D:\\Content', zeroCostMode: false }));
  for (const k of Object.keys(backend)) delete backend[k];
  for (const k of Object.keys(creds)) delete creds[k];
  Object.assign(creds, { HIGGSFIELD_KEY_ID: 'id', HIGGSFIELD_KEY_SECRET: 'secret', HIGGSFIELD_PICTURE_MODEL: 'm/pic' });
  backend.higgsfield_estimate = () => ({ ok: true, usd: 0.05 });
  backend.higgsfield_run = (a) => ({ ok: true, status: 'done', path: a.outPath });
  backend.delete_workspace_file = () => null;
  vi.clearAllMocks();
  resetReferenceCacheForTests();
  await refreshHiggsfieldEstimate('picture');
});

describe('the character in pictures', () => {
  it('a ready character goes with each Higgsfield picture where Miya put it', async () => {
    const { project } = setup();
    await renderScenePictures(project.id, settings, undefined, { paidApproved: true });
    expect(runs().map((j) => j.characterId)).toEqual(['soul-9', undefined]);
  });

  it('a scene can choose none, and a project another character', async () => {
    const { project, brandId } = setup();
    const other = addCharacter(brandId, { name: 'Bo', kind: 'made_up', description: 'a robot' });
    updateCharacter(brandId, other.id, { pictures: PICS, higgsfield: { status: 'ready', characterId: 'soul-bo' } });
    setVideoSettings(project.id, { characterId: other.id });
    setSceneCharacter(project.id, 's2', other.id);
    await renderScenePictures(project.id, settings, undefined, { paidApproved: true });
    expect(runs().map((j) => j.characterId)).toEqual(['soul-bo', 'soul-bo']);
    vi.clearAllMocks();
    setSceneCharacter(project.id, 's1', 'none');
    expect(resolveCharacter(getProject(project.id)!, (await import('../../../services/contentFactory/contentBrandService')).getBrand(brandId)!, 's1', 'higgsfield').use).toBe('none');
  });

  it('a real person without the tick is never used, and the note says why', async () => {
    const { project, brandId, characterId } = setup({ kind: 'real_person' });
    await renderScenePictures(project.id, settings, undefined, { paidApproved: true });
    expect(runs().every((j) => j.characterId === undefined)).toBe(true);
    expect(note(project.id)).toContain('Ana: Tick that this is you or that you have permission first.');
    setPermission(brandId, characterId, true);
    vi.clearAllMocks();
    await renderScenePictures(project.id, settings, undefined, { paidApproved: true });
    expect(runs()[0].characterId).toBe('soul-9');
  });

  it('a deleted character falls back to none with the reason', async () => {
    const { project, brandId, characterId } = setup();
    setVideoSettings(project.id, { characterId });
    await deleteCharacter(brandId, characterId, settings);
    await renderScenePictures(project.id, settings, undefined, { paidApproved: true });
    expect(runs().every((j) => j.characterId === undefined)).toBe(true);
    expect(note(project.id)).toContain('That character was deleted.');
  });

  it('not trained: ComfyUI keeps the character from its description and says how to keep it exactly', async () => {
    const { project } = setup({ engine: 'comfyui', trained: false });
    await renderScenePictures(project.id, settings);
    const prompts = vi.mocked(generateComfyUiImage).mock.calls.map((c) => c[0].prompt);
    expect(prompts[0]).toContain('a teacher with red glasses');
    expect(prompts[1]).not.toContain('a teacher with red glasses');
    expect(note(project.id)).toContain('Install the character reference model in Runtime Hub to keep the character.');
  });

  it("with the reference model installed, ComfyUI makes the picture from the character's pictures", async () => {
    backend.comfyui_reference_model = () => ({ installed: true });
    backend.comfyui_upload_image = (a) => ({ name: a.request.relPath });
    const { project } = setup({ engine: 'comfyui', trained: false });
    await renderScenePictures(project.id, settings);
    expect(comfyRequest).toHaveBeenCalledTimes(1);
    expect(generateComfyUiImage).toHaveBeenCalledTimes(1);
    expect(note(project.id) || '').not.toContain('Install the character reference model');
  });

  it('thumbnails show the character too', async () => {
    const { project } = setup();
    saveStepVersion(project.id, 'thumbnail', { output: { miya: { concepts: [{ id: 't1', headline: 'Hi', imagePrompt: 'a face', layout: 'left' }] } }, summary: '', joseCommandId: null });
    await renderThumbnails(project.id, settings, undefined, { paidApproved: true });
    expect(runs()[0].characterId).toBe('soul-9');
  });
});
