// Phase 4b: what was asked of Higgsfield by name, in Quick package and under Chat's reply.
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../../services/contentFactory/contentProjectFiles', async () => {
  const actual = await vi.importActual<typeof import('../../../services/contentFactory/contentProjectFiles')>('../../../services/contentFactory/contentProjectFiles');
  return { ...actual, mediaUrl: vi.fn((_r: string, rel: string) => `asset-test://${rel}`), allowMediaFolder: vi.fn(async () => true), loadProjectImage: vi.fn(async () => 'data:image/png;base64,AAA') };
});
vi.mock('../../../services/contentFactory/chatMedia', () => ({
  listChatMedia: vi.fn(() => (globalThis as any).__chatMedia),
  checkChatMedia: vi.fn(async () => null),
}));
vi.mock('../../../services/contentFactory/higgsfieldByName', () => ({
  listHiggsfieldResults: vi.fn(() => (globalThis as any).__results),
  checkHiggsfieldResult: vi.fn(async () => null),
}));

import { ChatMediaList, HiggsfieldMedia, HiggsfieldResultsList } from '../../../components/miya/HiggsfieldResults';
import { checkHiggsfieldResult } from '../../../services/contentFactory/higgsfieldByName';
import { checkChatMedia } from '../../../services/contentFactory/chatMedia';

const video = { id: 'h1', kind: 'video', prompt: 'a pour', path: 'Higgsfield/2026-10-24/video-1.mp4', status: 'done', atMs: 1, usd: 0.4 } as const;
const picture = { id: 'h2', kind: 'picture', prompt: 'a cat', path: 'Higgsfield/2026-10-24/picture-1.png', status: 'done', atMs: 2 } as const;
const pending = { id: 'h3', kind: 'video', prompt: 'a wave', path: 'Higgsfield/2026-10-24/video-2.mp4', status: 'pending', atMs: 3, requestId: 'r' } as const;

const music = { id: 'm1', kind: 'music', prompt: 'calm piano', path: 'Miya/2026-10-30/music-1.wav', status: 'done', atMs: 4 } as const;
const clipPending = { id: 'm2', kind: 'video', prompt: 'a boat', path: 'Miya/2026-10-30/video-1.mp4', status: 'pending', atMs: 5, jobId: 'j' } as const;

beforeEach(() => { (globalThis as any).__results = [video, picture, pending]; (globalThis as any).__chatMedia = [music, clipPending]; vi.clearAllMocks(); });

describe('Made from Chat (closing phase)', () => {
  it('plays music from the output folder', async () => {
    const { container } = render(<HiggsfieldMedia outputRoot="D:\\Content" result={music} />);
    await waitFor(() => expect(container.querySelector('audio')?.getAttribute('src')).toBe('asset-test://Miya/2026-10-30/music-1.wav'));
  });

  it("Quick package lists Miya's videos and music, with Check again for a clip still in ComfyUI", async () => {
    render(<ChatMediaList outputRoot="D:\\Content" />);
    expect(screen.getByText('Made from Chat')).toBeTruthy();
    expect(screen.getByText('calm piano')).toBeTruthy();
    expect(screen.getByText('Still being made in ComfyUI…')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(checkChatMedia).toHaveBeenCalledWith('m2'));
  });
});

describe('Higgsfield results', () => {
  it('plays a video and shows a picture from the output folder', async () => {
    const { container } = render(<><HiggsfieldMedia outputRoot="D:\\Content" result={video} /><HiggsfieldMedia outputRoot="D:\\Content" result={picture} /></>);
    await waitFor(() => expect(container.querySelector('video')?.getAttribute('src')).toBe('asset-test://Higgsfield/2026-10-24/video-1.mp4'));
    expect(await screen.findByAltText('a cat')).toBeTruthy();
  });

  it('Quick package lists them, with Check again for one still being made', async () => {
    render(<HiggsfieldResultsList outputRoot="D:\\Content" />);
    expect(screen.getByText('Made with Higgsfield')).toBeTruthy();
    expect(screen.getByText('Higgsfield/2026-10-24/video-1.mp4 · about $0.40')).toBeTruthy();
    expect(screen.getByText('Waiting for Higgsfield…')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(checkHiggsfieldResult).toHaveBeenCalledWith('h3'));
  });

  it('shows nothing while nothing was asked', () => {
    (globalThis as any).__results = [];
    const { container } = render(<HiggsfieldResultsList outputRoot="D:\\Content" />);
    expect(container.textContent).toBe('');
  });
});
