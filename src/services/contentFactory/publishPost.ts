// Miya content factory phase 3a: the one publishing path. A post goes to
// YouTube (connector_upload_youtube) or Meta (meta_publish_video), and the
// result is what the platform did, never what was asked for. Miya Studio's
// Publish step, Marcus's post runner and Content Studio all post through here.
import { uploadYouTubeConnectorVideo } from '../connectors/connectorOutbound';
import { publishMetaVideo } from '../metaPublishService';
import { outputPath } from './contentProjectFiles';
import type { PostStatus, ProjectPost } from './contentTypes';

export interface PostResult {
  status: PostStatus;
  link?: string;
  platformId?: string;
  reason?: string;
}

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

/** Posts (or schedules) one approved post. Never throws; a failure says why. */
export async function publishPost(post: ProjectPost, settings: { outputFolder?: string | null }, nowMs = Date.now()): Promise<PostResult> {
  const root = String(settings?.outputFolder || '').trim();
  if (!root) return { status: 'failed', reason: 'Choose an output folder in Settings first: the video is saved there.' };
  const file = outputPath(root, post.file);
  try {
    if (post.platform === 'youtube') {
      const scheduled = post.scheduledAtMs > nowMs + YOUTUBE_SCHEDULE_LEAD_MS;
      const result = await uploadYouTubeConnectorVideo({
        filePath: file,
        title: post.title,
        description: withHashtags(post.caption, post.hashtags),
        tags: post.hashtags.map((tag) => tag.replace(/^#/, '')).filter(Boolean),
        privacyStatus: 'public',
        publishAt: scheduled ? new Date(post.scheduledAtMs).toISOString() : null,
        thumbnailPath: post.thumbnail ? outputPath(root, post.thumbnail) : null,
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
      caption: withHashtags(post.caption, post.hashtags),
      title: post.title,
      // Meta cannot schedule Instagram: Marcus's runner sends it at its time.
      scheduledAtMs: post.platform === 'facebook' ? post.scheduledAtMs : null,
      approved: true,
    });
    if (result.status === 'posted' || result.status === 'scheduled') return { status: result.status, ...linkAndId(result.url, result.postId) };
    return { status: 'failed', reason: result.message || 'Meta did not take the video.' };
  } catch (error) {
    return { status: 'failed', reason: error instanceof Error ? error.message : String(error) };
  }
}
