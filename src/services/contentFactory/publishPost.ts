// Miya content factory phase 3a: the one publishing path. A post goes to
// YouTube (connector_upload_youtube) or Meta (meta_publish_video, or
// meta_publish_content for a public media address), and the result is what
// the platform did, never what was asked for. Miya Studio's Publish step,
// Marcus's post runner and Content Studio all post through here.
import { uploadYouTubeConnectorVideo } from '../connectors/connectorOutbound';
import { publishMetaContent, publishMetaVideo } from '../metaPublishService';
import { outputPath } from './contentProjectFiles';
import type { PostStatus, ProjectPost } from './contentTypes';

export interface PostResult {
  status: PostStatus;
  link?: string;
  platformId?: string;
  reason?: string;
  /** Meta (or YouTube) is not set up yet: keys are missing in Settings. */
  setupRequired?: boolean;
}

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
      const reason = result?.message || result?.error || 'Meta did not take the post.';
      return result?.setupRequired || result?.setup_required ? { status: 'failed', reason, setupRequired: true } : { status: 'failed', reason };
    }

    let file = post.file;
    if (!isFullPath(file)) {
      const root = String(settings?.outputFolder || '').trim();
      if (!root) return { status: 'failed', reason: 'Choose an output folder in Settings first: the video is saved there.' };
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
      if (!result?.ok) return { status: 'failed', reason: result?.error || 'YouTube did not take the video.' };
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
    const reason = result.message || 'Meta did not take the video.';
    return result.status === 'setup_required' ? { status: 'failed', reason, setupRequired: true } : { status: 'failed', reason };
  } catch (error) {
    return { status: 'failed', reason: error instanceof Error ? error.message : String(error) };
  }
}
