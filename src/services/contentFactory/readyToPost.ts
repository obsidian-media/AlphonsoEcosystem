// "Post by hand" (content factory phase 3c, owner): a post Instagram can take only by a
// link, when the user has no storage set up, is saved in the project folder with its
// caption, ready to post by hand, and Marcus reminds the user at its time. Nothing fails.
import { invoke } from '@tauri-apps/api/core';
import type { ProjectPost } from './contentTypes';

const PLATFORM_NAME: Record<string, string> = { instagram: 'Instagram', facebook: 'Facebook', youtube: 'YouTube' };

function captionText(post: ProjectPost): string {
  const caption = (post.caption || '').trim();
  const missing = (post.hashtags || []).filter((tag) => !caption.includes(tag));
  if (!missing.length) return caption;
  return caption ? `${caption}\n\n${missing.join(' ')}` : missing.join(' ');
}

/** `<brand>/<project>/ready-to-post/<platform>-<piece>-v<n>` (from where the post's file is). */
export function handFolderFor(post: ProjectPost): string {
  const parts = post.file.split(/[\\/]/).filter(Boolean);
  const project = parts.slice(0, Math.max(1, Math.min(2, parts.length - 1))).join('/');
  const version = /v(\d+)/i.exec(parts[parts.length - 1] || '')?.[1] || '1';
  return `${project}/ready-to-post/${post.platform}-${post.piece}-v${version}`;
}

/**
 * Copies the post's files and its caption (`caption.txt`) into its hand-posting folder.
 * The backend never overwrites: a folder already there gets `-2`, `-3`… Returns the folder used.
 */
export async function exportForHand(post: ProjectPost, root: string): Promise<{ folder: string }> {
  const files = post.files?.length ? post.files : [post.file];
  const result = await invoke<{ ok: boolean; folder?: string; reason?: string }>('content_ready_to_post', {
    workspaceRoot: root, folder: handFolderFor(post), files, caption: captionText(post),
  });
  if (!result?.ok || !result.folder) throw new Error(result?.reason || 'The post could not be saved to post by hand.');
  return { folder: result.folder };
}

/** What Marcus says at the post's time. */
export function BY_HAND_REMINDER(post: ProjectPost, folder: string): string {
  return `Time to post ${post.title} on ${PLATFORM_NAME[post.platform] || post.platform} by hand: the files and caption are in ${folder}.`;
}
