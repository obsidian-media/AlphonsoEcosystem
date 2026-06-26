import { generateOllamaResponse } from '../../../lib/ollama';
import { generateComfyUiImage } from '../../../services/connectorRegistryService';
import { publishMetaContent } from '../../../services/metaPublishService';
import { generateRunwayVideo } from '../../../services/runwayService';
import { requireApproval } from '../../../services/approval/approvalService';
import { getAccBridgeStatus, receiveACCResult, syncApprovalState, syncContentCatalystJob, syncProjectMemory } from '../../../services/agentWorkshop/accBridgeService';
import { writeWorkspaceArtifact } from '../../../services/workspaceArtifactService';
import { buildMiyaExportPacket, createMiyaExportHandoffPacket } from '../../../services/miyaExportPacketService';
import { TRUST_STATES, timestampMs } from '../../../services/trustModel';
import { createDefaultContentRequest, CONTENT_JOB_STATES } from '../types/contentCatalystTypes';

const JOB_KEY = 'alphonso_content_catalyst_jobs_v1';

function nowIso() {
  return new Date().toISOString();
}

function safeJson(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return JSON.stringify({ error: 'serialization_failed' }, null, 2);
  }
}

function readJobs() {
  try {
    const raw = localStorage.getItem(JOB_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeJobs(rows) {
  localStorage.setItem(JOB_KEY, JSON.stringify(rows.slice(-200)));
}

function persistJob(job) {
  const next = { ...job, updatedAt: nowIso(), updatedAtMs: timestampMs() };
  const rows = readJobs();
  const merged = [...rows.filter((row) => row.id !== next.id), next];
  writeJobs(merged);
  return next;
}

function withLog(job, level, message, details = {}) {
  const next = {
    ...job,
    logs: [
      ...(job.logs || []),
      {
        id: `content-log-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        level,
        message,
        details,
        timestamp: nowIso(),
        timestampMs: timestampMs()
      }
    ]
  };
  return persistJob(next);
}

function buildAssetPlan(request) {
  const needs = request.needs || createDefaultContentRequest().needs;
  return {
    image: Boolean(needs.image),
    video: Boolean(needs.video),
    narration: Boolean(needs.narration),
    publish: Boolean(needs.publish)
  };
}

function normalizeLocalMediaArtifact(result = {}, fallbackPrompt = '') {
  const outputPaths = Array.isArray(result.outputPaths) ? result.outputPaths : [];
  const imageUrls = Array.isArray(result.imageUrls) ? result.imageUrls : [];
  const primaryUrl = result.imageUrl || result.url || imageUrls[0] || null;
  const primaryPath = result.outputPath || result.filePath || outputPaths[0] || null;
  return {
    id: result.jobId || result.promptId || `local-media-${timestampMs()}`,
    provider: result.provider || 'comfyui',
    engine: 'comfyui',
    source: 'alphonso-miya',
    media_type: 'image',
    privacy: 'local_only',
    prompt: result.prompt || fallbackPrompt,
    checkpoint: result.checkpoint || null,
    url: primaryUrl,
    path: primaryPath,
    outputPaths,
    imageUrls,
    previewBase64: result.previewBase64 || null,
    metadata: {
      width: result.width || null,
      height: result.height || null,
      steps: result.steps || null,
      cfgScale: result.cfgScale || null,
      jobId: result.jobId || result.promptId || null
    }
  };
}

function getRequestId(bridgeRequest = {}) {
  return String(bridgeRequest.request_id || bridgeRequest.requestId || '').trim();
}

function getBrandProfileContext(brandProfile = null) {
  if (!brandProfile) return '';
  const pillars = Array.isArray(brandProfile.content_pillars)
    ? brandProfile.content_pillars.map((pillar) => `- ${pillar.name || 'pillar'}: ${pillar.description || ''}`).join('\n')
    : '';
  return [
    `Brand name: ${brandProfile.brand_name || ''}`,
    `Industry: ${brandProfile.industry || ''}`,
    `Brand voice: ${brandProfile.brand_voice || ''}`,
    `Target audience: ${brandProfile.target_audience || ''}`,
    `Competitors: ${brandProfile.competitor_urls || ''}`,
    pillars ? `Content pillars:\n${pillars}` : ''
  ].filter(Boolean).join('\n');
}

function buildPrompt(request, brief, brandProfile = null) {
  const brandContext = getBrandProfileContext(brandProfile);
  return [
    'You are Alphonso content-catalyst.',
    'Return strict JSON with keys hook, caption, hashtags, visual_prompt, storyboard, narration, platform_notes, and preview_summary.',
    `Idea: ${request.idea || ''}`,
    `Business context: ${request.business_context || ''}`,
    `Platform: ${request.platform || 'instagram'}`,
    `Format: ${request.format || 'post'}`,
    `Tone: ${request.tone || 'confident and polished'}`,
    brandContext,
    `Asset plan: ${JSON.stringify(buildAssetPlan(request))}`,
    brief ? `Brief: ${safeJson(brief)}` : ''
  ].filter(Boolean).join('\n');
}

function parseLooseJson(text) {
  if (!text) return null;
  const trimmed = String(text).trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function fallbackDraft(request) {
  const idea = request.idea || 'Untitled campaign';
  const tone = request.tone || 'confident and polished';
  const hook = `Introducing ${idea} with a ${tone} launch angle.`;
  const caption = `${idea} packaged for ${request.platform || 'instagram'} with a direct call to action and premium framing.`;
  const hashtags = [`#${String(request.platform || 'content').replace(/[^a-z0-9]/gi, '')}`, '#alphonso', '#miya'].join(' ');
  const visualPrompt = `${idea}, premium editorial composition, ${tone}, clean high-contrast studio lighting`;
  return {
    hook,
    caption,
    hashtags,
    visual_prompt: visualPrompt,
    storyboard: [
      { step: 1, label: 'hook', detail: hook },
      { step: 2, label: 'body', detail: caption },
      { step: 3, label: 'asset', detail: visualPrompt }
    ],
    narration: `${idea} is presented with a ${tone} voiceover for ${request.platform || 'social'} distribution.`,
    platform_notes: [`Format: ${request.format || 'post'}`, `Tone: ${tone}`],
    preview_summary: `Ready for ${request.platform || 'instagram'} review with ${buildAssetPlan(request).image ? 'image' : 'no image'}${buildAssetPlan(request).video ? ', video' : ''}${buildAssetPlan(request).narration ? ', narration' : ''}.`
  };
}

function snapshotBridgeState(job, bridgeEvent = 'update') {
  return {
    id: job.id,
    status: job.status,
    currentStep: job.currentStep,
    request: job.request,
    request_id: job.request_id || job.request?.request_id || null,
    brief: job.brief || null,
    draft: job.draft || null,
    assets: job.assets || null,
    preview: job.preview || null,
    publish: job.publish || null,
    narration: job.narration || null,
    bridgeEvent,
    bridgeStatus: getAccBridgeStatus(),
    updatedAt: job.updatedAt,
    updatedAtMs: job.updatedAtMs
  };
}

async function syncJobBridge(job, bridgeEvent, jobOptions = {}) {
  try {
    return await syncContentCatalystJob(snapshotBridgeState(job, bridgeEvent), {
      eventType: bridgeEvent,
      workspaceRoot: jobOptions.workspaceRoot || ''
    });
  } catch (error) {
    return {
      ok: false,
      status: 'failed',
      error: String(error),
      packet: null
    };
  }
}

export function createContentBridgeRequest(payload = {}) {
  return {
    idea: String(payload.idea || '').trim(),
    business_context: String(payload.business_context || '').trim(),
    platform: String(payload.platform || 'instagram').trim().toLowerCase() || 'instagram',
    format: String(payload.format || 'post').trim().toLowerCase() || 'post',
    tone: String(payload.tone || 'confident and polished').trim(),
    request_id: getRequestId(payload),
    pillar: String(payload.pillar || '').trim(),
    needs: {
      image: payload.needs?.image !== false,
      video: Boolean(payload.needs?.video),
      narration: Boolean(payload.needs?.narration),
      publish: Boolean(payload.needs?.publish)
    }
  };
}

export function createContentJobFromBridgeRequest(bridgeRequest = {}, jobOptions = {}) {
  const request = createContentBridgeRequest(bridgeRequest);
  const id = `content_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const job = persistJob({
    id,
    request,
    request_id: request.request_id || null,
    brandProfile: jobOptions.brandProfile || null,
    status: CONTENT_JOB_STATES.RECEIVED,
    currentStep: 'brief',
    draft: null,
    assets: {
      image_url: null,
      video_url: null,
      narration_url: null
    },
    preview: null,
    publish: null,
    bridge: getAccBridgeStatus(),
    logs: [],
    createdAt: nowIso(),
    createdAtMs: timestampMs(),
    updatedAt: nowIso(),
    updatedAtMs: timestampMs()
  });
  return withLog(job, 'info', 'Content job received.', { request });
}

export function listContentJobs() {
  return readJobs().slice().sort((a, b) => (b.updatedAtMs || 0) - (a.updatedAtMs || 0));
}

export function getContentJob(jobId) {
  return readJobs().find((job) => job.id === jobId) || null;
}

export function getContentJobByRequestId(requestId) {
  const normalized = String(requestId || '').trim();
  if (!normalized) return null;
  return readJobs().find((job) => job.request_id === normalized || job.request?.request_id === normalized) || null;
}

export function upsertContentJob(job) {
  return persistJob(job);
}

export async function buildContentBrief(job) {
  const request = job.request || createDefaultContentRequest();
  const brandContext = getBrandProfileContext(job.brandProfile);
  const prompt = [
    'You are Alphonso content strategy assistant.',
    'Produce a concise content brief as JSON with keys: angle, audience, promise, hook_options, asset_plan, platform_notes, risk_notes.',
    `Idea: ${request.idea}`,
    `Business context: ${request.business_context}`,
    `Platform: ${request.platform}`,
    `Format: ${request.format}`,
    `Tone: ${request.tone}`,
    brandContext
  ].join('\n');

  let brief = null;
  try {
    const response = await generateOllamaResponse({
      endpoint: job?.settings?.endpoint,
      model: job?.settings?.selectedModel,
      prompt
    });
    brief = parseLooseJson(response?.response) || null;
  } catch (error) {
    brief = null;
  }

  if (!brief) {
    brief = {
      angle: request.tone,
      audience: request.business_context || 'Primary audience',
      promise: request.idea,
      hook_options: [request.idea, `${request.idea} in a premium format`],
      asset_plan: buildAssetPlan(request),
      platform_notes: [request.platform, request.format],
      risk_notes: ['Draft generated locally without external publication.']
    };
  }

  await syncProjectMemory({
    jobId: job.id,
    workflowId: 'content-catalyst',
    requestId: request.request_id || null,
    status: 'briefing',
    brief
  });

  return brief;
}

export async function generateContentDraft(job) {
  const request = job.request || createDefaultContentRequest();
  const brief = await buildContentBrief(job);
  const prompt = buildPrompt(request, brief, job.brandProfile);
  let draft = null;
  try {
    const response = await generateOllamaResponse({
      endpoint: job?.settings?.endpoint,
      model: job?.settings?.selectedModel,
      prompt
    });
    draft = parseLooseJson(response?.response) || null;
  } catch (error) {
    draft = null;
  }

  if (!draft) {
    draft = fallbackDraft(request);
  }

  const next = withLog({ ...job, status: CONTENT_JOB_STATES.DRAFTING, currentStep: 'draft' }, 'info', 'Content draft generated.', { draft });
  return {
    ...next,
    brief,
    draft,
    assets: job.assets || {
      image_url: null,
      video_url: null,
      narration_url: null
    },
    bridge: next.bridge || getAccBridgeStatus()
  };
}

export async function generateContentImage(job) {
  const prompt = job.draft?.visual_prompt || job.brief?.visual_prompt || `${job.request.idea || 'Content'} premium studio visual`;
  const result = await generateComfyUiImage({
    prompt,
    negativePrompt: job.request?.tone ? `low quality, blurry, ${job.request.tone}` : 'low quality, blurry',
    width: 512,
    height: 512,
    steps: 20,
    cfgScale: 7
  });
  if (!result?.ok) {
    window.dispatchEvent(new CustomEvent('alphonso:toast', {
      detail: { type: 'warning', message: 'Image generation skipped — ComfyUI not running. Start it in Runtimes.' }
    }));
    return {
      ...job,
      status: CONTENT_JOB_STATES.FAILED,
      currentStep: 'image',
      error: result?.error || 'Image generation failed.',
      assets: job.assets || { image_url: null, video_url: null, narration_url: null }
    };
  }
  const mediaArtifact = normalizeLocalMediaArtifact(result, prompt);
  const next = withLog({ ...job, status: CONTENT_JOB_STATES.IMAGE_READY, currentStep: 'image' }, 'info', 'ComfyUI image asset ready.', { result, mediaArtifact });
  return {
    ...next,
    assets: {
      ...(job.assets || {}),
      image_url: mediaArtifact.url || mediaArtifact.path || null,
      image_path: mediaArtifact.path || null,
      image_preview_base64: mediaArtifact.previewBase64 || null,
      local_media_artifacts: [
        ...((job.assets?.local_media_artifacts || []).filter((artifact) => artifact.media_type !== 'image')),
        mediaArtifact
      ],
      comfyui: {
        provider: mediaArtifact.provider,
        checkpoint: mediaArtifact.checkpoint,
        jobId: mediaArtifact.metadata.jobId,
        outputPaths: mediaArtifact.outputPaths,
        imageUrls: mediaArtifact.imageUrls,
        privacy: mediaArtifact.privacy
      }
    },
    bridge: next.bridge || getAccBridgeStatus()
  };
}

export async function generateContentVideo(job) {
  const promptText = job.draft?.caption || job.draft?.hook || job.request?.idea || 'Premium social content';
  const promptImage = job.assets?.image_url || '';
  const result = await generateRunwayVideo({
    promptText,
    promptImage,
    model: 'gen4.5',
    ratio: job.request?.format === 'reel' ? '1080:1920' : '1280:720',
    duration: 5,
    timeoutSeconds: 600
  });
  if (!result?.ok) {
    window.dispatchEvent(new CustomEvent('alphonso:toast', {
      detail: { type: 'warning', message: 'Video generation skipped — Runway API key not configured. Add it in Settings.' }
    }));
    return {
      ...job,
      status: CONTENT_JOB_STATES.FAILED,
      currentStep: 'video',
      error: result?.error || 'Video generation failed.',
      assets: job.assets || { image_url: null, video_url: null, narration_url: null }
    };
  }
  const next = withLog({ ...job, status: CONTENT_JOB_STATES.VIDEO_READY, currentStep: 'video' }, 'info', 'Video asset ready.', { result });
  return {
    ...next,
    assets: {
      ...(job.assets || {}),
      video_url: result.videoUrl || result.outputPath || result.url || null
    },
    bridge: next.bridge || getAccBridgeStatus()
  };
}

export async function generateContentNarration(job) {
  const narrationText = job.draft?.narration || job.draft?.caption || job.request?.idea || 'Narration ready.';
  const narration = {
    narration_text: narrationText,
    narration_asset_type: 'script',
    audio_url: null,
    processing_job_id: null,
    setup_required: true
  };
  const next = withLog({ ...job, status: CONTENT_JOB_STATES.NARRATION_READY, currentStep: 'narration' }, 'info', 'Narration script prepared.', { narration });
  return {
    ...next,
    narration,
    assets: {
      ...(job.assets || {}),
      narration_url: null
    },
    bridge: next.bridge || getAccBridgeStatus()
  };
}

export async function generateContentPreview(job) {
  const preview = {
    platform: job.request?.platform || 'instagram',
    format: job.request?.format || 'post',
    tone: job.request?.tone || 'confident and polished',
    request_id: job.request?.request_id || job.request_id || null,
    draft: job.draft || null,
    assets: job.assets || null,
    readiness: {
      image: Boolean(job.assets?.image_url),
      video: Boolean(job.assets?.video_url),
      narration: Boolean(job.narration?.narration_text),
      publish: Boolean(job.request?.needs?.publish)
    },
    summary: job.draft?.preview_summary || 'Preview package generated.'
  };
  const next = withLog({ ...job, currentStep: 'preview' }, 'info', 'Publish preview generated.', { preview });
  return {
    ...next,
    preview,
    status: CONTENT_JOB_STATES.READY_FOR_REVIEW,
    bridge: next.bridge || getAccBridgeStatus()
  };
}

function buildExportPackage(job) {
  return buildMiyaExportPacket({
    exportType: 'content_catalyst_bundle',
    title: job.request?.idea || 'Content catalyst bundle',
    topic: job.request?.platform || 'social',
    summary: job.preview?.summary || job.draft?.preview_summary || 'Content package ready for review.',
    artifactPaths: [job.assets?.image_url, job.assets?.video_url].filter(Boolean),
    workflowJson: {
      request: job.request,
      draft: job.draft,
      preview: job.preview,
      narration: job.narration
    },
    target: job.request?.platform || 'instagram',
    privacyStatus: 'private',
    metadata: {
      contentJobId: job.id,
      generatedAtMs: timestampMs(),
      source: 'content-catalyst'
    }
  });
}

export async function publishContentPreview(job) {
  const preview = await generateContentPreview(job);
  const exportPackage = buildExportPackage(preview);
  const handoffPacket = createMiyaExportHandoffPacket(exportPackage, {
    source: 'content-catalyst-preview',
    riskLevel: 'low',
    actionType: 'content_preview',
    commandPreview: 'Content preview package prepared.',
    fileChangePreview: 'Preview only. No publish action.',
    verificationState: TRUST_STATES.VERIFIED
  });
  const next = withLog({ ...preview, preview, exportPackage, handoffPacket }, 'info', 'Preview package ready.', { exportPackage, handoffPacket });
  return {
    ...next,
    status: CONTENT_JOB_STATES.READY_FOR_REVIEW,
    bridge: next.bridge || getAccBridgeStatus()
  };
}

export async function publishContent(job, { approved = false } = {}) {
  const approval = await requireApproval({
    actionType: 'external_posting_uploading',
    approved,
    riskLevel: 'high',
    summary: job.request?.idea || 'Content publish request',
    requestedBy: 'jose',
    workflowId: 'content_catalyst_publish',
    metadata: {
      contentJobId: job.id,
      platform: job.request?.platform || 'instagram'
    }
  });

  if (!approval.ok) {
    await syncApprovalState({
      jobId: job.id,
      workflowId: 'content-catalyst-publish',
      actionType: 'external_posting_uploading',
      approved: false,
      required: true,
      requestId: job.request?.request_id || job.request_id || null
    });
    return withLog({
      ...job,
      status: CONTENT_JOB_STATES.FAILED,
      currentStep: 'publish',
      publish: {
        ok: false,
        approvalRequired: true,
        approval,
        error: 'Publish denied: approval required'
      }
    }, 'warning', 'Publish blocked pending approval.', { approval });
  }

  const result = await publishMetaContent(job, {
    approved: true,
    platform: job.request?.platform || 'instagram',
    caption: job.draft?.caption || job.draft?.hook || job.request?.idea || '',
    message: job.draft?.caption || job.draft?.hook || job.request?.idea || '',
    title: job.request?.idea || '',
    imageUrl: job.assets?.image_url || '',
    videoUrl: job.assets?.video_url || '',
    localFilePath: job.assets?.local_file_path || job.assets?.file_path || '',
    mediaType: job.request?.format || '',
    requestId: job.request?.request_id || job.request_id || null,
    jobId: job.id
  });

  const postIds = Array.isArray(result?.postIds)
    ? result.postIds
    : Array.isArray(result?.post_ids)
      ? result.post_ids
      : [];
  const normalizedResult = {
    ...result,
    postIds,
    setup_required: Boolean(result?.setupRequired ?? result?.setup_required),
    failureDetails: result?.failureDetails || result?.error || null
  };

  await receiveACCResult({
    jobId: job.id,
    workflowId: 'content-catalyst-publish',
    actionType: 'external_posting_uploading',
    approved: true,
    result: normalizedResult,
    requestId: job.request?.request_id || job.request_id || null
  });

  if (normalizedResult.ok && normalizedResult.published) {
    return withLog({
      ...job,
      status: CONTENT_JOB_STATES.PUBLISHED,
      currentStep: 'publish',
      publish: normalizedResult
    }, 'info', 'Meta publish completed.', { result: normalizedResult });
  }

  if (normalizedResult.setup_required) {
    return withLog({
      ...job,
      status: CONTENT_JOB_STATES.APPROVED_FOR_PUBLISH,
      currentStep: 'publish',
      publish: normalizedResult
    }, 'info', 'Publish adapter returned setup_required.', { result: normalizedResult });
  }

  return withLog({
    ...job,
    status: CONTENT_JOB_STATES.FAILED,
    currentStep: 'publish',
    publish: normalizedResult,
    error: normalizedResult.error || normalizedResult.message || 'Meta publish failed.'
  }, 'error', 'Meta publish failed.', { result: normalizedResult });
}

export async function runContentCatalystJob(bridgeRequest = {}, jobOptions = {}) {
  const request = createContentBridgeRequest(bridgeRequest);
  const existing = request.request_id ? getContentJobByRequestId(request.request_id) : null;
  if (existing && existing.status !== CONTENT_JOB_STATES.FAILED) {
    return existing;
  }

  let job = createContentJobFromBridgeRequest(request, jobOptions);
  job = withLog(job, 'info', 'Job created from bridge request.', { bridgeRequest });
  job = withLog({ ...job, status: CONTENT_JOB_STATES.QUEUED, currentStep: 'queue' }, 'info', 'Content job queued.', { requestId: request.request_id || null });
  job = persistJob(job);
  job = { ...job, bridge: (await syncJobBridge(job, 'received', jobOptions)) };
  try {
    job = { ...job, status: CONTENT_JOB_STATES.BRIEFING, currentStep: 'brief' };
    const brief = await buildContentBrief(job);
    job = withLog({ ...job, brief }, 'info', 'Content brief generated.', { brief });
    job = { ...job, bridge: (await syncJobBridge(job, 'briefing', jobOptions)) };
    job = { ...job, status: CONTENT_JOB_STATES.DRAFTING, currentStep: 'draft' };
    job = await generateContentDraft(job);
    job = { ...job, bridge: (await syncJobBridge(job, 'drafting', jobOptions)) };
    if (job.request?.needs?.image) {
      job = await generateContentImage(job);
      job = { ...job, bridge: (await syncJobBridge(job, 'image_ready', jobOptions)) };
    }
    if (job.request?.needs?.video && job.status !== CONTENT_JOB_STATES.FAILED) {
      job = { ...job, status: CONTENT_JOB_STATES.VIDEO_PROCESSING, currentStep: 'video' };
      job = await generateContentVideo(job);
      job = { ...job, bridge: (await syncJobBridge(job, 'video_ready', jobOptions)) };
    }
    if (job.request?.needs?.narration && job.status !== CONTENT_JOB_STATES.FAILED) {
      job = await generateContentNarration(job);
      job = { ...job, bridge: (await syncJobBridge(job, 'narration_ready', jobOptions)) };
    }
    if (job.status !== CONTENT_JOB_STATES.FAILED) {
      job = await generateContentPreview(job);
      job = { ...job, bridge: (await syncJobBridge(job, 'ready_for_review', jobOptions)) };
    }
    const exportPackage = buildExportPackage(job);
    if (jobOptions.workspaceRoot) {
      await writeWorkspaceArtifact({
        workspaceRoot: jobOptions.workspaceRoot,
        relativePath: `release/content-catalyst/${job.id}.json`,
        content: safeJson({
          job,
          exportPackage,
          bridgeResponse: {
            success: true,
            job_id: job.id,
            status: job.status,
            draft: job.draft,
            assets: job.assets,
            preview: job.preview
          }
        })
      });
    }
    job = withLog({
      ...job,
      exportPackage,
      bridgeResponse: {
        success: true,
        job_id: job.id,
        status: job.status,
        draft: job.draft,
        assets: job.assets,
        preview: job.preview,
        bridge: job.bridge || getAccBridgeStatus()
      }
    }, 'info', 'Content catalyst job completed.', { jobId: job.id });
    return persistJob(job);
  } catch (error) {
    job = withLog({
      ...job,
      status: CONTENT_JOB_STATES.FAILED,
      error: String(error),
      bridgeResponse: {
        success: false,
        job_id: job.id,
        status: CONTENT_JOB_STATES.FAILED,
        error: String(error),
        bridge: job.bridge || getAccBridgeStatus()
      }
    }, 'error', 'Content catalyst job failed.', { error: String(error) });
    return persistJob(job);
  }
}

export function createContentBridgeResponse(job) {
  const step = job?.currentStep || 'brief';
  const progress = {
    received: 5,
    queued: 10,
    brief_ready: 10,
    briefing: 15,
    drafting: 35,
    image_requested: 45,
    image_ready: 55,
    video_requested: 65,
    video_processing: 70,
    video_ready: 80,
    narration_requested: 82,
    narration_ready: 85,
    ready_for_review: 90,
    waiting_approval: 93,
    approved_for_publish: 95,
    published: 100,
    failed: 100
  }[job?.status || CONTENT_JOB_STATES.RECEIVED] || 0;

  return {
    success: job?.status !== CONTENT_JOB_STATES.FAILED,
    job_id: job?.id || null,
    status: job?.status || CONTENT_JOB_STATES.RECEIVED,
    step,
    progress,
    request_id: job?.request_id || job?.request?.request_id || null,
    bridge: job?.bridge || getAccBridgeStatus(),
    draft: job?.draft || null,
    artifacts: {
      image_url: job?.assets?.image_url || null,
      image_path: job?.assets?.image_path || null,
      image_preview_base64: job?.assets?.image_preview_base64 || null,
      video_url: job?.assets?.video_url || null,
      audio_url: job?.assets?.narration_url || job?.narration?.audio_url || null,
      local_media_artifacts: job?.assets?.local_media_artifacts || [],
      comfyui: job?.assets?.comfyui || null
    },
    assets: job?.assets || {
      image_url: null,
      video_url: null,
      narration_url: null
    },
    preview: job?.preview || null,
    publish: job?.publish || null,
    logs: job?.logs || [],
    error: job?.error || null,
    updated_at: job?.updatedAt || null,
    next_step: job?.status === CONTENT_JOB_STATES.READY_FOR_REVIEW
      ? 'publish-preview'
      : job?.status === CONTENT_JOB_STATES.APPROVED_FOR_PUBLISH
        ? 'publish'
        : job?.status === CONTENT_JOB_STATES.PUBLISHED
          ? 'complete'
          : 'generate'
  };
}
