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
