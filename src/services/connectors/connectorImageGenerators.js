import { invoke } from '@tauri-apps/api/core';
import { TRUST_STATES } from '../trustModel';
import { appendConnectorAudit, getConnectorCircuitState, recordConnectorFailure, recordConnectorSuccess } from './connectorRegistry.js';
import { gateConnectorAction } from './connectorRegistry.js';

export async function generateSdWebUiImage({
  prompt,
  negativePrompt = '',
  width = 768,
  height = 768,
  steps = 24,
  cfgScale = 7
}, options = {}) {
  const circuit = getConnectorCircuitState('sd_webui', 'local_image_generation');
  if (!circuit.ok) {
    appendConnectorAudit('sd_webui', 'image_generation_blocked_circuit_open', {
      failures: circuit.failures,
      remainingMs: circuit.remainingMs
    });
    return {
      ok: false, connectorId: 'sd_webui', blocked: true,
      error: `Circuit breaker open — ${Math.ceil(circuit.remainingMs / 1000)}s remaining`,
      trust: TRUST_STATES.FAILED
    };
  }
  const gate = gateConnectorAction('sd_webui', 'local_image_generation', prompt, { ...options, approved: true });
  if (!gate.ok) {
    return {
      ok: false,
      connectorId: 'sd_webui',
      blocked: true,
      trust: gate.verificationState || TRUST_STATES.PENDING,
      error: gate.reason || 'SD WebUI policy gate blocked the action.'
    };
  }
  let result;
  try {
    result = await invoke('connector_generate_sdwebui_image', {
      prompt,
      negativePrompt: negativePrompt || null,
      width,
      height,
      steps,
      cfgScale
    });
  } catch (error) {
    const errMsg = String(error || '');
    recordConnectorFailure('sd_webui', 'local_image_generation');
    appendConnectorAudit('sd_webui', 'image_generation_failed', {
      provider: 'automatic1111',
      error: errMsg
    });
    return {
      ok: false, connectorId: 'sd_webui', blocked: false,
      error: `SD WebUI error: ${errMsg}`, trust: TRUST_STATES.FAILED
    };
  }
  if (result?.ok) {
    recordConnectorSuccess('sd_webui', 'local_image_generation');
  } else {
    recordConnectorFailure('sd_webui', 'local_image_generation');
  }
  appendConnectorAudit('sd_webui', result?.ok ? 'image_generation_success' : 'image_generation_failed', {
    provider: result?.provider || 'automatic1111',
    error: result?.error || null,
    message: result?.message || null
  });
  return result;
}

const DEFAULT_COMFYUI_ENDPOINT = 'http://127.0.0.1:8188';
const DEFAULT_COMFYUI_CHECKPOINT = 'v1-5-pruned-emaonly-fp16.safetensors';

function getComfyUiEndpoint() {
  try {
    const configured = localStorage.getItem('alphonso_comfyui_endpoint_v1');
    return String(configured || DEFAULT_COMFYUI_ENDPOINT).replace(/\/+$/, '');
  } catch {
    return DEFAULT_COMFYUI_ENDPOINT;
  }
}

function createComfyClientId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `alphonso-miya-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createMiyaSd15ComfyWorkflow({
  prompt,
  negativePrompt = '',
  width = 512,
  height = 512,
  steps = 20,
  cfgScale = 7,
  seed = Math.floor(Math.random() * 1000000000)
}) {
  return {
    3: { class_type: 'KSampler', inputs: { seed, steps, cfg: cfgScale, sampler_name: 'euler', scheduler: 'normal', denoise: 1, model: ['4', 0], positive: ['6', 0], negative: ['7', 0], latent_image: ['5', 0] } },
    4: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: DEFAULT_COMFYUI_CHECKPOINT } },
    5: { class_type: 'EmptyLatentImage', inputs: { width, height, batch_size: 1 } },
    6: { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['4', 1] } },
    7: { class_type: 'CLIPTextEncode', inputs: { text: negativePrompt || 'blurry, low quality, distorted text, watermark, logo artifacts, bad anatomy', clip: ['4', 1] } },
    8: { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['4', 2] } },
    9: { class_type: 'SaveImage', inputs: { filename_prefix: 'ALPHONSO_MIYA', images: ['8', 0] } }
  };
}

function parseAndInjectComfyWorkflow(workflowJson, prompt) {
  const workflow = JSON.parse(workflowJson);
  Object.values(workflow || {}).forEach((node) => {
    if (node?.class_type === 'CLIPTextEncode' && node.inputs && typeof node.inputs.text === 'string') {
      node.inputs.text = prompt;
    }
  });
  return workflow;
}

async function queueComfyUiPrompt({ workflow, clientId = createComfyClientId() }) {
  const endpoint = getComfyUiEndpoint();
  const response = await fetch(`${endpoint}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow, client_id: clientId })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, provider: 'comfyui', endpoint, error: body?.error?.message || body?.error || response.statusText || 'ComfyUI prompt queue failed.' };
  }
  return { ok: true, provider: 'comfyui', endpoint, jobId: body.prompt_id, promptId: body.prompt_id, nodeErrors: body.node_errors || null, message: `Queued ComfyUI prompt ${body.prompt_id}.` };
}

