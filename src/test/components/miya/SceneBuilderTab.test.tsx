import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => undefined) }));
vi.mock('../../../services/contentFactory/contentMediaExecutor', () => ({
  resolveProjectClipEngine: vi.fn(async () => ({ engine: 'local', modelId: 'ltx_video_2b', maxSeconds: 5 })),
}));
vi.mock('../../../services/contentFactory/contentProjectFiles', async () => {
  const actual = await vi.importActual<typeof import('../../../services/contentFactory/contentProjectFiles')>('../../../services/contentFactory/contentProjectFiles');
  return {
    ...actual,
    loadProjectImage: vi.fn(async () => 'data:image/jpeg;base64,AAAA'),
    mediaUrl: vi.fn((root: string, rel: string) => `asset-test://${rel}`),
    allowMediaFolder: vi.fn(async () => true),
  };
});

import { invoke } from '@tauri-apps/api/core';
import { allowMediaFolder } from '../../../services/contentFactory/contentProjectFiles';
import { SceneBuilderTab } from '../../../components/miya/SceneBuilderTab';
import { createProject, emptyBrief, getProject, saveStepVersion } from '../../../services/contentFactory/contentProjectService';

beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); vi.mocked(allowMediaFolder).mockImplementation(async () => true); });

// Miya makes the finished video since agent roles Part A; older projects saved it under Alphonso.
function setup(options: { musicSkipped?: boolean; sfx?: unknown; assembledBy?: 'miya' | 'alphonso' } = {}) {
  const p = createProject('b', 'P', emptyBrief());
  const save = (step: any, output: unknown) => saveStepVersion(p.id, step, { output, summary: '', joseCommandId: null });
  save('scenes', { miya: { style: 'warm', scenes: [{ id: 's1', description: 'A barista pours coffee' }] } });
  save('voice', { miya: { full: 'b/p/audio/voice-v1/full.wav', durationSec: 8, lines: [] } });
  save('music', { miya: options.musicSkipped
    ? { skipped: 'AudioCraft is not installed. Install it in Runtime Hub to add music.' }
    : { path: 'b/p/audio/music-v1.wav', prompt: 'calm lofi' } });
  save('broll', { hector: { clips: [
    { sceneId: 's1', path: 'b/p/broll/v1-s1.mp4', source: 'pexels', author: 'Ana', pageUrl: 'https://www.pexels.com/video/7', license: 'Pexels License' },
  ] } });
  if (options.sfx) save('sfx', { miya: options.sfx });
  save('assemble', { [options.assembledBy || 'miya']: {
    outputs: [
      { aspect: '16x9', path: 'b/p/output/v1-16x9.mp4', durationSec: 8, frames: ['b/p/output/v1-16x9-10.jpg', 'b/p/output/v1-16x9-50.jpg', 'b/p/output/v1-16x9-90.jpg'] },
      { aspect: '9x16', path: 'b/p/output/v1-9x16.mp4', durationSec: 8, frames: [] },
    ],
    srt: 'b/p/output/v1.srt', captions: 'lines',
    note: 'Whisper is not installed, so each caption line is timed by its sentence, not word by word. Install Whisper in Runtime Hub for word timing.',
  } });
  return getProject(p.id)!;
}

const props = (project: any) => ({ project, outputRoot: 'D:\\Content', runStep: vi.fn(), chooseVersion: vi.fn(), checkAgain: vi.fn() });

