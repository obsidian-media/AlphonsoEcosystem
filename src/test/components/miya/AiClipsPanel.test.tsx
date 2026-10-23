import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../../services/contentFactory/contentProjectFiles', async () => {
  const actual = await vi.importActual<typeof import('../../../services/contentFactory/contentProjectFiles')>('../../../services/contentFactory/contentProjectFiles');
  return { ...actual, mediaUrl: vi.fn((root: string, rel: string) => `asset-test://${rel}`), allowMediaFolder: vi.fn(async () => true), loadProjectImage: vi.fn(async () => null) };
});
vi.mock('../../../services/contentFactory/contentMediaExecutor', () => ({
  resolveProjectClipEngine: vi.fn(async () => (globalThis as any).__engine),
}));

import { AiClipsPanel } from '../../../components/miya/AiClipsPanel';
import { createProject, emptyBrief, getProject, getVideoSettings, saveStepVersion } from '../../../services/contentFactory/contentProjectService';

function setup(clips?: unknown) {
  const p = createProject('b', 'P', emptyBrief());
  saveStepVersion(p.id, 'scenes', { output: { miya: { style: 's', scenes: [
    { id: 's1', startSec: 0, endSec: 3, description: 'Hook', mainMoment: true },
    { id: 's2', startSec: 3, endSec: 10, description: 'Middle', mainMoment: false },
    { id: 's3', startSec: 10, endSec: 14, description: 'Call to action', mainMoment: true },
  ] } }, summary: '', joseCommandId: null });
  if (clips) saveStepVersion(p.id, 'clips', { output: { miya: clips }, summary: '', joseCommandId: null });
  return getProject(p.id)!;
}

const props = (project: any, extra: Record<string, unknown> = {}) => ({
  project, outputRoot: 'D:\\Content', waiting: false, onRun: vi.fn(), onChooseVersion: vi.fn(), onApprove: vi.fn(), onCheckAgain: vi.fn(), onChange: vi.fn(), ...extra,
});

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('alphonso_settings', JSON.stringify({ zeroCostMode: false, paidModels: { runwayPricePerSecondUsd: 0.05 } }));
  (globalThis as any).__engine = { engine: 'local', modelId: 'ltx_video_2b', maxSeconds: 5 };
});

// Miya content factory phase 2b: AI clips in the Scene Builder.
describe('AiClipsPanel', () => {
  it('saves how much AI and which engine, and says which engine will be used', async () => {
    const project = setup();
    const p = props(project);
    render(<AiClipsPanel {...p} />);
    await waitFor(() => expect(screen.getByText(/Uses your ComfyUI \(ltx_video_2b\)/)).toBeTruthy());
    fireEvent.change(screen.getByLabelText('AI clips for'), { target: { value: 'every' } });
    expect(getVideoSettings(getProject(project.id)!).aiClips).toBe('every');
    fireEvent.change(screen.getByLabelText('Clip engine'), { target: { value: 'runway' } });
    expect(getVideoSettings(getProject(project.id)!).clipEngine).toBe('runway');
    expect(p.onChange).toHaveBeenCalled();
  });

  it('says why no engine can be used', async () => {
    (globalThis as any).__engine = { engine: null, reason: 'Install a video model in Runtime Hub (ComfyUI), or add a Runway key in Connectors.' };
    render(<AiClipsPanel {...props(setup())} />);
    await waitFor(() => expect(screen.getByText('Install a video model in Runtime Hub (ComfyUI), or add a Runway key in Connectors.')).toBeTruthy());
  });

  it('shows the Runway estimate for the main moments, and "Make AI clips" with it while the run waits', async () => {
    (globalThis as any).__engine = { engine: 'runway' };
    const p = props(setup(), { waiting: true });
    render(<AiClipsPanel {...p} />);
    // Two main moments of 3 s and 4 s: two 5 s clips at $0.05 a second.
    await waitFor(() => expect(screen.getByText('2 clips, about $0.50')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Make AI clips (about $0.50)' }));
    expect(p.onApprove).toHaveBeenCalled();
  });

  it('plays each clip that was made, says why the others were not, and checks a pending one again', async () => {
    const project = setup({ engine: 'local', model: 'ltx_video_2b', clips: [
      { sceneId: 's1', status: 'done', path: 'b/p/clips/v1-s1.mp4', seconds: 3 },
      { sceneId: 's2', status: 'skipped', reason: 'This scene has no picture to start from.' },
      { sceneId: 's3', status: 'pending', jobId: 'j1', seconds: 4, target: 'b/p/clips/v1-s3.mp4' },
    ] });
    const p = props(project);
    const { container } = render(<AiClipsPanel {...p} />);
    await waitFor(() => expect(container.querySelectorAll('section[aria-label="AI clips"] video')).toHaveLength(1));
    expect(container.querySelector('section[aria-label="AI clips"] video')!.getAttribute('src')).toBe('asset-test://b/p/clips/v1-s1.mp4');
    expect(screen.getByText('This scene has no picture to start from.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(p.onCheckAgain).toHaveBeenCalled();
  });
});
