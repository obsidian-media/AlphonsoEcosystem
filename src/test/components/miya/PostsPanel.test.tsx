// Phase 3a: Campaign Studio's Posts list (review, edit, approve once, see what happened).
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const cancelScheduledContentPost = vi.fn();
const postOverdueNow = vi.fn();
const scheduleContentPost = vi.fn();
const openExternalUrl = vi.fn();
vi.mock('../../../services/marcusExecutionService', () => ({
  cancelScheduledContentPost: (...a: unknown[]) => cancelScheduledContentPost(...a),
  postOverdueNow: (...a: unknown[]) => postOverdueNow(...a),
  scheduleContentPost: (...a: unknown[]) => scheduleContentPost(...a),
}));
vi.mock('../../../services/browserAutomationService', () => ({ openExternalUrl: (...a: unknown[]) => openExternalUrl(...a) }));

import { PostsPanel } from '../../../components/miya/PostsPanel';
import { createProject, emptyBrief, getProject, saveStepVersion } from '../../../services/contentFactory/contentProjectService';
import { saveBrand } from '../../../services/contentFactory/contentBrandService';
import { savePosts, updatePost } from '../../../services/contentFactory/contentPosts';
import type { ProjectPost } from '../../../services/contentFactory/contentTypes';

function finished(outputs = ['16x9', '9x16']) {
  const brand = saveBrand({ name: 'Acme', platforms: ['YouTube', 'Instagram'] });
  const p = createProject(brand.id, 'Launch', { ...emptyBrief(), idea: 'x' });
  saveStepVersion(p.id, 'assemble', { output: { miya: { outputs: outputs.map((aspect) => ({ aspect, path: `acme/launch/output/v-${aspect}.mp4` })) } }, summary: 'v', joseCommandId: null });
  const project = saveStepVersion(p.id, 'campaign', {
    output: { miya: { platforms: [{ platform: 'Instagram', caption: 'IG caption', hashtags: ['#a'] }], ads: [], calendar: [] } }, summary: 'c', joseCommandId: null,
  });
  return { brand, project };
}

function withPost(patch: Partial<ProjectPost>) {
  const { brand, project } = finished();
  savePosts(project.id, [{
    id: 'p1', platform: 'instagram', piece: 'reel', file: 'f', title: 'Launch', caption: 'IG caption', hashtags: [],
    scheduledAtMs: new Date(2026, 10, 2, 18, 0).getTime(), status: 'draft', ...patch,
  }]);
  return { brand, project: getProject(project.id)! };
}

const renderPanel = (project = finished().project, brand = saveBrand({ name: 'B' }), approvePosts = vi.fn()) => {
  const onChange = vi.fn();
  const view = render(<PostsPanel project={project} brand={brand} approvePosts={approvePosts} onChange={onChange} />);
  return { ...view, onChange, approvePosts };
};

beforeEach(() => {
  localStorage.clear();
  [cancelScheduledContentPost, postOverdueNow, scheduleContentPost, openExternalUrl].forEach((f) => f.mockReset());
});

describe('PostsPanel', () => {
  it('makes the posts list from the finished video and the campaign', () => {
    const { brand, project } = finished();
    const { onChange } = renderPanel(project, brand);
    fireEvent.click(screen.getByRole('button', { name: 'Make the posts list' }));
    expect(getProject(project.id)!.posts!.map((p) => `${p.platform}:${p.piece}`)).toEqual(['youtube:video', 'youtube:short', 'instagram:reel']);
    expect(onChange).toHaveBeenCalled();
  });

  it('says why a post is missing', () => {
    const { brand, project } = finished(['16x9']);
    renderPanel(project, brand);
    fireEvent.click(screen.getByRole('button', { name: 'Make the posts list' }));
    expect(screen.getAllByText(/no 9:16 version/).length).toBe(2);
  });

  it('edits a post before it is approved', () => {
    const { brand, project } = withPost({});
    renderPanel(project, brand);
    fireEvent.change(screen.getByLabelText('Instagram Reel caption'), { target: { value: 'New caption' } });
    fireEvent.change(screen.getByLabelText('Instagram Reel time'), { target: { value: '2026-11-03T09:30' } });
    const post = getProject(project.id)!.posts![0];
    expect(post.caption).toBe('New caption');
    expect(post.scheduledAtMs).toBe(new Date(2026, 10, 3, 9, 30).getTime());
  });

  it('moves a scheduled Instagram post in the runner when its time changes', () => {
    const { brand, project } = withPost({ status: 'scheduled' });
    renderPanel(project, brand);
    fireEvent.change(screen.getByLabelText('Instagram Reel time'), { target: { value: '2026-11-04T12:00' } });
    expect(scheduleContentPost).toHaveBeenCalledWith({ projectId: project.id, postId: 'p1', platform: 'instagram', scheduledAt: new Date(2026, 10, 4, 12, 0).getTime() });
  });

  it('cancels a post and its scheduled send', () => {
    const { brand, project } = withPost({ status: 'scheduled' });
    renderPanel(project, brand);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel Instagram Reel' }));
    expect(getProject(project.id)!.posts![0].status).toBe('cancelled');
    expect(cancelScheduledContentPost).toHaveBeenCalledWith('p1');
  });

  it('approves the list once', () => {
    const { brand, project } = withPost({});
    const { approvePosts } = renderPanel(project, brand);
    fireEvent.click(screen.getByRole('button', { name: 'Approve and schedule' }));
    expect(approvePosts).toHaveBeenCalledTimes(1);
  });

  it('shows what happened: the link, the reason, and "Post it now" for a late post', () => {
    const { brand, project } = withPost({ status: 'posted', link: 'https://www.instagram.com/reel/x' });
    const { rerender } = renderPanel(project, brand);
    expect(screen.getByText('Posted')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open Instagram Reel' }));
    expect(openExternalUrl).toHaveBeenCalledWith('https://www.instagram.com/reel/x');
    expect((screen.getByLabelText('Instagram Reel caption') as HTMLTextAreaElement).disabled).toBe(true);

    updatePost(project.id, 'p1', { status: 'ask', reason: 'This was due more than 7 days ago.' });
    rerender(<PostsPanel project={getProject(project.id)!} brand={brand} approvePosts={vi.fn()} onChange={vi.fn()} />);
    expect(screen.getByText('This was due more than 7 days ago.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Post Instagram Reel now' }));
    expect(postOverdueNow).toHaveBeenCalledWith('p1');
  });
});
