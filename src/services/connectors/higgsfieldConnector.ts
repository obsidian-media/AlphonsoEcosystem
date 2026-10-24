// Higgsfield (content factory phase 4b): pictures and AI clips from model ids the user pastes
// from the Higgsfield Console, each with an optional "Extra settings (JSON)" box. Making
// anything runs inside an approved content step through the backend (`higgsfield.rs`), which
// asks Higgsfield's own estimate first; this file only reads the settings and runs Test.
import { invoke } from '@tauri-apps/api/core';
import { getConnectorCredential } from './connectorAuth';
import { getRuntimePolicySettings } from '../policyEnforcementService';

export const HIGGSFIELD_NOT_SET_UP = 'Add your Higgsfield key id and secret in Settings → Connectors → Higgsfield.';
export const HIGGSFIELD_CONSOLE_URL = 'https://cloud.higgsfield.ai';

export interface HiggsfieldKeys { keyId: string; keySecret: string }
export interface HiggsfieldModels {
  picture?: string;
  pictureExtra?: Record<string, unknown>;
  pictureExtraProblem?: string;
  clip?: string;
  clipExtra?: Record<string, unknown>;
  clipExtraProblem?: string;
  /** Phase 4c: the model id that trains a consistent character, and its extras. */
  character?: string;
  characterExtra?: Record<string, unknown>;
  characterExtraProblem?: string;
  /** Phase 4c: the model id that copies a motion onto a picture, and its extras. */
  motion?: string;
  motionExtra?: Record<string, unknown>;
  motionExtraProblem?: string;
}

const read = (key: string): string => String(getConnectorCredential('higgsfield', key) || '').trim();

export function higgsfieldKeys(): HiggsfieldKeys {
  return { keyId: read('HIGGSFIELD_KEY_ID'), keySecret: read('HIGGSFIELD_KEY_SECRET') };
}

export function isHiggsfieldConfigured(): boolean {
  const k = higgsfieldKeys();
  return Boolean(k.keyId && k.keySecret);
}

/** Keys set and Zero-Cost Mode off; spending is still asked per run. */
export function higgsfieldAvailable(): { ok: boolean; reason?: string } {
  if (!isHiggsfieldConfigured()) return { ok: false, reason: HIGGSFIELD_NOT_SET_UP };
  if (getRuntimePolicySettings().zeroCostMode) return { ok: false, reason: 'Higgsfield is off while Zero-Cost Mode is on.' };
  return { ok: true };
}

/** An extra settings box: empty → nothing; a JSON object → used; anything else → a problem to show. */
export function parseExtra(text: string, what: string): { extra?: Record<string, unknown>; problem?: string } {
  if (!text.trim()) return {};
  try {
    const value = JSON.parse(text);
    if (value && typeof value === 'object' && !Array.isArray(value)) return { extra: value as Record<string, unknown> };
  } catch {
    // Reported below.
  }
  return { problem: `The ${what} model’s extra settings are not valid JSON.` };
}

export function higgsfieldModels(): HiggsfieldModels {
  const out: HiggsfieldModels = {};
  const picture = read('HIGGSFIELD_PICTURE_MODEL');
  const clip = read('HIGGSFIELD_CLIP_MODEL');
  if (picture) {
    out.picture = picture;
    const p = parseExtra(read('HIGGSFIELD_PICTURE_EXTRA'), 'picture');
    if (p.extra) out.pictureExtra = p.extra;
    if (p.problem) out.pictureExtraProblem = p.problem;
  }
  if (clip) {
    out.clip = clip;
    const c = parseExtra(read('HIGGSFIELD_CLIP_EXTRA'), 'clip');
    if (c.extra) out.clipExtra = c.extra;
    if (c.problem) out.clipExtraProblem = c.problem;
  }
  const character = read('HIGGSFIELD_CHARACTER_MODEL');
  if (character) {
    out.character = character;
    const t = parseExtra(read('HIGGSFIELD_CHARACTER_EXTRA'), 'character');
    if (t.extra) out.characterExtra = t.extra;
    if (t.problem) out.characterExtraProblem = t.problem;
  }
  const motion = read('HIGGSFIELD_MOTION_MODEL');
  if (motion) {
    out.motion = motion;
    const m = parseExtra(read('HIGGSFIELD_MOTION_EXTRA'), 'motion');
    if (m.extra) out.motionExtra = m.extra;
    if (m.problem) out.motionExtraProblem = m.problem;
  }
  return out;
}

