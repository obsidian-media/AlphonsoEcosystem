// Phase 3d: Shorts Studio — each Short's kind, platforms, fit, player, redo and send back.
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../../services/contentFactory/contentProjectFiles', async () => {
  const actual = await vi.importActual<typeof import('../../../services/contentFactory/contentProjectFiles')>('../../../services/contentFactory/contentProjectFiles');
  return {
    ...actual,
    loadProjectImage: vi.fn(async () => 'data:image/jpeg;base64,AAAA'),
    mediaUrl: vi.fn((_root: string, rel: string) => `asset-test://${rel}`),
    allowMediaFolder: vi.fn(async () => true),
  };
});

import { ShortsStudioTab } from '../../../components/miya/ShortsStudioTab';
import { createProject, emptyBrief, getProject, getShortsSettings, saveStepVersion, setShortsSettings } from '../../../services/contentFactory/contentProjectService';

beforeEach(() => localStorage.clear());

function setup() {
  const p = createProject('b', 'P', emptyBrief());
  const shorts = [
    { id: 'sh1', kind: 'mini', title: 'Why coffee waits', hook: 'Your coffee is lying', seconds: 45, platforms: ['youtube', 'facebook'], copy: [], parts: [{ spoken: 'x', imagePrompt: 'y', seconds: 5 }] },
    { id: 'sh2', kind: 'highlight', title: 'The pour', hook: 'Watch this', seconds: 40, platforms: [], copy: [], moment: { startSec: 10, endSec: 50 } },
  ];
  const made = {
    sh1: { shortId: 'sh1', status: 'done', path: 'b/p/shorts/sh1/v1.mp4', seconds: 95, fileVersion: 1 },
    sh2: { shortId: 'sh2', status: 'failed', reason: 'Make the finished video first.' },
  };
  saveStepVersion(p.id, 'shorts', { output: { miya: { shorts }, made }, summary: '', joseCommandId: null });
  return getProject(p.id)!;
}
const props = () => ({ outputRoot: 'D:/Content', runStep: vi.fn(), chooseVersion: vi.fn(), redo: vi.fn(), reject: vi.fn(), addShort: vi.fn(), onChange: vi.fn() });
const shortOf = (id: string, sid: string) => (getProject(id)!.steps.shorts.versions[0].output as { miya: { shorts: Record<string, unknown>[] } }).miya.shorts.find((s) => s.id === sid)!;

describe('ShortsStudioTab', () => {
  it("shows each Short's kind, hook, length and its fit on each platform", () => {
    render(<ShortsStudioTab project={setup()} {...props()} />);
    expect(screen.getByRole('heading', { name: 'Shorts Studio' })).toBeTruthy();
    expect(screen.getByText('Your coffee is lying')).toBeTruthy();
    expect((screen.getByLabelText('Kind of Short 1') as HTMLSelectElement).value).toBe('mini');
    expect(screen.getByText('1:35')).toBeTruthy();
    expect(screen.getByText(/Facebook: Not a Facebook Reel/)).toBeTruthy();
    expect(screen.getByText('YouTube: fits')).toBeTruthy();
  });

  it("changing a Short's kind or platforms is saved", () => {
    const p = setup();
    const pr = props();
    render(<ShortsStudioTab project={p} {...pr} />);
    fireEvent.change(screen.getByLabelText('Kind of Short 1'), { target: { value: 'cut' } });
    fireEvent.click(screen.getByLabelText('Short 1 on Instagram'));
    expect(shortOf(p.id, 'sh1')).toMatchObject({ kind: 'cut', platforms: ['youtube', 'facebook', 'instagram'] });
    expect(pr.onChange).toHaveBeenCalled();
  });

  it('the player plays a made Short', async () => {
    render(<ShortsStudioTab project={setup()} {...props()} />);
    await waitFor(() => expect(document.querySelector('video')?.getAttribute('src')).toBe('asset-test://b/p/shorts/sh1/v1.mp4'));
  });

  it('Redo makes that Short again; Send back with a reason', () => {
    const pr = props();
    render(<ShortsStudioTab project={setup()} {...pr} />);
    fireEvent.click(screen.getByRole('button', { name: 'Redo Short 2' }));
    expect(pr.redo).toHaveBeenCalledWith('sh2');
    fireEvent.click(screen.getByRole('button', { name: 'Send back Short 1' }));
    fireEvent.change(screen.getByLabelText('What is wrong with it?'), { target: { value: 'Hook too slow' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send back with this reason' }));
    expect(pr.reject).toHaveBeenCalledWith('sh1', 'Hook too slow');
  });

  it('a Short on no platform says it won\u2019t be posted; a failed one says why', () => {
    render(<ShortsStudioTab project={setup()} {...props()} />);
    expect(screen.getByText(/won.t be posted: tick a platform/)).toBeTruthy();
    expect(screen.getByText('Make the finished video first.')).toBeTruthy();
  });

  it('Add a Short, and the Shorts\u2019 AI clip setting is saved', () => {
    const p = setup();
    const pr = props();
    render(<ShortsStudioTab project={p} {...pr} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add a Short' }));
    expect(pr.addShort).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Its own mini-script' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'A highlight with its own hook' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'A plain cut of the video' }));
    expect(pr.addShort).toHaveBeenCalledWith('cut');
    fireEvent.change(screen.getByLabelText('AI clips for Shorts'), { target: { value: 'every' } });
    expect(getShortsSettings(getProject(p.id)!).aiClips).toBe('every');
  });

  it('without Shorts it says how to make them', () => {
    render(<ShortsStudioTab project={createProject('b', 'P', emptyBrief())} {...props()} />);
    expect(screen.getByText(/add .Shorts. to What to make/i)).toBeTruthy();
  });

  it('a failed Short is flagged', () => {
    render(<ShortsStudioTab project={setup()} {...props()} />);
    expect(screen.getByTestId('short-failed-sh2')).toBeTruthy();
    expect(screen.queryByTestId('short-failed-sh1')).toBeNull();
  });

  it('the Shorts can use Runway for their clips', () => {
    const p = setup();
    setShortsSettings(p.id, { aiClips: 'main', clipEngine: 'local' });
    render(<ShortsStudioTab project={getProject(p.id)!} {...props()} />);
    fireEvent.change(screen.getByLabelText('Clip engine for Shorts'), { target: { value: 'runway' } });
    expect(getShortsSettings(getProject(p.id)!)).toEqual({ aiClips: 'main', clipEngine: 'runway' });
    fireEvent.change(screen.getByLabelText('Clip engine for Shorts'), { target: { value: 'higgsfield' } });
    expect(getShortsSettings(getProject(p.id)!)).toEqual({ aiClips: 'main', clipEngine: 'higgsfield' });
  });

  // Phase 4c: a mini Short's part can get a motion.
  it("a mini Short's part can get a motion", () => {
    const p = setup();
    render(<ShortsStudioTab project={getProject(p.id)!} {...props()} />);
    fireEvent.change(screen.getByLabelText('Motion: Why coffee waits, part 1'), { target: { value: 'preset' } });
    fireEvent.change(screen.getByLabelText('Preset id: Why coffee waits, part 1'), { target: { value: 'nod' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use this preset' }));
    const short = (getProject(p.id)!.steps.shorts.versions[0].output as any).miya.shorts.find((x: any) => x.id === 'sh1');
    expect(short.parts[0].motion).toEqual({ source: 'preset', presetId: 'nod' });
  });
});
