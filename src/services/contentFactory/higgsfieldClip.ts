// A Higgsfield AI clip (content factory phase 4b): from a scene's (or a Short part's) picture,
// with the clip model id the user pasted, inside a run whose spending was approved with
// Higgsfield's estimate. The cost recorded is that estimate, once the clip is made.
import { invoke } from '@tauri-apps/api/core';
import { cachedHiggsfieldEstimate, higgsfieldKeys, higgsfieldModels } from '../connectors/higgsfieldConnector';
import { canSpend, recordSpendUsd } from '../jose/joseSpend';
import { paidEngineAvailable } from './engineChoice';
import type { SceneMotion } from './contentTypes';

/** Whether Higgsfield can make clips now, with its estimate per clip; otherwise a plain reason. */
export function higgsfieldClipAvailable(): { ok: boolean; reason?: string; usd?: number } {
  const can = paidEngineAvailable('higgsfield');
  if (!can.ok) return { ok: false, reason: can.reason };
  const models = higgsfieldModels();
  if (!models.clip) return { ok: false, reason: 'Paste a clip model id in Settings → Connectors → Higgsfield' };
  if (models.clipExtraProblem) return { ok: false, reason: models.clipExtraProblem.replace(/\.$/, '') };
  const estimate = cachedHiggsfieldEstimate('clip');
  if (!estimate) return { ok: false, reason: "Higgsfield's estimate for clips isn't known yet" };
  if (typeof estimate.usd !== 'number') return { ok: false, reason: String(estimate.reason || 'Higgsfield gave no estimate').replace(/\.$/, '') };
  return { ok: true, usd: estimate.usd };
}

/** What `count` Higgsfield clips would cost, or null when Higgsfield can't make them. */
export function estimateHiggsfieldClipsUsd(count: number): number | null {
  const can = higgsfieldClipAvailable();
  return can.ok && can.usd !== undefined ? Math.round(count * can.usd * 10000) / 10000 : null;
}

export interface HiggsfieldClipResult {
  status: 'done' | 'pending' | 'failed';
  /** Relative to the output folder. */
  path?: string;
  requestId?: string;
  costUsd?: number;
  error?: string;
  /** Past the monthly cap: nothing more should be sent this run. */
  capped?: boolean;
}

type RunAnswer = { ok?: boolean; status?: string; requestId?: string; reason?: string };

function outcome(answer: RunAnswer, outRel: string, usd: number): HiggsfieldClipResult {
  if (answer?.status === 'pending' && answer.requestId) return { status: 'pending', requestId: answer.requestId, costUsd: usd };
  if (!answer?.ok || answer.status !== 'done') return { status: 'failed', error: answer?.reason || 'Higgsfield made no clip.' };
  recordSpendUsd(usd);
  return { status: 'done', path: outRel, costUsd: usd };
}

export async function makeHiggsfieldClip(input: {
  root: string; imageRel: string; outRel: string; prompt: string; seconds: number; vertical: boolean;
}): Promise<HiggsfieldClipResult> {
  const can = higgsfieldClipAvailable();
  if (!can.ok || can.usd === undefined) return { status: 'failed', error: `${can.reason}.` };
  const cap = canSpend(can.usd);
  if (!cap.ok) return { status: 'failed', error: String(cap.reason), capped: true };
  const models = higgsfieldModels();
  const answer = await invoke<RunAnswer>('higgsfield_run', {
    job: {
      model: models.clip, prompt: input.prompt, imagePath: input.imageRel,
      seconds: Math.max(1, Math.round(input.seconds)), aspect: input.vertical ? '9:16' : '16:9', extra: models.clipExtra ?? null,
    },
    workspaceRoot: input.root, outPath: input.outRel, keys: higgsfieldKeys(),
  }).catch(() => ({ ok: false, reason: 'Higgsfield could not be reached.' }));
  return outcome(answer, input.outRel, can.usd);
}

/** Whether Higgsfield can copy motions now (phase 4c), with its estimate per motion clip; otherwise the reason. */
export function higgsfieldMotionAvailable(): { ok: boolean; reason?: string; usd?: number } {
  const can = paidEngineAvailable('higgsfield');
  if (!can.ok) return { ok: false, reason: can.reason };
  const models = higgsfieldModels();
  if (!models.motion) return { ok: false, reason: 'Paste a motion model id in Settings → Connectors → Higgsfield' };
  if (models.motionExtraProblem) return { ok: false, reason: models.motionExtraProblem.replace(/\.$/, '') };
  const estimate = cachedHiggsfieldEstimate('motion');
  if (!estimate) return { ok: false, reason: "Higgsfield's estimate for motion clips isn't known yet" };
  if (typeof estimate.usd !== 'number') return { ok: false, reason: String(estimate.reason || 'Higgsfield gave no estimate').replace(/\.$/, '') };
  return { ok: true, usd: estimate.usd };
}

export function estimateHiggsfieldMotionUsd(count: number): number | null {
  const can = higgsfieldMotionAvailable();
  return can.ok && can.usd !== undefined ? Math.round(count * can.usd * 10000) / 10000 : null;
}

/** A motion clip: the picture (with the character) moved like the recorded or chosen clip, or a preset. */
export async function makeHiggsfieldMotionClip(input: {
  root: string; imageRel: string; motion: SceneMotion; outRel: string; prompt: string; seconds: number; vertical: boolean;
}): Promise<HiggsfieldClipResult> {
  const can = higgsfieldMotionAvailable();
  if (!can.ok || can.usd === undefined) return { status: 'failed', error: `${can.reason}.` };
  const cap = canSpend(can.usd);
  if (!cap.ok) return { status: 'failed', error: String(cap.reason), capped: true };
  const models = higgsfieldModels();
  const answer = await invoke<RunAnswer>('higgsfield_run', {
    job: {
      model: models.motion, prompt: input.prompt, imagePath: input.imageRel,
      ...(input.motion.source === 'preset' ? { presetId: input.motion.presetId } : { motionPath: input.motion.path }),
      seconds: Math.max(1, Math.round(input.seconds)), aspect: input.vertical ? '9:16' : '16:9', extra: models.motionExtra ?? null,
    },
    workspaceRoot: input.root, outPath: input.outRel, keys: higgsfieldKeys(),
  }).catch(() => ({ ok: false, reason: 'Higgsfield could not be reached.' }));
  return outcome(answer, input.outRel, can.usd);
}

/** One look at a clip Higgsfield was still making; never a new run. */
export async function checkHiggsfieldClip(requestId: string, outRel: string, root: string, usd: number): Promise<HiggsfieldClipResult> {
  const answer = await invoke<RunAnswer>('higgsfield_check', { requestId, workspaceRoot: root, outPath: outRel, keys: higgsfieldKeys() })
    .catch(() => ({ ok: true, status: 'pending', requestId }));
  return outcome(answer, outRel, usd);
}