/** Higgsfield's motion presets (phase 4c), when its API lists them; otherwise the user pastes an id. */
export async function listHiggsfieldPresets(): Promise<{ ok: boolean; presets?: { id: string; name: string }[]; reason?: string }> {
  if (!isHiggsfieldConfigured()) return { ok: false, reason: HIGGSFIELD_NOT_SET_UP };
  try {
    return (await invoke('higgsfield_presets', { keys: higgsfieldKeys() })) as { ok: boolean; presets?: { id: string; name: string }[]; reason?: string };
  } catch {
    return { ok: false, reason: 'Higgsfield could not be reached.' };
  }
}

/** Settings' Test: Higgsfield's estimate for a model id; nothing is made or charged. */
export async function testHiggsfieldModel(model: string, extra?: Record<string, unknown>): Promise<{ ok: boolean; usd?: number; reason?: string }> {
  if (!isHiggsfieldConfigured()) return { ok: false, reason: HIGGSFIELD_NOT_SET_UP };
  try {
    return (await invoke('higgsfield_test', { model, extra: extra ?? null, keys: higgsfieldKeys() })) as { ok: boolean; usd?: number; reason?: string };
  } catch {
    return { ok: false, reason: 'Higgsfield could not be reached.' };
  }
}

const ESTIMATES_KEY = 'alphonso_higgsfield_estimates_v1';
type Kind = 'picture' | 'clip' | 'motion';
interface StoredEstimate { model: string; extra: string; usd?: number; reason?: string; atMs: number }

function current(kind: Kind): { model?: string; extra?: Record<string, unknown>; problem?: string } {
  const m = higgsfieldModels();
  if (kind === 'picture') return { model: m.picture, extra: m.pictureExtra, problem: m.pictureExtraProblem };
  if (kind === 'motion') return { model: m.motion, extra: m.motionExtra, problem: m.motionExtraProblem };
  return { model: m.clip, extra: m.clipExtra, problem: m.clipExtraProblem };
}

function readEstimates(): Partial<Record<Kind, StoredEstimate>> {
  try {
    return JSON.parse(localStorage.getItem(ESTIMATES_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

/**
 * Asks Higgsfield's estimate for one picture or clip with the saved model id and extra
 * settings, and keeps it for the plan (which can't wait on the network). Nothing is made.
 */
export async function refreshHiggsfieldEstimate(kind: Kind, job: { seconds?: number; aspect?: string } = {}): Promise<{ ok: boolean; usd?: number; reason?: string }> {
  const { model, extra, problem } = current(kind);
  if (!model) return { ok: false, reason: `Paste a ${kind} model id in Settings → Connectors → Higgsfield.` };
  if (problem) return { ok: false, reason: problem };
  if (!isHiggsfieldConfigured()) return { ok: false, reason: HIGGSFIELD_NOT_SET_UP };
  let answer: { ok: boolean; usd?: number; reason?: string };
  try {
    answer = (await invoke('higgsfield_estimate', {
      job: { model, prompt: kind === 'picture' ? 'A picture for a video' : kind === 'motion' ? 'A short clip with a movement' : 'A short clip for a video', extra: extra ?? null, ...job },
      keys: higgsfieldKeys(),
    })) as { ok: boolean; usd?: number; reason?: string };
  } catch {
    answer = { ok: false, reason: 'Higgsfield could not be reached.' };
  }
  const stored: StoredEstimate = { model, extra: JSON.stringify(extra ?? null), atMs: Date.now(), ...(answer.ok && typeof answer.usd === 'number' ? { usd: answer.usd } : { reason: answer.reason || 'Higgsfield gave no estimate.' }) };
  try {
    localStorage.setItem(ESTIMATES_KEY, JSON.stringify({ ...readEstimates(), [kind]: stored }));
  } catch {
    // The plan then says the estimate isn't known.
  }
  return answer;
}

/** The kept estimate, only while the model id and extra settings are the ones it was asked for. */
export function cachedHiggsfieldEstimate(kind: Kind): { usd?: number; reason?: string } | null {
  const stored = readEstimates()[kind];
  const { model, extra } = current(kind);
  if (!stored || stored.model !== model || stored.extra !== JSON.stringify(extra ?? null)) return null;
  return typeof stored.usd === 'number' ? { usd: stored.usd } : { reason: stored.reason };
}