async function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function normalizeComfyUiHistory(history, promptId, endpoint) {
  const row = history?.[promptId] || null;
  const outputs = Object.values(row?.outputs || {});
  const images = outputs.flatMap((output) => Array.isArray(output?.images) ? output.images : []);
  const imageUrls = images.map((image) => {
    const params = new URLSearchParams({ filename: image.filename, type: image.type || 'output' });
    if (image.subfolder) params.set('subfolder', image.subfolder);
    return `${endpoint}/view?${params.toString()}`;
  });
  let previewBase64 = '';
  if (imageUrls[0]) {
    try {
      const response = await fetch(imageUrls[0]);
      if (response.ok) previewBase64 = await blobToBase64(await response.blob());
    } catch {
      previewBase64 = '';
    }
  }
  return {
    ok: Boolean(row), provider: 'comfyui', endpoint, jobId: promptId, promptId,
    message: row ? `ComfyUI history loaded with ${images.length} image output(s).` : 'ComfyUI prompt is still running or not found yet.',
    outputPaths: images.map((image) => [image.subfolder, image.filename].filter(Boolean).join('/')),
    imageUrls, previewBase64, rawHistory: row
  };
}

async function fetchComfyUiHistory(promptId) {
  const endpoint = getComfyUiEndpoint();
  const response = await fetch(`${endpoint}/history/${encodeURIComponent(promptId)}`);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, provider: 'comfyui', endpoint, jobId: promptId, error: body?.error?.message || body?.error || response.statusText || 'ComfyUI history lookup failed.' };
  }
  return normalizeComfyUiHistory(body, promptId, endpoint);
}

export async function pollComfyUiHistory(promptId, { timeoutMs = 180000, intervalMs = 1500 } = {}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const result = await fetchComfyUiHistory(promptId);
    if (result.ok && (result.previewBase64 || result.imageUrls?.length || result.outputPaths?.length)) return result;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return { ok: false, provider: 'comfyui', jobId: promptId, error: 'Timed out waiting for ComfyUI image output.', message: 'Prompt was queued, but no image output appeared before timeout.' };
}

export async function generateComfyUiImage({
  prompt,
  negativePrompt = '',
  width = 512,
  height = 512,
  steps = 20,
  cfgScale = 7
}, options = {}) {
  const circuit = getConnectorCircuitState('comfyui_video', 'local_image_generation');
  if (!circuit.ok) {
    appendConnectorAudit('comfyui_video', 'image_generation_blocked_circuit_open', {
      failures: circuit.failures,
      remainingMs: circuit.remainingMs
    });
    return { ok: false, connectorId: 'comfyui_video', blocked: true, error: `Circuit breaker open — ${Math.ceil(circuit.remainingMs / 1000)}s remaining`, trust: TRUST_STATES.FAILED };
  }
  const gate = gateConnectorAction('comfyui_video', 'local_image_generation', prompt, { ...options, approved: true });
  if (!gate.ok) {
    return { ok: false, connectorId: 'comfyui_video', blocked: true, trust: gate.verificationState || TRUST_STATES.PENDING, error: gate.reason || 'ComfyUI policy gate blocked the action.' };
  }
  let workflow;
  try {
    workflow = createMiyaSd15ComfyWorkflow({ prompt, negativePrompt, width, height, steps, cfgScale });
  } catch (error) {
    const errMsg = String(error || '');
    recordConnectorFailure('comfyui_video', 'local_image_generation');
    appendConnectorAudit('comfyui_video', 'image_generation_failed', { provider: 'comfyui', error: `Workflow creation failed: ${errMsg}` });
    return { ok: false, connectorId: 'comfyui_video', blocked: false, error: `ComfyUI workflow error: ${errMsg}`, trust: TRUST_STATES.FAILED };
  }
  let queued;
  try {
    queued = await queueComfyUiPrompt({ workflow });
  } catch (error) {
    const errMsg = String(error || '');
    recordConnectorFailure('comfyui_video', 'local_image_generation');
    appendConnectorAudit('comfyui_video', 'image_generation_failed', { provider: 'comfyui', error: `Queue failed: ${errMsg}` });
    return { ok: false, connectorId: 'comfyui_video', blocked: false, error: `ComfyUI queue error: ${errMsg}`, trust: TRUST_STATES.FAILED };
  }
  if (!queued.ok) {
    recordConnectorFailure('comfyui_video', 'local_image_generation');
    appendConnectorAudit('comfyui_video', 'image_generation_failed', { provider: 'comfyui', error: queued.error || null });
    return queued;
  }
  let result;
  try {
    result = await pollComfyUiHistory(queued.promptId, options);
  } catch (error) {
    const errMsg = String(error || '');
    recordConnectorFailure('comfyui_video', 'local_image_generation');
    appendConnectorAudit('comfyui_video', 'image_generation_failed', { provider: 'comfyui', jobId: queued.promptId, error: `Poll failed: ${errMsg}` });
    return { ok: false, connectorId: 'comfyui_video', blocked: false, jobId: queued.promptId, error: `ComfyUI poll error: ${errMsg}`, trust: TRUST_STATES.FAILED };
  }
  if (result?.ok) {
    recordConnectorSuccess('comfyui_video', 'local_image_generation');
  } else {
    recordConnectorFailure('comfyui_video', 'local_image_generation');
  }
  const finalResult = { ...result, provider: 'comfyui', checkpoint: DEFAULT_COMFYUI_CHECKPOINT, prompt, width, height, steps, cfgScale };
  appendConnectorAudit('comfyui_video', finalResult?.ok ? 'image_generation_success' : 'image_generation_failed', {
    provider: 'comfyui', jobId: finalResult?.jobId || queued.promptId,
    outputCount: Array.isArray(finalResult?.outputPaths) ? finalResult.outputPaths.length : 0,
    error: finalResult?.error || null
  });
  return finalResult;
}

