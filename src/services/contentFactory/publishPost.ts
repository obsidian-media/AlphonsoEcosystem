// Miya content factory phase 3a: the one publishing path. A post goes to
// YouTube (connector_upload_youtube) or Meta (meta_publish_video, or
// meta_publish_content for a public media address), and the result is what
// the platform did, never what was asked for. Miya Studio's Publish step,
// Marcus's post runner and Content Studio all post through here.
// Phase 3c: carousels (Instagram by link, Facebook as one photo post), Reels through
// Instagram Login (by link), the user's own storage for those links, and "Post by hand"
// when a link is needed and there is no storage.
import { uploadYouTubeConnectorVideo } from '../connectors/connectorOutbound';
import { publishFacebookPhotos, publishInstagramByUrl, publishMetaContent, publishMetaVideo, type MetaVideoResult } from '../metaPublishService';
import { removeStaged, stageFile, storageConfigured } from '../mediaStorageService';
import { outputPath } from './contentProjectFiles';
import { getInstagramRoute } from './instagramRoute';
import { exportForHand } from './readyToPost';
import { plainSignInReason } from './signInExpiry';
import type { PostStatus, ProjectPost } from './contentTypes';

export interface PostResult {
  status: PostStatus;
  link?: string;
  platformId?: string;
  reason?: string;
  /** Meta (or YouTube) is not set up yet: keys are missing in Settings. */
  setupRequired?: boolean;
  /** Where the post was saved to post by hand (`by_hand`). */
  folder?: string;
}

const NO_OUTPUT_FOLDER = 'Choose an output folder in Settings first: the video is saved there.';

/**
 * What can be posted: a project's post (its `file` relative to the output folder), or a
 * Content Studio post whose `file` is a full path, or which has a public `mediaUrl`.
 */
export type PublishablePost = ProjectPost & { mediaUrl?: string; mediaType?: string };

/** YouTube publishes a scheduled upload itself; a time nearer than this is posted now. */
const YOUTUBE_SCHEDULE_LEAD_MS = 15 * 60_000;

function withHashtags(caption: string, hashtags: string[]): string {
  const missing = hashtags.filter((tag) => !caption.includes(tag));
  const text = caption.trim();
  if (!missing.length) return text;
  if (!text) return missing.join(' ');
  // Hashtags already in the caption: the rest go with them; otherwise on their own line.
  return /#\w/.test(text) ? `${text} ${missing.join(' ')}` : `${text}\n\n${missing.join(' ')}`;
}

const linkAndId = (link?: string | null, id?: string | null) => ({ ...(link ? { link } : {}), ...(id ? { platformId: id } : {}) });
const isFullPath = (file: string) => /^[a-zA-Z]:[\\/]/.test(file) || file.startsWith('/') || file.startsWith('\\\\');

/** A file as (folder, name inside it): a full path is split, a project file stays under the output folder. */
function fileRoot(file: string, root: string): [string, string] {
  if (!isFullPath(file)) return [root, file];
  const at = Math.max(file.lastIndexOf('/'), file.lastIndexOf('\\'));
  return [file.slice(0, at), file.slice(at + 1)];
}

function metaResult(platform: string, result: MetaVideoResult, fallback: string): PostResult {
  if (result.status === 'posted' || result.status === 'scheduled') return { status: result.status, ...linkAndId(result.url, result.postId) };
  const raw = result.message || fallback;
  const reason = plainSignInReason(platform, raw) || raw;
  return result.status === 'setup_required' ? { status: 'failed', reason, setupRequired: true } : { status: 'failed', reason };
}

/**
 * A post that goes by link or as photos (phase 3c), or null for the usual path: Facebook
 * carousels are uploaded from this computer as one photo post; Instagram carousels, and
 * Reels on Instagram Login, go through the user's storage, or are saved to post by hand.
 */
async function postByLink(post: PublishablePost, caption: string, root: string): Promise<PostResult | null> {
  const carousel = post.piece === 'carousel';
  const files = carousel && post.files?.length ? post.files : [post.file];
  const needsRoot = files.some((f) => !isFullPath(f));
  if (post.platform === 'facebook') {
    if (!carousel) return null;
    if (needsRoot && !root) return { status: 'failed', reason: NO_OUTPUT_FOLDER };
    const result = await publishFacebookPhotos({ root, photoFiles: files, message: caption, scheduledAtMs: post.scheduledAtMs });
    return metaResult('facebook', result, 'Facebook did not take the post.');
  }
  if (post.platform !== 'instagram') return null;
  const route = await getInstagramRoute();
  if (!carousel && route !== 'instagram_login') return null;
  if (needsRoot && !root) return { status: 'failed', reason: NO_OUTPUT_FOLDER };
  // No way in to Instagram (phase 3d): save it to post by hand rather than fail.
  if (!route) {
    const { folder } = await exportForHand(post, root);
    return { status: 'by_hand', folder, reason: `Saved to post by hand (Instagram isn't set up in Settings → Connectors → Meta): ${folder}` };
  }
  if (!(await storageConfigured())) {
    const { folder } = await exportForHand(post, root);
    return { status: 'by_hand', folder, reason: `Saved to post by hand (no storage is set up): ${folder}` };
  }
  const keys: string[] = [];
  const urls: string[] = [];
  try {
    for (const file of files) {
      const [folder, name] = fileRoot(file, root);
      const staged = await stageFile(folder, name);
      if (!staged.ok || !staged.url) return { status: 'failed', reason: staged.reason || 'The file could not be put in your storage.' };
      if (staged.key) keys.push(staged.key);
      urls.push(staged.url);
    }
    const result = await publishInstagramByUrl(
      carousel ? { route, mediaType: 'CAROUSEL', imageUrls: urls, caption } : { route, mediaType: 'REELS', videoUrl: urls[0], caption },
    );
    return metaResult('instagram', result, 'Instagram did not take the post.');
  } finally {
    // The bucket keeps nothing once Instagram has it (or refused it).
    for (const key of keys) await removeStaged(key);
  }
}

