// Phase 4c: a scene's (or a Short part's) motion — a Higgsfield preset, a recording or a chosen file.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const backend: Record<string, (args: any) => unknown> = {};
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string, args: any) => {
    if (cmd === 'kv_set' || cmd === 'kv_get') return null;
    if (!backend[cmd]) throw new Error(`unexpected command ${cmd}`);
    return backend[cmd](args);
  }),
}));

import { invoke } from '@tauri-apps/api/core';
import { saveBrand } from '../../../services/contentFactory/contentBrandService';
import { createProject, emptyBrief, getProject, saveStepVersion, setSceneMotion, setShortPartMotion, setMotionSuggested } from '../../../services/contentFactory/contentProjectService';
import { saveMotionClip, saveShortPartMotionClip, sceneMotion } from '../../../services/contentFactory/contentMotion';
import { parseStepAnswer } from '../../../services/contentFactory/contentStepPrompts';

const settings = { outputFolder: 'D:\\Content' };
function setup() {
  const brand = saveBrand({ name: 'B' });
  const p = createProject(brand.id, 'P', emptyBrief());
  saveStepVersion(p.id, 'scenes', { output: { miya: { style: 's', scenes: [{ id: 's1', description: 'A wave', motionSuggested: true }, { id: 's2', description: 'Desk' }] } }, summary: '', joseCommandId: null });
  saveStepVersion(p.id, 'shorts', { output: { miya: { shorts: [{ id: 'sh1', kind: 'mini', title: 'T', parts: [{ spoken: 'Hi', imagePrompt: 'x' }] }] } }, summary: '', joseCommandId: null });
  return { project: getProject(p.id)!, dir: `${brand.folderName}/${p.folderName}` };
}
const scenes = (id: string) => (getProject(id)!.steps.scenes.versions[0].output as any).miya.scenes;

beforeEach(() => {
  localStorage.clear();
  for (const k of Object.keys(backend)) delete backend[k];
  vi.clearAllMocks();
});

describe('a scene motion', () => {
  it("Miya's suggestion is only an explicit true", () => {
    const parsed = parseStepAnswer('creative_scenes', JSON.stringify({ style: 's', scenes: [
      { id: 'a', imagePrompt: 'x', description: 'd', motionSuggested: true },
      { id: 'b', imagePrompt: 'y', description: 'e', motionSuggested: 'yes' },
    ] })) as any;
    expect(parsed.scenes.map((sc: any) => sc.motionSuggested)).toEqual([true, false]);
  });

  it('a preset, or none, is saved on the scene', () => {
    const { project } = setup();
    setSceneMotion(project.id, 's1', { source: 'preset', presetId: 'wave-01' });
    expect(scenes(project.id)[0].motion).toEqual({ source: 'preset', presetId: 'wave-01' });
    expect(sceneMotion(getProject(project.id)!, 's1')).toEqual({ source: 'preset', presetId: 'wave-01' });
    setSceneMotion(project.id, 's1', null);
    expect(scenes(project.id)[0].motion).toBeUndefined();
  });

  it('a recording is saved as motion/<scene>-v<n>.mp4 and set on the scene; the next is v2', async () => {
    const { project, dir } = setup();
    backend.content_save_motion_clip = (a) => ({ ok: true, path: a.request.outPath });
    const first = await saveMotionClip(project.id, 's1', { base64: 'WEBM' }, settings);
    expect(first).toEqual({ ok: true, path: `${dir}/motion/s1-v1.mp4` });
    expect(vi.mocked(invoke)).toHaveBeenCalledWith('content_save_motion_clip', { request: { workspaceRoot: 'D:\\Content', outPath: `${dir}/motion/s1-v1.mp4`, base64: 'WEBM' } });
    expect(scenes(project.id)[0].motion).toEqual({ source: 'recorded', path: `${dir}/motion/s1-v1.mp4` });
    await saveMotionClip(project.id, 's1', { choose: true }, settings);
    expect(scenes(project.id)[0].motion).toEqual({ source: 'file', path: `${dir}/motion/s1-v2.mp4` });
  });

  it('a refused clip leaves the scene as it was, with the reason; a cancelled choice says nothing', async () => {
    const { project } = setup();
    backend.content_save_motion_clip = () => ({ ok: false, reason: 'The clip is longer than 10 seconds.' });
    expect(await saveMotionClip(project.id, 's1', { choose: true }, settings)).toEqual({ ok: false, reason: 'The clip is longer than 10 seconds.' });
    expect(scenes(project.id)[0].motion).toBeUndefined();
    backend.content_save_motion_clip = () => ({ ok: false, cancelled: true });
    expect(await saveMotionClip(project.id, 's1', { choose: true }, settings)).toEqual({ ok: false });
  });

  it("a mini Short's part can have a motion too", () => {
    const { project } = setup();
    setShortPartMotion(project.id, 'sh1', 0, { source: 'preset', presetId: 'nod' });
    const short = (getProject(project.id)!.steps.shorts.versions[0].output as any).miya.shorts[0];
    expect(short.parts[0].motion).toEqual({ source: 'preset', presetId: 'nod' });
  });

  it("Miya's suggestion can be turned off", () => {
    const { project } = setup();
    setMotionSuggested(project.id, 's1', false);
    expect(scenes(project.id)[0].motionSuggested).toBe(false);
  });

  it("a Short part's clip is saved as motion/<short>-p<n>-v<m>.mp4", async () => {
    const { project, dir } = setup();
    backend.content_save_motion_clip = (a) => ({ ok: true, path: a.request.outPath });
    expect(await saveShortPartMotionClip(project.id, 'sh1', 0, { choose: true }, settings)).toEqual({ ok: true, path: `${dir}/motion/sh1-p1-v1.mp4` });
    const short = (getProject(project.id)!.steps.shorts.versions[0].output as any).miya.shorts[0];
    expect(short.parts[0].motion).toEqual({ source: 'file', path: `${dir}/motion/sh1-p1-v1.mp4` });
  });
});
