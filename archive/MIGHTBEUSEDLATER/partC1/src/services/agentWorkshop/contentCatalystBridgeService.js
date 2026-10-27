import {
  createContentBridgeRequest,
  getContentStatus,
  listContentStatusJobs,
  postContentBrief,
  postContentGenerate,
  postContentGenerateImage,
  postContentGenerateNarration,
  postContentGenerateVideo,
  postContentPublish,
  postContentPublishPreview
} from '../../features/content-catalyst';

function mergeBridgeOptions(payload = {}, options = {}) {
  return {
    ...payload,
    workspaceRoot: options.workspaceRoot || payload.workspaceRoot || '',
    brandProfile: options.brandProfile || payload.brandProfile || null
  };
}

export function createAccContentCatalystBridgeRequest(payload = {}) {
  return createContentBridgeRequest(payload);
}

export async function submitAccContentCatalystBrief(payload = {}, options = {}) {
  return postContentBrief(mergeBridgeOptions(payload, options));
}

export async function submitAccContentCatalystJob(payload = {}, options = {}) {
  return postContentGenerate(mergeBridgeOptions(payload, options));
}

export async function submitAccContentCatalystImage(jobId, payload = {}) {
  return postContentGenerateImage({ jobId, ...payload });
}

export async function submitAccContentCatalystVideo(jobId, payload = {}) {
  return postContentGenerateVideo({ jobId, ...payload });
}

export async function submitAccContentCatalystNarration(jobId, payload = {}) {
  return postContentGenerateNarration({ jobId, ...payload });
}

export async function submitAccContentCatalystPreview(jobId, payload = {}) {
  return postContentPublishPreview({ jobId, ...payload });
}

export async function submitAccContentCatalystPublish(jobId, payload = {}) {
  return postContentPublish({ jobId, ...payload });
}

export function getAccContentCatalystStatus(jobId) {
  return getContentStatus(jobId);
}

export function listAccContentCatalystJobs() {
  return listContentStatusJobs();
}
