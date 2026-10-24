// Which engine makes a project's voice-over, pictures and AI clips (content factory phase 4b):
// the brand's default (Brands tab), which a project can override (its video settings), else
// the free ones. A paid engine that isn't available (no key, Zero-Cost Mode on, over the
// monthly cap) is replaced by the free one with a note saying why — never silently.
import { getConnectorCredential } from '../connectors/connectorAuth';
import { cachedHiggsfieldEstimate, higgsfieldAvailable, higgsfieldModels, isHiggsfieldConfigured, refreshHiggsfieldEstimate } from '../connectors/higgsfieldConnector';
import { canSpend, getPaidModelSettings } from '../jose/joseSpend';
import { getVideoSettings } from './contentProjectService';
import type { ContentBrand, ContentProject } from './contentTypes';

export type PaidEngine = 'elevenlabs' | 'higgsfield';
export interface VoiceChoice { engine: 'kokoro' | 'elevenlabs'; voiceId: string; modelId?: string }
export interface EngineChoices {
  voice?: VoiceChoice;
  pictures?: 'comfyui' | 'higgsfield';
  clips?: 'local' | 'runway' | 'higgsfield' | null;
}

const NAME: Record<PaidEngine, string> = { elevenlabs: 'ElevenLabs', higgsfield: 'Higgsfield' };

function zeroCostModeOn(): boolean {
  try {
    return JSON.parse(localStorage.getItem('alphonso_settings') || '{}')?.zeroCostMode !== false;
  } catch {
    return true;
  }
}

function hasKeys(engine: PaidEngine): boolean {
  if (engine === 'elevenlabs') return Boolean(String(getConnectorCredential('elevenlabs', 'ELEVENLABS_API_KEY') || '').trim());
  return isHiggsfieldConfigured();
}

/** Whether a paid engine can be used now; otherwise a plain reason. */
export function paidEngineAvailable(engine: PaidEngine): { ok: boolean; reason?: string } {
  if (!hasKeys(engine)) return { ok: false, reason: `${NAME[engine]} isn't set up` };
  if (zeroCostModeOn()) return { ok: false, reason: `${NAME[engine]} is off while Zero-Cost Mode is on` };
  if (engine === 'elevenlabs' && getPaidModelSettings().elevenLabsPricePer1kCharsUsd === null) {
    return { ok: false, reason: "Enter ElevenLabs' price per 1,000 characters in Settings → Approvals → Allow paid models" };
  }
  const cap = canSpend(0.01);
  if (!cap.ok) return { ok: false, reason: `Over this month's spending cap (${cap.reason})` };
  return { ok: true };
}

function kokoroVoice(brand: ContentBrand): VoiceChoice {
  return { engine: 'kokoro', voiceId: brand.voice?.voiceId || 'af_heart' };
}

/** The choices for this project: its override, else the brand's, else the free engines. */
export function projectEngines(project: ContentProject, brand: ContentBrand): { voice: VoiceChoice; pictures: 'comfyui' | 'higgsfield'; clips: 'local' | 'runway' | 'higgsfield' | null } {
  const saved = (project.videoSettings || {}) as { voiceEngine?: string; pictures?: string };
  const brandVoice = brand.engines?.voice;
  const voiceEngine = saved.voiceEngine === 'kokoro' || saved.voiceEngine === 'elevenlabs' ? saved.voiceEngine : brandVoice?.engine || 'kokoro';
  const voice = voiceEngine === 'elevenlabs' && brandVoice?.engine === 'elevenlabs' && brandVoice.voiceId
    ? { engine: 'elevenlabs' as const, voiceId: brandVoice.voiceId, ...(brandVoice.modelId ? { modelId: brandVoice.modelId } : {}) }
    : kokoroVoice(brand);
  const pictures = saved.pictures === 'comfyui' || saved.pictures === 'higgsfield' ? saved.pictures : brand.engines?.pictures || 'comfyui';
  const clips = getVideoSettings(project).clipEngine ?? brand.engines?.clips ?? null;
  return { voice, pictures, clips };
}

/** The voice to read with now; Kokoro with a note when ElevenLabs can't be used. */
export function resolveVoice(project: ContentProject, brand: ContentBrand): VoiceChoice & { note?: string } {
  const { voice } = projectEngines(project, brand);
  if (voice.engine !== 'elevenlabs') return voice;
  const can = paidEngineAvailable('elevenlabs');
  return can.ok ? voice : { ...kokoroVoice(brand), note: `${can.reason}; read by Kokoro.` };
}

/** The picture engine to use now, with Higgsfield's estimate per picture; ComfyUI with a note when Higgsfield can't be used. */
export function resolvePictures(project: ContentProject, brand: ContentBrand): { engine: 'comfyui' | 'higgsfield'; note?: string; usd?: number } {
  const { pictures } = projectEngines(project, brand);
  if (pictures !== 'higgsfield') return { engine: 'comfyui' };
  const can = paidEngineAvailable('higgsfield');
  if (!can.ok) return { engine: 'comfyui', note: `${can.reason}; made with ComfyUI.` };
  const models = higgsfieldModels();
  if (!models.picture) return { engine: 'comfyui', note: 'Paste a picture model id in Settings → Connectors → Higgsfield; made with ComfyUI.' };
  if (models.pictureExtraProblem) return { engine: 'comfyui', note: `${models.pictureExtraProblem} Made with ComfyUI.` };
  const estimate = cachedHiggsfieldEstimate('picture');
  if (!estimate) return { engine: 'comfyui', note: "Higgsfield's estimate isn't known yet; made with ComfyUI." };
  if (typeof estimate.usd !== 'number') return { engine: 'comfyui', note: `${estimate.reason || 'Higgsfield gave no estimate.'} Made with ComfyUI.` };
  return { engine: 'higgsfield', usd: estimate.usd };
}

/** The most pictures one approval covers for a step (Scenes: one per 5 s of the video). */
export function higgsfieldPictureLimit(project: ContentProject, step: 'scenes' | 'thumbnail' | 'carousel'): number {
  if (step === 'thumbnail') return 3;
  if (step === 'carousel') return 10;
  return Math.max(1, Math.ceil((Number(project.brief.lengthSec) || 60) / 5));
}

/** Before a run is planned: asks Higgsfield's estimates the plan will show (the plan can't wait on the network). */
export async function prepareEngineEstimates(project: ContentProject, brand: ContentBrand): Promise<void> {
  if (!higgsfieldAvailable().ok) return;
  const engines = projectEngines(project, brand);
  if (engines.pictures === 'higgsfield') await refreshHiggsfieldEstimate('picture');
  if (engines.clips === 'higgsfield' || project.shortsSettings?.clipEngine === 'higgsfield') await refreshHiggsfieldEstimate('clip', { seconds: 5 });
}
