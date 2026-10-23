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

beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });

function setup(options: { musicSkipped?: boolean } = {}) {
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
  save('assemble', { alphonso: {
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