export async function queueComfyUiWorkflow({
  prompt,
  workflowJson,
  mediaType = 'video'
}, options = {}) {
  const permission = mediaType === 'image' ? 'local_image_generation' : 'local_video_generation';
  const circuit = getConnectorCircuitState('comfyui_video', permission);
  if (!circuit.ok) {
    appendConnectorAudit('comfyui_video', `${mediaType}_queue_blocked_circuit_open`, {
      failures: circuit.failures,
      remainingMs: circuit.remainingMs
    });
    return {
      ok: false, connectorId: 'comfyui_video', blocked: true,
      error: `Circuit breaker open — ${Math.ceil(circuit.remainingMs / 1000)}s remaining`,
      trust: TRUST_STATES.FAILED
    };
  }
  const gate = gateConnectorAction('comfyui_video', permission, prompt, { ...options, approved: true });
  if (!gate.ok) {
    return {
      ok: false,
      connectorId: 'comfyui_video',
      blocked: true,
      trust: gate.verificationState || TRUST_STATES.PENDING,
      error: gate.reason || 'ComfyUI policy gate blocked the action.'
    };
  }
  let result;
  try {
    result = await invoke('connector_queue_comfyui_video', {
      prompt,
      workflowJson
    });
  } catch {
    try {
      result = await queueComfyUiPrompt({ workflow: parseAndInjectComfyWorkflow(workflowJson, prompt) });
    } catch (fallbackError) {
      const errMsg = String(fallbackError || '');
      recordConnectorFailure('comfyui_video', permission);
      appendConnectorAudit('comfyui_video', `${mediaType}_queue_failed`, {
        provider: 'comfyui',
        error: errMsg
      });
      return {
        ok: false, connectorId: 'comfyui_video', blocked: false,
        error: `ComfyUI queue error: ${errMsg}`, trust: TRUST_STATES.FAILED
      };
    }
  }
  if (result?.ok) {
    recordConnectorSuccess('comfyui_video', permission);
  } else {
    recordConnectorFailure('comfyui_video', permission);
  }
  appendConnectorAudit('comfyui_video', result?.ok ? `${mediaType}_queue_success` : `${mediaType}_queue_failed`, {
    provider: result?.provider || 'comfyui',
    jobId: result?.jobId || null,
    error: result?.error || null
  });
  return result;
}

export async function queueComfyUiVideo({
  prompt,
  workflowJson
}, options = {}) {
  return queueComfyUiWorkflow({ prompt, workflowJson, mediaType: 'video' }, options);
}

export async function getComfyUiVideoHistory(promptId) {
  const circuit = getConnectorCircuitState('comfyui_video', 'video_history');
  if (!circuit.ok) {
    appendConnectorAudit('comfyui_video', 'video_history_blocked_circuit_open', {
      failures: circuit.failures,
      remainingMs: circuit.remainingMs
    });
    return { ok: false, connectorId: 'comfyui_video', blocked: true, error: `Circuit breaker open — ${Math.ceil(circuit.remainingMs / 1000)}s remaining`, trust: TRUST_STATES.FAILED };
  }
  let result;
  try {
    result = await invoke('connector_get_comfyui_history', {
      promptId
    });
  } catch {
    try {
      result = await fetchComfyUiHistory(promptId);
    } catch (fallbackError) {
      const errMsg = String(fallbackError || '');
      recordConnectorFailure('comfyui_video', 'video_history');
      appendConnectorAudit('comfyui_video', 'video_history_failed', {
        provider: 'comfyui',
        jobId: promptId || null,
        error: errMsg
      });
      return { ok: false, connectorId: 'comfyui_video', blocked: false, jobId: promptId, error: `ComfyUI history error: ${errMsg}`, trust: TRUST_STATES.FAILED };
    }
  }
  if (result?.ok) {
    recordConnectorSuccess('comfyui_video', 'video_history');
  } else {
    recordConnectorFailure('comfyui_video', 'video_history');
  }
  appendConnectorAudit('comfyui_video', result?.ok ? 'video_history_success' : 'video_history_failed', {
    provider: result?.provider || 'comfyui',
    jobId: result?.jobId || promptId || null,
    error: result?.error || null,
    outputCount: Array.isArray(result?.outputPaths) ? result.outputPaths.length : 0
  });
  return result;
}
