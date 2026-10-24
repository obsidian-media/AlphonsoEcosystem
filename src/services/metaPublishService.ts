import { invoke } from '@tauri-apps/api/core';
import { getConnectorCredential } from './connectors/connectorAuth';

/** Keys saved in Settings → Connectors → Meta; a key not saved is left for the environment (QA Bug 32). */
export function savedMetaCredentials() {
  const saved = (key: string) => getConnectorCredential('meta', key) || null;
  return {
    accessToken: saved('META_ACCESS_TOKEN'),
    pageAccessToken: saved('META_PAGE_ACCESS_TOKEN'),
    pageId: saved('META_PAGE_ID'),
    instagramBusinessAccountId: saved('INSTAGRAM_BUSINESS_ACCOUNT_ID'),
    appSecret: saved('META_APP_SECRET'),
    appId: saved('META_APP_ID'),
    instagramLoginToken: saved('INSTAGRAM_LOGIN_TOKEN'),
    instagramLoginUserId: saved('INSTAGRAM_LOGIN_USER_ID'),
  };
}

export function buildMetaPublishRequest(job: Record<string, any> = {}, options: Record<string, any> = {}) {
  const platform = String(options.platform || job.request?.platform || 'instagram').trim().toLowerCase() || 'instagram';
  return {
    approved: Boolean(options.approved),
    platform,
    caption: String(options.caption || job.draft?.caption || job.draft?.hook || job.request?.idea || '').trim(),
    message: String(options.message || job.draft?.caption || job.draft?.hook || job.request?.idea || '').trim(),
    title: String(options.title || job.request?.idea || '').trim(),
    link: String(options.link || job.preview?.link || '').trim(),
    imageUrl: String(options.imageUrl || job.assets?.image_url || '').trim(),
    videoUrl: String(options.videoUrl || job.assets?.video_url || '').trim(),
    localFilePath: String(options.localFilePath || job.assets?.local_file_path || job.assets?.file_path || '').trim(),
    mediaType: String(options.mediaType || job.request?.format || '').trim(),
    requestId: String(options.requestId || job.request?.request_id || job.request_id || '').trim(),
    jobId: String(options.jobId || job.id || '').trim()
  };
}

export async function publishMetaContent(job: Record<string, any> = {}, options: Record<string, any> = {}) {
  const request = buildMetaPublishRequest(job, options);
  return invoke('meta_publish_content', { request: { ...request, credentials: savedMetaCredentials() } });
}

/** What Meta did with a video post (phase 3a). */
export interface MetaVideoResult {
  ok: boolean;
  platform?: string;
  status: 'posted' | 'scheduled' | 'failed' | 'setup_required';
  postId?: string | null;
  url?: string | null;
  publishAtMs?: number | null;
  message?: string;
}

/**
 * Posts a video on this computer as an Instagram Reel (now) or a Facebook Reel (now, or
 * scheduled on Meta when `scheduledAtMs` is more than 10 minutes ahead). Waits for Meta and
 * returns what Meta actually did. Only approved calls post.
 */
export async function publishMetaVideo(post: {
  platform: 'instagram' | 'facebook';
  localFilePath: string;
  caption: string;
  title?: string;
  scheduledAtMs?: number | null;
  approved?: boolean;
}): Promise<MetaVideoResult> {
  try {
    return await invoke<MetaVideoResult>('meta_publish_video', {
      request: {
        approved: post.approved === true,
        platform: post.platform,
        localFilePath: post.localFilePath,
        caption: post.caption,
        title: post.title || '',
        scheduledAtMs: post.scheduledAtMs ?? null,
        credentials: savedMetaCredentials(),
      },
    });
  } catch (error) {
    return { ok: false, platform: post.platform, status: 'failed', message: error instanceof Error ? error.message : String(error) };
  }
}

/** What Meta did with a change, or why not, with where to do it by hand (phase 3b). */
export interface MetaChangeResult {
  ok: boolean;
  scheduledAtMs?: number | null;
  postsLeft?: number | null;
  expiresAtMs?: number | null;
  reason?: string | null;
  manageUrl?: string | null;
}

async function metaChange(command: string, request: Record<string, unknown>): Promise<MetaChangeResult> {
  try {
    return await invoke<MetaChangeResult>(command, { request: { ...request, credentials: savedMetaCredentials() } });
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/** Moves a Facebook Reel scheduled on Meta to `scheduledAtMs`; the result is what Meta kept. */
export function rescheduleMetaVideo({ videoId, scheduledAtMs, kind }: { videoId: string; scheduledAtMs: number; kind?: 'post' }): Promise<MetaChangeResult> {
  return metaChange('meta_reschedule_video', { videoId, scheduledAtMs, ...(kind ? { kind } : {}) });
}

/** Cancels (deletes) a Facebook Reel that is still scheduled on Meta. */
export function cancelMetaVideo({ videoId, kind }: { videoId: string; kind?: 'post' }): Promise<MetaChangeResult> {
  return metaChange('meta_cancel_video', { videoId, ...(kind ? { kind } : {}) });
}

async function metaPost(command: string, request: Record<string, unknown>, platform: 'instagram' | 'facebook'): Promise<MetaVideoResult> {
  try {
    return await invoke<MetaVideoResult>(command, { request: { ...request, approved: true, credentials: savedMetaCredentials() } });
  } catch (error) {
    return { ok: false, platform, status: 'failed', message: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Posts a Reel or a carousel to Instagram from https links (the user's storage, phase 3c),
 * through the Facebook Page or Instagram Login. Only called for an approved post.
 */
export function publishInstagramByUrl(post: {
  route: 'page' | 'instagram_login';
  mediaType: 'REELS' | 'CAROUSEL';
  videoUrl?: string;
  imageUrls?: string[];
  caption: string;
}): Promise<MetaVideoResult> {
  return metaPost('meta_instagram_publish_by_url', { ...post, imageUrls: post.imageUrls || [] }, 'instagram');
}

/** Posts pictures from the project folder as one Facebook Page post, now or scheduled on Meta (phase 3c). */
export function publishFacebookPhotos(post: { root: string; photoFiles: string[]; message: string; scheduledAtMs?: number | null }): Promise<MetaVideoResult> {
  return metaPost('meta_facebook_photo_post', {
    workspaceRoot: post.root, photoFiles: post.photoFiles, message: post.message, scheduledAtMs: post.scheduledAtMs ?? null,
  }, 'facebook');
}

/** Posts left in Instagram's 24-hour limit, or null when Meta does not say. */
export async function instagramPublishingLimit(): Promise<number | null> {
  const result = await metaChange('meta_instagram_limit', {});
  return result.ok && typeof result.postsLeft === 'number' ? result.postsLeft : null;
}

/** When the saved Meta sign-in expires (needs the App ID and App Secret), or null. */
export async function metaTokenExpiry(): Promise<number | null> {
  const result = await metaChange('meta_token_expiry', {});
  return result.ok && typeof result.expiresAtMs === 'number' ? result.expiresAtMs : null;
}