// Miya content factory phase 2a: the Scene Builder shows the finished video.
describe('SceneBuilderTab: the finished video', () => {
  it('shows the voice, music, stock clips and finished video steps', () => {
    render(<SceneBuilderTab {...props(setup())} />);
    for (const label of ['Voice-over', 'Music', 'Stock clips', 'Finished video']) expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    expect(allowMediaFolder).toHaveBeenCalledWith('D:\\Content');
  });

  it('plays both videos and the audio from the project folder, with the frames', async () => {
    const { container } = render(<SceneBuilderTab {...props(setup())} />);
    await waitFor(() => expect(container.querySelectorAll('video')).toHaveLength(2));
    const videos = [...container.querySelectorAll('video')].map((v) => v.getAttribute('src'));
    expect(videos).toEqual(['asset-test://b/p/output/v1-16x9.mp4', 'asset-test://b/p/output/v1-9x16.mp4']);
    const audio = [...container.querySelectorAll('audio')].map((a) => a.getAttribute('src'));
    expect(audio).toEqual(['asset-test://b/p/audio/voice-v1/full.wav', 'asset-test://b/p/audio/music-v1.wav']);
    await waitFor(() => expect(screen.getAllByRole('img', { name: /Frame/ })).toHaveLength(3));
    expect(screen.getByText(/Whisper is not installed/)).toBeTruthy();
  });

  it("still plays an older project's video, made before Miya took the step over", async () => {
    const { container } = render(<SceneBuilderTab {...props(setup({ assembledBy: 'alphonso' }))} />);
    await waitFor(() => expect(container.querySelectorAll('video')).toHaveLength(2));
  });

  it("names each stock clip's source and author, and opens its license page", () => {
    render(<SceneBuilderTab {...props(setup())} />);
    expect(screen.getByText('Pexels: Ana')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Pexels License' }));
    expect(invoke).toHaveBeenCalledWith('open_url', { url: 'https://www.pexels.com/video/7' });
  });

  it('a skipped step shows why', () => {
    render(<SceneBuilderTab {...props(setup({ musicSkipped: true }))} />);
    expect(screen.getByText('AudioCraft is not installed. Install it in Runtime Hub to add music.')).toBeTruthy();
  });
});

// Phase 2b: the main moments and the AI clips panel.
describe('SceneBuilderTab: main moments', () => {
  it('a switch on each scene marks it a main moment, and the AI clips panel is there', async () => {
    const project = setup();
    const onChange = vi.fn();
    render(<SceneBuilderTab {...props(project)} onChange={onChange} />);
    const box = screen.getByRole('checkbox', { name: 'Main moment: Scene 1' });
    expect((box as HTMLInputElement).checked).toBe(false);
    fireEvent.click(box);
    const { getProject } = await import('../../../services/contentFactory/contentProjectService');
    expect(((getProject(project.id)!.steps.scenes.versions[0].output as any).miya.scenes[0]).mainMoment).toBe(true);
    expect(onChange).toHaveBeenCalled();
    expect(screen.getByRole('region', { name: 'AI clips' })).toBeTruthy();
  });
});

// Phase 3b: a new output folder works without reopening Miya Studio. A player refused its
// first load never tries again, so players wait until the current folder is allowed.
describe('a new output folder', () => {
  it('shows the players only once the folder is allowed, and again after the folder changes', async () => {
    const project = setup();
    let allowA: (v: boolean) => void = () => undefined;
    let allowB: (v: boolean) => void = () => undefined;
    vi.mocked(allowMediaFolder).mockImplementation((root: string) => new Promise((r) => { if (root === 'D:/A') allowA = r; else allowB = r; }));
    const { container, rerender } = render(<SceneBuilderTab {...props(project)} outputRoot="D:/A" />);
    expect(container.querySelectorAll('video').length).toBe(0);
    allowA(true);
    await waitFor(() => expect(container.querySelectorAll('video').length).toBeGreaterThan(0));
    rerender(<SceneBuilderTab {...props(project)} outputRoot="D:/B" />);
    expect(allowMediaFolder).toHaveBeenLastCalledWith('D:/B');
    expect(container.querySelectorAll('video').length).toBe(0);
    allowB(true);
    await waitFor(() => expect(container.querySelectorAll('video').length).toBeGreaterThan(0));
  });

  // Phase 4b: the Sound effects step, with a player for each effect and its note.
  it('plays each sound effect and says why one was not made', async () => {
    const project = setup({ sfx: { effects: [
      { sceneId: 's1', text: 'a coffee pour', seconds: 2, status: 'done', path: 'b/p/audio/sfx-v1-s1.wav', atSec: 0 },
      { sceneId: 's2', text: 'a whoosh', seconds: 1, status: 'failed', reason: 'ElevenLabs says the account is over its limit for now.' },
    ] } });
    const { container } = render(<SceneBuilderTab {...props(project)} />);
    expect(screen.getAllByText('Sound effects').length).toBeGreaterThan(0);
    await waitFor(() => expect(container.querySelectorAll('video')).toHaveLength(2));
    expect([...container.querySelectorAll('audio')].map((a) => a.getAttribute('src'))).toContain('asset-test://b/p/audio/sfx-v1-s1.wav');
    expect(screen.getByText('s1: a coffee pour')).toBeTruthy();
    expect(screen.getByText('ElevenLabs says the account is over its limit for now.')).toBeTruthy();
  });

  // Phase 4b: a picture still being made at Higgsfield, and the note saying which engine made them.
  it('says a picture is waiting for Higgsfield and why ComfyUI made the others', () => {
    const p = createProject('b', 'P', emptyBrief());
    saveStepVersion(p.id, 'scenes', { output: {
      miya: { style: 'warm', scenes: [{ id: 's1', description: 'A pour' }] },
      pictures: [{ sceneId: 's1', status: 'pending', requestId: 'req-1' }],
      pictureNote: 'More pictures than this run approved; the rest were made with ComfyUI.',
    }, summary: '', joseCommandId: null });
    render(<SceneBuilderTab {...props(getProject(p.id)!)} />);
    expect(screen.getByText('Waiting for Higgsfield…')).toBeTruthy();
    expect(screen.getByText('More pictures than this run approved; the rest were made with ComfyUI.')).toBeTruthy();
  });

  // Phase 4c: each scene can show the brand's main character, another one, or none.
  it("a scene can choose which of the brand's characters it shows", async () => {
    const { saveBrand } = await import('../../../services/contentFactory/contentBrandService');
    const { addCharacter } = await import('../../../services/contentFactory/contentCharacters');
    const brand = saveBrand({ name: 'B' });
    const ana = addCharacter(brand.id, { name: 'Ana', kind: 'made_up', description: 'x' });
    addCharacter(brand.id, { name: 'Bo', kind: 'made_up', description: 'y' });
    const p = createProject(brand.id, 'P', emptyBrief());
    saveStepVersion(p.id, 'scenes', { output: { miya: { style: 'warm', scenes: [{ id: 's1', description: 'A pour' }] } }, summary: '', joseCommandId: null });
    render(<SceneBuilderTab {...props(getProject(p.id)!)} />);
    const pick = screen.getByLabelText('Character: Scene 1') as HTMLSelectElement;
    expect(pick.value).toBe('');
    expect([...pick.options].map((o) => o.text)).toEqual(["The project's (Ana)", "Ana", "Bo", "Nobody"]);
    fireEvent.change(pick, { target: { value: 'none' } });
    const scene = ((getProject(p.id)!.steps.scenes.versions[0].output as any).miya.scenes[0]);
    expect(scene.characterId).toBe('none');
    expect(ana.id).toBeTruthy();
  });

  // Phase 4c: each scene can get a motion instead of a normal AI clip.
  it('a scene can get a motion, with Miya suggesting where', () => {
    const p = createProject('b', 'P', emptyBrief());
    saveStepVersion(p.id, 'scenes', { output: { miya: { style: 'warm', scenes: [{ id: 's1', description: 'A wave', motionSuggested: true }] } }, summary: '', joseCommandId: null });
    render(<SceneBuilderTab {...props(getProject(p.id)!)} />);
    expect(screen.getByText('Miya suggests a move here.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Motion: Scene 1'), { target: { value: 'preset' } });
    fireEvent.change(screen.getByLabelText('Preset id: Scene 1'), { target: { value: 'wave-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use this preset' }));
    const scene = (getProject(p.id)!.steps.scenes.versions[0].output as any).miya.scenes[0];
    expect(scene.motion).toEqual({ source: 'preset', presetId: 'wave-01' });
  });
});
