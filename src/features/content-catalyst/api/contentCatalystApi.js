import {
  buildContentBrief,
  createContentBridgeRequest,
  createContentBridgeResponse,
  createContentJobFromBridgeRequest,
  getContentJobByRequestId,
  generateContentDraft,
  generateContentImage,
  generateContentNarration,
  generateContentPreview,
  generateContentVideo,
  getContentJob,
  listContentJobs,
  publishContent,
  publishContentPreview,
  runContentCatalystJob,
  upsertContentJob
} from '../services/contentCatalystService';

export async function postContentBrief(payload) {
  const request = createContentBridgeRequest(payload);
  const existing = request.request_id ? getContentJobByRequestId(request.request_id) : null;
  const job = existing || createContentJobFromBridgeRequest(request, { brandProfile: payload?.brandProfile || null });
  const brief = await buildContentBrief(job);
  return {
    success: true,
    job_id: job.id,
    request_id: request.request_id || job.request_id || null,
    status: 'brief_ready',
    next_step: 'generate',
    brief
  };
}

export async function postContentGenerate(payload) {
  const request = createContentBridgeRequest(payload);
  const job = await runContentCatalystJob(request, {
    workspaceRoot: payload?.workspaceRoot || '',
    brandProfile: payload?.brandProfile || null
  });
  return createContentBridgeResponse(job);
}

export async function postContentGenerateImage(payload) {
  const job = getContentJob(payload.jobId);
  if (!job) return { success: false, error: 'job_not_found' };
  const next = await generateContentImage(job);
  upsertContentJob(next);
  return createContentBridgeResponse(next);
}

export async function postContentGenerateVideo(payload) {
  const job = getContentJob(payload.jobId);
  if (!job) return { success: false, error: 'job_not_found' };
  const next = await generateContentVideo(job);
  upsertContentJob(next);
  return createContentBridgeResponse(next);
}

export async function postContentGenerateNarration(payload) {
  const job = getContentJob(payload.jobId);
  if (!job) return { success: false, error: 'job_not_found' };
  const next = await generateContentNarration(job);
  upsertContentJob(next);
  return createContentBridgeResponse(next);
}

export async function postContentPublishPreview(payload) {
  const job = getContentJob(payload.jobId);
  if (!job) return { success: false, error: 'job_not_found' };
  const next = await publishContentPreview(job);
  upsertContentJob(next);
  return createContentBridgeResponse(next);
}

export async function postContentPublish(payload) {
  const job = getContentJob(payload.jobId);
  if (!job) return { success: false, error: 'job_not_found' };
  const next = await publishContent(job, { approved: Boolean(payload.approved) });
  upsertContentJob(next);
  return createContentBridgeResponse(next);
}

export function getContentStatus(jobId) {
  const job = getContentJob(jobId);
  if (!job) {
    return {
      success: false,
      error: 'job_not_found'
    };
  }
  return createContentBridgeResponse(job);
}

export function listContentStatusJobs() {
  return listContentJobs().map((job) => createContentBridgeResponse(job));
}
