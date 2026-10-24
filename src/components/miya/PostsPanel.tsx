import React, { useState } from 'react';
import { PostNumbers } from './PostNumbers';
import { Badge, Button } from '../ui';
import { buildPosts, POST_STATUS_LABEL, savePosts, updatePost } from '../../services/contentFactory/contentPosts';
import { cancelProjectPost, movePost, type MoveResult } from '../../services/contentFactory/contentPostMoves';
import { postOverdueNow } from '../../services/marcusExecutionService';
import { openExternalUrl } from '../../services/browserAutomationService';
import type { ContentBrand, ContentProject, PostStatus, ProjectPost } from '../../services/contentFactory/contentTypes';

const PLATFORM: Record<ProjectPost['platform'], string> = { youtube: 'YouTube', instagram: 'Instagram', facebook: 'Facebook' };
const PIECE: Record<ProjectPost['piece'], string> = { video: 'video', short: 'Short', reel: 'Reel', carousel: 'carousel' };
const VARIANT: Partial<Record<PostStatus, 'success' | 'warning' | 'error' | 'info'>> = {
  posted: 'success', scheduled: 'info', approved: 'info', failed: 'error', check: 'warning', locked_private: 'warning', ask: 'warning',
};
const EDITABLE: PostStatus[] = ['draft', 'approved', 'failed', 'scheduled', 'over_limit'];

/** A local time for <input type="datetime-local">, and back. */
function toLocalInput(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])).getTime() : null;
}

/**
 * Campaign Studio's Posts list (content factory phase 3a): one row per platform and piece,
 * editable until it goes out, approved once with "Approve and schedule", then what happened.
 */
export function PostsPanel({ project, brand, approvePosts, onChange }: {
  project: ContentProject;
  brand: ContentBrand | null;
  approvePosts(): void;
  onChange(): void;
}) {
  const [notes, setNotes] = useState<string[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const posts = project.posts || [];
  // Drafts, and posts that failed (approved again, they are retried).
  const drafts = posts.filter((p) => p.status === 'draft' || p.status === 'failed');

  const make = () => {
    if (!brand) return;
    const built = buildPosts(project, brand, Date.now());
    setNotes(built.notes);
    if (built.posts.length) savePosts(project.id, built.posts);
    onChange();
  };

  const show = (result: MoveResult) => {
    setProblem(result.ok ? null : `${result.reason || 'That could not be changed.'}${result.manageUrl ? ` (${result.manageUrl})` : ''}`);
    onChange();
  };

  const change = (post: ProjectPost, patch: Partial<ProjectPost>) => {
    // A new time goes through the one move path (Marcus's runner, or the platform itself).
    if (patch.scheduledAtMs) {
      void movePost(project.id, post.id, patch.scheduledAtMs).then(show);
      return;
    }
    show(updatePost(project.id, post.id, patch));
  };

  const cancel = (post: ProjectPost) => { void cancelProjectPost(project.id, post.id).then(show); };

  const field = 'mt-1 w-full rounded-xl bg-(--surface-2) px-3 py-2 text-[12px] text-(--text-1) disabled:opacity-60';
  return (
    <section className="space-y-3 rounded-2xl bg-(--surface-1) p-4 text-[12px]" aria-label="Posts">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-(--text-1)">Posts</h3>
        {(posts.length === 0 || posts.every((p) => p.status === 'draft' || p.status === 'cancelled')) && (
          <Button size="sm" variant="secondary" onClick={make} disabled={!brand}>{posts.length ? 'Make the list again' : 'Make the posts list'}</Button>
        )}
      </div>
      {posts.length === 0 && (
        <p className="text-(--text-3)">When the finished video and the campaign are ready, make the posts list: one post per platform, with its copy and a time you can change. Nothing goes out until you approve it.</p>
      )}
      {notes.map((note) => <p key={note} className="text-(--warning)">{note}</p>)}
      {posts.map((post) => {
        const label = `${PLATFORM[post.platform]} ${PIECE[post.piece]}`;
        // Scheduled on YouTube or Facebook: changed on the Calendar, which asks before changing the platform.
        const onPlatform = post.status === 'scheduled' && !!post.platformId && post.platform !== 'instagram';
        const editable = EDITABLE.includes(post.status) && !onPlatform;
        return (
          <div key={post.id} className="space-y-2 rounded-xl bg-(--surface-2) p-3" aria-label={label}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-(--text-1)">{label}</span>
              <Badge variant={VARIANT[post.status] || 'default'}>{POST_STATUS_LABEL[post.status]}</Badge>
              {post.link && <Button size="sm" variant="ghost" aria-label={`Open ${label}`} onClick={() => { void openExternalUrl(post.link as string); }}>Open</Button>}
              {post.status === 'ask' && <Button size="sm" aria-label={`Post ${label} now`} onClick={() => { postOverdueNow(post.id); onChange(); }}>Post it now</Button>}
              {!onPlatform && !['posting', 'posted', 'locked_private', 'check', 'cancelled'].includes(post.status) && (
                <Button size="sm" variant="ghost" aria-label={`Cancel ${label}`} onClick={() => cancel(post)}>Cancel</Button>
              )}
            </div>
            {post.reason && <p className="text-(--text-2)">{post.reason}</p>}
            {post.platformId && ['posted', 'scheduled'].includes(post.status) && <PostNumbers projectId={project.id} brandId={project.brandId} post={post} />}
            {onPlatform && <p className="text-(--text-3)">Scheduled on {PLATFORM[post.platform]}: move or cancel it on the Calendar, which asks before changing it there.</p>}
            <div className="grid gap-2 md:grid-cols-2">
              {post.platform === 'youtube' && (
                <label className="block text-[11px] text-(--text-3)">
                  Title
                  <input aria-label={`${label} title`} className={field} value={post.title} disabled={!editable} onChange={(e) => change(post, { title: e.target.value })} />
                </label>
              )}
              <label className="block text-[11px] text-(--text-3)">
                Time
                <input aria-label={`${label} time`} type="datetime-local" className={field} value={toLocalInput(post.scheduledAtMs)} disabled={!editable}
                  onChange={(e) => { const at = fromLocalInput(e.target.value); if (at) change(post, { scheduledAtMs: at }); }} />
              </label>
            </div>
            <label className="block text-[11px] text-(--text-3)">
              {post.platform === 'youtube' ? 'Description' : 'Caption'}
              <textarea aria-label={`${label} caption`} className={field} rows={3} value={post.caption} disabled={!editable} onChange={(e) => change(post, { caption: e.target.value })} />
            </label>
            <label className="block text-[11px] text-(--text-3)">
              Hashtags (separated by spaces)
              <input aria-label={`${label} hashtags`} className={field} value={post.hashtags.join(' ')} disabled={!editable}
                onChange={(e) => change(post, { hashtags: e.target.value.split(/\s+/).filter(Boolean) })} />
            </label>
          </div>
        );
      })}
      {problem && <p className="text-(--error)">{problem}</p>}
      {drafts.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" onClick={approvePosts}>Approve and schedule</Button>
          <span className="text-(--text-3)">Marcus posts {drafts.length === 1 ? 'this post' : `these ${drafts.length} posts`} at their times. YouTube and Facebook are scheduled on the platform; Instagram is sent by Alphonso at its time (the next start, if the app is closed then).</span>
        </div>
      )}
    </section>
  );
}