/** Posts (or schedules) one approved post. Never throws; a failure says why. */
export async function publishPost(post: PublishablePost, settings: { outputFolder?: string | null }, nowMs = Date.now()): Promise<PostResult> {
  const caption = withHashtags(post.caption, post.hashtags || []);
  try {
    // A public image or video address (Content Studio): Meta fetches it.
    if (post.platform !== 'youtube' && post.mediaUrl !== undefined && !post.file) {
      const video = post.mediaType === 'video' || /\.(mp4|mov)(\?|$)/i.test(post.mediaUrl);
      const result = (await publishMetaContent({}, {
        approved: true, platform: post.platform, caption, message: caption, title: post.title,
        imageUrl: video ? '' : post.mediaUrl, videoUrl: video ? post.mediaUrl : '', mediaType: post.mediaType || '',
      })) as { ok?: boolean; published?: boolean; postIds?: string[]; post_ids?: string[]; url?: string; message?: string; error?: string; setupRequired?: boolean; setup_required?: boolean } | null;
      const postIds = Array.isArray(result?.postIds) ? result.postIds : Array.isArray(result?.post_ids) ? result.post_ids : [];
      if (result?.ok && result?.published) return { status: 'posted', ...linkAndId(result.url, postIds[0]) };
      const raw = result?.message || result?.error || 'Meta did not take the post.';
      const reason = plainSignInReason(post.platform, raw) || raw;
      return result?.setupRequired || result?.setup_required ? { status: 'failed', reason, setupRequired: true } : { status: 'failed', reason };
    }

    const byLink = await postByLink(post, caption, String(settings?.outputFolder || '').trim());
    if (byLink) return byLink;

    let file = post.file;
    if (!isFullPath(file)) {
      const root = String(settings?.outputFolder || '').trim();
      if (!root) return { status: 'failed', reason: NO_OUTPUT_FOLDER };
      file = outputPath(root, post.file);
    }

    if (post.platform === 'youtube') {
      const root = String(settings?.outputFolder || '').trim();
      const scheduled = post.scheduledAtMs > nowMs + YOUTUBE_SCHEDULE_LEAD_MS;
      const thumbnail = post.thumbnail ? (isFullPath(post.thumbnail) || !root ? post.thumbnail : outputPath(root, post.thumbnail)) : null;
      const result = await uploadYouTubeConnectorVideo({
        filePath: file,
        title: post.title,
        description: caption,
        tags: (post.hashtags || []).map((tag) => tag.replace(/^#/, '')).filter(Boolean),
        privacyStatus: 'public',
        publishAt: scheduled ? new Date(post.scheduledAtMs).toISOString() : null,
        thumbnailPath: thumbnail,
      }, { approved: true, requestedBy: 'marcus', reason: 'Approved in the Publish step.' });
      if (!result?.ok) {
        const raw = result?.error || 'YouTube did not take the video.';
        return { status: 'failed', reason: plainSignInReason('youtube', raw) || raw };
      }
      const ids = linkAndId(result.url, result.videoId);
      if (result.lockedPrivate) return { status: 'locked_private', ...ids, reason: result.note || 'YouTube kept this video private.' };
      if (scheduled && result.publishAt) return { status: 'scheduled', ...ids };
      if (!scheduled && result.privacyStatus === 'public' && !/could not be read back/.test(result.note || '')) {
        return { status: 'posted', ...ids, ...(result.note ? { reason: result.note } : {}) };
      }
      return { status: 'check', ...ids, reason: result.note || 'YouTube took the video, but its state could not be confirmed; check YouTube Studio.' };
    }

    const result = await publishMetaVideo({
      platform: post.platform,
      localFilePath: file,
      caption,
      title: post.title,
      // Meta cannot schedule Instagram: Marcus's runner sends it at its time.
      scheduledAtMs: post.platform === 'facebook' ? post.scheduledAtMs : null,
      approved: true,
    });
    if (result.status === 'posted' || result.status === 'scheduled') return { status: result.status, ...linkAndId(result.url, result.postId) };
    const raw = result.message || 'Meta did not take the video.';
    const reason = plainSignInReason(post.platform, raw) || raw;
    return result.status === 'setup_required' ? { status: 'failed', reason, setupRequired: true } : { status: 'failed', reason };
  } catch (error) {
    return { status: 'failed', reason: error instanceof Error ? error.message : String(error) };
  }
}
