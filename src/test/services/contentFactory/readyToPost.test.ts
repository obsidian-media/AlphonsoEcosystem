// Phase 3c: a post Instagram can't take without storage is saved ready to post by hand.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }));

import { exportForHand, handFolderFor, BY_HAND_REMINDER } from '../../../services/contentFactory/readyToPost';
import type { ProjectPost } from '../../../services/contentFactory/contentTypes';

const post = (patch: Partial<ProjectPost> = {}): ProjectPost => ({
  id: 'c1', platform: 'instagram', piece: 'carousel', file: 'acme/launch/carousel/v2-1.png',
  files: ['acme/launch/carousel/v2-1.png', 'acme/launch/carousel/v2-2.png'], title: 'Launch', caption: 'Swipe', hashtags: ['#a', '#b'],
  scheduledAtMs: 0, status: 'approved', ...patch,
});

beforeEach(() => invoke.mockReset());

it('the folder sits in the project, named by platform, piece and version', () => {
  expect(handFolderFor(post())).toBe('acme/launch/ready-to-post/instagram-carousel-v2');
  expect(handFolderFor(post({ piece: 'reel', file: 'acme/launch/output/video-9x16-v3.mp4', files: undefined }))).toBe('acme/launch/ready-to-post/instagram-reel-v3');
  expect(handFolderFor(post({ file: 'acme/launch/carousel/slide.png', files: undefined }))).toBe('acme/launch/ready-to-post/instagram-carousel-v1');
});

it('exportForHand copies the files with the caption and returns the folder the backend used', async () => {
  invoke.mockResolvedValue({ ok: true, folder: 'acme/launch/ready-to-post/instagram-carousel-v2-2', files: [] });
  expect(await exportForHand(post(), 'D:/Content')).toEqual({ folder: 'acme/launch/ready-to-post/instagram-carousel-v2-2' });
  expect(invoke).toHaveBeenCalledWith('content_ready_to_post', {
    workspaceRoot: 'D:/Content', folder: 'acme/launch/ready-to-post/instagram-carousel-v2',
    files: ['acme/launch/carousel/v2-1.png', 'acme/launch/carousel/v2-2.png'], caption: 'Swipe\n\n#a #b',
  });
});

it('a refusal is passed on', async () => {
  invoke.mockResolvedValue({ ok: false, reason: 'A file was not found.' });
  await expect(exportForHand(post(), 'D:/Content')).rejects.toThrow('A file was not found.');
});

it('the reminder says where the files are', () => {
  expect(BY_HAND_REMINDER(post(), 'acme/launch/ready-to-post/instagram-carousel-v2')).toBe(
    'Time to post Launch on Instagram by hand: the files and caption are in acme/launch/ready-to-post/instagram-carousel-v2.',
  );
});
